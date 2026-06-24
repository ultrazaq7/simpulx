import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:pdfx/pdfx.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../domain/entities/message.dart';
import 'audio_message.dart';
import 'media_viewer.dart';

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
    final bg = mine
        ? AppColors.primary.withValues(alpha: 0.92)
        : (isDark ? AppColors.darkSurfaceAlt : const Color(0xFFF0F2F5)); // WhatsApp-like light gray
    final fg = mine ? Colors.white : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary);

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
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 2, 6, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.type == MessageType.call)
                    _callBubble(context, fg)
                  else if (message.body.isNotEmpty)
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
    final isMissed = subtitle.toLowerCase().contains('no answer') || title.toLowerCase().contains('missed');
    
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
        return _placeholder(Icons.videocam_rounded, 'Video');
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

  Widget _document(BuildContext context) {
    final url = message.mediaUrl!;
    final name = _fileName(url);
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
      final fileName = _fileName(url);
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
