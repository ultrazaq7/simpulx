import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// Central [ThemeData] for light + dark, built from the design tokens.
class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final scheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      secondary: AppColors.brandGreenSoft,
      onSecondary: AppColors.onPrimary,
      error: AppColors.danger,
      onError: Colors.white,
      surface: isDark ? AppColors.darkSurface : AppColors.surface,
      onSurface: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
      // Disable M3 surface tint — it blends primary (teal) into elevated
      // surfaces, producing the unwanted blueish/greenish cast on cards,
      // dialogs, bottom sheets, etc. WhatsApp uses flat, untinted surfaces.
      surfaceTint: Colors.transparent,
      // Secondary/muted text resolves per-brightness (bright grey in dark like
      // WhatsApp, sharp grey in light) so widgets can read it from the theme.
      onSurfaceVariant: isDark
          ? AppColors.darkTextSecondary
          : AppColors.textSecondary,
      surfaceContainerHighest: isDark
          ? AppColors.darkSurfaceAlt
          : AppColors.surfaceAlt,
      outline: isDark ? AppColors.darkBorder : AppColors.borderStrong,
    );

    final scaffoldBg = isDark ? AppColors.darkBackground : AppColors.background;
    final surface = isDark ? AppColors.darkSurface : AppColors.surface;
    final surfaceAlt = isDark ? AppColors.darkSurfaceAlt : AppColors.surfaceAlt;
    final border = isDark ? AppColors.darkBorder : AppColors.border;
    final textSecondary = isDark
        ? AppColors.darkTextSecondary
        : AppColors.textSecondary;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffoldBg,
      // Keep the canvas behind bars/menus identical to scaffold so nothing
      // ever "pops" as a mismatched panel.
      canvasColor: scaffoldBg,
      textTheme: AppText.textTheme(brightness),
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        // Sits on the scaffold canvas, not a raised panel — same trick
        // WhatsApp uses so the top bar doesn't read as a separate block.
        backgroundColor: scaffoldBg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: AppText.title.copyWith(color: scheme.onSurface),
        iconTheme: IconThemeData(color: scheme.onSurface),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.rLg,
          side: BorderSide(color: border),
        ),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceAlt,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        hintStyle: AppText.body.copyWith(
          color: isDark ? AppColors.darkTextMuted : AppColors.textMuted,
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.onPrimary,
          elevation: 0,
          minimumSize: const Size.fromHeight(50),
          textStyle: AppText.button,
          shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: AppText.button,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        // Same idea as appBarTheme: blend into scaffold instead of a
        // separately-shaded bar at the bottom.
        backgroundColor: scaffoldBg,
        surfaceTintColor: Colors.transparent, // Ensure no teal tint bleeding
        indicatorColor: AppColors.primary.withValues(alpha: 0.12),
        height: 62,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return AppText.caption.copyWith(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? AppColors.primary : textSecondary,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: selected ? AppColors.primary : textSecondary,
          );
        }),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        showDragHandle: true,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: isDark
            ? const Color(0xFF222222)
            : const Color(0xFF2C2C2C),
        contentTextStyle: AppText.body.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w500,
          fontSize: 14,
        ),
        elevation: 10,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      ),
      // Filter pills (All / Unread / Hot / Follow-up in your chat list).
      // Unselected pills sit on darkSurfaceAlt with a hairline border;
      // selected pill gets a soft primary tint + primary text, matching the
      // green "All" pill in stock WhatsApp instead of every pill looking the
      // same flat grey.
      chipTheme: ChipThemeData(
        backgroundColor: surfaceAlt,
        selectedColor: AppColors.primary.withValues(alpha: 0.16),
        side: BorderSide(color: border),
        labelStyle: AppText.label,
        secondaryLabelStyle: AppText.label.copyWith(color: AppColors.primary),
        checkmarkColor: AppColors.primary,
        showCheckmark: false,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.rPill,
          side: BorderSide(color: border),
        ),
      ),
    );
  }
}
