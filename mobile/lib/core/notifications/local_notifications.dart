import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_payload.dart';

/// Wraps flutter_local_notifications: per-category Android channels, display of
/// data-only pushes, and tap routing. Used in the foreground and (via
/// [showFromData]) in the background isolate.
class LocalNotifications {
  LocalNotifications._();
  static final LocalNotifications instance = LocalNotifications._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  void Function(String route)? onTapRoute;
  bool _initialized = false;

  Future<void> init({void Function(String route)? onTapRoute}) async {
    this.onTapRoute = onTapRoute;
    if (!_initialized) {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const ios = DarwinInitializationSettings(
        // Permission is requested via FCM in PushService.
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      await _plugin.initialize(
        settings: const InitializationSettings(android: android, iOS: ios),
        onDidReceiveNotificationResponse: _onResponse,
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );
      await _ensureChannels(_plugin);
      _initialized = true;
    }

    // Cold start via a tapped local notification.
    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp ?? false) {
      final route = NotificationPayload.routeFromEncoded(
        launch?.notificationResponse?.payload,
      );
      this.onTapRoute?.call(route);
    }
  }

  void _onResponse(NotificationResponse response) {
    final route = NotificationPayload.routeFromEncoded(response.payload);
    onTapRoute?.call(route);
  }

  Future<void> show(NotificationPayload payload) =>
      _show(_plugin, payload);

  /// Show from a raw data map (used by the background isolate).
  static Future<void> showFromData(Map<String, dynamic> data) async {
    final plugin = FlutterLocalNotificationsPlugin();
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await plugin.initialize(
      settings: const InitializationSettings(android: android, iOS: ios),
    );
    await _ensureChannels(plugin);
    await _show(plugin, NotificationPayload.fromData(data));
  }

  static Future<void> _show(
    FlutterLocalNotificationsPlugin plugin,
    NotificationPayload payload,
  ) async {
    final cat = payload.category;
    final isUrgent = cat != NotificationCategory.incomingMessage;
    final android = AndroidNotificationDetails(
      cat.channelId,
      cat.channelName,
      importance: isUrgent ? Importance.max : Importance.high,
      priority: Priority.high,
      category: AndroidNotificationCategory.message,
      styleInformation: BigTextStyleInformation(payload.body),
      actions: const [
        AndroidNotificationAction('view', 'View'),
      ],
    );
    const ios = DarwinNotificationDetails(
      interruptionLevel: InterruptionLevel.timeSensitive,
    );
    // Collapse repeats for the same conversation/lead.
    final id =
        (payload.conversationId ?? payload.contactId ?? payload.rawType ?? '')
                .hashCode &
            0x7fffffff;
    await plugin.show(
      id: id,
      title: payload.title,
      body: payload.body,
      notificationDetails: NotificationDetails(android: android, iOS: ios),
      payload: payload.encodeRoute(),
    );
  }

  static Future<void> _ensureChannels(
      FlutterLocalNotificationsPlugin plugin) async {
    final android = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;
    for (final cat in NotificationCategory.values) {
      await android.createNotificationChannel(
        AndroidNotificationChannel(
          cat.channelId,
          cat.channelName,
          importance: cat == NotificationCategory.incomingMessage
              ? Importance.high
              : Importance.max,
          playSound: true,
          enableVibration: true,
        ),
      );
    }
  }
}

/// Top-level handler for taps on notifications shown by the background isolate.
@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) {
  // The app routes from getNotificationAppLaunchDetails on next launch.
}
