import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/controllers/auth_controller.dart';
import '../../features/calls/domain/call_session.dart';
import '../../features/calls/presentation/call_controller.dart';

/// iOS CallKit bridge (PushKit VoIP). The full-screen call UI itself is reported
/// to CallKit natively in AppDelegate when a VoIP push arrives (works even when
/// the app is killed — see ios/Runner/AppDelegate.swift). This service:
///   1. registers the device's VoIP push token with the backend (platform
///      "ios_voip"), so the gateway knows where to send call pushes, and
///   2. bridges the CallKit Accept/Decline/End actions to the existing
///      [CallController] (which already resolves the SDP offer on cold start).
///
/// Android keeps its FCM + full-screen-intent path and does not use this.
class CallKitService {
  CallKitService(this._ref, this._onRoute);

  final WidgetRef _ref;
  final void Function(String route) _onRoute;
  bool _started = false;

  static const _voipPlatform = 'ios_voip';

  Future<void> init() async {
    if (_started || !Platform.isIOS) return;
    _started = true;

    // Register the VoIP token now (if the OS already issued one) and on refresh.
    try {
      final tok = await FlutterCallkitIncoming.getDevicePushTokenVoIP();
      if (tok is String && tok.isNotEmpty) await _registerVoipToken(tok);
    } catch (e) {
      debugPrint('[CallKit] VoIP token fetch failed: $e');
    }

    FlutterCallkitIncoming.onEvent.listen((event) async {
      if (event == null) return;
      final body = (event.body is Map) ? Map<String, dynamic>.from(event.body as Map) : <String, dynamic>{};
      switch (event.event) {
        case Event.actionDidUpdateDevicePushTokenVoip:
          final tok = body['deviceTokenVoIP'] as String? ?? '';
          if (tok.isNotEmpty) await _registerVoipToken(tok);
          break;
        case Event.actionCallAccept:
          await _accept(body);
          break;
        case Event.actionCallDecline:
        case Event.actionCallEnded:
        case Event.actionCallTimeout:
          await _endFromSystem();
          break;
        default:
          break;
      }
    });
  }

  Future<void> _registerVoipToken(String token) async {
    try {
      await _ref.read(authRepositoryProvider).registerPushToken(token: token, platform: _voipPlatform);
      debugPrint('[CallKit] VoIP token registered');
    } catch (e) {
      debugPrint('[CallKit] VoIP token register failed: $e');
    }
  }

  Future<void> _accept(Map<String, dynamic> body) async {
    final extra = (body['extra'] is Map) ? Map<String, dynamic>.from(body['extra'] as Map) : <String, dynamic>{};
    final conversationId = (extra['conversationId'] ?? '') as String;
    final callId = (extra['callId'] ?? body['id'] ?? '') as String;
    final contactName = (body['nameCaller'] ?? '') as String;
    final contactPhone = (extra['handle'] ?? body['handle'] ?? '') as String;

    final ctrl = _ref.read(callControllerProvider.notifier);
    // The controller resolves the SDP offer from the backend when it's missing
    // (cold start), so this works even when the app was killed by the push.
    await ctrl.setupIncomingFromNotification(
      conversationId: conversationId,
      contactName: contactName,
      contactPhone: contactPhone,
      callId: callId.isEmpty ? null : callId,
    );
    await ctrl.acceptIncoming();
    if (conversationId.isNotEmpty) _onRoute('/chat/$conversationId');
  }

  /// The system call UI ended the call. Route it correctly: declining a ring is
  /// NOT the same as hanging up a live call — an OUTBOUND call reported to
  /// CallKit (or an already-answered inbound one) must hang up, only a still-
  /// ringing inbound call is a decline.
  Future<void> _endFromSystem() async {
    try {
      final session = _ref.read(callControllerProvider);
      if (session == null) return;
      // Already torn down — nothing to do (also stops endAllCalls() from
      // bouncing back into another hangUp).
      if (session.phase == CallPhase.ended || session.phase == CallPhase.failed) {
        return;
      }
      final ctrl = _ref.read(callControllerProvider.notifier);
      if (session.inbound && session.phase == CallPhase.incoming) {
        await ctrl.rejectIncoming();
      } else {
        await ctrl.hangUp();
      }
    } catch (e) {
      debugPrint('[CallKit] end failed: $e');
    }
  }
}
