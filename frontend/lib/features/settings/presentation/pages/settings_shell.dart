// ============================================================
// Settings Shell - Sidebar + Sub-page Router
// ============================================================
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/core/theme/app_style.dart';

class SettingsShell extends StatelessWidget {
  final Widget child;
  final String currentPath;

  const SettingsShell({
    super.key,
    required this.child,
    required this.currentPath,
  });

  static const _allSections = [
    _Section('Profile', Icons.person_rounded, '/settings/profile', null),
    _Section('Organization', Icons.business_rounded, '/settings/organization',
        'view_settings'),
    _Section('Departments', Icons.account_tree_rounded, '/settings/departments',
        'manage_departments'),
    _Section(
        'Channels', Icons.hub_rounded, '/settings/whatsapp', 'manage_channels'),
    _Section('Templates', Icons.description_rounded, '/settings/templates',
        'manage_channels'),
    _Section('Team', Icons.group_rounded, '/settings/team', 'manage_team'),
    _Section('Roles & Permissions', Icons.admin_panel_settings_rounded,
        '/settings/roles', 'manage_roles'),
    _Section('Quick Replies', Icons.quickreply_rounded,
        '/settings/quick-replies', 'manage_quick_replies'),
    _Section(
        'Stages', Icons.layers_rounded, '/settings/stages', 'view_settings'),
    _Section('Contact Fields', Icons.contact_page_rounded,
        '/settings/contact-fields', 'manage_contact_fields'),
    _Section('Notifications', Icons.notifications_rounded,
        '/settings/notifications', null),
    _Section('Security', Icons.security_rounded, '/settings/security', null),
  ];

  List<_Section> _visibleSections(BuildContext context) {
    final state = context.read<AuthBloc>().state;
    if (state is! AuthAuthenticated) return [];
    final session = state.session;
    return _allSections.where((s) {
      if (s.minRole == null) return true;
      return session.hasPermission(s.minRole!);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWide = MediaQuery.of(context).size.width >= 900;

    if (isWide) {
      return Row(
        children: [
          SizedBox(width: 240, child: _buildSidebar(context, theme)),
          VerticalDivider(width: 1, color: theme.dividerColor),
          Expanded(child: child),
        ],
      );
    }
    return Column(
      children: [
        _buildChips(context, theme),
        Expanded(child: child),
      ],
    );
  }

  Widget _buildSidebar(BuildContext context, ThemeData theme) {
    return Container(
      color: theme.colorScheme.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
            child: Text(
              'Settings',
              style: AppText.titleLg,
            ),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: _visibleSections(context).map((section) {
                final isSelected = currentPath == section.route ||
                    (section.route == '/settings/profile' &&
                        currentPath == '/settings');

                return ListTile(
                  leading: Icon(
                    section.icon,
                    color: isSelected
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    size: 20,
                  ),
                  title: Text(
                    section.label,
                    style: AppText.body.copyWith(
                      fontSize: 13.5,
                      fontWeight:
                          isSelected ? FontWeight.w600 : FontWeight.w400,
                      color: isSelected
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface.withValues(alpha: 0.8),
                    ),
                  ),
                  selected: isSelected,
                  selectedTileColor:
                      theme.colorScheme.primary.withValues(alpha: 0.08),
                  dense: true,
                  minLeadingWidth: 28,
                  visualDensity: const VisualDensity(vertical: -2),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 0),
                  onTap: () => context.go(section.route),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChips(BuildContext context, ThemeData theme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Settings',
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _visibleSections(context).map((section) {
                final isSelected = currentPath == section.route ||
                    (section.route == '/settings/profile' &&
                        currentPath == '/settings');

                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(section.label),
                    selected: isSelected,
                    onSelected: (_) => context.go(section.route),
                    selectedColor:
                        theme.colorScheme.primary.withValues(alpha: 0.12),
                    labelStyle: TextStyle(
                      fontSize: 13,
                      fontWeight:
                          isSelected ? FontWeight.w600 : FontWeight.w400,
                      color: isSelected
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section {
  final String label;
  final IconData icon;
  final String route;
  final String? minRole;
  const _Section(this.label, this.icon, this.route, this.minRole);
}
