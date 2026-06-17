// ============================================================
// Security Settings Page - Extracted from monolith
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';

class SecuritySettingsPage extends StatefulWidget {
  const SecuritySettingsPage({super.key});

  @override
  State<SecuritySettingsPage> createState() => _SecuritySettingsPageState();
}

class _SecuritySettingsPageState extends State<SecuritySettingsPage> {
  late final SettingsRemoteDataSource _ds;
  final _currentPwCtrl = TextEditingController();
  final _newPwCtrl = TextEditingController();
  final _confirmPwCtrl = TextEditingController();
  bool _saving = false;

  String get _currentRole {
    final s = context.read<AuthBloc>().state;
    if (s is AuthAuthenticated) return s.session.user.role;
    return 'agent';
  }

  bool get _isAdminOrOwner =>
      _currentRole == 'owner' || _currentRole == 'admin';

  @override
  void initState() {
    super.initState();
    _ds = di.sl<SettingsRemoteDataSource>();
  }

  @override
  void dispose() {
    _currentPwCtrl.dispose();
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border:
                  Border.all(color: theme.dividerColor.withValues(alpha: 0.5)),
            ),
            child: Column(
              children: [
                TextField(
                  controller: _currentPwCtrl,
                  obscureText: true,
                  decoration:
                      const InputDecoration(labelText: 'Current Password'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _newPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'New Password',
                    helperText:
                        'Minimum 8 characters, 1 uppercase letter, 1 number',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _confirmPwCtrl,
                  obscureText: true,
                  decoration:
                      const InputDecoration(labelText: 'Confirm New Password'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _saving ? null : _changePassword,
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Update Password'),
            ),
          ),
          const SizedBox(height: 32),
          if (_isAdminOrOwner)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Danger Zone',
                          style: TextStyle(
                            color: Color(0xFFEF4444),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Account deletion is intentionally disabled here for safety.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton(
                    onPressed: null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFEF4444),
                      side: const BorderSide(color: Color(0xFFEF4444)),
                    ),
                    child: const Text('Delete Account'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _changePassword() async {
    final cur = _currentPwCtrl.text.trim();
    final np = _newPwCtrl.text.trim();
    final cp = _confirmPwCtrl.text.trim();

    if (cur.isEmpty || np.isEmpty || cp.isEmpty) {
      _snack('Please fill in all password fields.', isError: true);
      return;
    }
    if (np != cp) {
      _snack('New password and confirmation do not match.', isError: true);
      return;
    }
    final policy = RegExp(r'^(?=.*[A-Z])(?=.*\d).{8,}$');
    if (!policy.hasMatch(np)) {
      _snack(
        'Password must be at least 8 characters with 1 uppercase letter and 1 number.',
        isError: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final msg = await _ds.changePassword(
        currentPassword: cur,
        newPassword: np,
      );
      if (!mounted) return;
      _currentPwCtrl.clear();
      _newPwCtrl.clear();
      _confirmPwCtrl.clear();
      _snack(msg);
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, {bool isError = false}) {
    if (!mounted) return;
    if (isError) {
      AppSnackbar.error(context, msg);
    } else {
      AppSnackbar.success(context, msg);
    }
  }
}
