import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  // ── WhatsApp-style avatar with badge generation ──────────────────────────
  /// Generate a WhatsApp-style avatar with badge and save to file.
  /// Returns file path that can be used with FilePathAndroidBitmap.
  static Future<String?> _generateAvatarWithBadgeFile(String name) async {
    try {
      // Load the app icon bytes
      final iconBytes = await _loadAppIconBytes();

      final initial = name.trim().isNotEmpty
          ? name.trim().substring(0, 1).toUpperCase()
          : '?';

      // Deterministic color from name hash
      final bgColor = [
        const Color(0xFF1B5E20), // dark green
        const Color(0xFF0D47A1), // dark blue
        const Color(0xFF4A148C), // deep purple
        const Color(0xFFBF360C), // deep orange
        const Color(0xFF006064), // cyan dark
        const Color(0xFF880E4F), // pink dark
        const Color(0xFF33691E), // lime dark
        const Color(0xFF1A237E), // indigo
      ][name.hashCode.abs() % 8];

      const size = 256.0;

      // Draw to picture recorder
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, size, size));

      // Draw rounded square background (WhatsApp style)
      final bgPaint = Paint()..color = bgColor;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, size, size),
          const Radius.circular(40),
        ),
        bgPaint,
      );

      // Draw initial letter centered
      final textPainter = TextPainter(
        text: TextSpan(
          text: initial,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 128,
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

      // Draw app icon badge at bottom-right if we have icon bytes
      if (iconBytes != null) {
        await _drawAppIconBadge(canvas, size, iconBytes);
      } else {
        // Fallback: draw green circle with phone icon
        _drawFallbackBadge(canvas, size);
      }

      final picture = recorder.endRecording();
      final image = await picture.toImage(size.toInt(), size.toInt());
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();

      if (byteData == null) return null;

      // Save to temp file
      final dir = await getTemporaryDirectory();
      final fileName = 'notif_avatar_${name.hashCode.abs()}.png';
      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(byteData.buffer.asUint8List());

      debugPrint('[Notification] Avatar saved: ${file.path}');
      return file.path;
    } catch (e, st) {
      debugPrint('[Notification] AvatarWithBadge failed: $e');
      debugPrint('[Notification] Stack: $st');
      return null;
    }
  }

  /// Load app icon bytes from bundled resources.
  static Future<Uint8List?> _loadAppIconBytes() async {
    try {
      // Try to load ic_notification from assets
      // Use rootBundle which is available in Flutter context
      final ByteData data = await rootBundle.load(
        'android/app/src/main/res/drawable-hdpi/ic_notification.png',
      );
      return data.buffer.asUint8List();
    } catch (e) {
      debugPrint('[Notification] Failed to load app icon: $e');
      return null;
    }
  }

  /// Draw app icon badge at bottom-right (WhatsApp style).
  static Future<void> _drawAppIconBadge(
    Canvas canvas,
    double size,
    Uint8List iconBytes,
  ) async {
    const badgeSize = 64.0;
    const badgeMargin = 8.0;
    final badgeCenter = Offset(
      size - badgeMargin - badgeSize / 2,
      size - badgeMargin - badgeSize / 2,
    );

    // White border
    canvas.drawCircle(
      badgeCenter,
      badgeSize / 2 + 2,
      Paint()..color = Colors.white,
    );

    try {
      // Decode the icon image
      final codec = await ui.instantiateImageCodec(iconBytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;

      // Draw the icon scaled to fit in the badge
      final src = Rect.fromLTWH(
        0,
        0,
        image.width.toDouble(),
        image.height.toDouble(),
      );
      final dst = Rect.fromCenter(
        center: badgeCenter,
        width: badgeSize - 8,
        height: badgeSize - 8,
      );
      canvas.drawImageRect(image, src, dst, Paint());
      image.dispose();
    } catch (e) {
      debugPrint('[Notification] Failed to draw app icon: $e');
      // Fallback: draw green circle
      _drawFallbackBadge(canvas, size);
    }
  }

  /// Draw fallback badge (green circle).
  static void _drawFallbackBadge(Canvas canvas, double size) {
    const badgeSize = 64.0;
    const badgeMargin = 8.0;
    final badgeCenter = Offset(
      size - badgeMargin - badgeSize / 2,
      size - badgeMargin - badgeSize / 2,
    );

    // White border
    canvas.drawCircle(
      badgeCenter,
      badgeSize / 2 + 2,
      Paint()..color = Colors.white,
    );

    // Green background
    canvas.drawCircle(
      badgeCenter,
      badgeSize / 2,
      Paint()..color = const Color(0xFF25D366),
    );
  }

  /// Cache for avatar file paths to avoid regenerating
  static final Map<int, String> _avatarPathCache = {};

  /// Get cached avatar path or generate new one.
  static Future<String?> _getAvatarPath(String name) async {
    final hash = name.hashCode.abs();
    if (_avatarPathCache.containsKey(hash)) {
      return _avatarPathCache[hash];
    }
    final path = await _generateAvatarWithBadgeFile(name);
    if (path != null) {
      _avatarPathCache[hash] = path;
    }
    return path;
  }

  static Future<void> _show(
    FlutterLocalNotificationsPlugin plugin,
    NotificationPayload payload,
  ) async {
    try {
      await _showInternal(plugin, payload);
    } catch (e, st) {
      debugPrint('[Notification] _show failed: $e');
      debugPrint('[Notification] Stack: $st');
      // Fallback: show simple notification without avatar
      await _showFallback(plugin, payload);
    }
  }

  static Future<void> _showInternal(
    FlutterLocalNotificationsPlugin plugin,
    NotificationPayload payload,
  ) async {
    final cat = payload.category;
    final isMessage = cat == NotificationCategory.incomingMessage;
    final isCall = cat == NotificationCategory.incomingCall;

    // ── Generate WhatsApp-style avatar with badge ─────────────
    // Try to generate, but don't fail if it doesn't work
    String? avatarPath;
    try {
      avatarPath = await _getAvatarPath(payload.title);
    } catch (e) {
      debugPrint('[Notification] Avatar generation failed: $e');
      avatarPath = null;
    }

    debugPrint('[Notification] Avatar path: $avatarPath');

    // ── Style ──────────────────────────────────────────────
    final StyleInformation style;
    final DrawableResourceAndroidIcon defaultIcon =
        const DrawableResourceAndroidIcon('@mipmap/ic_launcher');

    if (isMessage) {
      const self = Person(
        key: 'self',
        name: 'You',
      );

      final sender = Person(
        key: payload.conversationId ?? payload.title,
        name: payload.title,
        important: true,
        // Note: Person.icon is optional, Android uses sender name for avatar
        // The largeIcon will show the avatar with badge
      );

      // No conversationTitle to avoid duplicate "Simpulx • Simpulx" header
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

    // Brand colors
    const brandGreen = Color(0xFF2D8B73);

    // Large icon with badge - avatar PNG already contains badge
    AndroidBitmap<Object> largeIcon;
    if (avatarPath != null && avatarPath.isNotEmpty) {
      try {
        largeIcon = FilePathAndroidBitmap(avatarPath);
      } catch (e) {
        debugPrint('[Notification] largeIcon bitmap failed: $e');
        largeIcon = const DrawableResourceAndroidBitmap('@mipmap/ic_launcher');
      }
    } else {
      largeIcon = const DrawableResourceAndroidBitmap('@mipmap/ic_launcher');
    }

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
      // Use a transparent 1x1 icon to avoid showing small icon overlay
      icon: '@drawable/ic_notification',
      largeIcon: largeIcon,
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

  /// Fallback notification without avatar - shows when avatar generation fails.
  static Future<void> _showFallback(
    FlutterLocalNotificationsPlugin plugin,
    NotificationPayload payload,
  ) async {
    final cat = payload.category;
    final isMessage = cat == NotificationCategory.incomingMessage;
    final isCall = cat == NotificationCategory.incomingCall;

    final StyleInformation style;
    if (isMessage) {
      const self = Person(key: 'self', name: 'You');
      final sender = Person(
        key: payload.conversationId ?? payload.title,
        name: payload.title,
        important: true,
      );
      // No conversationTitle to avoid duplicate header
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

    const brandGreen = Color(0xFF2D8B73);

    final android = AndroidNotificationDetails(
      cat.channelId,
      cat.channelName,
      importance: (isCall || !isMessage) ? Importance.max : Importance.high,
      priority: Priority.high,
      category: isCall ? AndroidNotificationCategory.call : AndroidNotificationCategory.message,
      fullScreenIntent: isCall,
      icon: '@drawable/ic_notification',
      largeIcon: const DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
      styleInformation: style,
      actions: [
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
        if (isCall) ...[
          const AndroidNotificationAction('decline', 'Decline', titleColor: Color(0xFFD32F2F), showsUserInterface: true),
          const AndroidNotificationAction('answer', 'Answer', titleColor: brandGreen, showsUserInterface: true),
        ],
      ],
      ongoing: isCall,
      autoCancel: !isCall,
    );

    final id = (payload.conversationId ?? payload.contactId ?? payload.rawType ?? '').hashCode & 0x7fffffff;

    await plugin.show(
      id: id,
      title: isMessage ? null : payload.title,
      body: isMessage ? null : payload.body,
      notificationDetails: NotificationDetails(android: android),
      payload: payload.encodeRoute(),
    );
    debugPrint('[Notification] Fallback notification shown');
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
