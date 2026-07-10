import 'package:flutter/material.dart';

class AppSnackbar {
  static void show(BuildContext context, String message, {bool isError = false}) {
    final scaffold = ScaffoldMessenger.of(context);
    final theme = Theme.of(context);
    // WhatsApp-style solid toast. Colors are keyed directly off the active
    // brightness (not the ColorScheme, which a custom theme may pin to a single
    // value) so the bar always follows the theme and flips correctly when it's
    // toggled: a dark bar on a light theme, a light bar on a dark theme.
    final isDark = theme.brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFFE9EDEF) : const Color(0xFF202C33);
    final fg = isDark ? const Color(0xFF111B21) : Colors.white;
    final errorFg = isDark ? const Color(0xFFC62828) : const Color(0xFFFF6B6B);

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
                  color: isError ? errorFg : fg,
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
