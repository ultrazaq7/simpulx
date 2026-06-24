import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../domain/entities/contact.dart';

/// One CRM lead row: avatar, name, phone/channel, stage + interest accents.
class ContactTile extends StatelessWidget {
  const ContactTile({super.key, required this.contact, required this.onTap});

  final Contact contact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = contact;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.primary.withValues(alpha: 0.12),
              child: Text(c.initials,
                  style: const TextStyle(
                      color: AppColors.primaryDark,
                      fontWeight: FontWeight.w700,
                      fontSize: 14)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyLarge
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (c.blacklisted)
                        const Icon(Icons.block_rounded,
                            size: 15, color: AppColors.danger),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.phone.isNotEmpty ? c.phone : 'No phone',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: AppColors.textSecondary),
                        ),
                      ),
                      if (c.stageName != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(c.stageName!,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.textSecondary,
                                  fontWeight: FontWeight.w600)),
                        ),
                      ],
                      if (c.interestLevel != null) ...[
                        const SizedBox(width: 6),
                        _ShinyBadge(interestLevel: c.interestLevel!),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            if (c.leadScore != null) ...[
              const SizedBox(width: 8),
              _ScoreBadge(score: c.leadScore!),
            ],
            const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

/// Compact buy-potential score pill for the lead list.
class _ScoreBadge extends StatelessWidget {
  const _ScoreBadge({required this.score});
  final int score;

  Color get _color {
    if (score >= 70) return AppColors.success;
    if (score >= 40) return AppColors.warning;
    return AppColors.textMuted;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: _color.withValues(alpha: 0.4)),
      ),
      child: Text(
        '$score',
        style: TextStyle(
          color: _color,
          fontWeight: FontWeight.w800,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _ShinyBadge extends StatelessWidget {
  const _ShinyBadge({required this.interestLevel});
  final String interestLevel;

  @override
  Widget build(BuildContext context) {
    Color baseColor;
    List<Color> gradientColors;

    switch (interestLevel.toLowerCase()) {
      case 'hot':
        baseColor = AppColors.hot;
        gradientColors = [const Color(0xFFff8a8a), const Color(0xFFef4444), const Color(0xFFb91c1c)];
        break;
      case 'warm':
        baseColor = AppColors.warm;
        gradientColors = [const Color(0xFFfcd34d), const Color(0xFFf59e0b), const Color(0xFFb45309)];
        break;
      case 'cold':
      default:
        baseColor = AppColors.cold;
        gradientColors = [const Color(0xFF93c5fd), const Color(0xFF3b82f6), const Color(0xFF1d4ed8)];
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradientColors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: baseColor.withValues(alpha: 0.4),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.5),
          width: 0.5,
        ),
      ),
      child: Text(
        interestLevel[0].toUpperCase() + interestLevel.substring(1),
        style: const TextStyle(
          fontSize: 11,
          color: Colors.white,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.2,
          shadows: [
            Shadow(
              color: Colors.black26,
              offset: Offset(0, 1),
              blurRadius: 2,
            ),
          ],
        ),
      ),
    );
  }
}
