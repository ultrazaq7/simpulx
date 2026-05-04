import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:simpulx/core/theme/app_style.dart';

class SimpulxWordmark extends StatelessWidget {
  final double fontSize;
  final bool onDark;

  const SimpulxWordmark({
    super.key,
    this.fontSize = 24,
    this.onDark = true,
  });

  @override
  Widget build(BuildContext context) {
    final baseStyle = GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: FontWeight.w800,
      height: 1,
      letterSpacing: -fontSize * 0.045,
    );
    final textColor = onDark ? AppColors.textInverse : AppColors.brandBlack;

    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: 'Simpul',
            style: baseStyle.copyWith(color: textColor),
          ),
          TextSpan(
            text: 'x',
            style: baseStyle.copyWith(color: AppColors.brandAmber),
          ),
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.visible,
      textHeightBehavior: const TextHeightBehavior(
        applyHeightToFirstAscent: false,
        applyHeightToLastDescent: false,
      ),
    );
  }
}
