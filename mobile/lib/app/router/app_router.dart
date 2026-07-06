import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/session_controller.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/reset_password_page.dart';
import '../../features/calls/domain/call_session.dart';
import '../../features/calls/presentation/call_controller.dart';
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
            return Routes.chat;
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
      // Full-screen incoming call UI. The CallOverlay handles the actual UI,
      // this route just ensures the call session is set up and navigates to it.
      GoRoute(
        path: '/call/:id',
        parentNavigatorKey: _rootKey,
        builder: (context, state) {
          // This page is a placeholder - CallOverlay shows the actual call UI
          // once the CallController has an incoming session.
          // We do minimal rendering to avoid showing the wrong screen.
          return _CallRoutePage(conversationId: state.pathParameters['id']!);
        },
      ),
      // Full-screen lead detail.
      GoRoute(
        path: '/contacts/:id',
        parentNavigatorKey: _rootKey,
        builder: (context, state) {
          final extra = state.extra;
          final scrollToHistory = extra is Map && extra['scrollToHistory'] == true;
          return ContactDetailPage(
            contactId: state.pathParameters['id']!,
            scrollToHistory: scrollToHistory,
          );
        },
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
      StatefulShellRoute(
        // Return the shell itself; the container builder below decides HOW the
        // branch navigators are laid out (a PageView for WhatsApp-style swipe).
        builder: (context, state, navigationShell) => navigationShell,
        navigatorContainerBuilder: (context, navigationShell, children) =>
            AppShell(navigationShell: navigationShell, children: children),
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

/// Placeholder page for /call/:id route.
/// This triggers setup of the incoming call session in CallController,
/// which causes CallOverlay to show the actual call UI.
class _CallRoutePage extends ConsumerStatefulWidget {
  const _CallRoutePage({required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<_CallRoutePage> createState() => _CallRoutePageState();
}

class _CallRoutePageState extends ConsumerState<_CallRoutePage> {
  @override
  void initState() {
    super.initState();
    // Setup incoming call session when this route is opened
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _setupCall();
    });
  }

  Future<void> _setupCall() async {
    final controller = ref.read(callControllerProvider.notifier);

    // Check if session already exists
    final existing = ref.read(callControllerProvider);
    if (existing != null && existing.conversationId == widget.conversationId) {
      // Already have this call session, don't recreate
      return;
    }

    // Extract contact info from route extra if available
    String contactName = 'Incoming Call';
    String contactPhone = '';

    final extra = GoRouterState.of(context).extra;
    if (extra is Map<String, dynamic>) {
      contactName = extra['contactName'] ?? contactName;
      contactPhone = extra['contactPhone'] ?? contactPhone;
    }

    final uri = GoRouterState.of(context).uri;
    String? callId = uri.queryParameters['callId'];

    await controller.setupIncomingFromNotification(
      conversationId: widget.conversationId,
      contactName: contactName,
      contactPhone: contactPhone,
      callId: callId,
    );

    // If no live call materialised (e.g. it already ended/was declined before we
    // got here), don't sit on the "Setting up call..." placeholder.
    if (mounted && ref.read(callControllerProvider) == null) {
      _leave();
    }
  }

  /// Remove this setup placeholder. The global CallOverlay owns the actual call
  /// UI, so once the call is gone there's nothing for this route to show.
  void _leave() {
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.chat);
    }
  }

  @override
  Widget build(BuildContext context) {
    // The CallOverlay renders the real call UI on top of everything; this route
    // is only a setup placeholder. Pop it the moment the call ends, fails, or is
    // cleared, so we never get stuck on "Setting up call..." after end/decline.
    ref.listen<CallSession?>(callControllerProvider, (prev, next) {
      final over = next == null ||
          next.phase == CallPhase.ended ||
          next.phase == CallPhase.failed;
      if (over) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _leave());
      }
    });
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Setting up call...'),
          ],
        ),
      ),
    );
  }
}
