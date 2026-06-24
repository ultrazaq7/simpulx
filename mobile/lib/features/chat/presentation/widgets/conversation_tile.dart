import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/utils/time_format.dart';
import '../../domain/entities/conversation.dart';

/// One inbox row: avatar, name, last-message preview, time, pulsing unread
/// badge, interest (hot/warm/cold) badge, channel accent, and - for managers -
/// the assigned agent.
class ConversationTile extends ConsumerWidget {
  const ConversationTile({
    super.key,
    required this.conversation,
    required this.onTap,
  });

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final c = conversation;
    final hasUnread = c.hasUnread;
    final preview = c.lastMessagePreview?.trim();
    final isOutbound = c.lastMessageDirection == 'agent';
    final isManager =
        ref.watch(sessionControllerProvider).user?.role.isManagerTier ?? false;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Avatar(name: c.displayName, channel: c.channel),
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
                          style: theme.textTheme.bodyLarge?.copyWith(
                            fontWeight:
                                hasUnread ? FontWeight.w700 : FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formatListTime(c.lastMessageAt),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: hasUnread
                              ? AppColors.primary
                              : AppColors.textMuted,
                          fontWeight:
                              hasUnread ? FontWeight.w700 : FontWeight.w400,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      if (isOutbound && preview != null) ...[
                        const Icon(Icons.done_all_rounded,
                            size: 15, color: AppColors.textMuted),
                        const SizedBox(width: 3),
                      ],
                      Expanded(
                        child: _PreviewWidget(
                          preview: preview,
                          hasUnread: hasUnread,
                        ),
                      ),
                      const SizedBox(width: 6),
                      if (hasUnread) _PulsingUnreadBadge(count: c.unreadCount),
                    ],
                  ),
                  if (c.interestLevel != null ||
                      c.stageName != null ||
                      (isManager && (c.agentName?.isNotEmpty ?? false))) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (c.interestLevel != null)
                          _InterestBadge(level: c.interestLevel!),
                        if (c.stageName != null) _StageChip(label: c.stageName!),
                        if (isManager && (c.agentName?.isNotEmpty ?? false))
                          _AssigneeChip(name: c.agentName!),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, required this.channel});
  final String name;
  final String channel;

  String get _initials {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 48,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(
              _initials,
              style: const TextStyle(
                color: AppColors.primaryDark,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: AppColors.forChannel(channel),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Unread count with a subtle continuous pulse to draw the eye.
class _PulsingUnreadBadge extends StatefulWidget {
  const _PulsingUnreadBadge({required this.count});
  final int count;

  @override
  State<_PulsingUnreadBadge> createState() => _PulsingUnreadBadgeState();
}

class _PulsingUnreadBadgeState extends State<_PulsingUnreadBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(begin: 1, end: 1.15).animate(
        CurvedAnimation(parent: _c, curve: Curves.easeInOut),
      ),
      child: Container(
        constraints: const BoxConstraints(minWidth: 20),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.45),
              blurRadius: 6,
              spreadRadius: 0.5,
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Text(
          widget.count > 99 ? '99+' : '${widget.count}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

/// Hot / Warm / Cold pill.
class _InterestBadge extends StatelessWidget {
  const _InterestBadge({required this.level});
  final String level;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forInterest(level);
    final label = level.isEmpty
        ? level
        : '${level[0].toUpperCase()}${level.substring(1).toLowerCase()}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final first = name.trim().split(RegExp(r'\s+')).first;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.person_rounded,
              size: 12, color: AppColors.primaryDark),
          const SizedBox(width: 3),
          Text(
            first,
            style: const TextStyle(
              fontSize: 10.5,
              color: AppColors.primaryDark,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _StageChip extends StatelessWidget {
  const _StageChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10.5,
          color: AppColors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PreviewWidget extends StatelessWidget {
  const _PreviewWidget({required this.preview, required this.hasUnread});
  final String? preview;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = hasUnread ? theme.colorScheme.onSurface : AppColors.textSecondary;
    final weight = hasUnread ? FontWeight.w500 : FontWeight.w400;
    final style = theme.textTheme.bodyMedium?.copyWith(color: color, fontWeight: weight);

    if (preview == null || preview!.isEmpty) {
      return Text('No messages yet', maxLines: 1, overflow: TextOverflow.ellipsis, style: style);
    }

    // Normalize legacy [bracket] format from server to WhatsApp-style emoji labels.
    String text = preview!;
    final p = text.toLowerCase().trim();
    if (p == '[image]' || p == '[photo]') {
      text = '📷 Photo';
    } else if (p == '[video]') {
      text = '🎥 Video';
    } else if (p == '[audio]' || p == '[voice]') {
      text = '🎤 Voice message';
    } else if (p == '[sticker]') {
      text = 'Sticker';
    } else if (p == '[document]' || p == '[file]') {
      text = '📄 Document';
    } else if (p == '[location]') {
      text = '📍 Location';
    } else if (p == '[contact]') {
      text = '👤 Contact';
    } else if (p == '[media]') {
      text = '📎 Attachment';
    }

    return Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: style);
  }
}
