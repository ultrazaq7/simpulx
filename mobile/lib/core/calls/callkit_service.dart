import 'dart:async';
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

    // 1) Attach the event listener FIRST, so a token-update event that fires while
    //    we poll below is never missed (the plugin emits it exactly once).
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
          await _endFromSystem(body);
          break;
        default:
          break;
      }
    });

    // 2) Poll for the VoIP token until the plugin has it. It can be empty at this
    //    instant (issued shortly after launch), so retry instead of checking once.
    //    This is independent of any native callback/registration timing, so the
    //    ios_voip token gets registered even if the one-time event was missed.
    unawaited(_pollVoipToken());
  }

  Future<void> _pollVoipToken() async {
    for (var i = 0; i < 20; i++) {
      try {
        final tok = await FlutterCallkitIncoming.getDevicePushTokenVoIP();
        if (tok is String && tok.isNotEmpty) {
          await _registerVoipToken(tok);
          return;
        }
      } catch (e) {
        debugPrint('[CallKit] VoIP token fetch failed: $e');
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    debugPrint('[CallKit] VoIP token still empty after polling');
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
  Future<void> _endFromSystem(Map<String, dynamic> body) async {
    try {
      final session = _ref.read(callControllerProvider);
      // No local session: the VoIP push woke us straight into CallKit and the
      // agent declined from the lock screen without the app ever running, so Dart
      // has no call state. Returning here meant the BACKEND WAS NEVER TOLD and the
      // customer kept ringing on a call nobody would answer. Reject by the id the
      // push carried instead — the same id CallKit is showing.
      if (session == null) {
        final extra = (body['extra'] is Map)
            ? Map<String, dynamic>.from(body['extra'] as Map)
            : <String, dynamic>{};
        final callId =
            (extra['callId'] ?? body['id'] ?? '').toString();
        if (callId.isEmpty) return;
        try {
          await _ref.read(callsDataSourceProvider).reject(callId);
          debugPrint('[CallKit] declined (no session) -> rejected $callId');
        } catch (e) {
          debugPrint('[CallKit] reject without session failed: $e');
        }
        return;
      }
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
