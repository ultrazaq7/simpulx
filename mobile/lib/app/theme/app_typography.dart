import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Typography tokens built on Inter (matches the web app).
///
/// Colours here use the light palette; the [TextTheme] in [AppTheme] remaps
/// colours per brightness, so prefer these named styles for one-off text and
/// let `Theme.of(context).textTheme` drive themed surfaces.
class AppText {
  AppText._();

  static TextStyle get _base => GoogleFonts.inter();

  static TextStyle get titleLg => _base.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
        letterSpacing: -0.2,
        height: 1.25,
      );

  static TextStyle get title => _base.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
        letterSpacing: -0.2,
      );

  static TextStyle get subtitle => _base.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        color: AppColors.textSecondary,
        height: 1.4,
      );

  static TextStyle get sectionTitle => _base.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
        letterSpacing: -0.1,
      );

  static TextStyle get body => _base.copyWith(
        fontSize: 14,
        color: AppColors.textPrimary,
        height: 1.45,
      );

  static TextStyle get bodyMuted => _base.copyWith(
        fontSize: 14,
        color: AppColors.textSecondary,
        height: 1.45,
      );

  static TextStyle get label => _base.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: AppColors.textSecondary,
        letterSpacing: 0.1,
      );

  static TextStyle get caption => _base.copyWith(
        fontSize: 11,
        color: AppColors.textMuted,
      );

  static TextStyle get statValue => _base.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
        letterSpacing: -0.3,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  static TextStyle get button => _base.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
      );

  /// Material [TextTheme] for the given brightness.
  static TextTheme textTheme(Brightness brightness) {
    final base = GoogleFonts.interTextTheme();
    final onSurface = brightness == Brightness.dark
        ? AppColors.darkTextPrimary
        : AppColors.textPrimary;
    return base.apply(
      bodyColor: onSurface,
      displayColor: onSurface,
    );
  }
}
