import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'local_notifications.dart';
import 'notification_payload.dart';

/// Background isolate handler for data-only pushes: surfaces a local
/// notification so the user never misses a lead, even when the app is killed.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await LocalNotifications.showFromData(message.data);
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
    await _fcm.requestPermission(alert: true, badge: true, sound: true);
  }

  /// Wire foreground display + tap routing. [onTapRoute] navigates the app;
  /// [allow] gates whether a category is shown in the foreground (user prefs).
  Future<void> initForeground({
    required void Function(String route) onTapRoute,
    bool Function(NotificationCategory category)? allow,
  }) async {
    await LocalNotifications.instance.init(onTapRoute: onTapRoute);

    FirebaseMessaging.onMessage.listen((message) {
      final payload = NotificationPayload.fromData(message.data);
      if (allow != null && !allow(payload.category)) return;
      LocalNotifications.instance.show(payload);
    });

    // For FCM notification-type messages (if any) tapped from background.
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      onTapRoute(NotificationPayload.fromData(message.data).route);
    });

    final initial = await _fcm.getInitialMessage();
    if (initial != null) {
      onTapRoute(NotificationPayload.fromData(initial.data).route);
    }
  }

  Future<String?> getToken() async {
    try {
      _token ??= await _fcm.getToken();
    } catch (_) {
      // iOS without an APNS token (e.g. simulator) returns null - non-fatal.
    }
    return _token;
  }

  Stream<String> get onTokenRefresh => _fcm.onTokenRefresh;

  Future<void> deleteToken() async {
    _token = null;
    try {
      await _fcm.deleteToken();
    } catch (_) {/* best effort */}
  }
}
