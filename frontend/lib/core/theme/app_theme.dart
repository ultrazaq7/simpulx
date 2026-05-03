// ============================================================
// App Theme - Custom ThemeData with CRM Status Extensions
// ============================================================
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── CRM Status Colors Extension ─────────────────────────
@immutable
class CrmStatusColors extends ThemeExtension<CrmStatusColors> {
  final Color open;
  final Color pending;
  final Color resolved;
  final Color closed;
  final Color urgent;
  final Color high;
  final Color medium;
  final Color low;
  final Color online;
  final Color offline;
  final Color inbound;
  final Color outbound;

  const CrmStatusColors({
    required this.open,
    required this.pending,
    required this.resolved,
    required this.closed,
    required this.urgent,
    required this.high,
    required this.medium,
    required this.low,
    required this.online,
    required this.offline,
    required this.inbound,
    required this.outbound,
  });

  @override
  CrmStatusColors copyWith({
    Color? open,
    Color? pending,
    Color? resolved,
    Color? closed,
    Color? urgent,
    Color? high,
    Color? medium,
    Color? low,
    Color? online,
    Color? offline,
    Color? inbound,
    Color? outbound,
  }) {
    return CrmStatusColors(
      open: open ?? this.open,
      pending: pending ?? this.pending,
      resolved: resolved ?? this.resolved,
      closed: closed ?? this.closed,
      urgent: urgent ?? this.urgent,
      high: high ?? this.high,
      medium: medium ?? this.medium,
      low: low ?? this.low,
      online: online ?? this.online,
      offline: offline ?? this.offline,
      inbound: inbound ?? this.inbound,
      outbound: outbound ?? this.outbound,
    );
  }

  @override
  CrmStatusColors lerp(CrmStatusColors? other, double t) {
    if (other is! CrmStatusColors) return this;
    return CrmStatusColors(
      open: Color.lerp(open, other.open, t)!,
      pending: Color.lerp(pending, other.pending, t)!,
      resolved: Color.lerp(resolved, other.resolved, t)!,
      closed: Color.lerp(closed, other.closed, t)!,
      urgent: Color.lerp(urgent, other.urgent, t)!,
      high: Color.lerp(high, other.high, t)!,
      medium: Color.lerp(medium, other.medium, t)!,
      low: Color.lerp(low, other.low, t)!,
      online: Color.lerp(online, other.online, t)!,
      offline: Color.lerp(offline, other.offline, t)!,
      inbound: Color.lerp(inbound, other.inbound, t)!,
      outbound: Color.lerp(outbound, other.outbound, t)!,
    );
  }
}

// ── App Theme ───────────────────────────────────────────
class AppTheme {
  AppTheme._();

  // Brand Colors
  static const Color _primaryColor = Color(0xFF0F62FE);
  static const Color _secondaryColor = Color(0xFF0F8B8D);
  static const Color _accentColor = Color(0xFFC97B2A);

  // Light Theme Surface Colors
  static const Color _lightBg = Color(0xFFF3F6FB);
  static const Color _lightSurface = Color(0xFFFFFFFF);
  static const Color _lightCard = Color(0xFFFFFFFF);
  static const Color _lightBorder = Color(0xFFD8E1EC);
  static const Color _lightText = Color(0xFF0F172A);
  static const Color _lightMutedText = Color(0xFF667085);
  static const Color _lightSurfaceAlt = Color(0xFFF8FAFC);

  // CRM Status Colors (shared - slightly toned for light)
  static const _crmStatusColors = CrmStatusColors(
    open: Color(0xFF00A67E),
    pending: Color(0xFFE8912D),
    resolved: Color(0xFF3B82F6),
    closed: Color(0xFF8A8D91),
    urgent: Color(0xFFEF4444),
    high: Color(0xFFE87B2D),
    medium: Color(0xFFD4A017),
    low: Color(0xFF2D9CDB),
    online: Color(0xFF42B72A),
    offline: Color(0xFF8A8D91),
    inbound: Color(0xFF2D9CDB),
    outbound: Color(0xFF3B82F6),
  );

