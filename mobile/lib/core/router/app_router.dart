// ============================================================
// App Router - GoRouter Configuration with Premium Sidebar
// ============================================================
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:simpulx/features/auth/presentation/pages/login_page.dart';
import 'package:simpulx/features/auth/presentation/pages/forgot_password_page.dart';
import 'package:simpulx/features/auth/presentation/pages/reset_password_page.dart';
import 'package:simpulx/features/dashboard/presentation/pages/dashboard_page.dart';
import 'package:simpulx/features/chat/presentation/pages/chat_shell_page.dart';
import 'package:simpulx/features/contacts/presentation/pages/contacts_page.dart';
import 'package:simpulx/features/settings/presentation/pages/settings_shell.dart';
import 'package:simpulx/features/settings/presentation/pages/profile_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/organization_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/departments_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/channels_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/templates_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/team_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/roles_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/contact_fields_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/stages_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/notifications_settings_page.dart';
import 'package:simpulx/features/settings/presentation/pages/security_settings_page.dart';
import 'package:simpulx/features/quick_replies/presentation/pages/quick_replies_page.dart';

import 'package:simpulx/features/settings/presentation/pages/mobile_profile_page.dart';
import 'package:simpulx/core/theme/app_style.dart';


Widget _webTitle(String title, Widget child) {
  if (kIsWeb) {
    return Title(
      title: title,
      color: AppColors.primary,
      child: child,
    );
  }
  return child;
}

class AppRouter {
  static final _rootNavigatorKey = GlobalKey<NavigatorState>();
  static final _shellNavigatorKey = GlobalKey<NavigatorState>();
  static final _settingsNavigatorKey = GlobalKey<NavigatorState>();

  static late final GoRouter router;

