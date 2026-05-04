import 'package:flutter/material.dart';

/// Unified design tokens for the Simpulx app.
///
/// Import with:
///   import 'package:simpulx/core/theme/app_style.dart';
///
/// Use `AppColors`, `AppSpacing`, `AppRadius`, `AppText`, and helpers below
/// instead of hard-coded values in feature pages. This keeps the UI
/// consistent across login, dashboard, chat, broadcasts, settings, etc.

class AppColors {
  AppColors._();

  // Brand tokens, aligned with the landing page.
  static const Color brandBlack = Color(0xFF0A1A1A);
  static const Color brandInk = Color(0xFF0F2625);
  static const Color brandBlue = Color(0xFF60A5FA);
  static const Color brandGreen = Color(0xFF2D8B73);
  static const Color brandGreenSoft = Color(0xFF3AA88D);
  static const Color brandGreenDark = Color(0xFF236F5D);
  static const Color brandAmber = Color(0xFFF5A623);
  static const Color brandAmberSoft = Color(0xFFFFBE4F);

  // Brand / semantic
  static const Color primary = brandGreen;
  static const Color primaryDark = brandGreenDark;
  static const Color success = brandGreen;
  static const Color danger = Color(0xFFEF4444); // red
  static const Color warning = Color(0xFFF59E0B); // amber
  static const Color purple = Color(0xFF8B5CF6);
  static const Color cyan = Color(0xFF06B6D4);

  // Surface
  static const Color background = Color(0xFFF8F9FC);
  static const Color surface = Colors.white;
  static const Color surfaceAlt = Color(0xFFF3F4F6);
  static const Color border = Color(0xFFEEF0F4);
  static const Color borderStrong = Color(0xFFE5E7EB);

  // Text
  static const Color textPrimary = Color(0xFF1F2937);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textMuted = Color(0xFF9CA3AF);
  static const Color textInverse = Colors.white;

  // Channel colors (keep in sync with legend usage in dashboard)
  static const Color whatsapp = Color(0xFF25D366);
  static const Color messenger = Color(0xFF0084FF);
  static const Color instagram = Color(0xFFE4405F);
  static const Color tiktok = Color(0xFF000000);
  static const Color google = Color(0xFFEA4335);
}

class AppGradients {
  AppGradients._();

  static const LinearGradient logo = LinearGradient(
    colors: [AppColors.textInverse, AppColors.brandAmber],
  );

  static const LinearGradient action = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [AppColors.brandGreenSoft, AppColors.brandGreen],
  );
}

class AppSpacing {
  AppSpacing._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 28;
  static const double xxxl = 40;
}

class AppRadius {
  AppRadius._();
  static const double sm = 8;
  static const double md = 10;
  static const double lg = 14;
  static const double xl = 20;
  static const double pill = 999;

  static BorderRadius get rSm => BorderRadius.circular(sm);
  static BorderRadius get rMd => BorderRadius.circular(md);
  static BorderRadius get rLg => BorderRadius.circular(lg);
}

class AppText {
  AppText._();

  /// Page title (e.g., "Dashboard").
  static const TextStyle titleLg = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
    letterSpacing: -0.2,
    height: 1.25,
  );

  /// Page subtitle.
  static const TextStyle subtitle = TextStyle(
    fontSize: 13,
    color: AppColors.textSecondary,
    fontWeight: FontWeight.w400,
    height: 1.4,
  );

  /// Section card header.
  static const TextStyle sectionTitle = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
    letterSpacing: -0.1,
  );

  /// Body text.
  static const TextStyle body = TextStyle(
    fontSize: 13,
    color: AppColors.textPrimary,
    height: 1.45,
  );

  /// Secondary body.
  static const TextStyle bodyMuted = TextStyle(
    fontSize: 13,
    color: AppColors.textSecondary,
    height: 1.45,
  );

  /// Label / small caps-ish.
  static const TextStyle label = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: AppColors.textSecondary,
    letterSpacing: 0.1,
  );

  /// Caption.
  static const TextStyle caption = TextStyle(
    fontSize: 11,
    color: AppColors.textMuted,
  );

  /// Big number (stat card).
  static const TextStyle statValue = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
    letterSpacing: -0.3,
  );

  /// Button label.
  static const TextStyle button = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    letterSpacing: 0,
  );
}

class AppShadows {
  AppShadows._();
  static const List<BoxShadow> card = [
    BoxShadow(
      color: Color(0x0F000000),
      blurRadius: 12,
      offset: Offset(0, 2),
    ),
  ];
  static const List<BoxShadow> soft = [
    BoxShadow(
      color: Color(0x08000000),
      blurRadius: 6,
      offset: Offset(0, 1),
    ),
  ];
}

/// Reusable card container decoration.
BoxDecoration appCardDecoration({Color? color, double radius = AppRadius.lg}) {
  return BoxDecoration(
    color: color ?? AppColors.surface,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: AppColors.border, width: 1),
    boxShadow: AppShadows.soft,
  );
}
