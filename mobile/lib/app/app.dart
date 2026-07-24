import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:flutter/services.dart';
import 'package:simpulx/l10n/app_localizations.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../core/calls/callkit_service.dart';
import '../core/calls/mic_permission.dart';
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

  /// Notification replies we've taken ownership of but haven't managed to send
  /// yet (send failed, or the native buffer was consumed before we were
  /// authenticated). The native buffer can only be drained ONCE, so once a reply
  /// is pulled the responsibility is entirely ours — losing it here is the
  /// "reply never actually sent" bug. Kept in memory and retried on the next
  /// drain / app resume until it lands.
  final List<Map<String, String>> _replyRetryQueue = [];

  /// A single notification tap can arrive through two channels at nearly the
  /// same time (the native `onNotificationTap` MethodChannel AND the
  /// flutter_local_notifications `onTapRoute` callback). Because navigation is
  /// async, the second call can read the old current-location and slip past the
  /// same-route guard, pushing the same chat twice (the "Back twice" duplicate).
  /// We dedup by remembering the last route + when we navigated to it.
  String? _lastNavRoute;
  DateTime? _lastNavAt;

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
        // Queue + attempt. sendMessage returns Result (it never throws), so the
        // old try/catch always "succeeded" even when the send failed — the reply
        // silently vanished. Queueing means a failed send is retried, not lost.
        _replyRetryQueue.add({'chatId': chatId, 'replyText': replyText});
        await _flushReplyQueue();
      } else if (call.method == 'onNotificationTap') {
        final route = call.arguments as String;
        debugPrint('[Push] onNotificationTap route: $route');
        final router = ref.read(routerProvider);
        _navigateToRoute(router, route);
      } else if (call.method == 'onPendingReplies') {
        // iOS buffered a reply typed into a notification (it can arrive before
        // this handler even exists, so native never pushes it at us directly).
        await _drainPendingReplies();
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
      // Refetch the inbox IMMEDIATELY, in parallel with the socket reconnect —
      // don't gate the catch-up on the WebSocket handshake. Previously the resume
      // refetch only fired after the socket RE-connected (via the status listener
      // in ConversationListController), so every foreground had a visible ~500ms+
      // "catching up" beat while the handshake completed. Firing the HTTP refetch
      // now makes the list current in one round-trip; the reconnect then just
      // restores the live stream for subsequent events.
      ref.read(conversationListProvider.notifier).refresh();
      ref.read(realtimeClientProvider).reconnectNow();
      // Tell every OTHER alive screen (open thread, dashboard, contacts, contact
      // details) to refetch now too, in parallel with the reconnect, so the whole
      // app is current the instant it opens — not just the inbox — instead of each
      // screen waiting on the WS handshake to catch up.
      ref.read(appResumeTickProvider.notifier).bump();
      auth.setPresence(true);
      // Self-heal push: if the token never landed server-side (getToken not ready
      // at launch, or the POST failed), this device is unreachable by push until
      // something retries. Re-registering is idempotent — the server keys rows by
      // device id — so every foreground is a free second chance.
      unawaited(_registerPushToken());
      // Retry any notification reply that couldn't be sent earlier (e.g. it was
      // typed while the app was launching and not yet authenticated).
      _flushReplyQueue();
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

  /// Send any reply the user typed into an iOS notification while the app wasn't
  /// running. Native buffers them because the reply lands before Flutter (and the
  /// session) exists; consuming clears the buffer, so this can't double-send.
  Future<void> _drainPendingReplies() async {
    if (!Platform.isIOS) return;
    // Sending needs an authenticated session (and its auth token). Draining the
    // native buffer before the session is restored means every send fails and the
    // reply is gone for good — exactly the killed-app case where replying from a
    // notification matters most. Wait: _initPush calls this again right after
    // authenticating, and so does app-resume.
    if (ref.read(sessionControllerProvider).status !=
        SessionStatus.authenticated) {
      return;
    }
    try {
      final raw =
          await _channel.invokeMethod<List<dynamic>>('consumePendingReplies');
      if (raw != null) {
        for (final item in raw) {
          final m = (item as Map).cast<String, dynamic>();
          final chatId = (m['chatId'] ?? '') as String;
          final text = (m['replyText'] ?? '') as String;
          if (chatId.isEmpty || text.isEmpty) continue;
          _replyRetryQueue.add({'chatId': chatId, 'replyText': text});
        }
      }
    } catch (_) {
      // No native buffer (Android) or nothing pending.
    }
    await _flushReplyQueue();
  }

  /// Send everything queued, keeping anything that fails for the next attempt.
  /// A queued reply survives until it actually lands on the backend.
  Future<void> _flushReplyQueue() async {
    if (_replyRetryQueue.isEmpty) return;
    if (ref.read(sessionControllerProvider).status !=
        SessionStatus.authenticated) {
      return; // Not authenticated yet — retry on resume / after _initPush.
    }
    final chatRepo = ref.read(chatRepositoryProvider);
    final batch = List<Map<String, String>>.from(_replyRetryQueue);
    _replyRetryQueue.clear();
    for (final r in batch) {
      final result = await chatRepo.sendMessage(r['chatId']!, body: r['replyText']!);
      if (result.isErr) {
        // sendMessage swallows errors into Result — the old code's try/catch never
        // saw them and reported success. Re-queue so it's retried, not dropped.
        debugPrint('[Push] reply send failed, will retry: ${result.failureOrNull}');
        _replyRetryQueue.add(r);
      } else {
        debugPrint('[Push] notification reply sent for ${r['chatId']}');
      }
    }
  }

  Future<void> _initPush(GoRouter router) async {
    final push = ref.read(pushServiceProvider);
    await push.requestPermission();
    // Register the push token FIRST and off the critical path. It used to sit
    // below the mic + full-screen-intent permission awaits, so anything that
    // blocked or threw there meant the token was never sent — a device that
    // silently receives no notifications at all, with nothing in the logs.
    unawaited(_registerPushToken());
    // Prime the microphone permission NOW, while the app is in the foreground
    // just after login. Calls arrive via push and are answered from CallKit /
    // the lock screen, where iOS cannot present a permission prompt — so if this
    // is the first time it's asked, the answer errors into dead audio. Asking
    // here means the answer-time check is already granted. Best-effort: a denial
    // is surfaced later at answer-time, it must not block the rest of startup.
    await ensureMicPermission();
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
    // Isolate FCM token acquisition: on iOS `getToken()` can throw/hang when the
    // APNS token isn't ready yet, and it used to abort the rest of _initPush —
    // so CallKitService.init() below never ran and the VoIP token was NEVER
    // registered (prod had zero ios_voip tokens, so background/lockscreen calls
    // never rang). Never let the FCM path block VoIP registration.
    try {
      push.onTokenRefresh.listen(
        (t) => repo.registerPushToken(token: t, platform: push.platform, deviceId: deviceId),
      );
    } catch (e) {
      debugPrint('[Push] onTokenRefresh subscribe failed: $e');
    }
    // iOS: register the PushKit VoIP token + bridge CallKit actions to the call
    // controller (Android uses FCM + full-screen intent instead). This is the
    // path that actually rings incoming calls on a locked/backgrounded iPhone.
    if (Platform.isIOS) {
      await CallKitService(ref, (route) => _navigateToRoute(router, route)).init();
    }
    // Coming back into an authenticated session means we're online.
    ref.read(authControllerProvider.notifier).setPresence(true);
    // Now that we're authenticated we can actually send: flush any reply typed
    // into a notification while the app was killed.
    await _drainPendingReplies();
  }

  /// Register this device's FCM token with the backend, retrying on failure.
  ///
  /// A device whose token never lands server-side is simply unreachable by push,
  /// and the old single best-effort attempt failed silently — so this retries a
  /// few times with backoff, logs loudly, and is safe to call again (the server
  /// keys rows by device id, so re-registering replaces rather than duplicates).
  Future<void> _registerPushToken() async {
    final push = ref.read(pushServiceProvider);
    final repo = ref.read(authRepositoryProvider);
    final deviceId = await ref.read(secureStoreProvider).deviceId();
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        // Retries throw the cached registration away first. Firebase persists a
        // FAILED registration on the device, so anything that blocked it once
        // (a wrong API-key restriction, no network on first run) keeps the phone
        // silent long after the cause is fixed - re-asking for the same broken
        // cache would never recover. Deleting forces a genuinely new one.
        final token = await push.getToken(force: attempt > 0);
        if (token == null || token.isEmpty) {
          debugPrint('[Push] no FCM token yet (attempt ${attempt + 1}): '
              '${push.lastTokenError ?? "no error reported"}');
        } else {
          await repo.registerPushToken(
              token: token, platform: push.platform, deviceId: deviceId);
          debugPrint('[Push] FCM token registered (${push.platform})');
          return;
        }
      } catch (e) {
        debugPrint('[Push] token registration failed (attempt ${attempt + 1}): $e');
      }
      await Future<void>.delayed(Duration(seconds: 2 * (attempt + 1)));
    }
    debugPrint('[Push] FCM token registration gave up; will retry on resume');
  }

  /// Smart navigation that avoids duplicate routes.
  /// Uses router.go() for root-level routes, router.push() for nested routes.
  void _navigateToRoute(GoRouter router, String route) {
    // Use the actual resolved location, NOT fullPath (which returns the route
    // *pattern* like "/chat/:id" — that breaks every same-route guard below and
    // lets a tap push the same thread twice, so Back lands on a duplicate).
    final currentLoc = router.routerDelegate.currentConfiguration.uri.toString();
    debugPrint('[Push] Current route: $currentLoc, navigating to: $route');

    // Collapse a double-delivered tap: the same route requested again within a
    // short window is the second channel firing, not a real second intent. This
    // catches the race the `currentLoc` guard below can miss (navigation hasn't
    // committed yet when the duplicate arrives). Callbacks/calls are excluded —
    // those are intentional actions, not navigations, and are idempotent enough.
    if (!route.startsWith('/callback/')) {
      final now = DateTime.now();
      if (_lastNavRoute == route &&
          _lastNavAt != null &&
          now.difference(_lastNavAt!) < const Duration(milliseconds: 1800)) {
        debugPrint('[Push] Duplicate tap for $route within window, skipping');
        return;
      }
      _lastNavRoute = route;
      _lastNavAt = now;
    }

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

    // iOS icon badge. The server stamps a badge on every push, but ONLY a push can
    // change it — so reading a chat would leave a stale number stuck on the icon.
    // Mirror the live unread count instead. Counted per CHAT (not per message) to
    // match Android, where the launcher badges one notification per conversation.
    // Android needs nothing here: it badges from its own notifications.
    if (Platform.isIOS) {
      ref.listen(conversationListProvider, (_, next) {
        final list = next.value;
        if (list == null) return;
        final unreadChats = list.where((c) => c.unreadCount > 0).length;
        _channel
            .invokeMethod('setBadge', {'count': unreadChats})
            .catchError((_) {});
      });
    }

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
