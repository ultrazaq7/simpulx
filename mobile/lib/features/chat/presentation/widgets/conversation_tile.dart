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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final c = conversation;
    final hasUnread = c.hasUnread;
    final preview = c.lastMessagePreview?.trim();
    final isManager =
        ref.watch(sessionControllerProvider).user?.role.isManagerTier ?? false;
    // Last responder derived from who actually sent the latest message: a human
    // agent (headset) vs Simpuler (robot). isBotActive only means the bot is
    // enabled, not who replied, so it must not drive this.
    final repliedByBot = c.lastSenderType == 'bot';
    final repliedByAgent =
        c.lastSenderType == 'agent' || c.lastSenderType == 'system';
    final showResponder = repliedByBot || repliedByAgent;
    final responderIcon = repliedByBot
        ? Icons.smart_toy_outlined
        : Icons.headset_mic_outlined;
    final responderLabel =
        repliedByBot ? 'Replied by Simpuler' : 'Replied by agent';
    // The 24h WhatsApp session window counts down from the CUSTOMER's last
    // inbound message; an agent/bot reply must NOT reset it. Falls back to
    // lastMessageAt only until the gateway ships last_contact_message_at. While
    // open, the line-1 trailing slot shows a live countdown; once elapsed it
    // becomes the plain date with a red "24H" badge in the responder slot.
    final sessionAnchor = c.lastContactMessageAt ?? c.lastMessageAt;
    final countdownActive = formatWindowCountdown(sessionAnchor) != null;
    final windowExpired =
        c.channel == 'whatsapp' && sessionAnchor != null && !countdownActive;

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
                  // Line 1: name + [responder icon | 24H badge] + [pill | date].
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          c.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight:
                                hasUnread ? FontWeight.w700 : FontWeight.w600,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(width: 8),
                      if (countdownActive)
                        // Flush to the tile's right edge (ribbon): the +16 shift
                        // cancels the row's right padding. Chip icon doubles as
                        // the "replied by" indicator.
                        Transform.translate(
                          offset: const Offset(16, 0),
                          child: Tooltip(
                            message: showResponder
                                ? responderLabel
                                : '24h session window',
                            child: _CountdownBadge(
                              lastMessageAt: sessionAnchor!,
                              icon: showResponder
                                  ? responderIcon
                                  : Icons.schedule_rounded,
                            ),
                          ),
                        )
                      else ...[
                        if (windowExpired) ...[
                          const _Window24hBadge(),
                          const SizedBox(width: 6),
                        ] else if (showResponder) ...[
                          Tooltip(
                            message: responderLabel,
                            child: Icon(
                              responderIcon,
                              size: 13,
                              color: AppColors.textMuted,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        _WindowTime(
                          lastMessageAt: c.lastMessageAt,
                          hasUnread: hasUnread,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  // Line 2: preview + status/unread.
                  Row(
                    children: [
                      Expanded(
                        child: _PreviewWidget(
                          preview: preview,
                          hasUnread: hasUnread,
                        ),
                      ),
                      const SizedBox(width: 6),
                      // Clean trailing: unread count, else closed/snoozed icon.
                      if (hasUnread)
                        _PulsingUnreadBadge(count: c.unreadCount)
                      else if (c.status == 'closed')
                        const Icon(Icons.check_circle_outline_rounded,
                            size: 14, color: AppColors.textMuted)
                      else if (c.status == 'snoozed')
                        const Icon(Icons.snooze_rounded,
                            size: 14, color: AppColors.warning),
                    ],
                  ),
                  if ((isManager && (c.agentName?.isNotEmpty ?? false)) ||
                      (c.campaignName?.isNotEmpty ?? false)) ...[
                    const SizedBox(height: 5),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        if (isManager && (c.agentName?.isNotEmpty ?? false))
                          _AssigneeChip(name: c.agentName!),
                        if (c.campaignName?.isNotEmpty ?? false)
                          _CampaignChip(name: c.campaignName!),
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
            backgroundColor: avatarColor,
            child: Text(
              _initials,
              style: const TextStyle(
                color: Colors.white,
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

/// Assignee as a plain icon + name (no pill).
class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.person_outline_rounded,
            size: 13, color: AppColors.textMuted),
        const SizedBox(width: 3),
        Text(
          name,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.textMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
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

/// Campaign as a plain icon + name (no pill).
class _CampaignChip extends StatelessWidget {
  const _CampaignChip({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.campaign_outlined,
            size: 14, color: AppColors.primary),
        const SizedBox(width: 3),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 140),
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

/// "24H" badge shown when the WhatsApp 24h session window has closed (template
/// only). Mirrors the web ConversationCard badge: red, uppercase, clock icon.
class _Window24hBadge extends StatelessWidget {
  const _Window24hBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.hot,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.schedule_rounded, size: 10, color: Colors.white),
          SizedBox(width: 2),
          Text('24H',
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                  color: Colors.white)),
        ],
      ),
    );
  }
}

/// Chat-list date cell: the static MM/dd/yyyy date. The live 24h countdown
/// lives in [_CountdownBadge] pinned to the tile's corner.
class _WindowTime extends StatelessWidget {
  const _WindowTime({required this.lastMessageAt, required this.hasUnread});
  final DateTime? lastMessageAt;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      formatSessionTimestamp(lastMessageAt),
      style: theme.textTheme.bodySmall?.copyWith(
        color: hasUnread ? AppColors.primary : AppColors.textMuted,
        fontWeight: hasUnread ? FontWeight.w700 : FontWeight.w400,
        fontSize: 10.5,
      ),
    );
  }
}

/// Corner badge: live per-second countdown of the 24h session window as a
/// brand badge ("Xh Ym Zs") with a leading icon chip. The [icon] doubles as
/// the "replied by" indicator (headset/robot), else a clock. Ticks only while
/// the window is open and stops its own ticker once it elapses. Mirrors web
/// WindowCountdownBadge.
class _CountdownBadge extends StatefulWidget {
  const _CountdownBadge({required this.lastMessageAt, required this.icon});
  final DateTime lastMessageAt;
  final IconData icon;

  @override
  State<_CountdownBadge> createState() => _CountdownBadgeState();
}

class _CountdownBadgeState extends State<_CountdownBadge> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant _CountdownBadge old) {
    super.didUpdateWidget(old);
    if (old.lastMessageAt != widget.lastMessageAt) _sync();
  }

  void _sync() {
    _timer?.cancel();
    _timer = null;
    if (formatWindowCountdown(widget.lastMessageAt) != null) {
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        if (formatWindowCountdown(widget.lastMessageAt) == null) {
          t.cancel();
          _timer = null;
        }
        setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final countdown = formatWindowCountdown(widget.lastMessageAt);
    if (countdown == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.only(left: 3, right: 10, top: 2, bottom: 2),
      decoration: const BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(8),
          bottomLeft: Radius.circular(8),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 15,
            height: 15,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(widget.icon, size: 10, color: Colors.white),
          ),
          const SizedBox(width: 4),
          Text(countdown,
              style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white)),
        ],
      ),
    );
  }
}
