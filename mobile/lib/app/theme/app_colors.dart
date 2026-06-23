import 'package:flutter/material.dart';

/// Brand + semantic color tokens for Simpulx v2.
///
/// Design system philosophy:
/// - Primary: Simpulx teal (#2D8B73) — used for actions, selections, brand moments
/// - Interest colors (hot/warm/cold): functional signals, never decorative
/// - Surfaces: clean whites in light, deep teal-black in dark (not pure black)
/// - Danger/warning/success: semantic, used sparingly
class AppColors {
  AppColors._();

  // ── Brand ──────────────────────────────────────────────────
  static const Color brandGreen = Color(0xFF2D8B73);
  static const Color brandGreenDark = Color(0xFF1A5247);
  static const Color brandAmber = Color(0xFFF59E0B);

  // ── Primary palette ────────────────────────────────────────
  static const Color primary = brandGreen;
  static const Color primaryDark = brandGreenDark;
  static const Color onPrimary = Colors.white;

  // ── Semantic ───────────────────────────────────────────────
  static const Color success = Color(0xFF25D366); // WhatsApp green
  static const Color successMuted = Color(0xFF0D9E5C);
  static const Color danger = Color(0xFFEF4444);
  static const Color dangerMuted = Color(0xFFDC2626);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningMuted = Color(0xFFD97706);
  static const Color info = Color(0xFF3B82F6);
  static const Color purple = Color(0xFF8B5CF6);

  // ── Interest / lead temperature ────────────────────────────
  static const Color hot = Color(0xFFEF4444);
  static const Color warm = Color(0xFFF59E0B);
  static const Color cold = Color(0xFF3B82F6);
  static const Color neutral = Color(0xFF6B7280);

  // ── Channels ────────────────────────────────────────────────
  static const Color whatsapp = Color(0xFF25D366);
  static const Color messenger = Color(0xFF0084FF);
  static const Color instagram = Color(0xFFE4405F);
  static const Color tiktok = Color(0xFF000000);
  static const Color google = Color(0xFFEA4335);

  // ── Light surfaces ─────────────────────────────────────────
  /// Main scaffold background (WhatsApp-style warm grey)
  static const Color background = Color(0xFFECE5DD);
  /// Card/sheet surface (pure white for contrast)
  static const Color surface = Color(0xFFFFFFFF);
  /// Secondary surface (input fields, chips)
  static const Color surfaceAlt = Color(0xFFF7F8FA);
  /// Subtle divider/border
  static const Color border = Color(0xFFE8EAED);
  /// Stronger border for cards, inputs
  static const Color borderStrong = Color(0xFFD1D5DB);

  // ── Light text ─────────────────────────────────────────────
  static const Color textPrimary = Color(0xFF111B21);
  static const Color textSecondary = Color(0xFF5C6B73);
  static const Color textMuted = Color(0xFF9BA8AF);
  static const Color textInverse = Colors.white;

  // ── Dark surfaces ─────────────────────────────────────────
  /// Deep teal-black (brand-aligned, better than pure black)
  static const Color darkBackground = Color(0xFF0B1820);
  static const Color darkSurface = Color(0xFF15232C);
  static const Color darkSurfaceAlt = Color(0xFF1D3341);
  static const Color darkBorder = Color(0xFF253B49);
  /// Sent message bubble (brand teal, WhatsApp dark style)
  static const Color darkBubbleOut = Color(0xFF00574B);
  /// Received message bubble
  static const Color darkBubbleIn = Color(0xFF1D3341);

  // ── Dark text ─────────────────────────────────────────────
  static const Color darkTextPrimary = Color(0xFFE8ECEF);
  static const Color darkTextSecondary = Color(0xFF8B9DA8);
  static const Color darkTextMuted = Color(0xFF5C7A8C);

  // ── Shadows ────────────────────────────────────────────────
  /// Elevation 1: card resting
  static Color shadow1(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return (isDark ? Colors.black : Colors.black).withValues(alpha: isDark ? 0.30 : 0.08);
  }

  /// Elevation 2: card hover / floating
  static Color shadow2(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return (isDark ? Colors.black : Colors.black).withValues(alpha: isDark ? 0.40 : 0.14);
  }

  /// Elevation 3: overlay / FAB
  static Color shadow3(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return (isDark ? Colors.black : Colors.black).withValues(alpha: isDark ? 0.50 : 0.20);
  }

  // ── Brand helpers ─────────────────────────────────────────

  /// Colour for a given channel string.
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

  /// Colour for a lead interest/temperature string.
  static Color forInterest(String? interest) {
    switch (interest?.toLowerCase()) {
      case 'hot':
        return hot;
      case 'warm':
        return warm;
      case 'cold':
        return cold;
      default:
        return neutral;
    }
  }

  /// Colour for lead score (0-100).
  static Color forScore(int? score) {
    if (score == null) return neutral;
    if (score >= 70) return success;
    if (score >= 40) return warning;
    return neutral;
  }

  /// Tinted surface color for a given interest level (for backgrounds, chips).
  static Color tintForInterest(String? interest) {
    switch (interest?.toLowerCase()) {
      case 'hot':
        return hot.withValues(alpha: 0.10);
      case 'warm':
        return warm.withValues(alpha: 0.10);
      case 'cold':
        return cold.withValues(alpha: 0.10);
      default:
        return surfaceAlt;
    }
  }
}
