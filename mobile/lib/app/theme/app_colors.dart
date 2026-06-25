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
  static const Color textSecondary = Color(0xFF54656F);
  static const Color textMuted = Color(0xFF8696A0);
  static const Color textInverse = Colors.white;

  // ── Dark surfaces ──────────────────────────────────────
  static const Color darkBackground = Color(0xFF0B1413);
  static const Color darkSurface = Color(0xFF13201E);
  static const Color darkSurfaceAlt = Color(0xFF1B2A28);
  static const Color darkBorder = Color(0xFF243834);

  // ── Dark text ──────────────────────────────────────────
  static const Color darkTextPrimary = Color(0xFFE7EDEB);
  static const Color darkTextSecondary = Color(0xFF9CB0AB);
  static const Color darkTextMuted = Color(0xFF6B807B);

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
