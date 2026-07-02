import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/notifications/notification_prefs.dart';
import '../../../../core/providers/locale_provider.dart';
import '../../../../core/providers/theme_provider.dart';
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
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);

    String langName(Locale? l) {
      if (l == null) return 'System Default';
      switch (l.languageCode) {
        case 'id':
          return 'Indonesia';
        case 'en':
        default:
          return 'English';
      }
    }

    String themeName(ThemeMode m) {
      switch (m) {
        case ThemeMode.light:
          return 'Light';
        case ThemeMode.dark:
          return 'Dark';
        case ThemeMode.system:
        default:
          return 'System Default';
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          SliverList.list(
            children: [
              if (user != null) _ProfileHeader(),
              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 8),
              _OnlineStatusTile(),
              ListTile(
                leading: const Icon(Icons.key_rounded),
                title: const Text('Account'),
                subtitle: const Text('Change password'),
                onTap: () => _showProfile(context),
              ),
              ListTile(
                leading: const Icon(Icons.notifications_none_rounded),
                title: const Text('Notifications'),
                subtitle: const Text('Message & Alerts'),
                onTap: () => _showNotificationPrefs(context),
              ),
              ListTile(
                leading: const Icon(Icons.language_rounded),
                title: const Text('App language'),
                subtitle: Text(langName(locale)),
                onTap: () => _showLanguagePicker(context, ref, locale),
              ),
              ListTile(
                leading: const Icon(Icons.palette_outlined),
                title: const Text('App theme'),
                subtitle: Text(themeName(themeMode)),
                onTap: () => _showThemePicker(context, ref, themeMode),
              ),
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

  void _showLanguagePicker(BuildContext context, WidgetRef ref, Locale? current) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Language',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            RadioListTile<Locale?>(
              title: const Text('System Default'),
              subtitle: const Text('Follow device language'),
              value: null,
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(null);
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Language set to System Default');
              },
            ),
            RadioListTile<Locale?>(
              title: const Text('English'),
              value: const Locale('en'),
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(const Locale('en'));
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Language set to English');
              },
            ),
            RadioListTile<Locale?>(
              title: const Text('Indonesia'),
              value: const Locale('id'),
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(const Locale('id'));
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Bahasa diubah ke Indonesia');
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showThemePicker(BuildContext context, WidgetRef ref, ThemeMode current) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('App theme',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            RadioListTile<ThemeMode>(
              title: const Text('System Default'),
              subtitle: const Text('Follow device theme'),
              value: ThemeMode.system,
              groupValue: current,
              onChanged: (v) {
                if (v != null) ref.read(themeModeProvider.notifier).setThemeMode(v);
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Theme set to System Default');
              },
            ),
            RadioListTile<ThemeMode>(
              title: const Text('Light'),
              value: ThemeMode.light,
              groupValue: current,
              onChanged: (v) {
                if (v != null) ref.read(themeModeProvider.notifier).setThemeMode(v);
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Theme set to Light');
              },
            ),
            RadioListTile<ThemeMode>(
              title: const Text('Dark'),
              value: ThemeMode.dark,
              groupValue: current,
              onChanged: (v) {
                if (v != null) ref.read(themeModeProvider.notifier).setThemeMode(v);
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Theme set to Dark');
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

}

class _OnlineStatusTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;
    final isOnline = user?.isOnline ?? false;

    return SwitchListTile.adaptive(
      secondary: _PulsingDot(isOnline: isOnline),
      title: Text(isOnline ? 'Online' : 'Offline'),
      value: isOnline,
      activeThumbColor: AppColors.success,
      onChanged: (v) =>
          ref.read(authControllerProvider.notifier).setPresence(v),
    );
  }
}

/// Green dot that pulses when online.
class _PulsingDot extends StatefulWidget {
  const _PulsingDot({required this.isOnline});
  final bool isOnline;

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500));
    _scale = Tween<double>(begin: 1.0, end: 1.6).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
    );
    if (widget.isOnline) _ctrl.repeat(reverse: false);
  }

  @override
  void didUpdateWidget(_PulsingDot old) {
    super.didUpdateWidget(old);
    if (widget.isOnline && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: false);
    } else if (!widget.isOnline && _ctrl.isAnimating) {
      _ctrl.stop();
      _ctrl.reset();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 24,
      height: 24,
      child: Center(
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (widget.isOnline)
              AnimatedBuilder(
                animation: _ctrl,
                builder: (_, __) => Transform.scale(
                  scale: _scale.value,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.success.withValues(alpha: 1 - _ctrl.value),
                    ),
                  ),
                ),
              ),
            Icon(
              widget.isOnline ? Icons.circle : Icons.circle_outlined,
              color: widget.isOnline ? AppColors.success : AppColors.textMuted,
              size: 16,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeader extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user!;
    final theme = Theme.of(context);
    // Plain header (no card/container): just the avatar + identity on the page
    // background, so the top of Settings reads clean.
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.sm),
      child: Row(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppColors.avatarColor(user.name),
            backgroundImage: user.avatarUrl != null
                ? NetworkImage(user.avatarUrl!)
                : null,
            child: user.avatarUrl == null
                ? Text(user.initials,
                    style: const TextStyle(
                        color: Colors.white,
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
            const Text(
              'CHANGE PASSWORD',
              style: TextStyle(
                color: AppColors.textMuted,
                letterSpacing: 0.6,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 8),
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
            title: const Text('Incoming calls'),
            value: prefs.calls,
            onChanged: controller.setCalls,
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
