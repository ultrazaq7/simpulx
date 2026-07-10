import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_spacing.dart';
import '../error/failure.dart';
import '../i18n/i18n.dart';

/// Standard error view with a retry affordance. Pass a [Failure] to surface its
/// message, or a raw [message].
class AppErrorView extends StatelessWidget {
  const AppErrorView({super.key, this.failure, this.message, this.onRetry});

  final Failure? failure;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = message ?? failure?.message ?? 'Something went wrong'.tr(context);
    final isNetwork = failure is NetworkFailure;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isNetwork ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
              color: AppColors.danger,
              size: 40,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              text,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: AppColors.textSecondary),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppSpacing.xl),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: Text('Retry'.tr(context)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
