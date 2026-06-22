import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';

/// Centered brand spinner used for full-screen / section loading states.
class AppLoader extends StatelessWidget {
  const AppLoader({super.key, this.size = 28, this.label});

  final double size;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: const CircularProgressIndicator(
              strokeWidth: 2.6,
              valueColor: AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
          if (label != null) ...[
            const SizedBox(height: 12),
            Text(label!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}
