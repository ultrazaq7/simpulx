// ============================================================
// SimpulxLogo - Reusable logo widget using the Simpulx launcher icon
// ============================================================
import 'package:flutter/material.dart';

/// Renders the Simpulx app logo from the launcher icon asset.
/// Applies rounded corners and optional glow for a polished look.
class SimpulxLogo extends StatelessWidget {
  /// The width & height of the logo (always square).
  final double size;

  /// If true, adds a subtle glow effect for dark backgrounds.
  final bool onDark;

  /// Border radius factor (0.0 = square, 1.0 = circle).
  /// Defaults to 0.25 for a rounded-square like the launcher icon.
  final double borderRadiusFactor;

  const SimpulxLogo({
    super.key,
    this.size = 32,
    this.onDark = true,
    this.borderRadiusFactor = 0.25,
  });

  @override
  Widget build(BuildContext context) {
    final radius = size * borderRadiusFactor;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: onDark
            ? [
                BoxShadow(
                  color: const Color(0xFF2D8B73).withValues(alpha: 0.3),
                  blurRadius: size * 0.5,
                  offset: const Offset(0, 2),
                ),
              ]
            : [
                BoxShadow(
                  color: const Color(0xFF2D8B73).withValues(alpha: 0.15),
                  blurRadius: size * 0.3,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Image.asset(
          'assets/images/simpulx_logo.png',
          width: size,
          height: size,
          fit: BoxFit.cover,
        ),
      ),
    );
  }
}
