import 'package:flutter/material.dart';

class AppSnackbar {
  static void show(BuildContext context, String message, {bool isError = false}) {
    final scaffold = ScaffoldMessenger.of(context);
    final theme = Theme.of(context);
    // WhatsApp-style solid toast: fully opaque and theme-aware. Material's
    // inverseSurface flips automatically — a dark bar on a light theme, a light
    // bar on a dark theme — so the toast always contrasts with the background.
    final bg = theme.colorScheme.inverseSurface;
    final fg = theme.colorScheme.onInverseSurface;

    // Animate the previous toast out first so a rapid second call slides in
    // cleanly instead of snapping.
    scaffold.hideCurrentSnackBar();

    scaffold.showSnackBar(
      SnackBar(
        content: UnconstrainedBox(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.22),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.asset(
                  'assets/images/logo.png',
                  height: 18,
                  width: 18,
                  color: isError ? theme.colorScheme.error : fg,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    message,
                    style: TextStyle(
                      color: fg,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.only(bottom: 80, left: 16, right: 16),
        padding: EdgeInsets.zero,
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
