import 'package:flutter/material.dart';

class AppSnackbar {
  static void show(BuildContext context, String message, {bool isError = false}) {
    final scaffold = ScaffoldMessenger.of(context);
    scaffold.hideCurrentSnackBar();

    final overlay = OverlayEntry(builder: (_) => const SizedBox.shrink());

    scaffold.showSnackBar(
      SnackBar(
        content: UnconstrainedBox(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.78),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.asset(
                  'assets/images/logo.png',
                  height: 18,
                  width: 18,
                  color: isError ? Colors.redAccent : Colors.white.withValues(alpha: 0.85),
                ),
                const SizedBox(width: 8),
                Text(
                  message,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.only(
          bottom: MediaQuery.of(context).size.height / 2.5,
        ),
        padding: EdgeInsets.zero,
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
