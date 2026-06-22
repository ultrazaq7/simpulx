import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../domain/entities/message.dart';
import 'audio_message.dart';
import 'media_viewer.dart';

/// A single chat bubble. Outbound (mine) right-aligned in brand tint; inbound
/// left in a neutral surface. Renders text, images, and document attachments.
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message});

  final Message message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mine = message.isMine;
    final bg = mine
        ? AppColors.primary.withValues(alpha: 0.92)
        : theme.colorScheme.surfaceContainerHighest;
    final fg = mine ? Colors.white : theme.colorScheme.onSurface;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(mine ? 14 : 4),
            bottomRight: Radius.circular(mine ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.hasMedia) _MediaContent(message: message, fg: fg),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 2, 6, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.body.isNotEmpty)
                    Text(
                      message.body,
                      style: TextStyle(color: fg, fontSize: 15, height: 1.3),
                    ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        formatBubbleTime(message.createdAt),
                        style: TextStyle(
                            color: fg.withValues(alpha: 0.7), fontSize: 10.5),
                      ),
                      if (mine) ...[
                        const SizedBox(width: 4),
                        _StatusTick(status: message.status),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
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

class _StatusTick extends StatelessWidget {
  const _StatusTick({required this.status});
  final MessageStatus status;

  @override
  Widget build(BuildContext context) {
    const onPrimary = Colors.white;
    switch (status) {
      case MessageStatus.sending:
        return const Icon(Icons.schedule_rounded, size: 13, color: onPrimary);
      case MessageStatus.failed:
        return const Icon(Icons.error_outline_rounded,
            size: 13, color: Color(0xFFFFD2D2));
      case MessageStatus.queued:
      case MessageStatus.sent:
        return Icon(Icons.done_rounded,
            size: 14, color: onPrimary.withValues(alpha: 0.85));
      case MessageStatus.delivered:
        return Icon(Icons.done_all_rounded,
            size: 14, color: onPrimary.withValues(alpha: 0.85));
      case MessageStatus.read:
        return const Icon(Icons.done_all_rounded,
            size: 14, color: Color(0xFF9BE7FF));
    }
  }
}
