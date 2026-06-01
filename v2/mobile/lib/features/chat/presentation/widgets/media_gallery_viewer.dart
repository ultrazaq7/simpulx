// ============================================================
// Media Gallery Viewer - Fullscreen Lightbox for Attachments
// ============================================================
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/presentation/widgets/web_download_stub.dart'
    if (dart.library.html) 'package:simpulx/features/chat/presentation/widgets/web_download_web.dart';

/// Extracts all media messages (image, video, document, sticker) from a list
/// and returns them along with a resolved URL helper.
class _MediaItem {
  final MessageEntity message;
  final String url;
  final String type;

  _MediaItem({required this.message, required this.url, required this.type});
}

class MediaGalleryViewer extends StatefulWidget {
  /// All messages in the conversation (used to extract media for navigation).
  final List<MessageEntity> allMessages;

  /// The message that was tapped (used to determine initial page).
  final MessageEntity initialMessage;

  /// Base URL for resolving relative media paths.
  static const String mediaHost = kIsWeb ? '' : 'http://10.0.2.2:8080';

  const MediaGalleryViewer({
    super.key,
    required this.allMessages,
    required this.initialMessage,
  });

  /// Show the gallery as a fullscreen dialog.
  static void show(
    BuildContext context, {
    required List<MessageEntity> allMessages,
    required MessageEntity initialMessage,
  }) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: true,
        barrierColor: Colors.black87,
        pageBuilder: (_, __, ___) => MediaGalleryViewer(
          allMessages: allMessages,
          initialMessage: initialMessage,
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 200),
      ),
    );
  }

  @override
  State<MediaGalleryViewer> createState() => _MediaGalleryViewerState();
}

class _MediaGalleryViewerState extends State<MediaGalleryViewer> {
  late final List<_MediaItem> _mediaItems;
  late final PageController _pageController;
  late int _currentIndex;

  static String? _resolveUrl(MessageEntity m) {
    final url = m.mediaUrl;
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return '${MediaGalleryViewer.mediaHost}$url';
    return null;
  }

  @override
  void initState() {
    super.initState();

    // Build media items list (chronological - oldest first)
    _mediaItems = widget.allMessages
        .where((m) {
          final type = m.type;
          final url = _resolveUrl(m);
          return url != null &&
              (type == 'image' ||
                  type == 'sticker' ||
                  type == 'video' ||
                  type == 'document');
        })
        .map((m) => _MediaItem(
              message: m,
              url: _resolveUrl(m)!,
              type: m.type,
            ))
        .toList();

    // Find starting index
    _currentIndex = _mediaItems.indexWhere(
      (item) => item.message.id == widget.initialMessage.id,
    );
    if (_currentIndex < 0) _currentIndex = 0;

    _pageController = PageController(initialPage: _currentIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _goToPage(int index) {
    if (index < 0 || index >= _mediaItems.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_mediaItems.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
      return const SizedBox.shrink();
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          // ── Dismiss on tap background ──
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(color: Colors.transparent),
          ),

          // ── PageView ──
          PageView.builder(
            controller: _pageController,
            itemCount: _mediaItems.length,
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (context, index) {
              final item = _mediaItems[index];
              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: _buildMediaPage(item),
                ),
              );
            },
          ),

          // ── Top bar: counter + close ──
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    // Counter
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '${_currentIndex + 1} of ${_mediaItems.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const Spacer(),
                    // Download
                    _circleButton(
                      icon: Icons.download_rounded,
                      tooltip: 'Download',
                      onTap: () => _downloadCurrent(),
                    ),
                    const SizedBox(width: 8),
                    // Close
                    _circleButton(
                      icon: Icons.close_rounded,
                      tooltip: 'Close',
                      onTap: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Left arrow ──
          if (_currentIndex > 0)
            Positioned(
              left: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: _circleButton(
                  icon: Icons.chevron_left_rounded,
                  tooltip: 'Previous',
                  onTap: () => _goToPage(_currentIndex - 1),
                  size: 44,
                ),
              ),
            ),

          // ── Right arrow ──
          if (_currentIndex < _mediaItems.length - 1)
            Positioned(
              right: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: _circleButton(
                  icon: Icons.chevron_right_rounded,
                  tooltip: 'Next',
                  onTap: () => _goToPage(_currentIndex + 1),
                  size: 44,
                ),
              ),
            ),

