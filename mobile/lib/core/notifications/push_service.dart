import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'local_notifications.dart';
import 'notification_payload.dart';

/// Background isolate handler for data-only pushes: surfaces a local
/// notification so the user never misses a lead, even when the app is killed.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('[FCM Background] Received message: ${message.data}');
  // All notifications are built natively by SimpulxMessagingService (Kotlin).
  // No Flutter notification display needed.
}

/// FCM lifecycle: permission, token registration, foreground display, and deep
/// link taps. The backend sends data-only messages, so foreground/background
/// both render via [LocalNotifications].
class PushService {
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  String? _token;

  String get platform =>
      Platform.isIOS ? 'iOS' : (Platform.isAndroid ? 'Android' : 'Web');

  Future<void> requestPermission() async {
    debugPrint('[PushService] Requesting FCM permission...');
    final result = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: true, // Allow provisional (silent) permission on iOS
    );
    debugPrint('[PushService] Permission result: $result');
  }

  /// Wire foreground display + tap routing. [onTapRoute] navigates the app;
  /// [allow] gates whether a category is shown in the foreground (user prefs).
  Future<void> initForeground({
    required void Function(String route) onTapRoute,
    bool Function(NotificationCategory category)? allow,
  }) async {
    debugPrint('[PushService] initForeground called');
    await LocalNotifications.instance.init(onTapRoute: onTapRoute);

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('[PushService] Foreground message: ${message.data}');
      // On Android, SimpulxMessagingService (native) renders EVERY push in all
      // app states (messages, calls, alerts) with the correct call lifecycle
      // (a call_ended push dismisses the ring instead of re-ringing). Showing a
      // Flutter notification here as well double-posted the call - the second
      // one even rang for ended/missed calls. iOS has no native handler, so it
      // still needs this Flutter fallback.
      if (Platform.isAndroid) {
        debugPrint('[PushService] Skipping - native Kotlin handles all pushes');
        return;
      }
      final payload = NotificationPayload.fromData(message.data);
      debugPrint('[PushService] Payload category: ${payload.category}');
      if (allow != null && !allow(payload.category)) {
        debugPrint('[PushService] Blocked by allow callback');
        return;
      }
      debugPrint('[PushService] Showing notification...');
      LocalNotifications.instance.show(payload);
    });

    // Handle when app opened from notification
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      debugPrint('[PushService] onMessageOpenedApp: ${message.data}');
      onTapRoute(NotificationPayload.fromData(message.data).route);
    });

    // Handle cold start from notification
    final initial = await _fcm.getInitialMessage();
    if (initial != null) {
      debugPrint('[PushService] getInitialMessage: ${initial.data}');
      onTapRoute(NotificationPayload.fromData(initial.data).route);
    } else {
      debugPrint('[PushService] No initial message');
    }
  }

  Future<String?> getToken() async {
    try {
      _token = await _fcm.getToken();
      debugPrint('[PushService] FCM Token: ${_token?.substring(0, 20)}...');
    } catch (e) {
      debugPrint('[PushService] getToken error: $e');
      // iOS without an APNS token (e.g. simulator) returns null - non-fatal.
    }
    return _token;
  }

  Stream<String> get onTokenRefresh => _fcm.onTokenRefresh;

  Future<void> deleteToken() async {
    _token = null;
    try {
      await _fcm.deleteToken();
      debugPrint('[PushService] Token deleted');
    } catch (_) {/* best effort */}
  }
}
