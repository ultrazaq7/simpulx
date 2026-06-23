import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/animation_constants.dart';
import '../../../../core/utils/haptics.dart';
import '../../../../core/utils/time_format.dart';
import '../../domain/entities/message.dart';
import 'audio_message.dart';
import 'media_viewer.dart';

/// Premium message bubble with WhatsApp-style animations.
/// Features: slide-in animation, haptic feedback, long-press menu.
class PremiumMessageBubble extends StatefulWidget {
  const PremiumMessageBubble({
    super.key,
    required this.message,
    this.index = 0,
  });

  final Message message;
  final int index;

  @override
  State<PremiumMessageBubble> createState() => _PremiumMessageBubbleState();
}

class _PremiumMessageBubbleState extends State<PremiumMessageBubble>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.medium,
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _controller, curve: AnimCurves.smoothOut),
    );

    // Stagger animation based on index
    Future.delayed(
      Duration(milliseconds: 30 * widget.index),
      () {
        if (mounted) _controller.forward();
      },
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails _) {
    setState(() => _isPressed = true);
  }

  void _handleTapUp(TapUpDetails _) {
    setState(() => _isPressed = false);
  }

  void _handleTapCancel() {
    setState(() => _isPressed = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mine = widget.message.isMine;
    final bg = mine
        ? (isDark ? const Color(0xFF005C4B) : const Color(0xFFDCF8C6))
        : (isDark ? AppColors.darkSurface : Colors.white);
    final fg = mine ? const Color(0xFF111B21) : AppColors.textPrimary;

    return SlideTransition(
      position: _slideAnimation,
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: GestureDetector(
            onTapDown: _handleTapDown,
            onTapUp: _handleTapUp,
            onTapCancel: _handleTapCancel,
            onLongPress: widget.message.body.isEmpty
                ? null
                : () {
                    Haptics.medium;
                    _showMessageActions(context);
                  },
            onDoubleTap: () {
              Haptics.doubleTap;
              _handleDoubleTap(context);
            },
            child: AnimatedScale(
              scale: _isPressed ? 0.98 : 1.0,
              duration: AnimDurations.fast,
              child: _MessageBubbleContent(
                message: widget.message,
                bg: bg,
                fg: fg,
                mine: mine,
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _handleDoubleTap(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.favorite, color: Colors.red, size: 20),
            const SizedBox(width: 8),
            Text(
              widget.message.isMine ? 'You reacted' : 'Reacted',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showMessageActions(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _ActionTile(
              icon: Icons.copy_rounded,
              label: 'Copy',
              onTap: () {
                Clipboard.setData(ClipboardData(text: widget.message.body));
                Navigator.of(sheetContext).pop();
                Haptics.light;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: const Text('Copied to clipboard'),
                    duration: const Duration(seconds: 1),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                );
              },
            ),
            _ActionTile(
              icon: Icons.reply_rounded,
              label: 'Reply',
              onTap: () {
                Navigator.of(sheetContext).pop();
                Haptics.medium;
                // TODO: Implement reply functionality
              },
            ),
            _ActionTile(
              icon: Icons.forward_rounded,
              label: 'Forward',
              onTap: () {
                Navigator.of(sheetContext).pop();
                Haptics.medium;
                // TODO: Implement forward functionality
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      onTap: onTap,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }
}

/// Message bubble content widget.
class _MessageBubbleContent extends StatelessWidget {
  const _MessageBubbleContent({
    required this.message,
    required this.bg,
    required this.fg,
    required this.mine,
  });

  final Message message;
  final Color bg;
  final Color fg;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.78,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(7.5),
          topRight: const Radius.circular(7.5),
          bottomLeft: Radius.circular(mine ? 7.5 : 18),
          bottomRight: Radius.circular(mine ? 18 : 7.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (message.hasMedia)
            _MediaContent(message: message, fg: fg),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (message.body.isNotEmpty)
                  Text(
                    message.body,
                    style: TextStyle(color: fg, fontSize: 15.5, height: 1.25),
                  ),
                const SizedBox(height: 3),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      formatBubbleTime(message.createdAt),
                      style: TextStyle(
                          color: fg.withValues(alpha: 0.5), fontSize: 11),
                    ),
                    if (mine) ...[
                      const SizedBox(width: 4),
                      _AnimatedStatusTick(status: message.status),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Animated status tick for message delivery status.
class _AnimatedStatusTick extends StatefulWidget {
  const _AnimatedStatusTick({required this.status});

  final MessageStatus status;

  @override
  State<_AnimatedStatusTick> createState() => _AnimatedStatusTickState();
}

class _AnimatedStatusTickState extends State<_AnimatedStatusTick>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.fast,
      vsync: this,
    );
    if (widget.status == MessageStatus.sending) {
      _controller.repeat();
    } else {
      _controller.forward();
    }
  }

  @override
  void didUpdateWidget(_AnimatedStatusTick oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.status == MessageStatus.sending) {
      _controller.repeat();
    } else if (widget.status != oldWidget.status) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const onPrimary = Colors.white;
    IconData icon;
    Color color;

    switch (widget.status) {
      case MessageStatus.sending:
        return RotationTransition(
          turns: Tween(begin: 0.0, end: 1.0).animate(_controller),
          child: const Icon(Icons.schedule_rounded, size: 13, color: onPrimary),
        );
      case MessageStatus.failed:
        icon = Icons.error_outline_rounded;
        color = const Color(0xFFFFD2D2);
      case MessageStatus.queued:
      case MessageStatus.sent:
        icon = Icons.done_rounded;
        color = onPrimary.withValues(alpha: 0.85);
      case MessageStatus.delivered:
        icon = Icons.done_all_rounded;
        color = onPrimary.withValues(alpha: 0.85);
      case MessageStatus.read:
        icon = Icons.done_all_rounded;
        color = const Color(0xFF9BE7FF);
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: widget.status == MessageStatus.sending
              ? 0.8 + 0.2 * _controller.value
              : 1.0,
          child: Icon(icon, size: 14, color: color),
        );
      },
    );
  }
}

class _MediaContent extends StatelessWidget {
  const _MediaContent({required this.message, required this.fg});
  final Message message;
  final Color fg;

  bool get _isLocal => !(message.mediaUrl!.startsWith('http'));
  bool get _uploading => message.status == MessageStatus.sending;

  @override
  Widget build(BuildContext context) {
    switch (message.type) {
      case MessageType.image:
        return _image(context);
      case MessageType.document:
        return _document(context);
      case MessageType.audio:
        return _uploading
            ? _placeholder(Icons.mic_rounded, 'Sending voice...')
            : AudioMessage(url: message.mediaUrl!, fg: fg);
      case MessageType.video:
        return _placeholder(Icons.videocam_rounded, 'Video');
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _image(BuildContext context) {
    final url = message.mediaUrl!;
    return GestureDetector(
      onTap: _uploading ? null : () => showMediaViewer(context, url),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280, minWidth: 160),
              child: _isLocal
                  ? Image.file(File(url), fit: BoxFit.cover)
                  : CachedNetworkImage(
                      imageUrl: url,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => Container(
                        height: 180,
                        color: Colors.black12,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (_, _, _) => Container(
                        height: 120,
                        color: Colors.black12,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
            ),
            if (_uploading)
              const Positioned.fill(
                child: ColoredBox(
                  color: Colors.black26,
                  child: Center(
                    child: SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.4, color: Colors.white),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _document(BuildContext context) {
    return InkWell(
      onTap: _uploading
          ? null
          : () => launchUrl(Uri.parse(message.mediaUrl!),
              mode: LaunchMode.externalApplication),
      child: Container(
        padding: const EdgeInsets.all(8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.description_rounded, color: fg, size: 28),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                _fileName(message.mediaUrl!),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: fg, fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder(IconData icon, String label) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: fg, size: 24),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: fg, fontSize: 13)),
        ],
      ),
    );
  }

  String _fileName(String url) {
    final uri = Uri.tryParse(url);
    final name = uri?.queryParameters['name'];
    if (name != null && name.isNotEmpty) return name;
    final seg = uri?.pathSegments.isNotEmpty == true
        ? uri!.pathSegments.last
        : 'Document';
    return seg;
  }
}
