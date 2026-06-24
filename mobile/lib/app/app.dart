import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:simpulx/l10n/app_localizations.dart';

import '../core/notifications/notification_prefs.dart';
import '../core/notifications/notification_providers.dart';
import '../core/providers/locale_provider.dart';
import '../core/session/session_controller.dart';
import '../features/auth/presentation/controllers/auth_controller.dart';
import '../features/calls/presentation/call_overlay.dart';
import 'router/app_router.dart';
import 'theme/app_theme.dart';

/// Root application widget. Wires theme, localization, the GoRouter, and the
/// push-notification lifecycle (permission + token + deep-link taps).
class SimpulxApp extends ConsumerStatefulWidget {
  const SimpulxApp({super.key});

  @override
  ConsumerState<SimpulxApp> createState() => _SimpulxAppState();
}

class _SimpulxAppState extends ConsumerState<SimpulxApp> {
  bool _pushInited = false;

  Future<void> _initPush(GoRouter router) async {
    final push = ref.read(pushServiceProvider);
    await push.requestPermission();
    await push.initForeground(
      onTapRoute: (route) => _navigateToRoute(router, route),
      allow: (category) =>
          ref.read(notificationPrefsProvider).isEnabled(category),
    );
    final repo = ref.read(authRepositoryProvider);
    final token = await push.getToken();
    if (token != null) {
      await repo.registerPushToken(token: token, platform: push.platform);
    }
    push.onTokenRefresh.listen(
      (t) => repo.registerPushToken(token: t, platform: push.platform),
    );
  }

  /// Smart navigation that avoids duplicate routes.
  /// Uses router.go() for root-level routes, router.push() for nested routes.
  void _navigateToRoute(GoRouter router, String route) {
    final currentLoc = router.routerDelegate.currentConfiguration.fullPath;
    debugPrint('[Push] Current route: $currentLoc, navigating to: $route');

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
      final targetId = route.substring('/chat/'.length);
      final currentMatch = RegExp(r'^/chat/([^/]+)').firstMatch(currentLoc);
      if (currentMatch != null && currentMatch.group(1) == targetId) {
        debugPrint('[Push] Already viewing chat $targetId, skipping');
        return;
      }
      router.push(route);
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
      themeMode: ThemeMode.system,
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
