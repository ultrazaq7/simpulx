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
      // NOT provisional. Provisional authorization on iOS means "deliver
      // quietly": no prompt, but also NO banner, NO sound and NO icon badge —
      // notifications only ever appear buried in Notification Center, which reads
      // to the user as "notifications are completely broken". Ask for real
      // authorization so iOS behaves like Android/WhatsApp.
      provisional: false,
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

    // iOS: let the OS render the aps alert the server now sends (foreground
    // included), so notifications look/behave natively like Android's and the
    // Dart layer never has to draw a standard notification (no duplicate).
    if (Platform.isIOS) {
      await _fcm.setForegroundNotificationPresentationOptions(
          alert: true, badge: true, sound: true);
    }

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('[PushService] Foreground message: ${message.data}');
      // On Android, SimpulxMessagingService (native) renders EVERY push in all
      // app states (messages, calls, alerts) with the correct call lifecycle
      // (a call_ended push dismisses the ring instead of re-ringing). Showing a
      // Flutter notification here as well double-posted the call.
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
      // iOS: standard notifications are rendered natively by the OS from the
      // server's aps alert, so DON'T re-draw them here (that was the duplicate).
      // Calls still need the Dart-rendered notification until CallKit lands.
      if (payload.category != NotificationCategory.incomingCall) {
        debugPrint('[PushService] iOS standard notif - native aps handles it');
        return;
      }
      debugPrint('[PushService] Showing call notification...');
      LocalNotifications.instance.show(payload);
    });

    // Handle when app opened from notification
    // Route a tapped notification exactly ONCE. onMessageOpenedApp and
    // getInitialMessage can BOTH deliver the same message on a cold start, which
    // pushed the chat route twice — the thread ended up stacked on itself, so
    // backing out of a chat opened from a notification showed it a second time.
    final handledTaps = <String>{};
    void routeOnce(RemoteMessage message, String source) {
      final id = message.messageId ?? '';
      if (id.isNotEmpty && !handledTaps.add(id)) {
        debugPrint('[PushService] $source: tap already routed ($id), skipping');
        return;
      }
      if (handledTaps.length > 50) handledTaps.clear();
      debugPrint('[PushService] $source: ${message.data}');
      onTapRoute(NotificationPayload.fromData(message.data).route);
    }

    FirebaseMessaging.onMessageOpenedApp.listen(
      (message) => routeOnce(message, 'onMessageOpenedApp'),
    );

    // Handle cold start from notification
    final initial = await _fcm.getInitialMessage();
    if (initial != null) {
      routeOnce(initial, 'getInitialMessage');
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
