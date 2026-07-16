import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:flutter/services.dart';
import 'package:simpulx/l10n/app_localizations.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../core/calls/callkit_service.dart';
import '../core/notifications/notification_prefs.dart';
import '../core/notifications/notification_providers.dart';
import '../core/providers/app_providers.dart';
import '../core/providers/locale_provider.dart';
import '../core/realtime/realtime_providers.dart';
import '../core/providers/theme_provider.dart';
import '../core/session/session_controller.dart';
import '../features/auth/presentation/controllers/auth_controller.dart';
import '../features/calls/presentation/call_controller.dart';
import '../features/calls/presentation/call_overlay.dart';
import '../features/chat/presentation/controllers/chat_providers.dart';
import '../features/chat/presentation/controllers/conversation_list_controller.dart';
import 'router/app_router.dart';
import 'theme/app_theme.dart';

/// Root application widget. Wires theme, localization, the GoRouter, and the
/// push-notification lifecycle (permission + token + deep-link taps).
class SimpulxApp extends ConsumerStatefulWidget {
  const SimpulxApp({super.key});

  @override
  ConsumerState<SimpulxApp> createState() => _SimpulxAppState();
}

class _SimpulxAppState extends ConsumerState<SimpulxApp>
    with WidgetsBindingObserver {
  bool _pushInited = false;
  static const _channel = MethodChannel('simpulx_notification');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Keep the screen awake while the app is in the foreground: agents monitor
    // the inbox without touching it, so the normal system timeout locking the
    // phone mid-shift is a bug from their side. Released on background (below)
    // so it never drains battery while the app isn't in use.
    WakelockPlus.enable();
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onInlineReply') {
        final data = call.arguments as Map;
        final chatId = data['chatId'] as String;
        final replyText = data['replyText'] as String;
        debugPrint('[Push] onInlineReply for $chatId: $replyText');

        try {
          final chatRepo = ref.read(chatRepositoryProvider);
          await chatRepo.sendMessage(chatId, body: replyText);
          debugPrint('[Push] Inline reply sent successfully');
        } catch (e) {
          debugPrint('[Push] Error sending inline reply: $e');
        }
      } else if (call.method == 'onNotificationTap') {
        final route = call.arguments as String;
        debugPrint('[Push] onNotificationTap route: $route');
        final router = ref.read(routerProvider);
        _navigateToRoute(router, route);
      } else if (call.method == 'onCallHangup') {
        // Hang up pressed on the ongoing-call notification. The native side
        // already ends the call on the backend, but the LOCAL call overlay must
        // tear down now — waiting for the realtime "ended" event to come back
        // left the caller staring at a live call screen while the customer had
        // already been hung up on (and kept the mic hot).
        debugPrint('[Push] onCallHangup from notification');
        await ref.read(callControllerProvider.notifier).hangUp();
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    super.dispose();
  }

  /// Mirror foreground/background to presence: an agent is "online" while the app
  /// is in the foreground and "offline" when it leaves. Resuming also forces an
  /// immediate realtime reconnect so the inbox is live again right away.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Screen wakelock tracks foreground/background, independent of auth: hold it
    // while the app is visible, release it once truly backgrounded. (inactive is
    // a transient state - app switcher, system dialog - so leave it held there.)
    if (state == AppLifecycleState.resumed) {
      WakelockPlus.enable();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      WakelockPlus.disable();
    }

    if (ref.read(sessionControllerProvider).status !=
        SessionStatus.authenticated) {
      return;
    }
    final auth = ref.read(authControllerProvider.notifier);
    if (state == AppLifecycleState.resumed) {
      ref.read(realtimeClientProvider).reconnectNow();
      auth.setPresence(true);
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      auth.setPresence(false);
    }
  }

  /// Android 14+ no longer auto-grants USE_FULL_SCREEN_INTENT to apps that
  /// aren't dialers/alarms, so an incoming call could only ever show as a
  /// heads-up notification instead of the WhatsApp-style full-screen ring.
  /// Ask once — if the user declines, calls still arrive as heads-up.
  Future<void> _ensureFullScreenCallPermission() async {
    if (!Platform.isAndroid) return;
    try {
      final ok = await _channel.invokeMethod<bool>('canUseFullScreenIntent');
      if (ok == false) {
        await _channel.invokeMethod('requestFullScreenIntentPermission');
      }
    } catch (_) {
      // Best-effort: never block startup on this.
    }
  }

  Future<void> _initPush(GoRouter router) async {
    final push = ref.read(pushServiceProvider);
    await push.requestPermission();
    await _ensureFullScreenCallPermission();
    await push.initForeground(
      onTapRoute: (route) => _navigateToRoute(router, route),
      allow: (category) =>
          ref.read(notificationPrefsProvider).isEnabled(category),
    );
    final repo = ref.read(authRepositoryProvider);
    // Stable per-device id so the server keeps ONE token row per device
    // (reinstall/refresh replaces it) — kills duplicate push notifications.
    final deviceId = await ref.read(secureStoreProvider).deviceId();
    final token = await push.getToken();
    if (token != null) {
      await repo.registerPushToken(token: token, platform: push.platform, deviceId: deviceId);
    }
    push.onTokenRefresh.listen(
      (t) => repo.registerPushToken(token: t, platform: push.platform, deviceId: deviceId),
    );
    // iOS: register the PushKit VoIP token + bridge CallKit actions to the call
    // controller (Android uses FCM + full-screen intent instead).
    if (Platform.isIOS) {
      await CallKitService(ref, (route) => _navigateToRoute(router, route)).init();
    }
    // Coming back into an authenticated session means we're online.
    ref.read(authControllerProvider.notifier).setPresence(true);
  }

  /// Smart navigation that avoids duplicate routes.
  /// Uses router.go() for root-level routes, router.push() for nested routes.
  void _navigateToRoute(GoRouter router, String route) {
    // Use the actual resolved location, NOT fullPath (which returns the route
    // *pattern* like "/chat/:id" — that breaks every same-route guard below and
    // lets a tap push the same thread twice, so Back lands on a duplicate).
    final currentLoc = router.routerDelegate.currentConfiguration.uri.toString();
    debugPrint('[Push] Current route: $currentLoc, navigating to: $route');

    // "Call back" from a missed-call notification: start an outbound call to the
    // contact rather than navigating. The CallOverlay renders the call UI.
    if (route.startsWith('/callback/')) {
      final uri = Uri.parse(route);
      final conv = uri.pathSegments.length > 1 ? uri.pathSegments[1] : '';
      final name = uri.queryParameters['name'] ?? '';
      if (conv.isNotEmpty) {
        ref.read(callControllerProvider.notifier).startOutbound(
              conversationId: conv,
              contactName: name,
              contactPhone: '',
            );
      }
      return;
    }

    // If navigating to the same route we're already on, do nothing
    if (currentLoc == route) {
      debugPrint('[Push] Already on $route, skipping navigation');
      return;
    }

    // For /call/:id routes, always use push since call screen needs to overlay
    if (route.startsWith('/call/')) {
      router.push(route);
      return;
    }

    // For conversation/chat routes that include an ID
    // Check if we're already viewing that specific conversation
    if (route.startsWith('/chat/')) {
      // Opening from a notification: the app may have been backgrounded with a
      // stale inbox - force a re-sync so the list + thread are current.
      ref.read(conversationListProvider.notifier).refresh();
      final targetId = route.substring('/chat/'.length);
      final currentMatch = RegExp(r'^/chat/([^/]+)').firstMatch(currentLoc);
      if (currentMatch != null && currentMatch.group(1) == targetId) {
        debugPrint('[Push] Already viewing chat $targetId, skipping');
        return;
      }
      // Another thread is already open: replace it so Back returns to the inbox
      // instead of peeling back through a stack of notification-opened threads.
      if (currentMatch != null) {
        router.pushReplacement(route);
      } else {
        router.push(route);
      }
      return;
    }

    // For other routes, check if it's a top-level shell route
    final isShellRoute = route == '/dashboard' ||
        route == '/chat' ||
        route == '/contacts' ||
        route == '/settings';

    if (isShellRoute) {
      // Use go() to replace the current route in the shell
      router.go(route);
    } else {
      router.push(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    // Initialize push once the session is authenticated; tear down on logout.
    ref.listen<SessionState>(sessionControllerProvider, (_, next) {
      if (next.status == SessionStatus.authenticated && !_pushInited) {
        _pushInited = true;
        _initPush(router);
      } else if (next.status == SessionStatus.unauthenticated && _pushInited) {
        _pushInited = false;
        ref.read(pushServiceProvider).deleteToken();
      }
    });
    // Handle the already-authenticated cold-start case.
    final session = ref.watch(sessionControllerProvider);
    if (session.status == SessionStatus.authenticated && !_pushInited) {
      _pushInited = true;
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _initPush(router));
    }

    return MaterialApp.router(
      title: 'Simpulx',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(themeModeProvider),
      locale: ref.watch(localeProvider),
      routerConfig: router,
      // Renders the active-call UI above all routes + keeps the call controller
      // alive to receive inbound `call.updated` rings.
      builder: (context, child) =>
          CallOverlay(child: child ?? const SizedBox.shrink()),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
