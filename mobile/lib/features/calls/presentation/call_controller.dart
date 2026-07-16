import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
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
  Timer? _ringTimeout;
  Timer? _statusPoll;
  Timer? _pickupPoll;
  Timer? _permissionPoll;
  Timer? _incomingPoll;
  // The `call.updated` sdp_answer can arrive more than once; applying the answer
  // twice throws (setRemoteDescription on an already-stable peer) and surfaced
  // as a bogus "Audio connection failed". Apply it exactly once per call.
  bool _answerApplied = false;
  static const _channel = MethodChannel('simpulx_notification');

  /// How long we ring an outbound call before giving up as "No answer". Without
  /// this the caller waits forever on a customer who never picks up.
  static const _outboundRingTimeout = Duration(seconds: 45);

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
      if (perm.granted) {
        await _placeOffer();
      } else {
        // Safety net: if the realtime grant event is missed (WS blip, or the
        // backend couldn't classify the customer's reply), poll the call status
        // so "Awaiting permission" can never get stuck forever.
        _startPermissionPoll();
      }
    } catch (e) {
      final raw = e is AppException ? e.message : 'Could not start the call';
      _fail(_friendlyMessage(raw));
    }
  }

  Future<void> _placeOffer() async {
    _stopPermissionPoll(); // permission resolved (or superseded)
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
      // "Calling..." while we build + deliver the offer; the phase flips to
      // "Ringing..." only when WhatsApp confirms delivery (the SDP answer
      // arrives = the callee's phone is actually ringing).
      state = s.copyWith(phase: CallPhase.connecting, message: 'Calling...');
      final offer = await _rtc!.createOffer();
      await _ds.initiate(callId: s.callId, sdpOffer: offer);
      // The user may have pressed End while we were gathering ICE / initiating.
      final now = state;
      if (now == null ||
          now.callId != s.callId ||
          now.phase != CallPhase.connecting) {
        return;
      }
      // Arm the no-answer timeout for the whole wait (ring included).
      _armRingTimeout();
      // The outbound call is now live — show the ongoing-call notification so it
      // stays visible (with Hang up) if the agent minimizes the app.
      _syncOngoingCall('Calling…');
      // Wait for the `call.updated` sdp_answer -> ringing -> pickup.
    } catch (e) {
      _fail('Could not place the call');
    }
  }

  /// Play the outbound ringback tone (Android ToneGenerator, no bundled asset).
  /// Best-effort: silence on failure is fine, the call still proceeds.
  void _startRingback() {
    _channel.invokeMethod('startRingback').catchError((_) {});
  }

  void _stopRingback() {
    _channel.invokeMethod('stopRingback').catchError((_) {});
  }

  // ── Ongoing-call system presence (WhatsApp-style) ───────
  // Android: a foreground service posts a persistent CallStyle notification with
  // a Hang up chip and keeps the process (mic/WebRTC) alive when minimized.
  // iOS: report the OUTBOUND call to CallKit so the system shows its native call
  // UI / green pill while the app is backgrounded (inbound calls are already in
  // CallKit via the PushKit VoIP push, so we must NOT report those again or the
  // call would be duplicated).
  bool _ongoingShown = false;

  void _syncOngoingCall(String statusText) {
    final s = state;
    if (s == null) return;

    if (Platform.isAndroid) {
      _ongoingShown = true;
      _channel.invokeMethod('startOngoingCall', {
        'chatId': s.conversationId,
        'callId': s.callId,
        'contactName': s.contactName,
        'statusText': statusText,
      }).catchError((_) {});
      return;
    }

    if (Platform.isIOS) {
      // Inbound is already a CallKit call (PushKit) — don't double-report it.
      if (s.inbound || _ongoingShown || s.callId.isEmpty) return;
      _ongoingShown = true;
      FlutterCallkitIncoming.startCall(CallKitParams(
        id: s.callId,
        nameCaller: s.contactName,
        handle: s.contactPhone,
        type: 0, // audio
        appName: 'Simpulx',
        extra: {
          'conversationId': s.conversationId,
          'callId': s.callId,
          'handle': s.contactPhone,
        },
      )).catchError((_) {});
    }
  }

  /// iOS only: tell CallKit the outbound call is actually connected so the system
  /// UI stops showing "calling…" and starts its duration timer.
  void _markSystemCallConnected() {
    if (!Platform.isIOS || !_ongoingShown) return;
    final s = state;
    if (s == null || s.inbound || s.callId.isEmpty) return;
    FlutterCallkitIncoming.setCallConnected(s.callId).catchError((_) {});
  }

  void _stopOngoingCall() {
    if (!_ongoingShown) return;
    _ongoingShown = false;
    if (Platform.isAndroid) {
      _channel.invokeMethod('stopOngoingCall').catchError((_) {});
    } else if (Platform.isIOS) {
      // Clears the CallKit call we reported for this outbound call.
      FlutterCallkitIncoming.endAllCalls().catchError((_) {});
    }
  }

  /// Give up on an unanswered outbound call after [_outboundRingTimeout].
  void _armRingTimeout() {
    _ringTimeout?.cancel();
    _ringTimeout = Timer(_outboundRingTimeout, () {
      final s = state;
      if (s == null || s.inbound || s.phase == CallPhase.connected) return;
      // Tell the backend to tear down so the customer's ring also stops.
      if (s.callId.isNotEmpty) {
        _ds.end(s.callId).catchError((_) {});
      }
      _cleanup(CallPhase.ended, message: 'No answer');
    });
  }

  void _cancelRingTimeout() {
    _ringTimeout?.cancel();
    _ringTimeout = null;
  }

  /// Poll the backend while "Awaiting permission" so a missed realtime grant
  /// event can never leave the screen stuck: on granted -> place the call, on
  /// denied/ended -> fail out.
  void _startPermissionPoll() {
    _permissionPoll?.cancel();
    _permissionPoll = Timer.periodic(const Duration(seconds: 3), (_) async {
      final s = state;
      if (s == null || s.inbound || s.phase != CallPhase.requesting) {
        _stopPermissionPoll();
        return;
      }
      if (s.callId.isEmpty) return;
      try {
        final info = await _ds.getCallInfo(s.callId);
        if (state?.phase != CallPhase.requesting) return;
        if (info.permissionStatus == 'granted') {
          _stopPermissionPoll();
          state = state?.copyWith(phase: CallPhase.connecting, message: null);
          await _placeOffer();
        } else if (info.permissionStatus == 'denied' ||
            info.status == 'ended' ||
            info.status == 'failed') {
          _stopPermissionPoll();
          _fail('Call permission declined');
        }
      } catch (_) {/* transient; next tick retries */}
    });
  }

  void _stopPermissionPoll() {
    _permissionPoll?.cancel();
    _permissionPoll = null;
  }

  /// Safety net while an inbound call is ringing on this device: if the caller
  /// cancels and the realtime "ended" event is missed (e.g. the app was just
  /// cold-started from the full-screen notification and the WS wasn't connected
  /// yet), poll the call status so the incoming overlay can never get stuck.
  void _startIncomingPoll() {
    _incomingPoll?.cancel();
    _incomingPoll = Timer.periodic(const Duration(seconds: 3), (_) async {
      final s = state;
      if (s == null || !s.inbound || s.phase != CallPhase.incoming) {
        _stopIncomingPoll();
        return;
      }
      if (s.callId.isEmpty) return; // backfill pending; next tick retries
      try {
        final info = await _ds.getCallInfo(s.callId);
        if (state?.phase != CallPhase.incoming) return;
        if (info.status == 'ended' || info.status == 'failed') {
          _stopIncomingPoll();
          _cleanup(CallPhase.ended, message: 'Missed call');
        }
      } catch (_) {/* transient; next tick retries */}
    });
  }

  void _stopIncomingPoll() {
    _incomingPoll?.cancel();
    _incomingPoll = null;
  }

  /// WhatsApp delivers the SDP answer while the callee's phone is still
  /// RINGING, so "answer received" is NOT "picked up". Actual pickup is when
  /// inbound audio starts flowing - poll RTP stats and only then flip the UI
  /// to connected (this is what makes the duration accurate).
  void _startPickupDetector() {
    if (_pickupPoll != null) return; // already watching
    _pickupPoll = Timer.periodic(const Duration(milliseconds: 500), (_) async {
      final s = state;
      if (s == null || s.inbound || s.phase == CallPhase.connected) {
        _stopPickupDetector();
        return;
      }
      final bytes = await _rtc?.inboundAudioBytes() ?? -1;
      // Stats unsupported on this platform -> fall back to the old behavior
      // (connect immediately) rather than never connecting at all.
      if (bytes < 0 || bytes > 500) {
        _stopPickupDetector();
        await _markOutboundConnected();
      }
    });
  }

  void _stopPickupDetector() {
    _pickupPoll?.cancel();
    _pickupPoll = null;
  }

  Future<void> _markOutboundConnected() async {
    final s = state;
    if (s == null || s.phase == CallPhase.connected) return;
    _stopRingback();
    _cancelRingTimeout();
    await _rtc?.setSpeaker(s.speakerOn);
    state = state?.copyWith(
      phase: CallPhase.connected,
      connectedAt: DateTime.now(),
    );
    _syncOngoingCall('Ongoing call');
    _markSystemCallConnected();
    _startStatusWatchdog();
    // Tell the backend talk time starts NOW (the SDP answer fires at ring
    // time, so the server can't know pickup on its own). Best-effort.
    if (s.callId.isNotEmpty) {
      _ds.markConnected(s.callId).catchError((_) {});
    }
  }

  /// Safety net for a missed realtime "ended" event (e.g. the WS was briefly
  /// disconnected when the customer hung up): while connected, poll the call
  /// status and tear down if the backend says it already ended. Without this the
  /// call screen could tick its duration forever after a remote hangup.
  void _startStatusWatchdog() {
    _statusPoll?.cancel();
    _statusPoll = Timer.periodic(const Duration(seconds: 20), (_) async {
      final s = state;
      if (s == null || s.phase != CallPhase.connected || s.callId.isEmpty) {
        return;
      }
      try {
        final info = await _ds.getCallInfo(s.callId);
        if (info.status == 'ended' || info.status == 'failed') {
          _cleanup(CallPhase.ended, message: 'Call ended');
        }
      } catch (_) {
        // Ignore transient errors; the next tick (or a WS event) will catch up.
      }
    });
  }

  void _stopStatusWatchdog() {
    _statusPoll?.cancel();
    _statusPoll = null;
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
    // The app may have been cold-started from the notification, so the caller
    // could have hung up before our WS connected - poll as a safety net.
    _startIncomingPoll();
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
      await _rtc?.setSpeaker(state?.speakerOn ?? false);
      state = state?.copyWith(
        phase: CallPhase.connected,
        connectedAt: DateTime.now(),
      );
      _syncOngoingCall('Ongoing call');
      _startStatusWatchdog();
    } catch (e) {
      _fail('Could not answer the call');
    }
  }

  Future<void> rejectIncoming() async {
    final s = state;
    if (s == null) return;
    // Tear down the local UI first so Decline feels instant, then tell the
    // backend (best-effort). Only hit the API when we actually have a call id
    // (an empty-id request 404s).
    final callId = s.callId;
    _cleanup(CallPhase.ended, message: 'Declined');
    if (callId.isNotEmpty) {
      try {
        await _ds.reject(callId);
      } catch (_) {/* best effort */}
    }
  }

  // ── Controls ───────────────────────────────────────────
  Future<void> hangUp() async {
    final s = state;
    if (s == null) return;
    // Optimistically tear down the local UI so End is always instant, then tell
    // the backend to terminate (which stops the customer's ring too). Doing the
    // network call after cleanup means a slow/failed request never leaves the
    // call screen stuck as if End did nothing.
    final callId = s.callId;
    _cleanup(CallPhase.ended, message: 'Call ended');
    if (callId.isNotEmpty) {
      try {
        await _ds.end(callId);
      } catch (_) {/* best effort */}
    }
  }

  Future<void> toggleMute() async {
    final s = state;
    if (s == null) return;
    final muted = !s.muted;
    await _rtc?.setMuted(muted);
    state = s.copyWith(muted: muted);
  }

  /// Toggle the loudspeaker on/off during a call.
  Future<void> toggleSpeaker() async {
    final s = state;
    if (s == null) return;
    final on = !s.speakerOn;
    await _rtc?.setSpeaker(on);
    state = s.copyWith(speakerOn: on);
  }

  /// Dismiss a finished call card.
  void clear() {
    _autoClear?.cancel();
    state = null;
    // The call UI is gone. If this call was answered from the lock screen, the
    // app is currently drawing OVER the keyguard — leaving it there would expose
    // the whole inbox on a locked phone. Tell native to drop that privilege and
    // fall back to the lock screen (no-op when the phone is unlocked).
    if (Platform.isAndroid) {
      _channel.invokeMethod('callFinished').catchError((_) {});
    }
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
        // Poll as a safety net so a caller-cancel can never leave the incoming
        // overlay stuck if the ended event is missed.
        _startIncomingPoll();
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
      // WhatsApp parity: an outbound call that ends before pickup is simply
      // "No answer" - declined, timed out, or busy all read the same.
      final noPickup = !s.inbound &&
          s.phase != CallPhase.connected &&
          p.callStatus != 'failed';
      _cleanup(
        p.callStatus == 'failed' ? CallPhase.failed : CallPhase.ended,
        message: noPickup
            ? 'No answer'
            : friendlyEndReason(p.endReason, failed: p.callStatus == 'failed'),
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

    // Outbound: the customer answered -> apply the SDP answer, exactly once
    // (duplicate call.updated events would otherwise re-apply it and throw).
    if (!s.inbound &&
        !_answerApplied &&
        p.sdpAnswer != null &&
        p.sdpAnswer!.isNotEmpty &&
        s.phase != CallPhase.connected) {
      _answerApplied = true;
      _applyAnswer(p.sdpAnswer!);
      return;
    }

    if (p.callStatus == 'connected' && s.phase != CallPhase.connected) {
      if (!s.inbound) {
        // Outbound: the backend marks "connected" on SDP answer, which happens
        // at RING time - wait for real inbound audio instead (accurate timer).
        _startPickupDetector();
        return;
      }
      _stopRingback();
      _cancelRingTimeout();
      _dismissNativeCallNotification();
      state = s.copyWith(
        phase: CallPhase.connected,
        connectedAt: s.connectedAt ?? DateTime.now(),
      );
      _syncOngoingCall('Ongoing call');
      _startStatusWatchdog();
    }
  }

  Future<void> _applyAnswer(String sdp) async {
    try {
      await _rtc?.setRemoteAnswer(sdp);
      // The SDP answer arrives while the callee is still RINGING (WhatsApp
      // pre-establishes the media path), so this is the moment the callee's
      // phone starts ringing - NOT pickup. Flip Calling... -> Ringing..., play
      // the local ringback, and let the pickup detector mark connected when
      // real inbound audio starts. The no-answer timeout stays armed.
      final s = state;
      if (s != null && !s.inbound && s.phase != CallPhase.connected) {
        state = s.copyWith(phase: CallPhase.ringing, message: null);
        _startRingback();
        _syncOngoingCall('Ringing…');
      }
      _startPickupDetector();
    } catch (e) {
      if (kDebugMode) debugPrint('[call] applyAnswer failed: $e');
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
    _answerApplied = false;
    _stopRingback();
    _cancelRingTimeout();
    _stopStatusWatchdog();
    _stopPickupDetector();
    _stopPermissionPoll();
    _stopIncomingPoll();
    _rtc?.dispose();
    _rtc = null;
    // Dismiss the native call notification when the call ends
    _dismissNativeCallNotification();
    _stopOngoingCall();
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

/// Map a raw backend end-reason enum (agent_hangup, rejected, no_answer, ...)
/// to a short human label shown when a call ends. Falls back gracefully for any
/// unknown value instead of leaking the raw token.
String friendlyEndReason(String? reason, {bool failed = false}) {
  switch (reason) {
    case 'rejected':
    case 'declined':
      return 'Call declined';
    case 'no_answer':
    case 'timeout':
      return 'No answer';
    case 'busy':
      return 'Line busy';
    case 'agent_hangup':
    case 'caller_hangup':
    case 'customer_hangup':
    case 'hangup':
    case 'call_ended':
    case 'ended':
    case null:
    case '':
      return 'Call ended';
    default:
      return failed ? 'Call failed' : 'Call ended';
  }
}
