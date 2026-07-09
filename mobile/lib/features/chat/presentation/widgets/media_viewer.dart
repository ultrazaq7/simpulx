import 'dart:io';
import '../../../../core/i18n/i18n.dart';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gal/gal.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_snackbar.dart';

/// WhatsApp-style full-screen media viewer with:
/// • Pinch-to-zoom via InteractiveViewer
/// • Swipe left/right between media items (PageView)
/// • Dark background, top bar with sender + timestamp
/// • Page indicator dots
Future<void> showMediaViewer(
  BuildContext context,
  String url, {
  List<MediaItem> allMedia = const [],
  int initialIndex = 0,
}) {
  // If no gallery provided, just show the single image
  final items = allMedia.isNotEmpty
      ? allMedia
      : [MediaItem(url: url, senderName: '', timestamp: null)];
  final startIdx = allMedia.isNotEmpty ? initialIndex : 0;

  return Navigator.of(context, rootNavigator: true).push(
    PageRouteBuilder<void>(
      opaque: true,
      pageBuilder: (_, anim, __) => FadeTransition(
        opacity: anim,
        child: _MediaGallery(items: items, initialIndex: startIdx),
      ),
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 200),
    ),
  );
}

/// Lightweight data class for a media item in the gallery.
class MediaItem {
  const MediaItem({
    required this.url,
    required this.senderName,
    required this.timestamp,
    this.isVideo = false,
  });
  final String url;
  final String senderName;
  final DateTime? timestamp;
  final bool isVideo;

  bool get isNetwork => url.startsWith('http');
}

class _MediaGallery extends StatefulWidget {
  const _MediaGallery({required this.items, required this.initialIndex});
  final List<MediaItem> items;
  final int initialIndex;

  @override
  State<_MediaGallery> createState() => _MediaGalleryState();
}

class _MediaGalleryState extends State<_MediaGallery> {
  late final PageController _pageCtrl;
  late int _current;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _pageCtrl = PageController(initialPage: _current);
    // Immersive mode
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    // Restore UI
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  Future<void> _saveMedia() async {
    final item = widget.items[_current];
    try {
      final hasAccess = await Gal.hasAccess();
      if (!hasAccess) await Gal.requestAccess();
      
      if (!mounted) return;
      AppSnackbar.show(context, 'Saving...'.tr(context));
      
      if (item.isNetwork) {
        final cacheDir = await getTemporaryDirectory();
        final path = '${cacheDir.path}/${item.url.hashCode}${item.isVideo ? '.mp4' : '.jpg'}';
        if (!File(path).existsSync()) {
          await Dio().download(item.url, path);
        }
        item.isVideo ? await Gal.putVideo(path) : await Gal.putImage(path);
      } else {
        item.isVideo ? await Gal.putVideo(item.url) : await Gal.putImage(item.url);
      }
      if (mounted) AppSnackbar.show(context, 'Saved to device'.tr(context));
    } catch (e) {
      if (mounted) AppSnackbar.show(context, 'Failed to save'.tr(context), isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.items[_current];
    final count = widget.items.length;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // ── Swipeable pages ─────────────────────────────
          PageView.builder(
            controller: _pageCtrl,
            itemCount: count,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (_, i) => _MediaPage(item: widget.items[i]),
          ),

          // ── Top bar ────────────────────────────────────
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.7),
                    Colors.transparent,
                  ],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded,
                            color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (item.senderName.isNotEmpty)
                              Text(
                                item.senderName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            if (item.timestamp != null)
                              Text(
                                formatFullDateTime(item.timestamp!),
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.7),
                                  fontSize: 12,
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (count > 1)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${_current + 1} / $count',
                            style: const TextStyle(
                                color: Colors.white, fontSize: 13),
                          ),
                        ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.download_rounded, color: Colors.white),
                        onPressed: _saveMedia,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Page indicator dots ────────────────────────
          if (count > 1 && count <= 20)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  count,
                  (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _current ? 8 : 6,
                    height: i == _current ? 8 : 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _current
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.4),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MediaPage extends StatelessWidget {
  const _MediaPage({required this.item});
  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    if (item.isVideo) {
      return _VideoPage(item: item);
    }
    return Center(
      child: InteractiveViewer(
        minScale: 0.5,
        maxScale: 5,
        child: item.isNetwork
            ? CachedNetworkImage(
                imageUrl: item.url,
                fit: BoxFit.contain,
                placeholder: (_, _) => const Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
                errorWidget: (_, _, _) => const Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.broken_image_outlined,
                        color: Colors.white54, size: 48),
                    SizedBox(height: 8),
                    Text('Could not load image'.tr(context),
                        style: TextStyle(color: Colors.white54)),
                  ],
                ),
              )
            : Image.file(File(item.url), fit: BoxFit.contain),
      ),
    );
  }
}

class _VideoPage extends StatefulWidget {
  final MediaItem item;
  const _VideoPage({required this.item});

  @override
  State<_VideoPage> createState() => _VideoPageState();
}

class _VideoPageState extends State<_VideoPage> {
  late VideoPlayerController _controller;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _controller = widget.item.isNetwork 
      ? VideoPlayerController.networkUrl(Uri.parse(widget.item.url))
      : VideoPlayerController.file(File(widget.item.url));
    _controller.initialize().then((_) {
      if (mounted) {
        setState(() { _initialized = true; });
        _controller.play();
        _controller.setLooping(true);
      }
    }).catchError((e) {
      debugPrint("Video error: $e");
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    return Center(
      child: AspectRatio(
        aspectRatio: _controller.value.aspectRatio,
        child: Stack(
          alignment: Alignment.center,
          children: [
            VideoPlayer(_controller),
            GestureDetector(
              onTap: () {
                setState(() {
                  _controller.value.isPlaying ? _controller.pause() : _controller.play();
                });
              },
              child: Container(
                color: Colors.transparent,
                child: Center(
                  child: !_controller.value.isPlaying
                      ? Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 48),
                        )
                      : const SizedBox.shrink(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
