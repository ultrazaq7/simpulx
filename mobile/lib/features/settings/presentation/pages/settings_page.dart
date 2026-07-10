import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
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
    // Watch the provider to rebuild when theme changes.
    final themeMode = ref.watch(themeModeProvider);

    String langName(Locale? l) {
      // Language names are shown as endonyms (their own language) regardless of
      // UI locale, matching how OS language pickers behave.
      if (l == null) return 'System Default'.tr(context);
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
          return 'Light'.tr(context);
        case ThemeMode.dark:
          return 'Dark'.tr(context);
        case ThemeMode.system:
        default:
          return 'System Default'.tr(context);
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Settings'.tr(context)),
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
                title: Text('Account'.tr(context)),
                subtitle: Text('Change password'.tr(context)),
                onTap: () => _showProfile(context),
              ),
              ListTile(
                leading: const Icon(Icons.notifications_none_rounded),
                title: Text('Notifications'.tr(context)),
                subtitle: Text('Message & Alerts'.tr(context)),
                onTap: () => _showNotificationPrefs(context),
              ),
              ListTile(
                leading: const Icon(Icons.language_rounded),
                title: Text('Language'.tr(context)),
                subtitle: Text(langName(locale)),
                onTap: () => _showLanguagePicker(context, ref, locale),
              ),
              ListTile(
                leading: const Icon(Icons.palette_outlined),
                title: Text('Theme'.tr(context)),
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
                      label: Text('Sign out'.tr(context)),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => _showAbout(context),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
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
                          Text('v1.0.0'.tr(context),
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: AppColors.textMuted.withValues(alpha: 0.6),
                                ),
                          ),
                        ],
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Language'.tr(context),
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            RadioListTile<Locale?>(
              title: Text('System Default'.tr(context)),
              subtitle: Text('Follow device language'.tr(context)),
              value: null,
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(null);
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Language set to System Default'.tr(context));
              },
            ),
            RadioListTile<Locale?>(
              title: Text('English'.tr(context)),
              value: const Locale('en'),
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(const Locale('en'));
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Language set to English'.tr(context));
              },
            ),
            RadioListTile<Locale?>(
              title: Text('Indonesia'.tr(context)),
              value: const Locale('id'),
              groupValue: current,
              onChanged: (v) {
                ref.read(localeProvider.notifier).setLocale(const Locale('id'));
                Navigator.of(context).pop();
                AppSnackbar.show(context, 'Bahasa diubah ke Indonesia'.tr(context));
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // Tapping the Simpulx wordmark reveals a WhatsApp-style "About" card with a
  // scale/fade pop and a pulsing brand glow behind the logo.
  void _showAbout(BuildContext context) {
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'About',
      barrierColor: Colors.black.withValues(alpha: 0.4),
      transitionDuration: const Duration(milliseconds: 480),
      pageBuilder: (ctx, animation, secondaryAnimation) => const _AboutScreen(),
      transitionBuilder: (ctx, anim, secondary, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: anim, curve: Curves.easeOutCubic),
          child: child,
        );
      },
    );
  }

  void _showThemePicker(
      BuildContext context, WidgetRef ref, ThemeMode current) {
    // Apply the theme, close the sheet, then show the confirmation AFTER the
    // next frame so the toast itself renders in the newly-applied theme rather
    // than the one that was active when it was tapped.
    void pick(ThemeMode? v, String label) {
      final mode = v ?? current;
      if (v != null) ref.read(themeModeProvider.notifier).setThemeMode(v);
      // Resolve the brightness the app is switching TO, so the confirmation
      // toast renders in the new theme instead of reading a stale context
      // (which would show it inverted).
      final target = switch (mode) {
        ThemeMode.light => Brightness.light,
        ThemeMode.dark => Brightness.dark,
        ThemeMode.system => MediaQuery.platformBrightnessOf(context),
      };
      Navigator.of(context).pop();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) AppSnackbar.show(context, label, brightness: target);
      });
    }

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Theme'.tr(context),
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            RadioListTile<ThemeMode>(
              title: Text('System Default'.tr(context)),
              subtitle: Text('Follow device theme'.tr(context)),
              value: ThemeMode.system,
              groupValue: current,
              onChanged: (v) => pick(v, 'Theme set to System Default'.tr(context)),
            ),
            RadioListTile<ThemeMode>(
              title: Text('Light'.tr(context)),
              value: ThemeMode.light,
              groupValue: current,
              onChanged: (v) => pick(v, 'Theme set to Light'.tr(context)),
            ),
            RadioListTile<ThemeMode>(
              title: Text('Dark'.tr(context)),
              value: ThemeMode.dark,
              groupValue: current,
              onChanged: (v) => pick(v, 'Theme set to Dark'.tr(context)),
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
      title: Text((isOnline ? 'Online' : 'Offline').tr(context)),
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
                ? CachedNetworkImageProvider(user.avatarUrl!)
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
      setState(() => _error = 'Fill in both password fields'.tr(context));
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters'.tr(context));
      return;
    }
    if (next != _confirm.text) {
      setState(() => _error = 'New passwords do not match'.tr(context));
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
        AppSnackbar.show(context, 'Password updated'.tr(context));
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
            Text('Profile'.tr(context),
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                  backgroundImage: user?.avatarUrl != null
                      ? CachedNetworkImageProvider(user!.avatarUrl!)
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
            Text('CHANGE PASSWORD'.tr(context),
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
              decoration:
                  InputDecoration(labelText: 'Current password'.tr(context)),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _new,
              obscureText: true,
              decoration: InputDecoration(
                  labelText: 'New password (min 8 characters)'.tr(context)),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _confirm,
              obscureText: true,
              decoration: InputDecoration(
                  labelText: 'Confirm new password'.tr(context)),
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
                  : Text('Update password'.tr(context)),
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
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Notifications'.tr(context),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          SwitchListTile.adaptive(
            title: Text('Incoming messages'.tr(context)),
            value: prefs.messages,
            onChanged: controller.setMessages,
          ),
          SwitchListTile.adaptive(
            title: Text('Incoming calls'.tr(context)),
            value: prefs.calls,
            onChanged: controller.setCalls,
          ),
          SwitchListTile.adaptive(
            title: Text('New leads'.tr(context)),
            value: prefs.leads,
            onChanged: controller.setLeads,
          ),
          SwitchListTile.adaptive(
            title: Text('Follow-up reminders'.tr(context)),
            value: prefs.followUps,
            onChanged: controller.setFollowUps,
          ),
          SwitchListTile.adaptive(
            title: Text('Assignments'.tr(context)),
            value: prefs.assignments,
            onChanged: controller.setAssignments,
          ),
          SwitchListTile.adaptive(
            title: Text('Performance alerts'.tr(context)),
            value: prefs.performance,
            onChanged: controller.setPerformance,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// Full-screen "About" shown when the Simpulx wordmark is tapped: a brand
/// gradient backdrop with the logo sitting in a layered, pulsing glow.
class _AboutScreen extends StatefulWidget {
  const _AboutScreen();

  @override
  State<_AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<_AboutScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _glow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _glow.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: isDark
                ? const [Color(0xFF0C201C), Color(0xFF060F0D)]
                : const [Color(0xFFF1FAF7), Colors.white],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: IconButton(
                    icon: Icon(Icons.close_rounded,
                        color: isDark ? Colors.white70 : Colors.black54),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 32, vertical: 40),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Logo inside a layered, pulsing brand glow.
                      AnimatedBuilder(
                        animation: _glow,
                        builder: (context, child) {
                          final t = _glow.value;
                          return SizedBox(
                            width: 210,
                            height: 210,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                Container(
                                  width: 150 + 34 * t,
                                  height: 150 + 34 * t,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(colors: [
                                      AppColors.primary
                                          .withValues(alpha: 0.20 + 0.16 * t),
                                      AppColors.primary.withValues(alpha: 0.0),
                                    ]),
                                  ),
                                ),
                                Container(
                                  width: 124,
                                  height: 124,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                        color: AppColors.primary.withValues(
                                            alpha: 0.16 + 0.16 * t),
                                        width: 1.2),
                                  ),
                                ),
                                child!,
                              ],
                            ),
                          );
                        },
                        child: Container(
                          width: 110,
                          height: 110,
                          decoration: BoxDecoration(
                            boxShadow: [
                              BoxShadow(
                                color:
                                    AppColors.primary.withValues(alpha: 0.30),
                                blurRadius: 40,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                          child: Image.asset('assets/images/logo.png',
                              fit: BoxFit.contain),
                        ),
                      ),
                      const SizedBox(height: 30),
                      RichText(
                        text: TextSpan(
                          text: 'Simpul',
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                            color: isDark
                                ? Colors.white
                                : const Color(0xFF0F1F1B),
                          ),
                          children: const [
                            TextSpan(
                                text: 'x',
                                style:
                                    TextStyle(color: AppColors.brandAmber)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Customer Engagement Platform'.tr(context),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 30),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 7),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color:
                                  AppColors.primary.withValues(alpha: 0.25)),
                        ),
                        child: Text(
                          'Version 1.0.0'.tr(context),
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Text(
                        '© 2026 Simpulx'.tr(context),
                        style: theme.textTheme.labelMedium?.copyWith(
                            color:
                                AppColors.textMuted.withValues(alpha: 0.7)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
