import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/i18n/i18n.dart';
import '../controllers/auth_controller.dart';

/// Completes a password reset from an email deep link
/// (`/reset-password?token=...`) via `POST /auth/reset-password`.
class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key, required this.token});

  final String token;

  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitting = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result = await ref.read(authRepositoryProvider).resetPassword(
          token: widget.token,
          newPassword: _password.text,
        );
    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _submitting = false;
        _error = failure.message;
      }),
      (_) => setState(() {
        _submitting = false;
        _done = true;
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final invalidToken = widget.token.isEmpty;

    return Scaffold(
      appBar: AppBar(title: Text('New password'.tr(context))),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: invalidToken
                  ? _Message(
                      icon: Icons.link_off_rounded,
                      title: 'Invalid link'.tr(context),
                      message:
                          'This reset link is missing or malformed. Request a new one.'.tr(context),
                    )
                  : _done
                      ? Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _Message(
                              icon: Icons.check_circle_outline_rounded,
                              title: 'Password updated'.tr(context),
                              message: 'You can now sign in with your new password.'.tr(context),
                            ),
                            const SizedBox(height: AppSpacing.xl),
                            ElevatedButton(
                              onPressed: () => context.go('/login'),
                              child: Text('Back to sign in'.tr(context)),
                            ),
                          ],
                        )
                      : Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Choose a new password (at least 8 characters).'.tr(context),
                                style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.textSecondary),
                              ),
                              const SizedBox(height: AppSpacing.xl),
                              TextFormField(
                                controller: _password,
                                enabled: !_submitting,
                                obscureText: true,
                                decoration: InputDecoration(
                                  labelText: 'New password'.tr(context),
                                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                                ),
                                validator: (v) => (v ?? '').length < 8
                                    ? 'At least 8 characters'.tr(context)
                                    : null,
                              ),
                              const SizedBox(height: AppSpacing.md),
                              TextFormField(
                                controller: _confirm,
                                enabled: !_submitting,
                                obscureText: true,
                                onFieldSubmitted: (_) => _submit(),
                                decoration: InputDecoration(
                                  labelText: 'Confirm password'.tr(context),
                                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                                ),
                                validator: (v) => v != _password.text
                                    ? 'Passwords do not match'.tr(context)
                                    : null,
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: AppSpacing.md),
                                Text(_error!,
                                    style: const TextStyle(
                                        color: AppColors.danger,
                                        fontSize: 13)),
                              ],
                              const SizedBox(height: AppSpacing.xl),
                              ElevatedButton(
                                onPressed: _submitting ? null : _submit,
                                child: _submitting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.4,
                                          valueColor: AlwaysStoppedAnimation(
                                              Colors.white),
                                        ),
                                      )
                                    : Text('Update password'.tr(context)),
                              ),
                            ],
                          ),
                        ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    required this.message,
  });
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: AppColors.primary, size: 44),
        const SizedBox(height: AppSpacing.lg),
        Text(title,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSpacing.sm),
        Text(message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: AppColors.textSecondary)),
      ],
    );
  }
}
