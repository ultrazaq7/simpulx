import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/i18n/i18n.dart';
import '../controllers/auth_controller.dart';

/// Requests a password-reset email via `POST /auth/forgot-password`.
class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() =>
      _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _submitting = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result = await ref
        .read(authRepositoryProvider)
        .forgotPassword(_email.text.trim());
    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _submitting = false;
        _error = failure.message;
      }),
      (_) => setState(() {
        _submitting = false;
        _sent = true;
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text('Reset password'.tr(context))),
      body: SafeArea(
        child: Align(
          alignment: const Alignment(0, -0.3),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: _sent
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.mark_email_read_outlined,
                            color: AppColors.primary, size: 44),
                        const SizedBox(height: AppSpacing.lg),
                        Text('Check your email'.tr(context),
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          'If an account exists for that email, a reset link is on its way.'.tr(context),
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: AppColors.textSecondary),
                        ),
                      ],
                    )
                  : Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Icon(Icons.lock_reset_rounded, size: 72, color: AppColors.primary),
                          const SizedBox(height: AppSpacing.lg),
                          Text(
                            'Enter your account email and we will send a reset link.'.tr(context),
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: AppSpacing.xl),
                          TextFormField(
                            controller: _email,
                            enabled: !_submitting,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: 'Email'.tr(context),
                              prefixIcon: const Icon(Icons.mail_outline_rounded),
                            ),
                            validator: (v) {
                              final value = v?.trim() ?? '';
                              if (value.isEmpty) return 'Enter your email'.tr(context);
                              if (!value.contains('@')) {
                                return 'Enter a valid email'.tr(context);
                              }
                              return null;
                            },
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            Text(_error!,
                                style: const TextStyle(
                                    color: AppColors.danger, fontSize: 13)),
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
                                : Text('Send reset link'.tr(context)),
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
