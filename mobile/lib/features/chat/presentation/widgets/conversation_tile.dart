import 'dart:async';

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

  static bool _isInactive(String status) =>
      status == 'closed' || status == 'snoozed';

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
                  if (_isInactive(c.status) ||
                      c.interestLevel != null ||
                      c.stageName != null ||
                      (isManager && (c.agentName?.isNotEmpty ?? false))) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (_isInactive(c.status))
                          _StatusChip(
                              status: c.status, until: c.snoozedUntil),
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
    // Dynamic, deterministic avatar colour per contact (WhatsApp-style).
    final avatarColor = AppColors.avatarColor(name);
    return SizedBox(
      width: 48,
      height: 48,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: avatarColor.withValues(alpha: 0.15),
            child: Text(
              _initials,
              style: TextStyle(
                color: avatarColor,
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

/// Closed / Snoozed status pill, so an inactive lead stays in the inbox but is
/// clearly marked instead of looking identical to an open chat. The snoozed
/// variant shows a live countdown that ticks down each minute while visible.
class _StatusChip extends StatefulWidget {
  const _StatusChip({required this.status, this.until});
  final String status;
  final DateTime? until;

  @override
  State<_StatusChip> createState() => _StatusChipState();
}

class _StatusChipState extends State<_StatusChip> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    if (widget.status == 'snoozed' && widget.until != null) {
      // Refresh the "time left" label about once a minute (hour-scale snoozes
      // don't need per-second updates).
      _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Status reflects open/closed/snoozed only. "Lost" is conveyed by the stage
    // chip now, so a lost lead just reads "Closed" here (no duplicate "Lost").
    final isSnoozed = widget.status == 'snoozed';
    final Color color;
    final IconData icon;
    String label;
    if (isSnoozed) {
      color = AppColors.warning;
      icon = Icons.snooze_rounded;
      final left = formatTimeLeft(widget.until);
      label = widget.until == null
          ? 'Snoozed'
          : (left == 'due' ? 'Reopening' : 'Snoozed · $left left');
    } else {
      color = AppColors.textMuted;
      icon = Icons.check_circle_outline_rounded;
      label = 'Closed';
    }
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
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 3),
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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timeline_rounded,
              size: 12, color: AppColors.textSecondary),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10.5,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
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

    // Check for media type indicators (emoji-prefixed from controller or [bracket] from server).
    final p = preview!.toLowerCase().trim();
    IconData? icon;
    String? label;
    // WhatsApp teal for media icons
    const teal = Color(0xFF00A884);

    // Match emoji-prefixed (from controller) or [bracket] (from server)
    if (p.startsWith('📷') || p == '[image]' || p == '[photo]') {
      icon = Icons.camera_alt_rounded;
      label = 'Photo';
    } else if (p.startsWith('🎥') || p == '[video]') {
      icon = Icons.videocam_rounded;
      label = 'Video';
    } else if (p.startsWith('🎤') || p == '[audio]' || p == '[voice]') {
      icon = Icons.mic_rounded;
      label = 'Voice message';
    } else if (p == '[sticker]' || p == 'sticker') {
      icon = Icons.sticky_note_2_rounded;
      label = 'Sticker';
    } else if (p.startsWith('📄') || p == '[document]' || p == '[file]') {
      icon = Icons.insert_drive_file_rounded;
      label = 'Document';
    } else if (p.startsWith('📍') || p == '[location]') {
      icon = Icons.location_on_rounded;
      label = 'Location';
    } else if (p.startsWith('👤') || p == '[contact]') {
      icon = Icons.person_rounded;
      label = 'Contact';
    } else if (p.startsWith('📎') || p == '[media]') {
      icon = Icons.attach_file_rounded;
      label = 'Attachment';
    }

    if (icon != null && label != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: teal),
          const SizedBox(width: 3),
          Flexible(
            child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: style),
          ),
        ],
      );
    }

    return Text(preview!, maxLines: 1, overflow: TextOverflow.ellipsis, style: style);
  }
}