  // ── Light Theme (Premium Web Workspace) ───
  static ThemeData get lightTheme {
    final base = ThemeData.light();
    final interFamily = GoogleFonts.inter().fontFamily;
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: interFamily,
      scaffoldBackgroundColor: _lightBg,
      canvasColor: _lightSurface,
      shadowColor: const Color(0x1A0F172A),
      colorScheme: const ColorScheme.light(
        primary: _primaryColor,
        onPrimary: Colors.white,
        secondary: _secondaryColor,
        onSecondary: Colors.white,
        tertiary: _accentColor,
        surface: _lightSurface,
        onSurface: _lightText,
        outline: _lightBorder,
        outlineVariant: Color(0xFFE5EBF2),
        error: Color(0xFFEF4444),
      ),
      textTheme: GoogleFonts.interTextTheme(base.textTheme).copyWith(
        displayLarge: GoogleFonts.inter(fontSize: 56, height: 1.05, fontWeight: FontWeight.w700, color: _lightText),
        displayMedium: GoogleFonts.inter(fontSize: 44, height: 1.08, fontWeight: FontWeight.w700, color: _lightText),
        displaySmall: GoogleFonts.inter(fontSize: 36, height: 1.1, fontWeight: FontWeight.w700, color: _lightText),
        headlineLarge: GoogleFonts.inter(fontSize: 30, height: 1.12, fontWeight: FontWeight.w700, color: _lightText),
        headlineMedium: GoogleFonts.inter(fontSize: 26, height: 1.15, fontWeight: FontWeight.w700, color: _lightText),
        headlineSmall: GoogleFonts.inter(fontSize: 20, height: 1.22, fontWeight: FontWeight.w700, color: _lightText, letterSpacing: -0.2),
        titleLarge: GoogleFonts.inter(fontSize: 18, height: 1.25, fontWeight: FontWeight.w600, color: _lightText, letterSpacing: -0.1),
        titleMedium: GoogleFonts.inter(fontSize: 15, height: 1.3, fontWeight: FontWeight.w600, color: _lightText),
        titleSmall: GoogleFonts.inter(fontSize: 14, height: 1.35, fontWeight: FontWeight.w600, color: _lightText),
        bodyLarge: GoogleFonts.inter(fontSize: 16, height: 1.5, fontWeight: FontWeight.w400, color: _lightText),
        bodyMedium: GoogleFonts.inter(fontSize: 14, height: 1.45, fontWeight: FontWeight.w400, color: _lightText),
        bodySmall: GoogleFonts.inter(fontSize: 13, height: 1.4, fontWeight: FontWeight.w400, color: _lightMutedText),
        labelLarge: GoogleFonts.inter(fontSize: 14, height: 1.2, fontWeight: FontWeight.w600, color: _lightText),
        labelMedium: GoogleFonts.inter(fontSize: 13, height: 1.2, fontWeight: FontWeight.w600, color: _lightMutedText),
        labelSmall: GoogleFonts.inter(fontSize: 12, height: 1.2, fontWeight: FontWeight.w600, color: _lightMutedText),
      ),
      dividerColor: _lightBorder,
      dividerTheme: const DividerThemeData(
        color: Color(0xFFE5EBF2),
        thickness: 0.8,
        space: 0,
      ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: _lightSurface,
        surfaceTintColor: Colors.transparent,
        foregroundColor: _lightText,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: _lightText,
          height: 1.2,
        ),
        iconTheme: const IconThemeData(color: _lightMutedText, size: 22),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: _lightCard,
        surfaceTintColor: Colors.transparent,
        shadowColor: const Color(0x120F172A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: _lightBorder, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        iconColor: _lightMutedText,
        textColor: _lightText,
        tileColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _lightSurfaceAlt,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _lightBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _lightBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _primaryColor, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFEF4444)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.6),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: GoogleFonts.inter(
          fontSize: 14,
          color: const Color(0xFF8A94A6),
        ),
        labelStyle: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: _lightMutedText,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _primaryColor,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            height: 1.2,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _primaryColor,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            height: 1.2,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: _primaryColor,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: _lightText,
          backgroundColor: _lightSurface,
          side: const BorderSide(color: _lightBorder),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: _lightMutedText,
          hoverColor: _primaryColor.withValues(alpha: 0.06),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: _lightSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shadowColor: Colors.black.withValues(alpha: 0.10),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: Color(0xFFE9EEF5)),
        ),
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: _lightText,
        ),
        contentTextStyle: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: _lightMutedText,
          height: 1.5,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: _lightSurfaceAlt,
        selectedColor: _primaryColor.withValues(alpha: 0.10),
        side: const BorderSide(color: _lightBorder),
        labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: _lightText),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: GoogleFonts.inter(fontSize: 12, color: Colors.white),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: _lightSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 4,
        shadowColor: Colors.black.withValues(alpha: 0.08),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFE5EBF2)),
        ),
        textStyle: GoogleFonts.inter(fontSize: 14, color: _lightText),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: _lightSurfaceAlt,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _lightBorder),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF0F172A),
        contentTextStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: 8,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: _lightSurface,
        selectedItemColor: _primaryColor,
        unselectedItemColor: Color(0xFF8A94A6),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: _lightSurface,
        indicatorColor: _primaryColor.withValues(alpha: 0.10),
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return GoogleFonts.inter(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? _primaryColor : _lightMutedText,
          );
        }),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: _primaryColor,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return _primaryColor;
          return const Color(0xFF8A94A6);
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return _primaryColor.withValues(alpha: 0.30);
          return const Color(0xFFD9E2EC);
        }),
      ),
      dataTableTheme: DataTableThemeData(
        dividerThickness: 0.6,
        headingRowColor: WidgetStateProperty.all(const Color(0xFFF9FAFB)),
        headingRowHeight: 48,
        dataRowMinHeight: 56,
        dataRowMaxHeight: 64,
        columnSpacing: 36,
        horizontalMargin: 24,
        dataRowColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.hovered)) {
            return const Color(0xFFFAFBFC);
          }
          return null;
        }),
        headingTextStyle: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: const Color(0xFF6B7280),
          letterSpacing: 0.2,
        ),
        dataTextStyle: GoogleFonts.inter(
          fontSize: 13.5,
          fontWeight: FontWeight.w400,
          color: _lightText,
        ),
        decoration: const BoxDecoration(color: Colors.transparent),
      ),
      extensions: const [_crmStatusColors],
    );
  }

  // ── Dark Theme ──────────────────────────────────────
  static ThemeData get darkTheme {
    final base = ThemeData.dark();
    final interFamily = GoogleFonts.inter().fontFamily;
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: interFamily,
      scaffoldBackgroundColor: const Color(0xFF18191A),
      colorScheme: const ColorScheme.dark(
        primary: _primaryColor,
        onPrimary: Colors.white,
        secondary: _secondaryColor,
        onSecondary: Colors.white,
        tertiary: _accentColor,
        surface: Color(0xFF242526),
        onSurface: Color(0xFFE4E6EB),
        outline: Color(0xFF3E4042),
        error: Color(0xFFEF4444),
      ),
      textTheme: GoogleFonts.interTextTheme(base.textTheme),
      dividerColor: const Color(0xFF3E4042),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        backgroundColor: const Color(0xFF242526),
        surfaceTintColor: Colors.transparent,
        foregroundColor: const Color(0xFFE4E6EB),
        titleTextStyle: GoogleFonts.inter(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: const Color(0xFFE4E6EB),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: const Color(0xFF242526),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFF3E4042)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF3A3B3C),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3E4042)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3E4042)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _primaryColor, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        hintStyle: GoogleFonts.inter(fontSize: 14, color: const Color(0xFF8A8D91)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _primaryColor,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _primaryColor,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: const Color(0xFF242526),
        surfaceTintColor: Colors.transparent,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        titleTextStyle: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w700, color: const Color(0xFFE4E6EB)),
        contentTextStyle: GoogleFonts.inter(fontSize: 14, color: const Color(0xFFB0B3B8)),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: const Color(0xFF242526),
        surfaceTintColor: Colors.transparent,
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFF3E4042)),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Color(0xFF242526),
        selectedItemColor: _primaryColor,
        unselectedItemColor: Color(0xFF8A8D91),
      ),
      extensions: const [_crmStatusColors],
    );
  }
}
