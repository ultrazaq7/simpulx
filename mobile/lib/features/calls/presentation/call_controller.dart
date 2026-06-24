import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error/app_exception.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../../core/notifications/notification_payload.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/realtime/realtime_event.dart';
import '../../../core/realtime/realtime_providers.dart';
import '../data/calls_remote_datasource.dart';
import '../domain/call_session.dart';
import 'webrtc_service.dart';

final callsDataSourceProvider = Provider<CallsRemoteDataSource>(
  (ref) => CallsRemoteDataSource(ref.watch(dioProvider)),
);

/// Factory for the WebRTC engine (overridable with a fake in tests).
final webRtcServiceFactoryProvider = Provider<WebRtcService Function()>(
  (ref) => WebRtcService.new,
);

/// Drives a single 1:1 audio call. Outbound: request permission -> place SDP
/// offer -> apply answer -> connected. Inbound: a `call.updated` ring creates an
/// incoming session that the agent accepts (SDP answer) or rejects.
class CallController extends Notifier<CallSession?> {
  WebRtcService? _rtc;
  Timer? _autoClear;

  CallsRemoteDataSource get _ds => ref.read(callsDataSourceProvider);

  @override
  CallSession? build() {
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event != null) _onEvent(event);
    });
    ref.onDispose(() => _rtc?.dispose());
    return null;
  }

  // ── Outbound ───────────────────────────────────────────
  Future<void> startOutbound({
    required String conversationId,
    required String contactName,
    required String contactPhone,
  }) async {
    if (state != null) return; // a call is already in progress
    _rtc = ref.read(webRtcServiceFactoryProvider)();
    state = CallSession(
      callId: '',
      conversationId: conversationId,
      inbound: false,
      contactName: contactName,
      contactPhone: contactPhone,
      phase: CallPhase.requesting,
      message: 'Requesting permission...',
    );
    try {
      final perm = await _ds.requestPermission(conversationId);
      state = state?.copyWith(
        callId: perm.callId,
        phase: perm.granted ? CallPhase.connecting : CallPhase.requesting,
        message: perm.granted ? null : 'Waiting for customer approval...',
      );
      if (perm.granted) await _placeOffer();
    } catch (e) {
      final raw = e is AppException ? e.message : 'Could not start the call';
      _fail(_friendlyMessage(raw));
    }
  }

  Future<void> _placeOffer() async {
    final s = state;
    if (s == null || s.callId.isEmpty || _rtc == null) {
      // callId not set yet - will be called again after permission granted
      return;
    }
    try {
      state = s.copyWith(phase: CallPhase.ringing, message: 'Calling...');
      final offer = await _rtc!.createOffer();
      await _ds.initiate(callId: s.callId, sdpOffer: offer);
      // Wait for the `call.updated` sdp_answer to connect.
    } catch (e) {
      _fail('Could not place the call');
    }
  }

  // ── Inbound ────────────────────────────────────────────
  Future<void> acceptIncoming() async {
    final s = state;
    if (s == null || !s.inbound || s.pendingOffer == null || _rtc == null) {
      return;
    }
    try {
      state = s.copyWith(phase: CallPhase.connecting);
      final answer = await _rtc!.createAnswer(s.pendingOffer!);
      await _ds.accept(callId: s.callId, sdpAnswer: answer);
      state = state?.copyWith(
        phase: CallPhase.connected,
        connectedAt: DateTime.now(),
      );
    } catch (e) {
      _fail('Could not answer the call');
    }
  }

  Future<void> rejectIncoming() async {
    final s = state;
    if (s == null) return;
    try {
      await _ds.reject(s.callId);
    } catch (_) {/* best effort */}
    _cleanup(CallPhase.ended, message: 'Declined');
  }

  // ── Controls ───────────────────────────────────────────
  Future<void> hangUp() async {
    final s = state;
    if (s == null) return;
    if (s.callId.isNotEmpty) {
      try {
        await _ds.end(s.callId);
      } catch (_) {/* best effort */}
    }
    _cleanup(CallPhase.ended, message: 'Call ended');
  }

  Future<void> toggleMute() async {
    final s = state;
    if (s == null) return;
    final muted = !s.muted;
    await _rtc?.setMuted(muted);
    state = s.copyWith(muted: muted);
  }

  /// Dismiss a finished call card.
  void clear() {
    _autoClear?.cancel();
    state = null;
  }

  // ── Realtime ───────────────────────────────────────────
  void _onEvent(RealtimeEvent event) {
    if (!event.isCallUpdated) return;
    final p = CallUpdatedPayload(event.data);

    // New inbound ring (no active session).
    if (state == null) {
      if (p.isInbound &&
          p.callStatus == 'ringing' &&
          p.sdpOffer != null &&
          p.sdpOffer!.isNotEmpty) {
        _rtc = ref.read(webRtcServiceFactoryProvider)();
        state = CallSession(
          callId: p.callId,
          conversationId: p.conversationId,
          inbound: true,
          contactName: p.contactName ?? 'Unknown',
          contactPhone: p.contactPhone ?? '',
          phase: CallPhase.incoming,
          pendingOffer: p.sdpOffer,
        );
        // Fire a local notification so the incoming call is visible on
        // lock screen / status bar (fullScreenIntent shows over lock screen).
        _showIncomingCallNotification(
          contactName: p.contactName ?? 'Unknown',
          conversationId: p.conversationId,
        );
      }
      return;
    }

    final s = state!;
    if (p.callId != s.callId && s.callId.isNotEmpty) return;

    if (p.callStatus == 'ended' ||
        p.callStatus == 'failed' ||
        (p.endReason != null && p.endReason!.isNotEmpty)) {
      _cleanup(
        p.callStatus == 'failed' ? CallPhase.failed : CallPhase.ended,
        message: p.endReason ?? 'Call ended',
      );
      return;
    }

    if (p.permissionStatus == 'rejected') {
      _fail('Call permission declined');
      return;
    }

    // Outbound: permission granted -> place the offer.
    if (!s.inbound &&
        p.permissionStatus == 'granted' &&
        s.phase == CallPhase.requesting) {
      _placeOffer();
      return;
    }

    // Outbound: the customer answered -> apply the SDP answer.
    if (!s.inbound &&
        p.sdpAnswer != null &&
        p.sdpAnswer!.isNotEmpty &&
        s.phase != CallPhase.connected) {
      _applyAnswer(p.sdpAnswer!);
      return;
    }

    if (p.callStatus == 'connected' && s.phase != CallPhase.connected) {
      state = s.copyWith(
        phase: CallPhase.connected,
        connectedAt: s.connectedAt ?? DateTime.now(),
      );
    }
  }

  Future<void> _applyAnswer(String sdp) async {
    try {
      await _rtc?.setRemoteAnswer(sdp);
      state = state?.copyWith(
        phase: CallPhase.connected,
        connectedAt: DateTime.now(),
      );
    } catch (e) {
      _fail('Audio connection failed');
    }
  }

  /// Show a heads-up / lock-screen notification for an incoming call.
  void _showIncomingCallNotification({
    required String contactName,
    required String conversationId,
  }) {
    final payload = NotificationPayload(
      category: NotificationCategory.incomingCall,
      title: contactName,
      body: 'Incoming voice call',
      conversationId: conversationId,
    );
    LocalNotifications.instance.show(payload);
  }

  void _fail(String message) => _cleanup(CallPhase.failed, message: message);

  /// Maps raw backend / exception messages to short, user-friendly labels.
  static String _friendlyMessage(String raw) {
    final lower = raw.toLowerCase();
    if (lower.contains('already requested') || lower.contains('pending')) {
      return 'Waiting for approval';
    }
    if (lower.contains('timeout') || lower.contains('timed out')) {
      return 'No answer';
    }
    if (lower.contains('signaling') || lower.contains('signal')) {
      return 'Connection failed';
    }
    if (lower.contains('busy')) return 'Line busy';
    if (lower.contains('rejected') || lower.contains('declined')) {
      return 'Call declined';
    }
    if (lower.contains('not available') || lower.contains('unavailable')) {
      return 'Unavailable';
    }
    if (raw.length > 30) return 'Call unavailable';
    return raw;
  }

  void _cleanup(CallPhase phase, {String? message}) {
    _rtc?.dispose();
    _rtc = null;
    // Dismiss any lingering incoming-call notification
    _dismissCallNotification();
    state = state?.copyWith(phase: phase, message: message) ??
        CallSession(
          callId: '',
          conversationId: '',
          inbound: false,
          contactName: '',
          contactPhone: '',
          phase: phase,
          message: message,
        );
    // Auto-dismiss the ended/failed card.
    _autoClear?.cancel();
    _autoClear = Timer(const Duration(seconds: 3), clear);
    if (kDebugMode) debugPrint('[call] $phase ${message ?? ''}');
  }

  /// Cancel the notification shown by [_showIncomingCallNotification].
  void _dismissCallNotification() {
    // The notification id matches how LocalNotifications._show computes it
    // from the conversationId. Re-derive the same id and cancel it.
    final convId = state?.conversationId ?? '';
    if (convId.isEmpty) return;
    final id = convId.hashCode & 0x7fffffff;
    LocalNotifications.instance.cancel(id);
  }
}

final callControllerProvider =
    NotifierProvider<CallController, CallSession?>(CallController.new);