  static void init(AuthBloc authBloc) {
    router = GoRouter(
      navigatorKey: _rootNavigatorKey,
      debugLogDiagnostics: false,
      refreshListenable: _AuthRefreshNotifier(authBloc),
      redirect: (context, state) {
        final authState = authBloc.state;
        // Don't redirect while auth is still resolving
        if (authState is AuthInitial || authState is AuthLoading) {
          final publicRoutes = [
            '/login',
            '/forgot-password',
            '/reset-password'
          ];
          final isPublicRoute = publicRoutes.any(
            (r) => state.matchedLocation.startsWith(r),
          );
          // If already on a public route, stay there; otherwise go to login
          if (!isPublicRoute) return '/login';
          return null;
        }
        final isLoggedIn = authState is AuthAuthenticated;
        final publicRoutes = ['/login', '/forgot-password', '/reset-password'];
        final isPublicRoute = publicRoutes.any(
          (r) => state.matchedLocation.startsWith(r),
        );

        if (!isLoggedIn && !isPublicRoute) {
          return '/login';
        }
        // Allow reset-password even when logged in (user may click email link
        // while an old session is still active).
        final isResetPassword =
            state.matchedLocation.startsWith('/reset-password');
        if (isLoggedIn && isPublicRoute && !isResetPassword) {
          return kIsWeb ? '/dashboard' : '/chat';
        }
        if (state.matchedLocation == '/') {
          return kIsWeb ? '/dashboard' : '/chat';
        }
        if (state.matchedLocation == '/settings' && kIsWeb) {
          return '/settings/profile';
        }

        // â”€â”€ Permission-based route protection â”€â”€
        if (isLoggedIn) {
          final session = (authState).session;
          final matched = state.matchedLocation;
          // Map routes to required permission keys
          const routePermissions = <String, String>{
            '/dashboard': 'menu_dashboard',
            '/contacts': 'menu_contacts',
            '/settings/organization': 'view_settings',
            '/settings/departments': 'manage_departments',
            '/settings/whatsapp': 'manage_channels',
            '/settings/templates': 'manage_channels',
            '/settings/team': 'manage_team',
            '/settings/roles': 'manage_roles',
            '/settings/contact-fields': 'manage_contact_fields',
          };
          for (final entry in routePermissions.entries) {
            if (matched.startsWith(entry.key)) {
              if (!session.hasPermission(entry.value)) {
                return '/chat';
              }
              break;
            }
          }
        }

        return null;
      },
      routes: [
        // â”€â”€ Auth Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        GoRoute(
          path: '/login',
          name: 'login',
          builder: (context, state) =>
              _webTitle('Login - Simpulx', const LoginPage()),
        ),
        GoRoute(
          path: '/forgot-password',
          name: 'forgot-password',
          builder: (context, state) => _webTitle(
              'Forgot Password - Simpulx', const ForgotPasswordPage()),
        ),
        GoRoute(
          path: '/reset-password',
          name: 'reset-password',
          builder: (context, state) {
            final token = state.uri.queryParameters['token'] ?? '';
            return _webTitle(
                'Reset Password - Simpulx', ResetPasswordPage(token: token));
          },
        ),



        // â”€â”€ Main App Shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ShellRoute(
          navigatorKey: _shellNavigatorKey,
          builder: (context, state, child) {
            return AppShell(
              currentPath: state.matchedLocation,
              child: child,
            );
          },
          routes: [
            GoRoute(
              path: '/dashboard',
              name: 'dashboard',
              builder: (context, state) =>
                  _webTitle('Dashboard - Simpulx', const DashboardPage()),
            ),
            GoRoute(
              path: '/chat',
              name: 'chat',
              pageBuilder: (context, state) => NoTransitionPage(
                key: state.pageKey,
                child: _webTitle('Chats - Simpulx', const ChatShellPage()),
              ),
              routes: [
                GoRoute(
                  path: ':conversationId',
                  name: 'chat-detail',
                  pageBuilder: (context, state) {
                    final id = state.pathParameters['conversationId']!;
                    return NoTransitionPage(
                      key: state.pageKey,
                      child: _webTitle('Chat - Simpulx',
                          ChatShellPage(selectedConversationId: id)),
                    );
                  },
                ),
              ],
            ),
            GoRoute(
              path: '/contacts',
              name: 'contacts',
              builder: (context, state) =>
                  _webTitle('Contacts - Simpulx', const ContactsPage()),
            ),
            GoRoute(
              path: '/profile',
              name: 'profile',
              builder: (context, state) =>
                  _webTitle('Profile - Simpulx', const MobileProfilePage()),
            ),
            // Mobile Settings tab - reuses MobileProfilePage
            GoRoute(
              path: '/settings',
              name: 'settings-mobile',
              builder: (context, state) {
                // On mobile, show MobileProfilePage directly
                // On desktop/web, this won't be reached (redirect to /settings/profile)
                return _webTitle('Simpulx', const MobileProfilePage());
              },
            ),
            // Mobile Quick Replies - standalone (outside Settings shell)
            GoRoute(
              path: '/quick-replies',
              name: 'quick-replies-standalone',
              builder: (context, state) => _webTitle(
                  'Quick Replies - Simpulx', const QuickRepliesPage()),
            ),
            // â”€â”€ Settings Shell with Sub-routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            ShellRoute(
              navigatorKey: _settingsNavigatorKey,
              builder: (context, state, child) {
                return SettingsShell(
                  currentPath: state.matchedLocation,
                  child: child,
                );
              },
              routes: [
                GoRoute(
                  path: '/settings/profile',
                  name: 'settings-profile',
                  builder: (context, state) => _webTitle(
                      'Profile - Simpulx', const ProfileSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/organization',
                  name: 'settings-organization',
                  builder: (context, state) => _webTitle(
                      'Organization - Simpulx',
                      const OrganizationSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/departments',
                  name: 'settings-departments',
                  builder: (context, state) => _webTitle(
                      'Departments - Simpulx', const DepartmentsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/whatsapp',
                  name: 'settings-whatsapp',
                  builder: (context, state) => _webTitle(
                      'Channels - Simpulx', const ChannelsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/templates',
                  name: 'settings-templates',
                  builder: (context, state) => _webTitle(
                      'Templates - Simpulx', const TemplatesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/team',
                  name: 'settings-team',
                  builder: (context, state) =>
                      _webTitle('Team - Simpulx', const TeamSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/roles',
                  name: 'settings-roles',
                  builder: (context, state) => _webTitle(
                      'Roles & Permissions - Simpulx',
                      const RolesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/quick-replies',
                  name: 'settings-quick-replies',
                  builder: (context, state) => _webTitle(
                      'Quick Replies - Simpulx', const QuickRepliesPage()),
                ),
                GoRoute(
                  path: '/settings/contact-fields',
                  name: 'settings-contact-fields',
                  builder: (context, state) => _webTitle(
                      'Contact Fields - Simpulx',
                      const ContactFieldsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/stages',
                  name: 'settings-stages',
                  builder: (context, state) =>
                      _webTitle('Stages - Simpulx', const StagesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/notifications',
                  name: 'settings-notifications',
                  builder: (context, state) => _webTitle(
                      'Notifications - Simpulx',
                      const NotificationsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/security',
                  name: 'settings-security',
                  builder: (context, state) => _webTitle(
                      'Security - Simpulx', const SecuritySettingsPage()),
                ),
              ],
            ),

          ],
        ),
      ],
    );
  }
}

class _AuthRefreshNotifier extends ChangeNotifier {
  late final StreamSubscription<dynamic> _subscription;

  _AuthRefreshNotifier(AuthBloc bloc) {
    _subscription = bloc.stream.listen((_) => notifyListeners());
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

// â”€â”€ App Shell with Premium Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class AppShell extends StatefulWidget {
  final Widget child;
  final String currentPath;

  const AppShell({
    super.key,
    required this.child,
    required this.currentPath,
  });

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell>
    with SingleTickerProviderStateMixin {
  late AnimationController _badgePulseController;

  @override
  void initState() {
    super.initState();
    _badgePulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _badgePulseController.dispose();
    super.dispose();
  }

  /// Returns true if the current path is a specific chat conversation
  /// (e.g. /chat/abc-123), not the chat list (/chat).
  bool get _isInChatDetail {
    final path = widget.currentPath;
    if (!path.startsWith('/chat')) return false;
    final remainder = path.substring('/chat'.length);
    // /chat â†’ list (show nav), /chat/ â†’ list (show nav), /chat/:id â†’ detail (hide nav)
    return remainder.length > 1 && remainder.startsWith('/');
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final mobileChild = MediaQuery(
      data: media.copyWith(
        textScaler: media.textScaler.clamp(maxScaleFactor: 1.12),
      ),
      child: SafeArea(
        bottom: false,
        child: widget.child,
      ),
    );

    // Hide bottom nav in chat detail
    final hideBottomNav = _isInChatDetail;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: SizedBox(
            width: double.infinity,
            height: double.infinity,
            child: mobileChild,
          ),
        ),
      ),
      bottomNavigationBar: hideBottomNav ? null : _buildBottomNav(context),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final theme = Theme.of(context);

    final mobileRoutes = ['/dashboard', '/chat', '/contacts', '/settings'];
    final matchedMobile = widget.currentPath.startsWith('/chat')
        ? '/chat'
        : widget.currentPath.startsWith('/contacts')
            ? '/contacts'
            : (widget.currentPath.startsWith('/settings') ||
                    widget.currentPath.startsWith('/quick-replies'))
                ? '/settings'
                : widget.currentPath.startsWith('/dashboard')
                    ? '/dashboard'
                    : '/chat';
    final mobileIndex = mobileRoutes.indexOf(matchedMobile);

    return Center(
      heightFactor: 1.0,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
              top: BorderSide(
                color: theme.dividerColor.withValues(alpha: 0.55),
                width: 0.5,
              ),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Theme(
              data: theme.copyWith(
                navigationBarTheme: theme.navigationBarTheme.copyWith(
                  labelTextStyle:
                      WidgetStateProperty.resolveWith<TextStyle>((states) {
                    final selected = states.contains(WidgetState.selected);
                    return TextStyle(
                      fontSize: 11,
                      height: 1.1,
                      letterSpacing: 0,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected
                          ? AppColors.primary
                          : theme.colorScheme.onSurface.withValues(alpha: 0.50),
                    );
                  }),
                ),
              ),
              child: BlocBuilder<ConversationCubit, ConversationListState>(
                builder: (context, convState) {
                  final unreadCount = convState.totalUnreadCount;
                  return NavigationBar(
                    selectedIndex: mobileIndex >= 0 ? mobileIndex : 1,
                    onDestinationSelected: (index) =>
                        context.go(mobileRoutes[index]),
                    backgroundColor: Colors.transparent,
                    elevation: 0,
                    indicatorColor: AppColors.primary.withValues(alpha: 0.12),
                    height: 58,
                    labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                    destinations: [
                      NavigationDestination(
                        icon: Icon(
                          Icons.dashboard_outlined,
                          size: 21,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                        selectedIcon: const Icon(
                          Icons.dashboard_rounded,
                          size: 21,
                          color: AppColors.primary,
                        ),
                        label: 'Dashboard',
                      ),
                      NavigationDestination(
                        icon: _buildChatsIcon(
                          theme: theme,
                          selected: false,
                          unreadCount: unreadCount,
                        ),
                        selectedIcon: _buildChatsIcon(
                          theme: theme,
                          selected: true,
                          unreadCount: unreadCount,
                        ),
                        label: 'Chats',
                      ),
                      NavigationDestination(
                        icon: Icon(
                          Icons.people_outline_rounded,
                          size: 21,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                        selectedIcon: const Icon(
                          Icons.people_rounded,
                          size: 21,
                          color: AppColors.primary,
                        ),
                        label: 'Contacts',
                      ),
                      NavigationDestination(
                        icon: Icon(
                          Icons.settings_outlined,
                          size: 21,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                        selectedIcon: const Icon(
                          Icons.settings_rounded,
                          size: 21,
                          color: AppColors.primary,
                        ),
                        label: 'Settings',
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Builds the Chats icon with an animated unread badge overlay
  Widget _buildChatsIcon({
    required ThemeData theme,
    required bool selected,
    required int unreadCount,
  }) {
    final icon = Icon(
      selected ? Icons.chat_bubble_rounded : Icons.chat_bubble_outline_rounded,
      size: 21,
      color: selected
          ? theme.colorScheme.primary
          : theme.colorScheme.onSurface.withValues(alpha: 0.45),
    );

    if (unreadCount <= 0) return icon;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        icon,
        Positioned(
          right: -8,
          top: -4,
          child: FadeTransition(
            opacity: Tween<double>(begin: 0.5, end: 1.0)
                .animate(_badgePulseController),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 14),
              decoration: BoxDecoration(
                color: const Color(0xFFFF3B30),
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF3B30).withValues(alpha: 0.4),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Text(
                unreadCount > 99 ? '99+' : '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