          // ── Bottom info bar ──
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black54, Colors.transparent],
                  ),
                ),
                child: _buildBottomInfo(_mediaItems[_currentIndex]),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaPage(_MediaItem item) {
    if (item.type == 'image' || item.type == 'sticker') {
      return InteractiveViewer(
        minScale: 0.5,
        maxScale: 4.0,
        child: Image.network(
          item.url,
          fit: BoxFit.contain,
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return const SizedBox(
              height: 200,
              child: Center(
                child: CircularProgressIndicator(
                  color: Colors.white70,
                  strokeWidth: 2,
                ),
              ),
            );
          },
          errorBuilder: (_, __, ___) => _errorPlaceholder(),
        ),
      );
    }

    // Video / document - show icon + tap to open
    return GestureDetector(
      onTap: () => _openUrl(item.url),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: Colors.white12,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(
              item.type == 'video'
                  ? Icons.play_circle_outline_rounded
                  : Icons.insert_drive_file_rounded,
              size: 48,
              color: Colors.white70,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _displayFilename(item.message),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            item.type == 'video' ? 'Tap to play video' : 'Tap to open document',
            style: const TextStyle(color: Colors.white60, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomInfo(_MediaItem item) {
    final time = item.message.createdAt;
    final h = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final m = time.minute.toString().padLeft(2, '0');
    final p = time.hour >= 12 ? 'PM' : 'AM';
    final timeStr = '$h:$m $p';
    final caption = item.message.content;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (caption != null && caption.isNotEmpty) ...[
          Text(
            caption,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
        ],
        Text(
          '${item.message.isOutbound ? "Sent" : "Received"} at $timeStr',
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
      ],
    );
  }

  Widget _errorPlaceholder() {
    return Container(
      height: 200,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white10,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.broken_image_rounded, color: Colors.white38, size: 40),
          SizedBox(height: 8),
          Text(
            'Image unavailable',
            style: TextStyle(color: Colors.white38, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _circleButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
    double size = 36,
  }) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black54,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(icon, color: Colors.white, size: size * 0.55),
          ),
        ),
      ),
    );
  }

  String _displayFilename(MessageEntity m) {
    final name = m.mediaFilename;
    if (name != null && name.isNotEmpty) return name;
    final url = m.mediaUrl ?? '';
    final idx = url.lastIndexOf('/');
    return idx >= 0 ? url.substring(idx + 1) : 'attachment';
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _downloadCurrent() async {
    final item = _mediaItems[_currentIndex];
    final filename = _displayFilename(item.message);
    if (kIsWeb) {
      webDownloadFile(item.url, filename);
      return;
    }

    if (Platform.isAndroid) {
      // Use Android DownloadManager — handles permissions, public Downloads folder,
      // and shows the native download progress notification automatically.
      try {
        const channel = MethodChannel('com.simpulx.app/downloader');
        await channel.invokeMethod('downloadFile', {
          'url': item.url,
          'filename': filename,
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.download_rounded,
                      color: Colors.white, size: 18),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Downloading $filename...')),
                ],
              ),
              backgroundColor: const Color(0xFF008B65),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              duration: const Duration(seconds: 2),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Download failed: $e'),
              backgroundColor: const Color(0xFFEF4444),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }
      return;
    }

    // iOS / other platforms — save to app documents directory
    try {
      final dir = await getApplicationDocumentsDirectory();
      final savePath = '${dir.path}/$filename';
      await Dio().download(item.url, savePath);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle_rounded,
                    color: Colors.white, size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text('Saved: $filename')),
              ],
            ),
            backgroundColor: const Color(0xFF008B65),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Download failed: $e'),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}
