import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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
    // If it's an action with reply input, handle inline (foreground)
    if (response.actionId == 'reply' || response.actionId == 'mark_read') {
      _handleActionForeground(response);
      return;
    }
    final route = NotificationPayload.routeFromEncoded(response.payload);
    debugPrint('[LocalNotifications] Tapped: ${response.actionId} -> $route');
    onTapRoute?.call(route);
  }

  /// Handle reply/mark-read when the app is in the foreground.
  void _handleActionForeground(NotificationResponse response) {
    final payloadStr = response.payload;
    if (payloadStr == null) return;
    final convId = _extractConversationId(payloadStr);
    if (convId == null) return;

    if (response.actionId == 'reply') {
      final input = response.input;
      if (input != null && input.isNotEmpty) {
        _sendReplyInBackground(convId, input).then((_) {
          // Dismiss the notification after successful reply
          final id = convId.hashCode & 0x7fffffff;
          _plugin.cancel(id: id);
        });
      }
    } else if (response.actionId == 'mark_read') {
      _markReadInBackground(convId).then((_) {
        final id = convId.hashCode & 0x7fffffff;
        _plugin.cancel(id: id);
      });
    }
  }

  Future<void> show(NotificationPayload payload) async {
    debugPrint('[LocalNotifications] show: ${payload.category} - ${payload.title}');
    await _show(_plugin, payload);
  }

  /// Cancel a notification by its id.
  Future<void> cancel(int id) => _plugin.cancel(id: id);

  /// Show from a raw data map (used by the background isolate).
  static Future<void> showFromData(Map<String, dynamic> data) async {
    debugPrint('[LocalNotifications] showFromData: $data');

    final plugin = FlutterLocalNotificationsPlugin();
    const android = AndroidInitializationSettings('@drawable/ic_notification');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await plugin.initialize(
      settings: const InitializationSettings(android: android, iOS: ios),
      onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
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

    // ── Style ──────────────────────────────────────────────
    final StyleInformation style;

    if (isMessage) {
      // Android MessagingStyle: person avatar + badge overlay.
      // 'self' = device owner, 'sender' = the contact who sent the message.
      // Person.icon = app launcher icon → Android overlays ic_notification
      // as a small badge at bottom-right (WhatsApp behavior).
      const self = Person(
        key: 'self',
        name: 'You',
      );
      final sender = Person(
        key: payload.conversationId ?? payload.title,
        name: payload.title,
        important: true,
        icon: const DrawableResourceAndroidIcon('@mipmap/ic_launcher'),
      );
      style = MessagingStyleInformation(
        self,
        groupConversation: false,
        messages: [
          Message(payload.body, DateTime.now(), sender),
        ],
      );
    } else if (isCall) {
      // Calls use BigText, NOT MessagingStyle
      style = BigTextStyleInformation(
        'Incoming voice call',
        contentTitle: payload.title,
        summaryText: 'WhatsApp Voice Call',
      );
    } else {
      style = BigTextStyleInformation(payload.body);
    }

    // Brand color
    const brandGreen = Color(0xFF2D8B73);

    final android = AndroidNotificationDetails(
      cat.channelId,
      cat.channelName,
      importance: (isCall || !isMessage) ? Importance.max : Importance.high,
      priority: Priority.high,
      groupKey: isMessage
          ? 'simpulx_messages_${payload.conversationId ?? 'general'}'
          : null,
      category: isCall
          ? AndroidNotificationCategory.call
          : AndroidNotificationCategory.message,
      fullScreenIntent: isCall,
      icon: '@drawable/ic_notification',
      // largeIcon for message (avatar badge) and for call (contact icon)
      largeIcon: (isMessage || isCall)
          ? const DrawableResourceAndroidBitmap('@mipmap/ic_launcher')
          : null,
      color: brandGreen,
      colorized: true,
      styleInformation: style,
      actions: [
        // ── Message actions ──
        if (isMessage) ...[
          const AndroidNotificationAction(
            'reply',
            'Reply',
            showsUserInterface: false,
            inputs: [AndroidNotificationActionInput(label: 'Type a message...')],
          ),
          const AndroidNotificationAction(
            'mark_read',
            'Mark as read',
            showsUserInterface: false,
          ),
        ],
        // ── Call actions ──
        if (isCall) ...[
          const AndroidNotificationAction(
            'decline',
            'Decline',
            titleColor: Color(0xFFD32F2F),
            showsUserInterface: true,
          ),
          const AndroidNotificationAction(
            'answer',
            'Answer',
            titleColor: brandGreen,
            showsUserInterface: true,
          ),
        ],
      ],
      ongoing: isCall,
      autoCancel: !isCall,
      visibility: isCall
          ? NotificationVisibility.public
          : NotificationVisibility.private,
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

    await plugin.show(
      id: id,
      // For MessagingStyle, Android uses the Person name as title.
      // For calls/other, use the payload title/body.
      title: isMessage ? null : payload.title,
      body: isMessage ? null : payload.body,
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

  /// Extract conversationId from an encoded payload string (type|convId|contactId).
  static String? _extractConversationId(String encoded) {
    final parts = encoded.split('|');
    final convId = parts.length > 1 ? parts[1] : '';
    return convId.isNotEmpty ? convId : null;
  }

  /// Fire-and-forget reply via Dio using stored credentials.
  static Future<void> _sendReplyInBackground(String convId, String text) async {
    try {
      debugPrint('[Notification] Attempting reply to $convId: "$text"');
      final store = SecureStore();
      final hasSession = await store.hasSession;
      debugPrint('[Notification] hasSession: $hasSession');
      if (!hasSession) return;
      final token = await store.readAccessToken();
      debugPrint('[Notification] token: ${token?.substring(0, 10)}...');
      final client = DioClient(config: AppConfig.resolve(), secureStore: store);
      final response = await client.dio.post(
        '/api/conversations/$convId/messages',
        data: {'type': 'text', 'body': text},
      );
      debugPrint('[Notification] Reply sent: ${response.statusCode}');
    } catch (e, st) {
      debugPrint('[Notification] Reply failed: $e');
      debugPrint('[Notification] Stack: $st');
    }
  }

  /// Fire-and-forget mark-read via fetching latest message.
  static Future<void> _markReadInBackground(String convId) async {
    try {
      debugPrint('[Notification] Attempting mark-read: $convId');
      final store = SecureStore();
      if (!(await store.hasSession)) return;
      final client = DioClient(config: AppConfig.resolve(), secureStore: store);
      await client.dio.get('/api/conversations/$convId/messages',
          queryParameters: {'limit': 1});
      debugPrint('[Notification] Marked read: $convId');
    } catch (e) {
      debugPrint('[Notification] Mark read failed: $e');
    }
  }
}

/// Top-level handler for notification actions when app is in background/killed.
@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse response) async {
  WidgetsFlutterBinding.ensureInitialized();
  debugPrint('[Notification BG] actionId=${response.actionId} payload=${response.payload}');

  final payloadStr = response.payload;
  if (payloadStr == null) return;

  final convId = LocalNotifications._extractConversationId(payloadStr);
  debugPrint('[Notification BG] convId=$convId');
  if (convId == null) return;

  if (response.actionId == 'reply') {
    final input = response.input;
    debugPrint('[Notification BG] reply input="$input"');
    if (input != null && input.isNotEmpty) {
      await LocalNotifications._sendReplyInBackground(convId, input);
    }
  } else if (response.actionId == 'mark_read') {
    await LocalNotifications._markReadInBackground(convId);
  }
}
