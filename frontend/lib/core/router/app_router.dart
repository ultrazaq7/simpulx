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
import 'package:simpulx/features/broadcasts/presentation/pages/broadcasts_page.dart';
import 'package:simpulx/features/automation/presentation/pages/automation_page.dart';
import 'package:simpulx/features/automation/presentation/pages/flow_builder_page.dart';
import 'package:simpulx/features/drip_campaigns/presentation/pages/drip_campaigns_page.dart';
import 'package:simpulx/features/audit_log/presentation/pages/audit_log_page.dart';
import 'package:simpulx/features/settings/presentation/pages/mobile_profile_page.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

Widget _webTitle(String title, Widget child) {
  if (kIsWeb) {
    return Title(
      title: title,
      color: const Color(0xFF1A73E8),
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
          final publicRoutes = ['/login', '/forgot-password', '/reset-password'];
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

        // ── Permission-based route protection ──
        if (isLoggedIn) {
          final session = (authState as AuthAuthenticated).session;
          final matched = state.matchedLocation;
          // Map routes to required permission keys
          const routePermissions = <String, String>{
            '/dashboard': 'menu_dashboard',
            '/contacts': 'menu_contacts',
            '/automation': 'menu_automation',
            '/broadcasts': 'menu_broadcasts',
            '/drip-campaigns': 'menu_drip_campaigns',
            '/audit-log': 'menu_audit_log',
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
        // ── Auth Routes ────────────────────────────────
        GoRoute(
          path: '/login',
          name: 'login',
          builder: (context, state) => _webTitle('Login - Simpulx', LoginPage()),
        ),
        GoRoute(
          path: '/forgot-password',
          name: 'forgot-password',
          builder: (context, state) => _webTitle('Forgot Password - Simpulx', ForgotPasswordPage()),
        ),
        GoRoute(
          path: '/reset-password',
          name: 'reset-password',
          builder: (context, state) {
            final token = state.uri.queryParameters['token'] ?? '';
            return _webTitle('Reset Password - Simpulx', ResetPasswordPage(token: token));
          },
        ),

        // ── Flow Builder (full-screen, no sidebar) ──────
        GoRoute(
          path: '/automation/:id/flow',
          name: 'automation-flow',
          builder: (context, state) {
            final ruleId = state.pathParameters['id'] ?? '';
            final ruleName =
                state.uri.queryParameters['name'] ?? 'Automation';
            return _webTitle('Flow Builder - Simpulx', FlowBuilderPage(
                ruleId: ruleId,
                ruleName: ruleName,
              ));
          },
        ),

        // ── Main App Shell ─────────────────────────────
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
              builder: (context, state) => _webTitle('Dashboard - Simpulx', DashboardPage()),
            ),
            GoRoute(
              path: '/chat',
              name: 'chat',
              pageBuilder: (context, state) => NoTransitionPage(
                key: state.pageKey,
                child: _webTitle('Chats - Simpulx', ChatShellPage()),
              ),
              routes: [
                GoRoute(
                  path: ':conversationId',
                  name: 'chat-detail',
                  pageBuilder: (context, state) {
                    final id = state.pathParameters['conversationId']!;
                    return NoTransitionPage(
                      key: state.pageKey,
                      child: _webTitle('Chat - Simpulx', ChatShellPage(selectedConversationId: id)),
                    );
                  },
                ),
              ],
            ),
            GoRoute(
              path: '/contacts',
              name: 'contacts',
              builder: (context, state) => _webTitle('Contacts - Simpulx', ContactsPage()),
            ),
            GoRoute(
              path: '/profile',
              name: 'profile',
              builder: (context, state) => _webTitle('Profile - Simpulx', const MobileProfilePage()),
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
              builder: (context, state) => _webTitle('Quick Replies - Simpulx', QuickRepliesPage()),
            ),
            // ── Settings Shell with Sub-routes ──────────
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
                  builder: (context, state) => _webTitle('Profile - Simpulx', ProfileSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/organization',
                  name: 'settings-organization',
                  builder: (context, state) => _webTitle('Organization - Simpulx', OrganizationSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/departments',
                  name: 'settings-departments',
                  builder: (context, state) => _webTitle('Departments - Simpulx', DepartmentsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/whatsapp',
                  name: 'settings-whatsapp',
                  builder: (context, state) => _webTitle('Channels - Simpulx', ChannelsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/templates',
                  name: 'settings-templates',
                  builder: (context, state) => _webTitle('Templates - Simpulx', TemplatesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/team',
                  name: 'settings-team',
                  builder: (context, state) => _webTitle('Team - Simpulx', TeamSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/roles',
                  name: 'settings-roles',
                  builder: (context, state) => _webTitle('Roles & Permissions - Simpulx', RolesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/quick-replies',
                  name: 'settings-quick-replies',
                  builder: (context, state) => _webTitle('Quick Replies - Simpulx', QuickRepliesPage()),
                ),
                GoRoute(
                  path: '/settings/contact-fields',
                  name: 'settings-contact-fields',
                  builder: (context, state) => _webTitle('Contact Fields - Simpulx', ContactFieldsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/stages',
                  name: 'settings-stages',
                  builder: (context, state) => _webTitle('Stages - Simpulx', const StagesSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/notifications',
                  name: 'settings-notifications',
                  builder: (context, state) => _webTitle('Notifications - Simpulx', NotificationsSettingsPage()),
                ),
                GoRoute(
                  path: '/settings/security',
                  name: 'settings-security',
                  builder: (context, state) => _webTitle('Security - Simpulx', SecuritySettingsPage()),
                ),
              ],
            ),
            GoRoute(
              path: '/broadcasts',
              name: 'broadcasts',
              builder: (context, state) => _webTitle('Broadcasts - Simpulx', BroadcastsPage()),
            ),
            GoRoute(
              path: '/automation',
              name: 'automation',
              builder: (context, state) => _webTitle('Automation - Simpulx', AutomationPage()),
            ),
            GoRoute(
              path: '/drip-campaigns',
              name: 'drip-campaigns',
              builder: (context, state) => _webTitle('Drip Campaigns - Simpulx', DripCampaignsPage()),
            ),
            GoRoute(
              path: '/audit-log',
              name: 'audit-log',
              builder: (context, state) => _webTitle('System Log - Simpulx', AuditLogPage()),
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

// ── App Shell with Premium Navigation ──────────────────
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
    // /chat → list (show nav), /chat/ → list (show nav), /chat/:id → detail (hide nav)
    return remainder.length > 1 && remainder.startsWith('/');
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;
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

    // Hide bottom nav on desktop, in chat detail on mobile
    final hideBottomNav = isDesktop || (!kIsWeb && _isInChatDetail);

    return Scaffold(
      body: isDesktop
          ? Row(
              children: [
                _PremiumSideNav(currentPath: widget.currentPath),
                Expanded(
                  child: Container(
                    color: const Color(0xFFF6F8FB),
                    child: widget.child,
                  ),
                ),
              ],
            )
          : mobileChild,
      bottomNavigationBar: hideBottomNav ? null : _buildBottomNav(context),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final theme = Theme.of(context);

    // On native mobile: Dashboard, Chats, Contacts, Settings (4 tabs)
    // On web (small screen): show all 5 tabs
    if (!kIsWeb) {
      final mobileRoutes = ['/dashboard', '/chat', '/contacts', '/settings'];
      final matchedMobile = widget.currentPath.startsWith('/chat')
          ? '/chat'
          : widget.currentPath.startsWith('/contacts')
              ? '/contacts'
              : (widget.currentPath.startsWith('/settings') || widget.currentPath.startsWith('/quick-replies'))
                  ? '/settings'
                  : widget.currentPath.startsWith('/dashboard')
                      ? '/dashboard'
                      : '/chat';
      final mobileIndex = mobileRoutes.indexOf(matchedMobile);

      return Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
              top: BorderSide(
                color: theme.dividerColor.withOpacity(0.55),
                width: 0.5,
              ),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
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
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurface.withOpacity(0.50),
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
                  indicatorColor: theme.colorScheme.primary.withOpacity(0.12),
                  height: 58,
                  labelBehavior:
                      NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: [
                    NavigationDestination(
                      icon: Icon(
                        Icons.dashboard_outlined,
                        size: 21,
                        color:
                            theme.colorScheme.onSurface.withOpacity(0.45),
                      ),
                      selectedIcon: Icon(
                        Icons.dashboard_rounded,
                        size: 21,
                        color: theme.colorScheme.primary,
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
                        color:
                            theme.colorScheme.onSurface.withOpacity(0.45),
                      ),
                      selectedIcon: Icon(
                        Icons.people_rounded,
                        size: 21,
                        color: theme.colorScheme.primary,
                      ),
                      label: 'Contacts',
                    ),
                    NavigationDestination(
                      icon: Icon(
                        Icons.settings_outlined,
                        size: 21,
                        color:
                            theme.colorScheme.onSurface.withOpacity(0.45),
                      ),
                      selectedIcon: Icon(
                        Icons.settings_rounded,
                        size: 21,
                        color: theme.colorScheme.primary,
                      ),
                      label: 'Settings',
                    ),
                  ],
                );
              },
            ),
          ),
          ),
      );
    }

    final routes = [
      '/dashboard',
      '/chat',
      '/contacts',
      '/settings'
    ];
    final matchedPath = widget.currentPath.startsWith('/chat')
        ? '/chat'
        : widget.currentPath.startsWith('/settings')
            ? '/settings'
            : widget.currentPath;
    final currentIndex = routes.indexOf(matchedPath);

    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: theme.dividerColor, width: 0.5),
        ),
      ),
      child: NavigationBar(
        selectedIndex: currentIndex >= 0 ? currentIndex : 0,
        onDestinationSelected: (index) => context.go(routes[index]),
        backgroundColor: theme.scaffoldBackgroundColor,
        indicatorColor: theme.colorScheme.primary.withOpacity(0.12),
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.grid_view_rounded, size: 22),
            selectedIcon: Icon(Icons.grid_view_rounded, size: 22),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline_rounded, size: 22),
            selectedIcon: Icon(Icons.chat_bubble_rounded, size: 22),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline_rounded, size: 22),
            selectedIcon: Icon(Icons.people_rounded, size: 22),
            label: 'Contacts',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined, size: 22),
            selectedIcon: Icon(Icons.settings_rounded, size: 22),
            label: 'Settings',
          ),
        ],
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
      selected
          ? Icons.chat_bubble_rounded
          : Icons.chat_bubble_outline_rounded,
      size: 21,
      color: selected
          ? theme.colorScheme.primary
          : theme.colorScheme.onSurface.withOpacity(0.45),
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
                    color: const Color(0xFFFF3B30).withOpacity(0.4),
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

