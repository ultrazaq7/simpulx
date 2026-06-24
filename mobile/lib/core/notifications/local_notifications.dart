import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';
import '../network/dio_client.dart';
import '../storage/secure_store.dart';
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
      // Use @drawable/ic_notification for notification icon (transparent background)
      const android = AndroidInitializationSettings('@drawable/ic_notification');
      const ios = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      await _plugin.initialize(
        settings: const InitializationSettings(android: android, iOS: ios),
        onDidReceiveNotificationResponse: _onResponse,
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );

      await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();

      await _ensureChannels(_plugin);
      _initialized = true;
      debugPrint('[LocalNotifications] Initialized');
    }

    // Cold start via a tapped local notification.
    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp ?? false) {
      final route = NotificationPayload.routeFromEncoded(
        launch?.notificationResponse?.payload,
      );
      debugPrint('[LocalNotifications] Launch from notification: $route');
      this.onTapRoute?.call(route);
    }
  }

  void _onResponse(NotificationResponse response) {
    final route = NotificationPayload.routeFromEncoded(response.payload);
    debugPrint('[LocalNotifications] Tapped: ${response.actionId} -> $route');
    onTapRoute?.call(route);
  }

  Future<void> show(NotificationPayload payload) async {
    debugPrint('[LocalNotifications] show: ${payload.category} - ${payload.title}');
    await _show(_plugin, payload);
  }

  /// Show from a raw data map (used by the background isolate).
  static Future<void> showFromData(Map<String, dynamic> data) async {
    debugPrint('[LocalNotifications] showFromData: $data');

    final plugin = FlutterLocalNotificationsPlugin();
    // Use @drawable/ic_notification for notification icon
    const android = AndroidInitializationSettings('@drawable/ic_notification');
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
    final isMessage = cat == NotificationCategory.incomingMessage;
    final isCall = cat == NotificationCategory.incomingCall;
    final isUrgent = isCall || !isMessage;

    debugPrint('[LocalNotifications] _show: isMessage=$isMessage, isCall=$isCall, isUrgent=$isUrgent');

    // WhatsApp-style: incoming messages use MessagingStyle
    // For calls, use big text with fullScreenIntent for incoming call screen
    final StyleInformation style;

    if (isMessage) {
      // MessagingStyle for WhatsApp-like chat notification
      final person = Person(
        key: payload.conversationId ?? payload.title,
        name: payload.title,
        important: true,
      );
      style = MessagingStyleInformation(
        person,
        groupConversation: false,
        messages: [
          Message(payload.body, DateTime.now(), person),
        ],
      );
    } else {
      style = BigTextStyleInformation(payload.body);
    }

    // WhatsApp green color
    const whatsappGreen = Color(0xFF00A884);

    final android = AndroidNotificationDetails(
      cat.channelId,
      cat.channelName,
      importance: isUrgent ? Importance.max : Importance.high,
      priority: Priority.high,

      category: isCall
          ? AndroidNotificationCategory.call
          : AndroidNotificationCategory.message,
      // Full screen intent for incoming calls - shows over lock screen
      fullScreenIntent: isCall,
      icon: '@drawable/ic_notification',
      color: const Color(0xFF2D8B73),
      styleInformation: style,
      // WhatsApp-like actions
      actions: [
        if (isMessage) ...[
          const AndroidNotificationAction(
            'reply',
            'Reply',
            titleColor: whatsappGreen,
            inputs: [AndroidNotificationActionInput(label: 'Reply message')],
          ),
          const AndroidNotificationAction('mark_read', 'Mark as read'),
        ],
        if (isCall) ...[
          const AndroidNotificationAction('decline', 'Decline', titleColor: Color(0xFFD32F2F)),
          const AndroidNotificationAction('answer', 'Answer', titleColor: whatsappGreen),
        ],
      ],
      // Ongoing for calls
      ongoing: isCall,
      autoCancel: !isCall,
      // Only show when unlocked for messages, always show for calls
      visibility: isCall ? NotificationVisibility.public : NotificationVisibility.private,
    );

    const ios = DarwinNotificationDetails(
      interruptionLevel: InterruptionLevel.timeSensitive,
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    // Collapse repeats for the same conversation/lead.
    final id =
        (payload.conversationId ?? payload.contactId ?? payload.rawType ?? '')
                .hashCode &
            0x7fffffff;

    debugPrint('[LocalNotifications] Showing notification id=$id, title=${payload.title}');
    await plugin.show(
      id: id,
      title: payload.title,
      body: payload.body,
      notificationDetails: NotificationDetails(android: android, iOS: ios),
      payload: payload.encodeRoute(),
    );
    debugPrint('[LocalNotifications] Show complete');
  }

  static Future<void> _ensureChannels(
      FlutterLocalNotificationsPlugin plugin) async {
    final android = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;

    // Create channels with proper settings for each category
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
void notificationTapBackground(NotificationResponse response) async {
  // Background actions handler
  if (response.actionId == 'reply' || response.actionId == 'mark_read') {
    WidgetsFlutterBinding.ensureInitialized();
    final payloadStr = response.payload;
    if (payloadStr == null) return;
    
    // Parse conversation ID from route payload (e.g. /inbox/123)
    final route = NotificationPayload.routeFromEncoded(payloadStr);
    if (!route.startsWith('/inbox/')) return;
    final parts = route.split('/');
    if (parts.length < 3) return;
    final convId = parts[2];

    final secureStore = SecureStore();
    if (!(await secureStore.hasSession)) return;

    final dioClient = DioClient(config: AppConfig.resolve(), secureStore: secureStore);

    if (response.actionId == 'reply') {
      final input = response.input;
      if (input != null && input.isNotEmpty) {
        try {
          await dioClient.dio.post('/api/conversations/$convId/messages', data: {
            'type': 'text',
            'body': input,
          });
        } catch (e) {
          debugPrint('[Background] Reply failed: $e');
        }
      }
    } else if (response.actionId == 'mark_read') {
      try {
        await dioClient.dio.get('/api/conversations/$convId/messages?limit=1');
      } catch (e) {
        debugPrint('[Background] Mark read failed: $e');
      }
    }
  }
}
