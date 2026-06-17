// ============================================================
// Push Notification Service - Firebase Cloud Messaging
// Aggressive notifications like WhatsApp
// ============================================================
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/router/app_router.dart';

import 'package:simpulx/core/network/websocket_service.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';

// Conditional import for Firebase (not available on web by default)
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

/// Top-level background message handler - MUST be top-level function
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await NotificationService._showLocalNotification(message);
}

class NotificationService with WidgetsBindingObserver {
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static final NotificationService _instance = NotificationService._();
  static String? _pendingToken;

  NotificationService._();

  /// Initialize Firebase + local notifications (call before login)
  static Future<void> init() async {
    if (kIsWeb || _initialized) return;
    _initialized = true;

    await Firebase.initializeApp();

    // Background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Android notification channel - HIGH importance for aggressive delivery
    const androidChannel = AndroidNotificationChannel(
      'simpulx_chat_v2',
      'Chat Messages',
      description: 'New incoming chat messages',
      importance: Importance.max,
      enableVibration: true,
      playSound: true,
      showBadge: true,
      enableLights: true,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);

    // Init local notifications - use monochrome drawable icon
    const androidInit =
        AndroidInitializationSettings('@drawable/ic_stat_notification');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
      requestCriticalPermission: true,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    // Request permission
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      criticalAlert: true,
      provisional: false,
    );

