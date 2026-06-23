import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/utils/animation_constants.dart';
import '../../../../core/utils/haptics.dart';
import '../../../../core/widgets/premium_indicators.dart';
import '../../../../core/utils/time_format.dart';
import '../../domain/entities/conversation.dart';

/// Premium conversation tile with WhatsApp-style animations.
/// Features: swipe actions, online status, unread badges, haptic feedback.
class PremiumConversationTile extends ConsumerWidget {
  const PremiumConversationTile({
    super.key,
    required this.conversation,
    required this.onTap,
    this.index = 0,
  });

  final Conversation conversation;
  final VoidCallback onTap;
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = conversation;
    final unread = c.unreadCount;
    final preview = c.lastMessagePreview?.trim() ?? '';
    final isOutbound = c.lastMessageDirection == 'agent';
    final isManager =
        ref.watch(sessionControllerProvider).user?.role.isManagerTier ?? false;

    return AnimationLimiter(
      child: AnimationConfiguration.staggeredList(
        position: index,
        duration: AnimDurations.medium,
        child: SlideAnimation(
          horizontalOffset: 50.0,
          child: FadeInAnimation(
            child: _TileContent(
              displayName: c.displayName,
              lastMessageAt: c.lastMessageAt,
              lastMessagePreview: preview,
              lastMessageDirection: c.lastMessageDirection,
              channel: c.channel,
              unreadCount: unread,
              interestLevel: c.interestLevel,
              stageName: c.stageName,
              agentName: c.agentName,
              isManager: isManager,
              onTap: () {
                Haptics.select;
                onTap();
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// The actual tile content.
class _TileContent extends StatefulWidget {
  const _TileContent({
    required this.displayName,
    required this.lastMessageAt,
    required this.lastMessagePreview,
    required this.lastMessageDirection,
    required this.channel,
    required this.unreadCount,
    required this.onTap,
    this.interestLevel,
    this.stageName,
    this.agentName,
    required this.isManager,
  });

  final String displayName;
  final DateTime? lastMessageAt;
  final String? lastMessagePreview;
  final String? lastMessageDirection;
  final String channel;
  final int unreadCount;
  final VoidCallback onTap;
  final String? interestLevel;
  final String? stageName;
  final String? agentName;
  final bool isManager;

  @override
  State<_TileContent> createState() => _TileContentState();
}

class _TileContentState extends State<_TileContent> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final unread = widget.unreadCount;
    final hasUnread = unread > 0;

    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      child: AnimatedContainer(
        duration: AnimDurations.fast,
        color: _isPressed
            ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.05)
            : Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              _PremiumAvatar(
                name: widget.displayName,
                channel: widget.channel,
                hasUnread: hasUnread,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _NameRow(
                      name: widget.displayName,
                      time: formatListTime(widget.lastMessageAt),
                      hasUnread: hasUnread,
                      unread: unread,
                    ),
                    const SizedBox(height: 5),
                    _PreviewRow(
                      preview: widget.lastMessagePreview ?? '',
                      isOutbound: widget.lastMessageDirection == 'agent',
                      hasUnread: hasUnread,
                    ),
                    if (_hasBadges()) ...[
                      const SizedBox(height: 6),
                      _BadgeRow(
                        interestLevel: widget.interestLevel,
                        stageName: widget.stageName,
                        agentName: widget.agentName,
                        isManager: widget.isManager,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool _hasBadges() =>
      widget.interestLevel != null ||
      widget.stageName != null ||
      (widget.isManager && (widget.agentName?.isNotEmpty ?? false));
}

class _NameRow extends StatelessWidget {
  const _NameRow({
    required this.name,
    required this.time,
    required this.hasUnread,
    required this.unread,
  });

  final String name;
  final String time;
  final bool hasUnread;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyLarge?.copyWith(
              fontWeight: hasUnread ? FontWeight.w700 : FontWeight.w600,
              fontSize: 15.5,
            ),
          ),
        ),
        const SizedBox(width: 6),
        if (hasUnread)
          AnimatedBadge(count: unread)
        else
          Text(
            time,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textMuted,
              fontSize: 12,
            ),
          ),
      ],
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({
    required this.preview,
    required this.isOutbound,
    required this.hasUnread,
  });

  final String preview;
  final bool isOutbound;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = preview.isNotEmpty ? preview : 'No messages yet';
    return Row(
      children: [
        if (isOutbound && preview.isNotEmpty) ...[
          Icon(Icons.done_all_rounded,
              size: 14, color: hasUnread ? AppColors.primary : AppColors.textMuted),
          const SizedBox(width: 3),
        ],
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: hasUnread ? AppColors.textPrimary : AppColors.textSecondary,
              fontSize: 13.5,
              fontWeight: hasUnread ? FontWeight.w500 : FontWeight.w400,
            ),
          ),
        ),
      ],
    );
  }
}

class _BadgeRow extends StatelessWidget {
  const _BadgeRow({
    required this.interestLevel,
    required this.stageName,
    required this.agentName,
    required this.isManager,
  });

  final String? interestLevel;
  final String? stageName;
  final String? agentName;
  final bool isManager;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 5,
      runSpacing: 4,
      children: [
        if (interestLevel != null)
          _InterestBadge(level: interestLevel!),
        if (stageName != null) _StageChip(label: stageName!),
        if (isManager && (agentName?.isNotEmpty ?? false))
          _AssigneeChip(name: agentName!),
      ],
    );
  }
}

/// Premium avatar with online status indicator.
class _PremiumAvatar extends StatelessWidget {
  const _PremiumAvatar({
    required this.name,
    required this.channel,
    required this.hasUnread,
  });

  final String name;
  final String channel;
  final bool hasUnread;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      width: 50,
      height: 50,
      child: Stack(
        children: [
          // Avatar with ring for unread
          AnimatedContainer(
            duration: AnimDurations.fast,
            width: 50,
            height: 50,
            decoration: hasUnread
                ? BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.primary,
                      width: 2,
                    ),
                  )
                : null,
            child: CircleAvatar(
              radius: 23,
              backgroundColor: isDark
                  ? AppColors.primary.withValues(alpha: 0.25)
                  : AppColors.primary.withValues(alpha: 0.12),
              child: Text(
                _initials,
                style: TextStyle(
                  color: isDark ? AppColors.primary : AppColors.primaryDark,
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                ),
              ),
            ),
          ),
          // Channel indicator
          Positioned(
            right: 1,
            bottom: 1,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: AppColors.forChannel(channel),
                shape: BoxShape.circle,
                border: Border.all(
                    color: isDark ? AppColors.darkSurface : Colors.white, width: 2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Interest badge (Hot/Warm/Cold).
class _InterestBadge extends StatelessWidget {
  const _InterestBadge({required this.level});
  final String level;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forInterest(level);
    final label = '${level[0].toUpperCase()}${level.substring(1).toLowerCase()}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.person_rounded, size: 10, color: AppColors.primaryDark),
          const SizedBox(width: 3),
          Text(
            name.trim().split(RegExp(r'\s+')).first,
            style: const TextStyle(
              fontSize: 10,
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceAlt : AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
