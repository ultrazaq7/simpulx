import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:path_provider/path_provider.dart';

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

  // ── Avatar bitmap generation ──────────────────────────
  /// Generate a square avatar PNG with contact initials on a colored background.
  /// Returns the file path. WhatsApp-style: rounded square, white letter, with
  /// small app icon badge at bottom-right corner.
  static Future<String?> _generateAvatarFile(String name) async {
    try {
      final initial = name.trim().isNotEmpty
          ? name.trim().substring(0, 1).toUpperCase()
          : '?';

      // Deterministic color from name hash
      const colors = [
        ui.Color(0xFF1B5E20), // dark green
        ui.Color(0xFF0D47A1), // dark blue
        ui.Color(0xFF4A148C), // deep purple
        ui.Color(0xFFBF360C), // deep orange
        ui.Color(0xFF006064), // cyan dark
        ui.Color(0xFF880E4F), // pink dark
        ui.Color(0xFF33691E), // lime dark
        ui.Color(0xFF1A237E), // indigo
      ];
      final bgColor = colors[name.hashCode.abs() % colors.length];

      const size = 256.0;
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, size, size));

      // Rounded rectangle background
      final paint = Paint()..color = bgColor;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(0, 0, size, size),
          const Radius.circular(32),
        ),
        paint,
      );

      // Draw initial letter
      final textPainter = TextPainter(
        text: TextSpan(
          text: initial,
          style: const TextStyle(
            color: ui.Color(0xFFFFFFFF),
            fontSize: 120,
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(
          (size - textPainter.width) / 2,
          (size - textPainter.height) / 2,
        ),
      );

      // Draw badge circle at bottom-right (WhatsApp-style)
      const badgeSize = 64.0;
      const badgeMargin = 12.0;
      final badgeCenter = Offset(size - badgeMargin - badgeSize / 2,
                                 size - badgeMargin - badgeSize / 2);

      // White background circle for badge
      canvas.drawCircle(badgeCenter, badgeSize / 2, Paint()..color = const ui.Color(0xFFFFFFFF));

      // Draw a simple phone icon in the badge (brand green)
      final iconPaint = Paint()
        ..color = const ui.Color(0xFF2D8B73)
        ..style = PaintingStyle.fill;

      // Phone icon approximation: small rounded rect
      final iconRect = RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: badgeCenter,
          width: 22,
          height: 28,
        ),
        const Radius.circular(4),
      );
      canvas.drawRRect(iconRect, iconPaint);

      // Add a small arc at top of phone icon for the receiver
      final arcPaint = Paint()
        ..color = const ui.Color(0xFFFFFFFF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4;

      canvas.drawArc(
        Rect.fromCenter(center: Offset(badgeCenter.dx, badgeCenter.dy - 8), width: 16, height: 12),
        0.2,
        2.7,
        false,
        arcPaint,
      );

      final picture = recorder.endRecording();
      final image = await picture.toImage(size.toInt(), size.toInt());
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();

      if (byteData == null) return null;

      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/notif_avatar_${name.hashCode.abs()}.png');
      await file.writeAsBytes(byteData.buffer.asUint8List());
      return file.path;
    } catch (e) {
      debugPrint('[Notification] Avatar generation failed: $e');
      return null;
    }
  }

  static Future<void> _show(
    FlutterLocalNotificationsPlugin plugin,
    NotificationPayload payload,
  ) async {
    final cat = payload.category;
    final isMessage = cat == NotificationCategory.incomingMessage;
    final isCall = cat == NotificationCategory.incomingCall;

    // ── Generate avatar bitmap ──────────────────────────
    final avatarPath = await _generateAvatarFile(payload.title);

    // ── Style ──────────────────────────────────────────────
    final StyleInformation style;

    if (isMessage) {
      const self = Person(
        key: 'self',
        name: 'You',
      );
      final sender = Person(
        key: payload.conversationId ?? payload.title,
        name: payload.title,
        important: true,
        // Square avatar with initials + badge overlay
        icon: avatarPath != null
            ? BitmapFilePathAndroidIcon(avatarPath)
            : const DrawableResourceAndroidIcon('@mipmap/ic_launcher'),
      );
      style = MessagingStyleInformation(
        self,
        groupConversation: false,
        messages: [
          Message(payload.body, DateTime.now(), sender),
        ],
      );
    } else if (isCall) {
      style = BigTextStyleInformation(
        'Incoming voice call',
        contentTitle: payload.title,
        summaryText: 'Simpulx Voice Call',
      );
    } else {
      style = BigTextStyleInformation(payload.body);
    }

    // Brand color
    const brandGreen = ui.Color(0xFF2D8B73);

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
      // Square avatar as largeIcon
      largeIcon: avatarPath != null
          ? FilePathAndroidBitmap(avatarPath)
          : const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
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
            titleColor: ui.Color(0xFFD32F2F),
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
