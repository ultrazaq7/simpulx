import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../domain/entities/contact.dart';

/// One CRM lead row: avatar, name, phone, and calm stage/interest accents.
///
/// Deliberately restrained (WhatsApp-like): a single small interest dot, a plain
/// stage label and a subtle score pill — no animated/shimmering badges — so a
/// long list stays easy on the eyes. Colours resolve from the theme so the row
/// reads correctly on both the light and the pitch-black dark canvas.
class ContactTile extends StatelessWidget {
  const ContactTile({super.key, required this.contact, required this.onTap});

  final Contact contact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final c = contact;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 21,
              backgroundColor: AppColors.avatarColor(c.displayName),
              child: Text(c.initials,
                  style: const TextStyle(
                      color: Colors.white,
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
                      Flexible(
                        child: Text(
                          c.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyLarge
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (c.interestLevel != null) ...[
                        const SizedBox(width: 8),
                        _InterestDot(interestLevel: c.interestLevel!),
                      ],
                      if (c.blacklisted) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.block_rounded,
                            size: 15, color: AppColors.danger),
                      ],
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Text(
                        c.phone.isNotEmpty ? c.phone : 'No phone',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                      ),
                      if (c.stageName != null) ...[
                        Text('  ·  ',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: muted)),
                        Flexible(
                          child: Text(
                            c.stageName!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                                color: muted, fontWeight: FontWeight.w500),
                          ),
                        ),
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
          ],
        ),
      ),
    );
  }
}

/// A small static interest dot (hot/warm/cold) — replaces the old animated pill.
class _InterestDot extends StatelessWidget {
  const _InterestDot({required this.interestLevel});
  final String interestLevel;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forInterest(interestLevel);
    return Container(
      width: 9,
      height: 9,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

/// Subtle buy-potential score pill for the lead list (flat, no heavy ring).
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
      width: 30,
      height: 30,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Text(
        '$score',
        style: TextStyle(
          color: _color,
          fontWeight: FontWeight.w800,
          fontSize: 12.5,
        ),
      ),
    );
  }
}
