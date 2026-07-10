import 'package:flutter/material.dart';

class AppSnackbar {
  static void show(BuildContext context, String message,
      {bool isError = false, Brightness? brightness}) {
    final scaffold = ScaffoldMessenger.of(context);
    // Toast MATCHES the active theme: a light bar with dark text on the light
    // theme, a dark bar with white text on the dark theme. Keyed off brightness
    // so it follows the theme (and flips) consistently when it's changed.
    // Callers that just switched the theme pass the target [brightness] so the
    // toast never reads a stale context mid-switch (which would invert it).
    final isDark = (brightness ?? Theme.of(context).brightness) == Brightness.dark;
    final bg = isDark ? const Color(0xFF2A3942) : const Color(0xFFE9EDEF);
    final fg = isDark ? Colors.white : const Color(0xFF1C2B33);
    final errorFg = isDark ? const Color(0xFFFF6B6B) : const Color(0xFFD32F2F);

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
        // Kill the default floating-SnackBar chrome so only our pill shows
        // (no faint bordered stadium behind it).
        shape: const RoundedRectangleBorder(
          side: BorderSide.none,
          borderRadius: BorderRadius.all(Radius.circular(999)),
        ),
        margin: const EdgeInsets.only(bottom: 80, left: 16, right: 16),
        padding: EdgeInsets.zero,
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
