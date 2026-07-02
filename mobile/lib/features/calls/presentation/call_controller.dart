import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';

import '../../../core/error/app_exception.dart';
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
  static const _channel = MethodChannel('simpulx_notification');

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
    if (!await _ensureMicPermission()) {
      _fail('Microphone permission is required to call');
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
  /// Setup an incoming call session from a notification tap.
  /// Fetches call info from backend and creates the session.
  Future<void> setupIncomingFromNotification({
    required String conversationId,
    required String contactName,
    required String contactPhone,
    String? callId,
    String? sdpOffer,
  }) async {
    if (state != null) return; // a call is already in progress

    // If we don't have callId/sdpOffer, try to fetch from backend
    String? resolvedCallId = callId;
    String? resolvedSdpOffer = sdpOffer;

    if (resolvedCallId == null || resolvedSdpOffer == null) {
      try {
        if (resolvedCallId != null) {
          final info = await _ds.getCallInfo(resolvedCallId);
          resolvedSdpOffer ??= info.sdpOffer;
        } else {
          debugPrint('[call] Missing callId, cannot fetch SDP offer');
        }
      } catch (e) {
        debugPrint('[call] Failed to fetch call info: $e');
        // Create session without SDP - will need to fetch later
      }
    }

    _rtc = ref.read(webRtcServiceFactoryProvider)();
    state = CallSession(
      callId: resolvedCallId ?? '',
      conversationId: conversationId,
      inbound: true,
      contactName: contactName.isNotEmpty ? contactName : 'Unknown',
      contactPhone: contactPhone.isNotEmpty ? contactPhone : '',
      phase: CallPhase.incoming,
      pendingOffer: resolvedSdpOffer,
    );
  }

  /// Ensure the OS microphone permission is granted, prompting if it hasn't been
  /// decided yet. Reuses the `record` plugin (already a dependency) so we don't
  /// hit a raw getUserMedia failure mid-answer when the user never granted it.
  Future<bool> _ensureMicPermission() async {
    try {
      return await AudioRecorder().hasPermission();
    } catch (_) {
      return false;
    }
  }

  Future<void> acceptIncoming() async {
    final s = state;
    if (s == null || !s.inbound || _rtc == null) return;
    // Auto-detect & request mic access before answering so the WebRTC layer
    // never throws on a missing permission.
    if (!await _ensureMicPermission()) {
      _fail('Microphone permission is required to answer');
      return;
    }

    // Resolve the SDP offer: it may be missing if we set up from a notification
    // before the WS ring landed. Fetch it from the backend as a fallback so the
    // Answer button is never a silent no-op.
    String? offer = s.pendingOffer;
    if ((offer == null || offer.isEmpty) && s.callId.isNotEmpty) {
      try {
        offer = (await _ds.getCallInfo(s.callId)).sdpOffer;
      } catch (_) {/* fall through to the guard below */}
    }
    if (offer == null || offer.isEmpty || s.callId.isEmpty) {
      _fail('Could not answer the call');
      return;
    }

    try {
      state = state?.copyWith(phase: CallPhase.connecting);
      // Answered: remove the ringing notification so it doesn't linger in the
      // tray (with stale Answer/Decline buttons) during the live call.
      _dismissNativeCallNotification();
      final answer = await _rtc!.createAnswer(offer);
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
    // Only hit the backend when we actually have a call id (otherwise the
    // empty-id request 404s); always clean up the local UI either way.
    if (s.callId.isNotEmpty) {
      try {
        await _ds.reject(s.callId);
      } catch (_) {/* best effort */}
    }
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
          (p.callStatus == 'ringing' || p.callStatus == 'incoming') &&
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
        // Native SimpulxMessagingService already shows the call notification
        // via NotificationHelper.showCallNotification — no Flutter duplicate.
      }
      return;
    }

    final s = state!;

    // A session created from a notification tap can be missing its callId/SDP
    // offer until the WS ring arrives. Backfill it so Accept/Decline actually
    // reach the backend (otherwise the toggle silently no-ops).
    if (s.inbound &&
        p.isInbound &&
        (p.callStatus == 'incoming' || p.callStatus == 'ringing') &&
        (s.callId.isEmpty ||
            s.pendingOffer == null ||
            s.pendingOffer!.isEmpty)) {
      state = s.copyWith(
        callId: p.callId.isNotEmpty ? p.callId : s.callId,
        pendingOffer: (p.sdpOffer != null && p.sdpOffer!.isNotEmpty)
            ? p.sdpOffer
            : s.pendingOffer,
        contactName: (p.contactName != null && p.contactName!.isNotEmpty)
            ? p.contactName
            : null,
        contactPhone: (p.contactPhone != null && p.contactPhone!.isNotEmpty)
            ? p.contactPhone
            : null,
      );
      return;
    }

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
      _dismissNativeCallNotification();
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
    // Dismiss the native call notification when the call ends
    _dismissNativeCallNotification();
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

  /// Cancel the native call notification shown by SimpulxMessagingService.
  ///
  /// We pass the raw conversationId and let the native side derive the id
  /// (chatId.hashCode() + 100). Computing the id in Dart never matched, because
  /// Dart's String.hashCode differs from the JVM's, so the ring notification was
  /// never actually dismissed (it lingered with stale Answer/Decline buttons and
  /// looked like a duplicate).
  void _dismissNativeCallNotification() {
    final convId = state?.conversationId ?? '';
    if (convId.isEmpty) return;
    _channel
        .invokeMethod('cancelCallNotification', {'chatId': convId})
        .catchError((_) {});
  }
}

final callControllerProvider =
    NotifierProvider<CallController, CallSession?>(CallController.new);
