import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/utils/time_format.dart';

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
  });
  final String url;
  final String senderName;
  final DateTime? timestamp;

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
            itemBuilder: (_, i) => _ZoomablePage(item: widget.items[i]),
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

class _ZoomablePage extends StatelessWidget {
  const _ZoomablePage({required this.item});
  final MediaItem item;

  @override
  Widget build(BuildContext context) {
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
                  children: [
                    Icon(Icons.broken_image_outlined,
                        color: Colors.white54, size: 48),
                    SizedBox(height: 8),
                    Text('Could not load image',
                        style: TextStyle(color: Colors.white54)),
                  ],
                ),
              )
            : Image.file(File(item.url), fit: BoxFit.contain),
      ),
    );
  }
}
