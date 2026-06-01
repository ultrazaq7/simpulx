import 'package:flutter/material.dart';

/// Shared avatar color utility for consistent contact avatars
/// across the app (contacts, chat list, notifications).
class AvatarColors {
  AvatarColors._();

  static const List<Color> _palette = [
    Color(0xFF1976D2), // blue
    Color(0xFF388E3C), // green
    Color(0xFFF57C00), // amber
    Color(0xFF7B1FA2), // purple
    Color(0xFFD32F2F), // red
    Color(0xFF00838F), // cyan
    Color(0xFFC2185B), // pink
    Color(0xFF00695C), // teal
  ];

  /// Cross-platform hash — consistent on web & native
  static int _stableHash(String s) {
    int hash = 0;
    for (int i = 0; i < s.length; i++) {
      hash = (hash * 37 + s.codeUnitAt(i)) & 0x7FFFFFFF;
    }
    return hash;
  }

  /// Get deterministic color for a name
  static Color getColor(String name) {
    if (name.isEmpty) return _palette[0];
    final index = _stableHash(name) % _palette.length;
    return _palette[index];
  }

  /// Get background color (lighter version) for a name
  static Color getBackgroundColor(String name) {
    return getColor(name).withValues(alpha: 0.12);
  }

  /// Build a CircleAvatar widget with consistent colors
  static Widget buildAvatar({
    required String name,
    double radius = 20,
    double fontSize = 16,
  }) {
    final color = getColor(name);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return CircleAvatar(
      radius: radius,
      backgroundColor: color.withValues(alpha: 0.12),
      child: Text(
        initial,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: fontSize,
        ),
      ),
    );
  }
}

