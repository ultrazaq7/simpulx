import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/notifications/notification_prefs.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/providers/locale_provider.dart';
import '../../../../core/session/session_controller.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';

/// P1 settings home: profile header, presence toggle, sign out. P6 adds
/// language, notification preferences, account, and the Workspace hub.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final user = ref.watch(sessionControllerProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          if (user != null) _ProfileHeader(),
          const _SectionLabel('Availability'),
          SwitchListTile.adaptive(
            secondary: Icon(
              user?.isOnline ?? false
                  ? Icons.circle
                  : Icons.circle_outlined,
              color: user?.isOnline ?? false
                  ? AppColors.success
                  : AppColors.textMuted,
              size: 16,
            ),
            title: Text(user?.isOnline ?? false ? 'Online' : 'Offline'),
            subtitle: const Text('Receive new lead assignments'),
            value: user?.isOnline ?? false,
            activeThumbColor: AppColors.success,
            onChanged: (v) =>
                ref.read(authControllerProvider.notifier).setPresence(v),
          ),
          const Divider(height: 1),
          const _SectionLabel('Account'),
          const ListTile(
            leading: Icon(Icons.person_rounded),
            title: Text('Profile'),
            subtitle: Text('Name, email, password (P6)'),
            trailing: Icon(Icons.chevron_right_rounded),
          ),
          ListTile(
            leading: const Icon(Icons.notifications_rounded),
            title: const Text('Notifications'),
            subtitle: const Text('Choose what alerts you'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _showNotificationPrefs(context),
          ),
          ListTile(
            leading: const Icon(Icons.language_rounded),
            title: const Text('Language'),
            subtitle: Text(_localeLabel(ref.watch(localeProvider))),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _showLanguageSheet(context, ref),
          ),
          if (user?.role.isManagerTier ?? false) ...[
            const Divider(height: 1),
            const _SectionLabel('Workspace'),
            ListTile(
              leading: const Icon(Icons.grid_view_rounded),
              title: const Text('Workspace'),
              subtitle: const Text('Broadcasts, team, and more'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/workspace'),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(
                    color: AppColors.danger.withValues(alpha: 0.4)),
              ),
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).signOut(),
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('Sign out'),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Text(
              'Simpulx - ${config.flavor.name}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}

class _ProfileHeader extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user!;
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            backgroundImage: user.avatarUrl != null
                ? NetworkImage(user.avatarUrl!)
                : null,
            child: user.avatarUrl == null
                ? Text(user.initials,
                    style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700))
                : null,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name,
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                Text(user.email,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: AppColors.textSecondary)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(user.role.label,
                      style: const TextStyle(
                          color: AppColors.primaryDark,
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.sm),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: AppColors.textMuted,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

String _localeLabel(Locale? locale) {
  switch (locale?.languageCode) {
    case 'en':
      return 'English';
    case 'id':
      return 'Bahasa Indonesia';
    default:
      return 'System default';
  }
}

void _showLanguageSheet(BuildContext context, WidgetRef ref) {
  final current = ref.read(localeProvider)?.languageCode;
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final option in const [
            (null, 'System default'),
            ('en', 'English'),
            ('id', 'Bahasa Indonesia'),
          ])
            ListTile(
              title: Text(option.$2),
              trailing: current == option.$1
                  ? const Icon(Icons.check_rounded, color: AppColors.primary)
                  : null,
              onTap: () {
                ref
                    .read(localeProvider.notifier)
                    .setLocale(option.$1 == null ? null : Locale(option.$1!));
                Navigator.of(context).pop();
              },
            ),
        ],
      ),
    ),
  );
}

void _showNotificationPrefs(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _NotificationPrefsSheet(),
  );
}

class _NotificationPrefsSheet extends ConsumerWidget {
  const _NotificationPrefsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPrefsProvider);
    final controller = ref.read(notificationPrefsProvider.notifier);
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Notifications',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          SwitchListTile.adaptive(
            title: const Text('Incoming messages'),
            value: prefs.messages,
            onChanged: controller.setMessages,
          ),
          SwitchListTile.adaptive(
            title: const Text('New leads'),
            value: prefs.leads,
            onChanged: controller.setLeads,
          ),
          SwitchListTile.adaptive(
            title: const Text('Follow-up reminders'),
            value: prefs.followUps,
            onChanged: controller.setFollowUps,
          ),
          SwitchListTile.adaptive(
            title: const Text('Assignments'),
            value: prefs.assignments,
            onChanged: controller.setAssignments,
          ),
          SwitchListTile.adaptive(
            title: const Text('Performance alerts'),
            value: prefs.performance,
            onChanged: controller.setPerformance,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
