import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/notifications/notification_prefs.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';

/// P1 settings home: profile header, presence toggle, sign out. P6 adds
/// language, notification preferences, account, and the Workspace hub.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: CustomScrollView(
        slivers: [
          SliverList.list(
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
                value: user?.isOnline ?? false,
                activeThumbColor: AppColors.success,
                onChanged: (v) =>
                    ref.read(authControllerProvider.notifier).setPresence(v),
              ),
              const Divider(height: 1),
              const _SectionLabel('Account'),
              ListTile(
                leading: const Icon(Icons.person_rounded),
                title: const Text('Profile'),
                subtitle: const Text('Your details and password'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => _showProfile(context),
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
                subtitle: const Text('English, Indonesia'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  // For now, just show a stub or dialog since language logic isn't defined yet
                  AppSnackbar.show(context, 'Language selection coming soon');
                },
              ),
              if (user?.role.isManagerTier ?? false) ...[
                const Divider(height: 1),
                const _SectionLabel('Workspace'),
                ListTile(
                  leading: const Icon(Icons.grid_view_rounded),
                  title: const Text('Workspace'),
                  subtitle: const Text('Team, and more'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push('/workspace'),
                ),
              ],
            ],
          ),
          SliverFillRemaining(
            hasScrollBody: false,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xxl, top: AppSpacing.lg, left: AppSpacing.lg, right: AppSpacing.lg),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OutlinedButton.icon(
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
                    const SizedBox(height: AppSpacing.xl),
                    RichText(
                      text: TextSpan(
                        text: 'Simpul',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.textMuted,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2,
                              shadows: [
                                Shadow(
                                  color: Colors.black.withValues(alpha: 0.1),
                                  offset: const Offset(0, 1),
                                  blurRadius: 2,
                                ),
                              ],
                            ),
                        children: const [
                          TextSpan(
                            text: 'x',
                            style: TextStyle(color: AppColors.brandAmber),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'v1.0.0',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.textMuted.withValues(alpha: 0.6),
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ),
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
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
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

void _showProfile(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
      child: const _ProfileSheet(),
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

/// Profile + change-password. Name/email are read-only (email changes require
/// verification on the web); password changes are self-service.
class _ProfileSheet extends ConsumerStatefulWidget {
  const _ProfileSheet();

  @override
  ConsumerState<_ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends ConsumerState<_ProfileSheet> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final current = _current.text;
    final next = _new.text;
    if (current.isEmpty || next.isEmpty) {
      setState(() => _error = 'Fill in both password fields');
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters');
      return;
    }
    if (next != _confirm.text) {
      setState(() => _error = 'New passwords do not match');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final result = await ref.read(authRepositoryProvider).changePassword(
          currentPassword: current,
          newPassword: next,
        );
    if (!mounted) return;
    result.fold(
      (f) => setState(() {
        _saving = false;
        _error = f.message;
      }),
      (_) {
        setState(() => _saving = false);
        AppSnackbar.show(context, 'Password updated');
        Navigator.of(context).pop();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionControllerProvider).user;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Profile',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                  backgroundImage: user?.avatarUrl != null
                      ? NetworkImage(user!.avatarUrl!)
                      : null,
                  child: user?.avatarUrl == null
                      ? Text(user?.initials ?? '?',
                          style: const TextStyle(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700))
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.name ?? '',
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                      Text(user?.email ?? '',
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const _SectionLabel('Change password'),
            TextField(
              controller: _current,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _new,
              obscureText: true,
              decoration: const InputDecoration(
                  labelText: 'New password (min 8 characters)'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _confirm,
              obscureText: true,
              decoration:
                  const InputDecoration(labelText: 'Confirm new password'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!,
                  style: const TextStyle(
                      color: AppColors.danger, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48)),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Update password'),
            ),
          ],
        ),
      ),
    );
  }
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