// ══════════════════════════════════════════════════════════
// Side Navigation - clean, minimal, flat
// ══════════════════════════════════════════════════════════
class _PremiumSideNav extends StatefulWidget {
  final String currentPath;

  const _PremiumSideNav({required this.currentPath});

  @override
  State<_PremiumSideNav> createState() => _PremiumSideNavState();
}

class _PremiumSideNavState extends State<_PremiumSideNav>
    with SingleTickerProviderStateMixin {
  bool _isExpanded = false;
  late AnimationController _animController;
  late Animation<double> _widthAnimation;

  static const double _collapsedWidth = 60;
  static const double _expandedWidth = 220;

  static const Color _navBg = Color(0xFF1A2236);
  static const Color _navBgSubtle = Color(0xFF222B40);
  static const Color _navAccent = Color(0xFF2563EB);
  static const Color _navTextMuted = Color(0xFF8A95A8);
  static const Color _navText = Color(0xFFE6EAF2);
  static const Color _navDivider = Color(0xFF2A344C);

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _widthAnimation = Tween<double>(
      begin: _collapsedWidth,
      end: _expandedWidth,
    ).animate(CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOutCubic,
    ));
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _toggleExpand() {
    setState(() {
      _isExpanded = !_isExpanded;
      if (_isExpanded) {
        _animController.forward();
      } else {
        _animController.reverse();
      }
    });
  }

  bool _hasPerm(BuildContext context, String permKey) {
    final state = context.read<AuthBloc>().state;
    if (state is AuthAuthenticated) {
      return state.session.hasPermission(permKey);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final canViewDashboard = _hasPerm(context, 'menu_dashboard');
    final canViewContacts = _hasPerm(context, 'menu_contacts');
    final canViewBroadcasts = _hasPerm(context, 'menu_broadcasts');
    final canViewAutomation = _hasPerm(context, 'menu_automation');
    final canViewDripCampaigns = _hasPerm(context, 'menu_drip_campaigns');
    final canViewAuditLog = _hasPerm(context, 'menu_audit_log');
    final canViewSettings = _hasPerm(context, 'menu_settings');
    final showMarketing =
        canViewBroadcasts || canViewAutomation || canViewDripCampaigns;
    final showInsights = canViewAuditLog;

    return AnimatedBuilder(
      animation: _widthAnimation,
      builder: (context, child) {
        return SizedBox(
          width: _widthAnimation.value,
          child: Container(
            decoration: const BoxDecoration(
              color: _navBg,
              border: Border(
                right: BorderSide(color: _navDivider, width: 1),
              ),
            ),
            child: Column(
              children: [
                const SizedBox(height: 12),
                _buildHeader(theme),
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 8),
                          if (canViewDashboard)
                            _buildNavItem(
                                context,
                                Icons.grid_view_rounded,
                                Icons.grid_view_rounded,
                                'Dashboard',
                                '/dashboard'),
                          _buildNavItem(
                              context,
                              Icons.chat_bubble_outline_rounded,
                              Icons.chat_bubble_rounded,
                              'Chats',
                              '/chat'),
                          if (canViewContacts)
                            _buildNavItem(
                                context,
                                Icons.people_outline_rounded,
                                Icons.people_rounded,
                                'Contacts',
                                '/contacts'),
                          if (showMarketing) ...[
                            const SizedBox(height: 6),
                            Container(
                              height: 1,
                              margin: const EdgeInsets.symmetric(horizontal: 8),
                              color: _navDivider,
                            ),
                            const SizedBox(height: 6),
                            if (canViewBroadcasts)
                              _buildNavItem(
                                  context,
                                  Icons.campaign_outlined,
                                  Icons.campaign_rounded,
                                  'Broadcasts',
                                  '/broadcasts'),
                            if (canViewAutomation)
                              _buildNavItem(
                                  context,
                                  Icons.auto_awesome_outlined,
                                  Icons.auto_awesome_rounded,
                                  'Automation',
                                  '/automation'),
                            if (canViewDripCampaigns)
                              _buildNavItem(
                                  context,
                                  Icons.water_drop_outlined,
                                  Icons.water_drop_rounded,
                                  'Drip Campaigns',
                                  '/drip-campaigns'),
                          ],
                          if (showInsights) ...[
                            const SizedBox(height: 6),
                            Container(
                              height: 1,
                              margin: const EdgeInsets.symmetric(horizontal: 8),
                              color: _navDivider,
                            ),
                            const SizedBox(height: 6),
                            if (canViewAuditLog)
                              _buildNavItem(
                                  context,
                                  Icons.history_rounded,
                                  Icons.history_rounded,
                                  'System Log',
                                  '/audit-log'),
                          ],
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                    child: Column(
                      children: [
                        if (canViewSettings)
                          _buildNavItem(
                              context,
                              Icons.settings_outlined,
                              Icons.settings_rounded,
                              'Settings',
                              '/settings'),
                        const SizedBox(height: 8),
                        Container(
                          height: 1,
                          color: _navDivider,
                        ),
                        const SizedBox(height: 8),
                        _buildUserTile(context, theme),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
      },
    );
  }

  Widget _buildHeader(ThemeData theme) {
    // Logo image in a clean rounded container
    final logo = Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.asset(
          'assets/images/simpulx_logo.png',
          width: 36,
          height: 36,
          fit: BoxFit.cover,
        ),
      ),
    );

    if (!_isExpanded) {
      return Column(
        children: [
          logo,
          const SizedBox(height: 8),
          _buildCollapseButton(),
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          logo,
          const SizedBox(width: 10),
          ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              colors: [Color(0xFF2563EB), Color(0xFF10B981)],
            ).createShader(bounds),
            child: const Text(
              'Simpulx',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.5,
              ),
            ),
          ),
          const Spacer(),
          _buildCollapseButton(),
        ],
      ),
    );
  }

  Widget _buildCollapseButton() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _toggleExpand,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _navBgSubtle,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            _isExpanded
                ? Icons.chevron_left_rounded
                : Icons.chevron_right_rounded,
            size: 16,
            color: _navTextMuted,
          ),
        ),
      ),
    );
  }

  Widget _buildSectionLabel(ThemeData theme, String label) {
    if (!_isExpanded) {
      return const SizedBox(height: 4);
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 4),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: _navTextMuted,
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData icon,
    IconData selectedIcon,
    String label,
    String route, {
    bool comingSoon = false,
  }) {
    final isSelected = widget.currentPath.startsWith(route) && !comingSoon;

    final iconColor = isSelected
        ? Colors.white
        : comingSoon
            ? _navTextMuted.withValues(alpha: 0.4)
            : _navTextMuted;

    final textColor = isSelected
        ? Colors.white
        : comingSoon
            ? _navTextMuted.withValues(alpha: 0.4)
            : _navText;

    final content = Row(
      mainAxisAlignment: _isExpanded
          ? MainAxisAlignment.start
          : MainAxisAlignment.center,
      children: [
        Icon(
          isSelected ? selectedIcon : icon,
          size: 18,
          color: iconColor,
        ),
        if (_isExpanded) ...[
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                color: textColor,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (comingSoon)
            Container(
              decoration: BoxDecoration(
                color: _navTextMuted.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(4),
              ),
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              child: const Text(
                'Soon',
                style: TextStyle(
                  fontSize: 9,
                  color: _navTextMuted,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ],
    );

    final item = Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: comingSoon
              ? () {
                  AppSnackbar.info(context, '$label coming soon!');
                }
              : () => context.go(route),
          borderRadius: BorderRadius.circular(8),
          hoverColor: _navBgSubtle.withValues(alpha: 0.6),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: 34,
            padding: EdgeInsets.symmetric(
              horizontal: _isExpanded ? 10 : 0,
            ),
            decoration: BoxDecoration(
              color: isSelected ? _navAccent : null,
              borderRadius: BorderRadius.circular(8),
            ),
            child: content,
          ),
        ),
      ),
    );

    if (!_isExpanded) {
      return Tooltip(
        message: label,
        waitDuration: const Duration(milliseconds: 300),
        preferBelow: false,
        child: item,
      );
    }
    return item;
  }

  Widget _buildUserTile(BuildContext context, ThemeData theme) {
    final authState = context.watch<AuthBloc>().state;
    String name = 'User';
    String role = 'Agent';

    if (authState is AuthAuthenticated) {
      name = authState.session.user.fullName;
      role = authState.session.user.role;
    }

    void confirmLogout() {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Logout'),
          content: const Text('Are you sure you want to sign out?'),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                context.read<AuthBloc>().add(LogoutEvent());
                GoRouter.of(context).go('/login');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red.shade600,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text('Sign Out'),
            ),
          ],
        ),
      );
    }

    final avatar = CircleAvatar(
      radius: 14,
      backgroundColor: _navBgSubtle,
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : 'U',
        style: const TextStyle(
          color: _navText,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    if (!_isExpanded) {
      return Tooltip(
        message: '$name • Sign out',
        preferBelow: false,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: confirmLogout,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              height: 44,
              alignment: Alignment.center,
              child: avatar,
            ),
          ),
        ),
      );
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: confirmLogout,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              avatar,
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: _navText,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 1),
                    Text(
                      role,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: _navTextMuted,
                        fontWeight: FontWeight.w500,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.logout_rounded,
                size: 15,
                color: _navTextMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