    // Set foreground notification presentation (iOS)
    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // Listen for foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification tap when app is in background
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationOpen);

    // Handle notification tap that launched app from terminated state
    final initialMessage = await messaging.getInitialMessage();
    if (initialMessage != null) {
      // Delay to let router initialize
      Future.delayed(const Duration(seconds: 1), () {
        _handleNotificationOpen(initialMessage);
      });
    }

    // Get token now, but don't send yet (no auth token yet)
    try {
      _pendingToken = await messaging.getToken();
    } catch (e) {
      debugPrint('FCM token error: $e');
    }

    // Listen for token refresh
    messaging.onTokenRefresh.listen((token) {
      _pendingToken = token;
      _sendTokenToServer(token);
    });

    // Register lifecycle observer for WebSocket reconnection
    WidgetsBinding.instance.addObserver(_instance);
  }

  /// Call AFTER successful login to register FCM token with backend
  static Future<void> registerTokenAfterLogin() async {
    if (kIsWeb) return;
    try {
      final token =
          _pendingToken ?? await FirebaseMessaging.instance.getToken();
      if (token != null) {
        _pendingToken = token;
        await _sendTokenToServer(token);
      }
    } catch (e) {
      debugPrint('FCM token registration error: $e');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // App came back to foreground - reconnect WebSocket + refresh data
      try {
        final wsService = di.sl<WebSocketService>();
        wsService.reconnectIfNeeded();
        debugPrint('📱 App resumed - WebSocket reconnecting');
      } catch (_) {}
      // Refresh conversation list to catch messages received while backgrounded
      try {
        final convCubit = di.sl<ConversationCubit>();
        convCubit.refreshOnResume();
        debugPrint('📱 App resumed - Refreshing conversations');
      } catch (_) {}
    }
  }

  static Future<void> _sendTokenToServer(String token) async {
    try {
      final dioClient = di.sl<DioClient>();
      await dioClient.dio.post(
        '${ApiConstants.baseUrl}/users/fcm-token',
        data: {'token': token, 'platform': defaultTargetPlatform.name},
      );
      debugPrint('✅ FCM token registered');
    } catch (e) {
      debugPrint('Failed to send FCM token: $e');
    }
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    await _showLocalNotification(message);
  }

  /// Generate a letter avatar as PNG bytes (like the contact list circle)
  static Future<Uint8List> _generateLetterAvatar(String name) async {
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    // Use shared color palette for consistency with contact list UI
    final color = AvatarColors.getColor(name);

    const size = 128.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, size, size));

    // Draw filled circle
    final paint = Paint()..color = color;
    canvas.drawCircle(const Offset(size / 2, size / 2), size / 2, paint);

    // Draw letter
    final textPainter = TextPainter(
      text: TextSpan(
        text: initial,
        style: const TextStyle(
          color: Color(0xFFFFFFFF),
          fontSize: 56,
          fontWeight: FontWeight.w700,
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

    final picture = recorder.endRecording();
    final image = await picture.toImage(size.toInt(), size.toInt());
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return byteData!.buffer.asUint8List();
  }

  // Cache message texts per conversation for stacking
  static final Map<String, List<String>> _messageTextCache = {};

  /// Clear message cache when user opens a conversation
  static void clearMessageCache(String conversationId) {
    _messageTextCache.remove(conversationId);
  }

  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    final data = message.data;

    final title = notification?.title ?? data['title'] ?? 'New Message';
    final body = notification?.body ?? data['body'] ?? '';
    final conversationId = data['conversationId'] ?? '';

    // Use conversationId hashCode as notification ID for grouping per conversation
    final notifId =
        conversationId.isNotEmpty ? conversationId.hashCode : message.hashCode;
    final cacheKey =
        conversationId.isNotEmpty ? conversationId : notifId.toString();

    // Generate letter avatar and save to temp file
    String? avatarPath;
    try {
      final avatarBytes = await _generateLetterAvatar(title);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/notif_avatar_${title.hashCode.abs()}.png');
      await file.writeAsBytes(avatarBytes);
      avatarPath = file.path;
    } catch (e) {
      debugPrint('Avatar generation failed: $e');
    }

    // Accumulate message texts for stacking (like WhatsApp)
    _messageTextCache.putIfAbsent(cacheKey, () => []);
    _messageTextCache[cacheKey]!.add(body);
    if (_messageTextCache[cacheKey]!.length > 10) {
      _messageTextCache[cacheKey] = _messageTextCache[cacheKey]!.sublist(
        _messageTextCache[cacheKey]!.length - 10,
      );
    }

    final stacked = _messageTextCache[cacheKey]!;
    final displayBody = stacked.length > 1 ? stacked.join('\n') : body;
    final msgCount = stacked.length;

    await _localNotifications.show(
      notifId,
      title,
      body, // collapsed: show only the latest message
      NotificationDetails(
        android: AndroidNotificationDetails(
          'simpulx_chat_v2',
          'Chat Messages',
          channelDescription: 'New incoming chat messages',
          importance: Importance.max,
          priority: Priority.max,
          icon: '@drawable/ic_stat_notification',
          largeIcon:
              avatarPath != null ? FilePathAndroidBitmap(avatarPath) : null,
          styleInformation: BigTextStyleInformation(
            displayBody,
            contentTitle: title,
            summaryText: msgCount > 1 ? '$msgCount messages' : null,
          ),
          number: msgCount > 1 ? msgCount : null,
          showWhen: true,
          enableVibration: true,
          playSound: true,
          visibility: NotificationVisibility.public,
          category: AndroidNotificationCategory.message,
          fullScreenIntent: true,
          ticker: 'New message',
          groupKey: 'simpulx_messages',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          interruptionLevel: InterruptionLevel.timeSensitive,
        ),
      ),
      payload: jsonEncode(data),
    );
  }

  static void _onNotificationTapped(NotificationResponse response) {
    if (response.payload != null) {
      try {
        final data = jsonDecode(response.payload!) as Map<String, dynamic>;
        final conversationId = data['conversationId'];
        final type = data['type'];
        if (conversationId != null && conversationId.toString().isNotEmpty) {
          // Auto-complete follow-up when tapping follow-up reminder
          if (type == 'follow_up_reminder') {
            _completeFollowUp(conversationId.toString());
          }
          AppRouter.router.go('/chat/$conversationId');
        } else {
          AppRouter.router.go('/chat');
        }
      } catch (_) {}
    }
  }

  static void _handleNotificationOpen(RemoteMessage message) {
    final conversationId = message.data['conversationId'];
    final type = message.data['type'];
    if (conversationId != null && conversationId.toString().isNotEmpty) {
      // Auto-complete follow-up when tapping follow-up reminder
      if (type == 'follow_up_reminder') {
        _completeFollowUp(conversationId.toString());
      }
      AppRouter.router.go('/chat/$conversationId');
    } else {
      AppRouter.router.go('/chat');
    }
  }

  /// Complete all pending follow-ups for a conversation when agent taps the notification
  static Future<void> _completeFollowUp(String conversationId) async {
    try {
      final dioClient = di.sl<DioClient>();
      await dioClient.dio.patch(
        '${ApiConstants.baseUrl}/follow-ups/conversation/$conversationId/complete',
      );
      debugPrint('✅ Follow-up completed for conversation $conversationId');
    } catch (e) {
      debugPrint('Failed to complete follow-up: $e');
    }
  }
}
