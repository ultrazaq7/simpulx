import 'package:flutter/material.dart';

/// Brand + semantic color tokens.
///
/// Ported from the legacy app's `app_style.dart` and aligned with the web app
/// (`web/`): teal primary `#2D8B73`, amber/red accents, neutral surfaces.
/// Use these tokens instead of hardcoded `Color(...)` literals in features.
class AppColors {
  AppColors._();

  // ── Brand ──────────────────────────────────────────────
  static const Color brandBlack = Color(0xFF0A1A1A);
  static const Color brandInk = Color(0xFF0F2625);
  static const Color brandGreen = Color(0xFF2D8B73);
  static const Color brandGreenSoft = Color(0xFF3AA88D);
  static const Color brandGreenDark = Color(0xFF236F5D);
  static const Color brandAmber = Color(0xFFF5A623);

  // ── Semantic ───────────────────────────────────────────
  static const Color primary = brandGreen;
  static const Color primaryDark = brandGreenDark;
  static const Color onPrimary = Colors.white;
  static const Color success = brandGreen;
  static const Color danger = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF3B82F6);
  static const Color purple = Color(0xFF8B5CF6);

  // ── Interest / lead temperature ────────────────────────
  static const Color hot = Color(0xFFEF4444);
  static const Color warm = Color(0xFFF59E0B);
  static const Color cold = Color(0xFF3B82F6);

  // ── Channels ───────────────────────────────────────────
  static const Color whatsapp = Color(0xFF25D366);
  static const Color messenger = Color(0xFF0084FF);
  static const Color instagram = Color(0xFFE4405F);
  static const Color tiktok = Color(0xFF000000);
  static const Color google = Color(0xFFEA4335);

  // ── Light surfaces ─────────────────────────────────────
  // Clean, WhatsApp-style pure white surfaces (no bluish/grey cast).
  static const Color background = Color(0xFFFFFFFF);
  static const Color surface = Colors.white;
  static const Color surfaceAlt = Color(0xFFF5F6F6);
  static const Color border = Color(0xFFE9EDEF);
  static const Color borderStrong = Color(0xFFD1D7DB);

  // ── Light text ─────────────────────────────────────────
  // Sharp near-black primary (WhatsApp #111B21) for a crisp, professional read.
  static const Color textPrimary = Color(0xFF111B21);
  // WhatsApp's secondary grey — legible on white AND on the dark canvas.
  static const Color textSecondary = Color(0xFF667781);
  static const Color textMuted = Color(0xFF8696A0);
  static const Color textInverse = Colors.white;

  // ── Dark surfaces (WhatsApp dark palette) ──────────────
  // The deep cool near-black WhatsApp uses: #0B141A canvas, #111B21 panels,
  // #202C33 elevated (search/input), #2A3942 dividers.
  static const Color darkBackground = Color(0xFF0B141A);
  static const Color darkSurface = Color(0xFF111B21);
  static const Color darkSurfaceAlt = Color(0xFF202C33);
  static const Color darkBorder = Color(0xFF2A3942);

  // ── Dark text (WhatsApp) ───────────────────────────────
  static const Color darkTextPrimary = Color(0xFFE9EDEF);
  static const Color darkTextSecondary = Color(0xFF8696A0);
  static const Color darkTextMuted = Color(0xFF667781);

  /// Brand colour for a given channel string (whatsapp/messenger/...).
  static Color forChannel(String? channel) {
    switch (channel?.toLowerCase()) {
      case 'whatsapp':
        return whatsapp;
      case 'messenger':
        return messenger;
      case 'instagram':
        return instagram;
      case 'tiktok':
        return tiktok;
      case 'google':
        return google;
      default:
        return primary;
    }
  }

  /// Deterministic avatar colour from a name/seed (WhatsApp-style coloured
  /// avatars). Same input always yields the same colour.
  static const List<Color> _avatarPalette = [
    Color(0xFF1B5E20), // dark green
    Color(0xFF0D47A1), // dark blue
    Color(0xFF4A148C), // deep purple
    Color(0xFFBF360C), // deep orange
    Color(0xFF006064), // cyan dark
    Color(0xFF880E4F), // pink dark
    Color(0xFF33691E), // lime dark
    Color(0xFF1A237E), // indigo
    Color(0xFF3E2723), // brown
    Color(0xFF004D40), // teal dark
  ];

  static Color avatarColor(String seed) {
    if (seed.trim().isEmpty) return _avatarPalette[0];
    return _avatarPalette[seed.hashCode.abs() % _avatarPalette.length];
  }

  /// Colour for a lead interest/temperature string (hot/warm/cold).
  static Color forInterest(String? interest) {
    switch (interest?.toLowerCase()) {
      case 'hot':
        return hot;
      case 'warm':
        return warm;
      case 'cold':
        return cold;
      default:
        return textMuted;
    }
  }
}
