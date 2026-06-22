import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/session_controller.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/reset_password_page.dart';
import '../../features/chat/domain/entities/conversation.dart';
import '../../features/chat/presentation/pages/chat_list_page.dart';
import '../../features/chat/presentation/pages/chat_thread_page.dart';
import '../../features/contacts/presentation/pages/contact_detail_page.dart';
import '../../features/contacts/presentation/pages/contacts_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/settings/presentation/pages/settings_page.dart';
import '../../features/workspace/presentation/pages/broadcasts_page.dart';
import '../../features/workspace/presentation/pages/team_page.dart';
import '../../features/workspace/presentation/pages/workspace_hub_page.dart';
import '../shell/app_shell.dart';
import '../splash_screen.dart';

/// Route path constants (also used for deep links).
class Routes {
  Routes._();
  static const splash = '/splash';
  static const login = '/login';
  static const forgotPassword = '/forgot-password';
  static const resetPassword = '/reset-password';
  static const dashboard = '/dashboard';
  static const chat = '/chat';
  static const contacts = '/contacts';
  static const settings = '/settings';
}

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _dashboardKey = GlobalKey<NavigatorState>(debugLabel: 'dashboard');
final _chatKey = GlobalKey<NavigatorState>(debugLabel: 'chat');
final _contactsKey = GlobalKey<NavigatorState>(debugLabel: 'contacts');
final _settingsKey = GlobalKey<NavigatorState>(debugLabel: 'settings');

/// App router. Rebuilds its redirect on session changes via a [ValueNotifier]
/// bridged to [sessionControllerProvider].
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.onDispose(refresh.dispose);
  ref.listen(sessionControllerProvider, (_, _) => refresh.value++);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.splash,
    debugLogDiagnostics: kDebugMode,
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(sessionControllerProvider).status;
      final loc = state.matchedLocation;

      const publicRoutes = {
        Routes.login,
        Routes.forgotPassword,
        Routes.resetPassword,
      };
      final isPublic = publicRoutes.contains(loc);

      switch (status) {
        case SessionStatus.unknown:
          return loc == Routes.splash ? null : Routes.splash;
        case SessionStatus.unauthenticated:
          return isPublic ? null : Routes.login;
        case SessionStatus.authenticated:
          // Allow reset-password even when signed in (email deep link).
          if (loc == Routes.splash ||
              loc == Routes.login ||
              loc == Routes.forgotPassword) {
            return Routes.dashboard;
          }
          return null;
      }
    },
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: Routes.resetPassword,
        builder: (context, state) => ResetPasswordPage(
          token: state.uri.queryParameters['token'] ?? '',
        ),
      ),
      // Full-screen conversation thread on the root navigator (no bottom nav).
      GoRoute(
        path: '/chat/:id',
        parentNavigatorKey: _rootKey,
        builder: (context, state) => ChatThreadPage(
          conversationId: state.pathParameters['id']!,
          conversation: state.extra is Conversation
              ? state.extra as Conversation
              : null,
        ),
      ),
      // Full-screen lead detail.
      GoRoute(
        path: '/contacts/:id',
        parentNavigatorKey: _rootKey,
        builder: (context, state) =>
            ContactDetailPage(contactId: state.pathParameters['id']!),
      ),
      // Workspace back-office (role-gated entry from Settings).
      GoRoute(
        path: '/workspace',
        parentNavigatorKey: _rootKey,
        builder: (context, state) => const WorkspaceHubPage(),
        routes: [
          GoRoute(
            path: 'broadcasts',
            builder: (context, state) => const BroadcastsPage(),
          ),
          GoRoute(
            path: 'team',
            builder: (context, state) => const TeamPage(),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _dashboardKey,
            routes: [
              GoRoute(
                path: Routes.dashboard,
                builder: (context, state) => const DashboardPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _chatKey,
            routes: [
              GoRoute(
                path: Routes.chat,
                builder: (context, state) => const ChatListPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _contactsKey,
            routes: [
              GoRoute(
                path: Routes.contacts,
                builder: (context, state) => const ContactsPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _settingsKey,
            routes: [
              GoRoute(
                path: Routes.settings,
                builder: (context, state) => const SettingsPage(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
