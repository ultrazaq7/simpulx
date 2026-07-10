import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/i18n/stage_label.dart';
import '../activity_label.dart';
import '../../domain/entities/contact.dart';
import '../controllers/contacts_providers.dart';

/// Rich CRM lead card.
///
/// Only the body area navigates to contact detail. The bottom bar
/// (History chevron, CHAT, CALL) has its own tap targets and does NOT
/// trigger the card-level onTap.
class ContactTile extends ConsumerStatefulWidget {
  const ContactTile({super.key, required this.contact, required this.onTap});

  final Contact contact;
  final VoidCallback onTap;

  @override
  ConsumerState<ContactTile> createState() => _ContactTileState();
}

class _ContactTileState extends ConsumerState<ContactTile> {
  bool _historyOpen = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final c = widget.contact;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      elevation: 0.6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Main content area (tappable → detail) ──
          InkWell(
            onTap: widget.onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Row 1: Name + Interest badge + Score
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(
                              child: Text(
                                c.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            if (c.interestLevel != null) ...[
                              const SizedBox(width: 8),
                              _InterestBadge(interestLevel: c.interestLevel!),
                            ],
                            if (c.blacklisted) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.block_rounded,
                                  size: 15, color: AppColors.danger),
                            ],
                          ],
                        ),
                      ),
                      if (c.leadScore != null) ...[
                        const SizedBox(width: 8),
                        _ScoreCircle(score: c.leadScore!),
                      ],
                    ],
                  ),

                  const SizedBox(height: 6),

                  // Row 2: Phone / Car / City
                  Text(
                    _buildInfoLine(c),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                  ),

                  const SizedBox(height: 8),

                  // Row 3: Source badge + Stage badge + duration
                  Row(
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (c.sourceLabel.isNotEmpty)
                              _SourceBadge(label: c.sourceLabel),
                            if (c.stageName != null)
                              _StageBadge(stageName: c.stageName!),
                          ],
                        ),
                      ),
                      // Duration since entry
                      if (c.createdAt != null)
                        Text(
                          'Added {time}'
                              .trp(context, {'time': _timeSince(c.createdAt!)}),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: muted,
                            fontSize: 11.5,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // ── Bottom bar: History chevron + CHAT + CALL ──
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                // History label + chevron (tapping either one expands/collapses)
                InkWell(
                  onTap: () =>
                      setState(() => _historyOpen = !_historyOpen),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('History'.tr(context),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: muted,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          _historyOpen
                              ? Icons.keyboard_arrow_up_rounded
                              : Icons.keyboard_arrow_down_rounded,
                          color: muted,
                          size: 22,
                        ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
                // CHAT button
                if (c.hasConversation)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          context.push('/chat/${c.conversationId}'),
                      icon: const Icon(Icons.chat_rounded, size: 16),
                      label: Text('CHAT'.tr(context)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.info,
                        side: const BorderSide(color: AppColors.info),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 0.5,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                // CALL button
                if (c.phone.isNotEmpty)
                  OutlinedButton.icon(
                    onPressed: () => _dial(c.phone),
                    icon: const Icon(Icons.phone_rounded, size: 17),
                    label: Text('CALL'.tr(context)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.success,
                      side: const BorderSide(color: AppColors.success),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 6),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        letterSpacing: 0.5,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Expanded history section ──
          if (_historyOpen) ...[
            const Divider(height: 1),
            _HistorySection(contactId: c.id),
          ],
        ],
      ),
    );
  }

  /// Builds the "phone / car / city" info line.
  static String _buildInfoLine(Contact c) {
    final parts = <String>[];
    if (c.phone.isNotEmpty) parts.add(c.phone);
    final car = [c.carBrand, c.carModel]
        .where((s) => s != null && s.isNotEmpty)
        .join(' ');
    if (car.isNotEmpty) parts.add(car);
    if (c.city != null && c.city!.isNotEmpty) parts.add(c.city!);
    return parts.join(' / ');
  }

  /// Human-readable relative time from [dt] until now. Locale-aware without a
  /// context: Indonesian uses h/mg/bln/thn/j + "lalu", English uses d/w/mo/y/h
  /// + "ago".
  static String _timeSince(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    final id = kActiveLocaleCode == 'id';
    final ago = id ? 'lalu' : 'ago';
    if (diff.inDays >= 365) {
      final y = diff.inDays ~/ 365;
      return id ? '${y}thn $ago' : '${y}y $ago';
    }
    if (diff.inDays >= 30) {
      final m = diff.inDays ~/ 30;
      return id ? '${m}bln $ago' : '${m}mo $ago';
    }
    if (diff.inDays >= 7) {
      final w = diff.inDays ~/ 7;
      return id ? '${w}mg $ago' : '${w}w $ago';
    }
    if (diff.inDays >= 1) {
      return id ? '${diff.inDays}h $ago' : '${diff.inDays}d $ago';
    }
    if (diff.inHours >= 1) {
      return id ? '${diff.inHours}j $ago' : '${diff.inHours}h $ago';
    }
    return id ? 'baru saja' : 'just now';
  }

  static Future<void> _dial(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}

// ─── History section (fetched on expand, shows last 2 with date) ────

class _HistorySection extends ConsumerWidget {
  const _HistorySection({required this.contactId});
  final String contactId;

  static final _dateFmt = DateFormat('dd MMM, HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final asyncAct = ref.watch(contactActivityProvider(contactId));

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
      child: asyncAct.when(
        loading: () => const SizedBox(
          height: 16,
          width: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (_, _) => Text('Failed to load history'.tr(context),
            style: theme.textTheme.bodySmall
                ?.copyWith(color: AppColors.danger)),
        data: (activities) {
          if (activities.isEmpty) {
            return Text('No history yet'.tr(context),
                style: theme.textTheme.bodySmall?.copyWith(color: muted));
          }
          final sorted = activities.reversed.take(2).toList();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final a in sorted)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Date+time column (fixed width)
                      SizedBox(
                        width: 100,
                        child: Text(
                          a.createdAt != null
                              ? _dateFmt.format(a.createdAt!)
                              : '-',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Activity label
                      Expanded(
                        child: Text(
                          activityLabel(context, a),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              GestureDetector(
                onTap: () => context.push(
                  '/contacts/$contactId',
                  extra: {'scrollToHistory': true},
                ),
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('See More →'.tr(context),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Sub-widgets ────────────────────────────────────────────

/// Rounded coloured pill for interest level (Hot / Warm / Cold).
class _InterestBadge extends StatelessWidget {
  const _InterestBadge({required this.interestLevel});
  final String interestLevel;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forInterest(interestLevel);
    final label =
        interestLevel[0].toUpperCase() + interestLevel.substring(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// Circled lead score (thin ring style).
class _ScoreCircle extends StatelessWidget {
  const _ScoreCircle({required this.score});
  final int score;

  Color get _color {
    if (score >= 70) return AppColors.success;
    if (score >= 40) return AppColors.warning;
    return AppColors.textMuted;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: _color, width: 1.8),
      ),
      child: Text(
        '$score',
        style: TextStyle(
          color: _color,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

/// Source badge pill (e.g. "Ad", "OTO.Com", "WhatsApp").
class _SourceBadge extends StatelessWidget {
  const _SourceBadge({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Stage name pill badge with a small arrow (▸).
class _StageBadge extends StatelessWidget {
  const _StageBadge({required this.stageName});
  final String stageName;

  @override
  Widget build(BuildContext context) {
    // Soft, premium slate instead of the loud amber — reads calm on both the
    // light and dark themes as a neutral pipeline-stage chip.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.16 : 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.32)),
      ),
      child: Text(
        '${stageLabel(context, stageName)} ▸',
        style: TextStyle(
          color: color.withValues(alpha: 1.0),
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
