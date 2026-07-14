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
  // AI / automation (Simpuler) — reserved indigo, never a status colour. Matches
  // the web rule: AI = indigo, human agent = brand (primary).
  static const Color ai = Color(0xFF4E5CD6);

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

  // ── Dark surfaces (true WhatsApp navy palette) ───────────
  // NOTE: an earlier version of this file deliberately swapped WhatsApp's
  // real background (#0B141A) for pure OLED black to strip out its blue
  // tint. For a pixel-accurate WhatsApp match, that tint is actually part
  // of the look — so it's back below. All layers still sit close together
  // in luminance (that's what avoids the "belang"/patchy effect); the
  // difference now is the whole stack leans navy instead of neutral grey.
  static const Color darkBackground = Color(0xFF021A1A); // chat wallpaper / scaffold canvas
  static const Color darkSurface = Color(0xFF052323); // app bar / bottom sheet / cards
  static const Color darkSurfaceAlt = Color(0xFF092D2D); // search bar / chips / incoming bubble
  static const Color darkBorder = Color(0xFF0F3B3B); // hairline separators

  // ── Dark text ──────────────────────────────────────────
  // Brightened from the old WhatsApp greys (8696A0 / 667781), which read too
  // dim on the deep-navy canvas; these clear WCAG AA on darkBackground.
  static const Color darkTextPrimary = Color(0xFFECF1F3);
  static const Color darkTextSecondary = Color(0xFFB4C1C8);
  static const Color darkTextMuted = Color(0xFF93A2AC);

  // ── Chat bubbles ───────────────────────────────────────
  // Dedicated tokens (not `primary`/`brandGreen`) so the message bubble
  // widget can match WhatsApp exactly without affecting buttons, links, etc.
  // elsewhere in the app that should stay on-brand teal.
  // NOT pure white: this app's light background is already pure white
  // (see `surface` above), so a white bubble would vanish the same way
  // the pure-black dark bubble did. surfaceAlt gives it a hairline of
  // contrast, matching real WhatsApp's off-white incoming bubble.
  static const Color bubbleIncomingLight = Color(0xFFE8ECEF); // Darker cool grey for better contrast
  static const Color bubbleOutgoingLight = Color(0xFFD9FDD3);
  static const Color bubbleIncomingDark = Color(0xFF0E3636); // Teal-tinted dark grey to match background
  static const Color bubbleOutgoingDark = Color(0xFF005C4B);

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
