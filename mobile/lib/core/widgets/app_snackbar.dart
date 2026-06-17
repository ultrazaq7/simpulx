import 'package:flutter/material.dart';

/// Styled snackbar utility for the entire app.
class AppSnackbar {
  AppSnackbar._();

  static void success(BuildContext context, String message) =>
      _show(context, message, _Type.success);

  static void error(BuildContext context, String message) =>
      _show(context, message, _Type.error);

  static void info(BuildContext context, String message) =>
      _show(context, message, _Type.info);

  static void _show(BuildContext context, String message, _Type type) {
    final screenWidth = MediaQuery.of(context).size.width;
    // Keep snackbar compact – max 380px, pinned to bottom-right
    final snackWidth = screenWidth < 420 ? screenWidth - 32 : 380.0;
    final leftMargin = screenWidth - snackWidth - 24;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(type.icon, color: Colors.white, size: 16),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: type.color,
          elevation: 6,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          margin: EdgeInsets.only(
            bottom: 24,
            left: leftMargin.clamp(16.0, double.infinity),
            right: 24,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          duration: const Duration(seconds: 3),
          dismissDirection: DismissDirection.horizontal,
        ),
      );
  }
}

enum _Type {
  success(Color(0xFF2ECC71), Icons.check_circle_rounded),
  error(Color(0xFFEF4444), Icons.error_rounded),
  info(Color(0xFF3498DB), Icons.info_rounded);

  final Color color;
  final IconData icon;
  const _Type(this.color, this.icon);
}
