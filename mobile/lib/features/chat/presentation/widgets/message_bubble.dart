import 'dart:io';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart' show TapGestureRecognizer;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:pdfx/pdfx.dart';
import 'package:video_player/video_player.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/network/api_endpoints.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../domain/entities/message.dart';
import 'audio_message.dart';
import 'media_viewer.dart';

/// Shared URL matcher for linkified text + OG preview.
final _kUrlRe = RegExp(r'(https?:\/\/[^\s]+|www\.[^\s]+)', caseSensitive: false);

/// Single OSM tile centered on the location (WhatsApp-style map thumbnail).
String _osmTileUrl(double lat, double lng, {int z = 15}) {
  final n = 1 << z;
  final x = (((lng + 180) / 360) * n).floor().clamp(0, n - 1);
  final latRad = lat * 3.141592653589793 / 180;
  final y = ((1 -
              (math.log(math.tan(latRad) + 1 / math.cos(latRad)) /
                  3.141592653589793)) /
          2 *
          n)
      .floor()
      .clamp(0, n - 1);
  return 'https://tile.openstreetmap.org/$z/$x/$y.png';
}

/// A single chat bubble. Outbound (mine) right-aligned in brand tint; inbound
/// left in a neutral surface. Renders text, images, and document attachments.
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    this.allMessages = const [],
  });

  final Message message;
  /// All messages in the conversation — used to build the swipeable media gallery.
  final List<Message> allMessages;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mine = message.isMine;
    final isDark = theme.brightness == Brightness.dark;
    // Real WhatsApp uses a solid, non-transparent bubble fill and the SAME
    // text colour for both outgoing and incoming bubbles (only the bg hue
    // differs) — that's why fg no longer branches on `mine`.
    final bg = mine
        ? (isDark ? AppColors.bubbleOutgoingDark : AppColors.bubbleOutgoingLight)
        : (isDark ? AppColors.bubbleIncomingDark : AppColors.bubbleIncomingLight);
    final fg = isDark ? AppColors.darkTextPrimary : AppColors.textPrimary;

    // Reaction: centered timeline marker, not a bubble (WhatsApp attaches
    // reactions to the target message; we surface them inline).
    if (message.type == MessageType.reaction) {
      return Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: fg.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            message.body.isNotEmpty
                ? '${message.body}  ${mine ? 'You reacted' : 'Reacted'} to a message'
                : '${mine ? 'You removed' : 'Removed'} a reaction',
            style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 12.5),
          ),
        ),
      );
    }

    // First URL in a plain text message -> OG link preview (the CTWA ad card
    // already provides its own preview).
    final firstUrl = message.type == MessageType.text && message.referral == null
        ? _kUrlRe.firstMatch(message.body)?.group(0)
        : null;
    // Media message whose file is still downloading server-side (published
    // instantly for zero text latency; MediaUpdated patches it in).
    const mediaTypes = {
      MessageType.image,
      MessageType.video,
      MessageType.audio,
      MessageType.document,
      MessageType.file,
      MessageType.sticker,
    };
    final mediaPending = !message.hasMedia && mediaTypes.contains(message.type);
    // Never render an empty bubble: unknown/undecodable types get a label.
    final isBlank = message.body.isEmpty &&
        !message.hasMedia &&
        !mediaPending &&
        message.referral == null &&
        message.contacts.isEmpty &&
        message.location == null &&
        message.type != MessageType.call;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: message.body.isEmpty
            ? null
            : () => _showMessageActions(context),
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
            if (message.hasMedia)
              _MediaContent(
                message: message,
                fg: fg,
                allMessages: allMessages,
              ),
            if (mediaPending)
              Padding(
                padding: const EdgeInsets.all(10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (message.type == MessageType.sticker)
                      Icon(Icons.emoji_emotions_outlined,
                          size: 18, color: fg.withValues(alpha: 0.6))
                    else
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: fg.withValues(alpha: 0.5)),
                      ),
                    const SizedBox(width: 10),
                    Text(
                      switch (message.type) {
                        MessageType.sticker => 'Sticker',
                        MessageType.video => 'Video',
                        MessageType.audio => 'Voice message',
                        MessageType.document || MessageType.file => 'Document',
                        _ => 'Photo',
                      },
                      style: TextStyle(
                          color: fg.withValues(alpha: 0.65), fontSize: 13.5),
                    ),
                  ],
                ),
              ),
            if (message.referral != null)
              _ReferralCard(referral: message.referral!, fg: fg),
            if (message.type == MessageType.contacts && message.contacts.isNotEmpty)
              _ContactsCard(contacts: message.contacts, fg: fg),
            if (message.type == MessageType.location && message.location != null)
              _LocationCard(location: message.location!, fg: fg),
            if (firstUrl != null) _LinkPreviewCard(url: firstUrl, fg: fg),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 2, 6, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.type == MessageType.call)
                    _callBubble(context, fg)
                  else if (message.body.isNotEmpty)
                    _LinkifiedBody(text: message.body, color: fg)
                  else if (isBlank)
                    Text(
                      message.type == MessageType.unsupported
                          ? "This message can't be displayed"
                          : 'Unsupported message',
                      style: TextStyle(
                        color: fg.withValues(alpha: 0.65),
                        fontSize: 14,
                        fontStyle: FontStyle.italic,
                      ),
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
                        _StatusTick(status: message.status, baseColor: fg),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
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
            ListTile(
              leading: const Icon(Icons.copy_rounded),
              title: const Text('Copy'),
              onTap: () {
                Clipboard.setData(ClipboardData(text: message.body));
                Navigator.of(sheetContext).pop();
                AppSnackbar.show(context, 'Copied');
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _callBubble(BuildContext context, Color fg) {
    final parts = message.body.split(' · ');
    final title = parts.isNotEmpty ? parts[0] : 'Voice call';
    final subtitle = parts.length > 1 ? parts[1] : '';
    final isMissed = subtitle.toLowerCase().contains('no answer') ||
        title.toLowerCase().contains('missed') ||
        title.toLowerCase().contains('declined');
    
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 4, right: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: fg.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isMissed ? Icons.phone_missed_rounded : Icons.phone_callback_rounded,
              color: isMissed ? AppColors.danger : fg,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 15),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 13),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MediaContent extends StatelessWidget {
  const _MediaContent({
    required this.message,
    required this.fg,
    this.allMessages = const [],
  });
  final Message message;
  final Color fg;
  final List<Message> allMessages;

  bool get _isLocal => !(message.mediaUrl!.startsWith('http'));
  bool get _uploading => message.status == MessageStatus.sending;

  @override
  Widget build(BuildContext context) {
    switch (message.type) {
      case MessageType.image:
        return _image(context, false);
      case MessageType.sticker:
        return _image(context, true);
      case MessageType.document:
      case MessageType.file:
        if (message.mediaUrl?.toLowerCase().endsWith('.pdf') == true) {
          return _PdfPreview(url: message.mediaUrl!, fg: fg, uploading: _uploading);
        }
        return _document(context);
      case MessageType.audio:
        return _uploading
            ? _placeholder(Icons.mic_rounded, 'Sending voice...')
            : AudioMessage(url: message.mediaUrl!, fg: fg);
      case MessageType.video:
        return _videoPreview(context);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _image(BuildContext context, bool isSticker) {
    final url = message.mediaUrl!;
    return GestureDetector(
      onTap: _uploading
          ? null
          : () {
              // Build gallery from all visual media in the conversation
              final mediaMessages = allMessages
                  .where((m) =>
                      m.hasMedia &&
                      (m.type == MessageType.image ||
                       m.type == MessageType.video ||
                       m.type == MessageType.sticker))
                  .toList();
              final items = mediaMessages
                  .map((m) => MediaItem(
                        url: m.mediaUrl!,
                        senderName: m.isMine ? 'You' : '',
                        timestamp: m.createdAt,
                        isVideo: m.type == MessageType.video,
                      ))
                  .toList();
              final idx = mediaMessages.indexWhere((m) => m.id == message.id);
              showMediaViewer(
                context,
                url,
                allMedia: items,
                initialIndex: idx >= 0 ? idx : 0,
              );
            },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: isSticker ? 160 : double.infinity,
                maxHeight: isSticker ? 160 : 280,
              ),
              child: _isLocal
                  ? Image.file(File(url),
                      fit: isSticker ? BoxFit.contain : BoxFit.cover,
                      width: isSticker ? null : double.infinity)
                  : CachedNetworkImage(
                      imageUrl: url,
                      fit: isSticker ? BoxFit.contain : BoxFit.cover,
                      width: isSticker ? null : double.infinity,
                      placeholder: (_, _) => Container(
                        height: isSticker ? 120 : 180,
                        color: Colors.black12,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (_, _, _) => Container(
                        height: isSticker ? 120 : 120,
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

  Widget _videoPreview(BuildContext context) {
    final url = message.mediaUrl!;
    return GestureDetector(
      onTap: _uploading
          ? null
          : () {
              final mediaMessages = allMessages
                  .where((m) =>
                      m.hasMedia &&
                      (m.type == MessageType.image ||
                       m.type == MessageType.video ||
                       m.type == MessageType.sticker))
                  .toList();
              final items = mediaMessages
                  .map((m) => MediaItem(
                        url: m.mediaUrl!,
                        senderName: m.isMine ? 'You' : '',
                        timestamp: m.createdAt,
                        isVideo: m.type == MessageType.video,
                      ))
                  .toList();
              final idx = mediaMessages.indexWhere((m) => m.id == message.id);
              showMediaViewer(
                context,
                url,
                allMedia: items,
                initialIndex: idx >= 0 ? idx : 0,
              );
            },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          alignment: Alignment.center,
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280, maxWidth: 280),
              child: _VideoThumbnail(url: url),
            ),
            Container(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.4),
                shape: BoxShape.circle,
              ),
              padding: const EdgeInsets.all(8),
              child: const Icon(Icons.play_arrow_rounded, size: 32, color: Colors.white),
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
            Positioned(
              bottom: 8,
              left: 8,
              child: Row(
                children: [
                  const Icon(Icons.videocam_rounded, size: 14, color: Colors.white),
                  const SizedBox(width: 4),
                  Text('Video', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _document(BuildContext context) {
    final url = message.mediaUrl!;
    final name = _fileName(url, message.body);
    final ext = name.toLowerCase();

    IconData iconData = Icons.insert_drive_file_rounded;
    Color iconColor = fg;
    Color iconBg = fg.withValues(alpha: 0.1);

    if (ext.endsWith('.doc') || ext.endsWith('.docx')) {
      iconData = Icons.description_rounded;
      iconColor = const Color(0xFF2B579A); // Word blue
      iconBg = const Color(0xFF2B579A).withValues(alpha: 0.15);
    } else if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
      iconData = Icons.table_chart_rounded;
      iconColor = const Color(0xFF217346); // Excel green
      iconBg = const Color(0xFF217346).withValues(alpha: 0.15);
    } else if (ext.endsWith('.ppt') || ext.endsWith('.pptx')) {
      iconData = Icons.slideshow_rounded;
      iconColor = const Color(0xFFB7472A); // PPT orange
      iconBg = const Color(0xFFB7472A).withValues(alpha: 0.15);
    } else if (ext.endsWith('.pdf')) {
      iconData = Icons.picture_as_pdf_rounded;
      iconColor = AppColors.danger;
      iconBg = AppColors.danger.withValues(alpha: 0.15);
    }

    return InkWell(
      onTap: _uploading ? null : () => _openDocument(context, url),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(iconData, color: iconColor, size: 28),
            ),
            const SizedBox(width: 12),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text('Document', style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 11)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            if (!_uploading && !_isLocal)
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: fg.withValues(alpha: 0.1),
                ),
                child: Icon(Icons.file_download_rounded, color: fg, size: 20),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openDocument(BuildContext context, String url) async {
    try {
      AppSnackbar.show(context, 'Opening document...');
      final cacheDir = await getTemporaryDirectory();
      final fileName = _fileName(url, message.body);
      final filePath = '${cacheDir.path}/$fileName';
      
      if (!File(filePath).existsSync()) {
        await Dio().download(url, filePath);
      }
      final result = await OpenFilex.open(filePath);
      if (result.type != ResultType.done) {
        if (context.mounted) {
           AppSnackbar.show(context, 'No app found to open this document', isError: true);
        }
      }
    } catch (e) {
      if (context.mounted) {
        AppSnackbar.show(context, 'Failed to open document', isError: true);
      }
    }
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

  String _fileName(String url, String body) {
    if (body.trim().isNotEmpty) return body.trim();
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
  const _StatusTick({required this.status, required this.baseColor});
  final MessageStatus status;
  /// The bubble's text colour — ticks derive from it so they stay legible
  /// on both the dark-green and pale-mint outgoing bubble variants.
  final Color baseColor;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case MessageStatus.sending:
        return Icon(Icons.schedule_rounded,
            size: 13, color: baseColor.withValues(alpha: 0.65));
      case MessageStatus.failed:
        return const Icon(Icons.error_outline_rounded,
            size: 13, color: AppColors.danger);
      case MessageStatus.queued:
      case MessageStatus.sent:
        return Icon(Icons.done_rounded,
            size: 14, color: baseColor.withValues(alpha: 0.65));
      case MessageStatus.delivered:
        return Icon(Icons.done_all_rounded,
            size: 14, color: baseColor.withValues(alpha: 0.65));
      case MessageStatus.read:
        // WhatsApp's signature "read" blue — same value in both themes.
        return const Icon(Icons.done_all_rounded,
            size: 14, color: Color(0xFF53BDEB));
    }
  }
}

class _PdfPreview extends StatefulWidget {
  final String url;
  final Color fg;
  final bool uploading;
  const _PdfPreview({required this.url, required this.fg, required this.uploading});

  @override
  State<_PdfPreview> createState() => _PdfPreviewState();
}

class _PdfPreviewState extends State<_PdfPreview> {
  String? _imagePath;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  Future<void> _loadPreview() async {
    if (widget.uploading) return;
    setState(() => _loading = true);
    try {
      final cacheDir = await getTemporaryDirectory();
      final uri = Uri.tryParse(widget.url);
      final fileName = uri?.pathSegments.last ?? widget.url.hashCode.toString();
      final imgPath = '${cacheDir.path}/preview_${fileName}.png';
      
      if (File(imgPath).existsSync()) {
        if (mounted) setState(() { _imagePath = imgPath; _loading = false; });
        return;
      }
      
      final pdfPath = '${cacheDir.path}/$fileName';
      if (!File(pdfPath).existsSync()) {
        await Dio().download(widget.url, pdfPath);
      }
      
      final document = await PdfDocument.openFile(pdfPath);
      final page = await document.getPage(1);
      final pageImage = await page.render(width: page.width, height: page.height, format: PdfPageImageFormat.png);
      await page.close();
      await document.close();
      
      if (pageImage != null) {
        final imgFile = File(imgPath);
        await imgFile.writeAsBytes(pageImage.bytes);
        if (mounted) setState(() { _imagePath = imgPath; });
      }
    } catch (e) {
      debugPrint('PDF preview error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
  
  Future<void> _openDocument(BuildContext context) async {
    try {
      AppSnackbar.show(context, 'Opening document...');
      final cacheDir = await getTemporaryDirectory();
      final uri = Uri.tryParse(widget.url);
      final fileName = uri?.pathSegments.last ?? widget.url.hashCode.toString();
      final filePath = '${cacheDir.path}/$fileName';
      
      if (!File(filePath).existsSync()) {
        await Dio().download(widget.url, filePath);
      }
      final result = await OpenFilex.open(filePath);
      if (result.type != ResultType.done) {
        if (context.mounted) {
           AppSnackbar.show(context, 'No app found to open this document', isError: true);
        }
      }
    } catch (e) {
      if (context.mounted) {
        AppSnackbar.show(context, 'Failed to open document', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(widget.url);
    final fileName = uri?.pathSegments.last ?? 'Document.pdf';

    return GestureDetector(
      onTap: widget.uploading ? null : () => _openDocument(context),
      child: Container(
        width: 240,
        decoration: BoxDecoration(
          color: widget.fg.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: widget.fg.withValues(alpha: 0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(9)),
              child: Container(
                height: 140,
                color: Colors.white,
                child: _loading 
                  ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                  : _imagePath != null
                    ? Image.file(File(_imagePath!), fit: BoxFit.cover, alignment: Alignment.topCenter)
                    : Center(child: Icon(Icons.picture_as_pdf_rounded, color: AppColors.danger, size: 48)),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: widget.fg.withValues(alpha: 0.1),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(9)),
              ),
              child: Row(
                children: [
                  Icon(Icons.picture_as_pdf_rounded, color: AppColors.danger, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          fileName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: widget.fg, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                        Text(
                          'PDF Document',
                          style: TextStyle(color: widget.fg.withValues(alpha: 0.7), fontSize: 11),
                        ),
                      ],
                    ),
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

class _VideoThumbnail extends StatefulWidget {
  final String url;
  const _VideoThumbnail({required this.url});

  @override
  State<_VideoThumbnail> createState() => _VideoThumbnailState();
}

class _VideoThumbnailState extends State<_VideoThumbnail> {
  late VideoPlayerController _controller;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    final isNetwork = widget.url.startsWith('http');
    _controller = isNetwork
        ? VideoPlayerController.networkUrl(Uri.parse(widget.url))
        : VideoPlayerController.file(File(widget.url));
    
    _controller.initialize().then((_) {
      if (mounted) setState(() => _initialized = true);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return Container(
        height: 180,
        width: double.infinity,
        color: Colors.black26,
      );
    }
    return AspectRatio(
      aspectRatio: _controller.value.aspectRatio,
      child: VideoPlayer(_controller),
    );
  }
}

/// CTWA ad creative preview (image + headline + body + link), WhatsApp-style.
class _ReferralCard extends StatelessWidget {
  const _ReferralCard({required this.referral, required this.fg});
  final Map<String, dynamic> referral;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    final image = (referral['image_url'] as String?)?.trim() ?? '';
    final headline = (referral['headline'] as String?)?.trim() ?? '';
    final body = (referral['body'] as String?)?.trim() ?? '';
    final sourceUrl = (referral['source_url'] as String?)?.trim() ?? '';
    return GestureDetector(
      onTap: sourceUrl.isEmpty
          ? null
          : () => launchUrl(Uri.parse(sourceUrl), mode: LaunchMode.externalApplication),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        constraints: const BoxConstraints(maxWidth: 280),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: fg.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: fg.withValues(alpha: 0.12)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (image.isNotEmpty)
              CachedNetworkImage(
                imageUrl: image,
                fit: BoxFit.cover,
                width: double.infinity,
                height: 150,
                placeholder: (_, _) => Container(height: 150, color: Colors.black12),
                errorWidget: (_, _, _) => const SizedBox.shrink(),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (headline.isNotEmpty)
                    Text(headline,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.2)),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: fg.withValues(alpha: 0.75), fontSize: 12.5, height: 1.25)),
                  ],
                  if (sourceUrl.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.open_in_new_rounded, size: 13, color: AppColors.primary),
                      const SizedBox(width: 3),
                      Text('View ad',
                          style: TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                    ]),
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

/// Shared contact card(s).
class _ContactsCard extends StatelessWidget {
  const _ContactsCard({required this.contacts, required this.fg});
  final List<Map<String, dynamic>> contacts;
  final Color fg;

  String _initial(String s) => s.trim().isEmpty ? '?' : s.trim().substring(0, 1).toUpperCase();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final c in contacts)
          Container(
            margin: const EdgeInsets.only(bottom: 4),
            constraints: const BoxConstraints(minWidth: 210),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            decoration: BoxDecoration(
              color: fg.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                  child: Text(_initial((c['name'] as String?) ?? '?'),
                      style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(((c['name'] as String?)?.isNotEmpty ?? false) ? c['name'] as String : 'Contact',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 1),
                      Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.phone_rounded, size: 12, color: fg.withValues(alpha: 0.6)),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                              ((c['phone'] as String?)?.isNotEmpty ?? false)
                                  ? c['phone'] as String
                                  : ((c['org'] as String?) ?? 'Contact card'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 12)),
                        ),
                      ]),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Message body with tappable links (WhatsApp-style): URLs are underlined and
/// open in the external browser.
class _LinkifiedBody extends StatefulWidget {
  const _LinkifiedBody({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  State<_LinkifiedBody> createState() => _LinkifiedBodyState();
}

class _LinkifiedBodyState extends State<_LinkifiedBody> {
  static final _urlRe =
      RegExp(r'(https?:\/\/[^\s]+|www\.[^\s]+)', caseSensitive: false);
  final List<TapGestureRecognizer> _recognizers = [];

  void _disposeRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(color: widget.color, fontSize: 15, height: 1.3);
    final matches = _urlRe.allMatches(widget.text).toList();
    if (matches.isEmpty) return Text(widget.text, style: base);

    _disposeRecognizers(); // rebuild-safe: recreate recognizers fresh
    final spans = <TextSpan>[];
    var last = 0;
    for (final m in matches) {
      if (m.start > last) {
        spans.add(TextSpan(text: widget.text.substring(last, m.start)));
      }
      final url = m.group(0)!;
      final rec = TapGestureRecognizer()
        ..onTap = () {
          final href = url.startsWith('http') ? url : 'https://$url';
          launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
        };
      _recognizers.add(rec);
      spans.add(TextSpan(
        text: url,
        recognizer: rec,
        style: const TextStyle(
          color: Color(0xFF53BDEB),
          decoration: TextDecoration.underline,
          decorationColor: Color(0xFF53BDEB),
        ),
      ));
      last = m.end;
    }
    if (last < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(last)));
    }
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

/// Shared pinned location: map thumbnail (OSM tile) + name/address, opens the
/// maps app on tap.
class _LocationCard extends StatelessWidget {
  const _LocationCard({required this.location, required this.fg});
  final Map<String, dynamic> location;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    final lat = (location['latitude'] as num?)?.toDouble() ?? 0;
    final lng = (location['longitude'] as num?)?.toDouble() ?? 0;
    final name = (location['name'] as String?)?.trim() ?? '';
    final address = (location['address'] as String?)?.trim() ?? '';
    final url = 'https://www.google.com/maps/search/?api=1&query=$lat,$lng';
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        width: 240,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: fg.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 110,
              width: 240,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  CachedNetworkImage(
                    imageUrl: _osmTileUrl(lat, lng),
                    fit: BoxFit.cover,
                    placeholder: (_, _) => Container(color: Colors.black12),
                    errorWidget: (_, _, _) => Container(
                      color: Colors.black12,
                      child: Icon(Icons.map_rounded,
                          color: fg.withValues(alpha: 0.4), size: 36),
                    ),
                  ),
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: 18),
                      child: Icon(Icons.location_on_rounded,
                          color: Color(0xFFEF4444), size: 30),
                    ),
                  ),
                  Positioned(
                    right: 2,
                    bottom: 1,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      color: Colors.white.withValues(alpha: 0.6),
                      child: const Text('© OpenStreetMap',
                          style: TextStyle(fontSize: 7, color: Colors.black54)),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(name.isNotEmpty ? name : 'Location',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 1),
                  Text(
                      address.isNotEmpty
                          ? address
                          : '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Open Graph preview card for a URL in a text message (fetched via the
/// gateway; results memory-cached so scrolling doesn't refetch).
class _LinkPreviewCard extends ConsumerStatefulWidget {
  const _LinkPreviewCard({required this.url, required this.fg});
  final String url;
  final Color fg;

  @override
  ConsumerState<_LinkPreviewCard> createState() => _LinkPreviewCardState();
}

class _LinkPreviewCardState extends ConsumerState<_LinkPreviewCard> {
  static final Map<String, Map<String, dynamic>?> _cache = {};
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final key = widget.url;
    if (_cache.containsKey(key)) {
      if (mounted) setState(() => _data = _cache[key]);
      return;
    }
    try {
      final target = key.startsWith('http') ? key : 'https://$key';
      final res = await ref.read(dioProvider).get(
        ApiEndpoints.linkPreview,
        queryParameters: {'url': target},
      );
      final m = (res.data as Map).cast<String, dynamic>();
      final title = (m['title'] as String?) ?? '';
      final image = (m['image'] as String?) ?? '';
      _cache[key] = (title.isNotEmpty || image.isNotEmpty) ? m : null;
    } catch (_) {
      _cache[key] = null;
    }
    if (mounted) setState(() => _data = _cache[key]);
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) return const SizedBox.shrink();
    final fg = widget.fg;
    final title = (d['title'] as String?) ?? '';
    final desc = (d['description'] as String?) ?? '';
    final image = (d['image'] as String?) ?? '';
    final target = widget.url.startsWith('http') ? widget.url : 'https://${widget.url}';
    String domain = '';
    try {
      domain = Uri.parse(target).host.replaceFirst('www.', '');
    } catch (_) {}
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(target), mode: LaunchMode.externalApplication),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        constraints: const BoxConstraints(maxWidth: 270),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: fg.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (image.isNotEmpty)
              CachedNetworkImage(
                imageUrl: image,
                fit: BoxFit.cover,
                width: double.infinity,
                height: 130,
                placeholder: (_, _) => Container(height: 130, color: Colors.black12),
                errorWidget: (_, _, _) => const SizedBox.shrink(),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (title.isNotEmpty)
                    Text(title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: fg, fontWeight: FontWeight.w700, fontSize: 13, height: 1.2)),
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(desc,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: fg.withValues(alpha: 0.7), fontSize: 12, height: 1.25)),
                  ],
                  if (domain.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(domain,
                        style: TextStyle(color: fg.withValues(alpha: 0.55), fontSize: 11)),
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
