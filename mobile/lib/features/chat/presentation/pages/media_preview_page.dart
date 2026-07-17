import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../domain/entities/message.dart';

/// One picked file awaiting send.
class MediaPreviewItem {
  MediaPreviewItem(this.path, this.name, this.type);
  final String path;
  final String name;
  final MessageType type;
}

/// Result of the preview screen: the caption plus the (possibly-trimmed) items.
class MediaPreviewResult {
  MediaPreviewResult(this.caption, this.items);
  final String caption;
  final List<MediaPreviewItem> items;
}

/// WhatsApp-style "review before send" for picked media/documents: shows a large
/// preview + a caption field + a send button, instead of firing off immediately.
/// Pops [MediaPreviewResult] on send, or null on cancel.
class MediaPreviewPage extends StatefulWidget {
  const MediaPreviewPage({super.key, required this.items});
  final List<MediaPreviewItem> items;

  @override
  State<MediaPreviewPage> createState() => _MediaPreviewPageState();
}

class _MediaPreviewPageState extends State<MediaPreviewPage> {
  late List<MediaPreviewItem> _items;
  int _current = 0;
  final _caption = TextEditingController();

  @override
  void initState() {
    super.initState();
    _items = [...widget.items];
  }

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  void _remove(int i) {
    setState(() {
      _items.removeAt(i);
      if (_items.isEmpty) {
        Navigator.of(context).pop();
        return;
      }
      _current = _current.clamp(0, _items.length - 1);
    });
  }

  void _send() => Navigator.of(context).pop(MediaPreviewResult(_caption.text.trim(), _items));

  @override
  Widget build(BuildContext context) {
    if (_items.isEmpty) return const SizedBox.shrink();
    final item = _items[_current.clamp(0, _items.length - 1)];
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: _items.length > 1
            ? Text('{n} items'.trp(context, {'n': _items.length}),
                style: const TextStyle(fontSize: 15, color: Colors.white))
            : null,
      ),
      body: Column(
        children: [
          Expanded(child: Center(child: _preview(item))),
          if (_items.length > 1)
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                itemCount: _items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final it = _items[i];
                  final selected = i == _current;
                  return GestureDetector(
                    onTap: () => setState(() => _current = i),
                    child: Stack(
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: selected ? AppColors.primary : Colors.white24,
                                width: selected ? 2 : 1),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: it.type == MessageType.image
                              ? Image.file(File(it.path), fit: BoxFit.cover)
                              : Container(
                                  color: Colors.white10,
                                  child: Icon(
                                      it.type == MessageType.video
                                          ? Icons.videocam_outlined
                                          : Icons.insert_drive_file_outlined,
                                      color: Colors.white54)),
                        ),
                        Positioned(
                          right: -4,
                          top: -4,
                          child: GestureDetector(
                            onTap: () => _remove(i),
                            child: const CircleAvatar(
                                radius: 9,
                                backgroundColor: Colors.black87,
                                child: Icon(Icons.close_rounded, size: 12, color: Colors.white)),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _caption,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Add a caption...'.tr(context),
                        hintStyle: const TextStyle(color: Colors.white54),
                        filled: true,
                        fillColor: Colors.white12,
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FloatingActionButton(
                    mini: true,
                    heroTag: 'mediaSend',
                    backgroundColor: AppColors.primary,
                    onPressed: _send,
                    child: const Icon(Icons.send_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _preview(MediaPreviewItem item) {
    switch (item.type) {
      case MessageType.image:
        return InteractiveViewer(
            child: Image.file(File(item.path), fit: BoxFit.contain));
      case MessageType.video:
        // Key by path so switching thumbnails rebuilds a fresh player.
        return _VideoPreview(key: ValueKey(item.path), path: item.path);
      default:
        return _iconPreview(Icons.insert_drive_file_outlined, item.name);
    }
  }

  Widget _iconPreview(IconData icon, String name) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white70, size: 80),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white70, fontSize: 14)),
          ),
        ],
      );
}

/// Plays a locally-picked video in the pre-send preview: shows the first frame
/// once initialized, tap to play/pause, with a spinner while it loads and a
/// clear error state instead of a blank screen if the file can't be decoded.
class _VideoPreview extends StatefulWidget {
  const _VideoPreview({super.key, required this.path});
  final String path;

  @override
  State<_VideoPreview> createState() => _VideoPreviewState();
}

class _VideoPreviewState extends State<_VideoPreview> {
  late final VideoPlayerController _controller;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(widget.path))
      ..initialize().then((_) {
        if (mounted) setState(() => _ready = true);
      }).catchError((_) {
        if (mounted) setState(() => _failed = true);
      });
    _controller.addListener(() {
      if (mounted) setState(() {}); // reflect play/pause on the overlay
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _toggle() {
    if (!_ready) return;
    setState(() {
      _controller.value.isPlaying ? _controller.pause() : _controller.play();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.videocam_off_outlined, color: Colors.white70, size: 72),
          SizedBox(height: 12),
          Text('Preview unavailable',
              style: TextStyle(color: Colors.white70, fontSize: 14)),
        ],
      );
    }
    if (!_ready) {
      return const SizedBox(
        height: 64,
        width: 64,
        child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 2),
      );
    }
    final playing = _controller.value.isPlaying;
    return GestureDetector(
      onTap: _toggle,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AspectRatio(
            aspectRatio: _controller.value.aspectRatio == 0
                ? 16 / 9
                : _controller.value.aspectRatio,
            child: VideoPlayer(_controller),
          ),
          AnimatedOpacity(
            opacity: playing ? 0 : 1,
            duration: const Duration(milliseconds: 150),
            child: Container(
              decoration: const BoxDecoration(
                  color: Colors.black38, shape: BoxShape.circle),
              padding: const EdgeInsets.all(12),
              child: const Icon(Icons.play_arrow_rounded,
                  color: Colors.white, size: 44),
            ),
          ),
        ],
      ),
    );
  }
}
