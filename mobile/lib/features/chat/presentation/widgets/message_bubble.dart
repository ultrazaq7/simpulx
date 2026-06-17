// ============================================================
// Message Bubble Widget - Chat Message Display
// ============================================================
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:just_audio/just_audio.dart' as ja;
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/features/chat/presentation/widgets/web_download_stub.dart'
    if (dart.library.html) 'package:simpulx/features/chat/presentation/widgets/web_download_web.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/presentation/widgets/media_gallery_viewer.dart';
import 'package:simpulx/features/chat/presentation/widgets/web_audio_helper_stub.dart'
    if (dart.library.html) 'package:simpulx/features/chat/presentation/widgets/web_audio_helper_web.dart';

class MessageBubble extends StatefulWidget {
  final MessageEntity message;

  /// All messages in the conversation - used for gallery navigation.
  final List<MessageEntity> allMessages;

  const MessageBubble({
    super.key,
    required this.message,
    this.allMessages = const [],
  });

  @override
  State<MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<MessageBubble> {
  bool _hovered = false;

  MessageEntity get message => widget.message;
  List<MessageEntity> get allMessages => widget.allMessages;

  static const String _mediaHost = kIsWeb ? '' : 'http://10.0.2.2:8080';

  bool get _isDesktop {
    if (kIsWeb) return true;
    return defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.macOS ||
        defaultTargetPlatform == TargetPlatform.linux;
  }

  String? _resolveMediaUrl() {
    final url = message.mediaUrl;
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return '$_mediaHost$url';
    // Raw ID (unresolved) - not downloadable directly
    return null;
  }

  String _displayFilename() {
    final name = message.mediaFilename;
    if (name != null && name.isNotEmpty) return name;
    final url = message.mediaUrl ?? '';
    final idx = url.lastIndexOf('/');
    return idx >= 0 ? url.substring(idx + 1) : 'attachment';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // ── System messages (assignment, status changes) ──
    if (message.senderType == 'system') {
      return _buildSystemMessage(theme);
    }

    final isOutbound = message.isOutbound;
    final screenWidth = MediaQuery.of(context).size.width;
    final resolvedUrl = _resolveMediaUrl();
    final type = message.type;
    final displayContent = _displayContent();
    final hasMedia = type != 'text' && resolvedUrl != null;
    final isImageType = type == 'image' || type == 'sticker';
    final hasCaption = displayContent != null &&
        displayContent.isNotEmpty &&
        !(type == 'document' && displayContent == message.mediaFilename) &&
        !(type == 'audio' && displayContent == message.mediaFilename);

    final timeStr = AppDateTime.time(message.createdAt);

    // Timestamp + status row (inside bubble)
    Widget timestampRow = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          timeStr,
          style: TextStyle(
            fontSize: 10,
            color: (isOutbound ? Colors.white : theme.colorScheme.onSurface)
                .withValues(alpha: 0.50),
          ),
        ),
        if (isOutbound) ...[
          const SizedBox(width: 3),
          _buildStatusIcon(message.status, theme),
        ],
      ],
    );

    // For text-only messages, use inline timestamp like WhatsApp
    final bool isTextOnly = type == 'text' && hasCaption && !hasMedia;

    final selectionColor = isOutbound
        ? Colors.white.withValues(alpha: 0.35)
        : const Color(0xFF166534).withValues(alpha: 0.25);

    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: screenWidth < 700 ? screenWidth * 0.72 : 420,
      ),
      child: DefaultSelectionStyle(
        selectionColor: selectionColor,
        cursorColor: isOutbound ? Colors.white : const Color(0xFF166534),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 3),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: isOutbound
                ? const Color(0xFF166534) // Dark Green for Outbound (v2 style)
                : theme.colorScheme.surface,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(12),
              topRight: const Radius.circular(12),
              bottomLeft: Radius.circular(isOutbound ? 12 : 4),
              bottomRight: Radius.circular(isOutbound ? 4 : 12),
            ),
            border: isOutbound
                ? null
                : Border.all(
                    color: theme.dividerColor.withValues(alpha: 0.5),
                  ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: isTextOnly
              // ── Text-only: inline timestamp (WhatsApp style) ──
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
                  child: Wrap(
                    alignment: WrapAlignment.end,
                    crossAxisAlignment: WrapCrossAlignment.end,
                    spacing: 4,
                    children: [
                      _selectableText(
                        displayContent,
                        TextStyle(
                          color: isOutbound
                              ? Colors.white
                              : theme.colorScheme.onSurface,
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 1),
                        child: timestampRow,
                      ),
                    ],
                  ),
                )
              // ── Media messages: keep original column layout ──
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (hasMedia && isImageType)
                      _buildImage(context, resolvedUrl, isOutbound),
                    if (hasMedia && type == 'video')
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                        child: _buildVideo(context, resolvedUrl, isOutbound),
                      ),
                    if (hasMedia && type == 'audio')
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                        child: _buildAudio(context, resolvedUrl, isOutbound),
                      ),
                    if (hasMedia && type == 'document')
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                        child: _buildDocument(context, resolvedUrl, isOutbound),
                      ),
                    if (_isMediaType(type) && resolvedUrl == null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                        child: _buildUnavailable(isOutbound),
                      ),
                    if (hasCaption)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _selectableText(
                              displayContent,
                              TextStyle(
                                color: isOutbound
                                    ? Colors.white
                                    : theme.colorScheme.onSurface,
                                fontSize: 14,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Align(
                              alignment: Alignment.bottomRight,
                              child: timestampRow,
                            ),
                          ],
                        ),
                      ),
                    if (!hasCaption)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 4, 10, 6),
                        child: Align(
                          alignment: Alignment.bottomRight,
                          child: timestampRow,
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );

    final kebab = _MessageActionsButton(
      visible: _hovered,
      onCopy: () => _copyMessageText(context),
    );

    final rowChildren = isOutbound
        ? [kebab, const SizedBox(width: 4), Flexible(child: bubble)]
        : [Flexible(child: bubble), const SizedBox(width: 4), kebab];

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: rowChildren,
    );

    if (_isDesktop) {
      content = MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: content,
      );
    } else {
      // Mobile: long-press bubble to copy text
      content = GestureDetector(
        behavior: HitTestBehavior.opaque,
        onLongPress: () => _copyMessageText(context),
        child: content,
      );
    }

    return Align(
      alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: EdgeInsets.only(
          left: isOutbound ? 64 : 0,
          right: isOutbound ? 0 : 64,
        ),
        child: content,
      ),
    );
  }

  Future<void> _copyMessageText(BuildContext context) async {
    final text = _displayContent();
    if (text == null || text.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!context.mounted) return;
    AppSnackbar.success(context, 'Copied to clipboard');
  }

  /// Desktop: wrap in SelectionArea for drag-select + right-click copy.
  /// Mobile: plain Text (selection handles are buggy on colored bubbles);
  /// user can long-press the bubble to copy.
  Widget _selectableText(String text, TextStyle style) {
    final child = Text(text, style: style);
    if (_isDesktop) return SelectionArea(child: child);
    return child;
  }

  String? _displayContent() {
    final content = message.content;
    if (content == null) return null;
    if (content.startsWith('[Unsupported:')) {
      return 'Unsupported WhatsApp message';
    }
    return content;
  }

  Widget _buildImage(BuildContext context, String url, bool isOutbound) {
    return GestureDetector(
      onTap: () {
        if (allMessages.isNotEmpty) {
          MediaGalleryViewer.show(
            context,
            allMessages: allMessages,
            initialMessage: message,
          );
        } else {
          _openUrl(url);
        }
      },
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320, maxHeight: 220),
        child: Image.network(
          url,
          fit: BoxFit.cover,
          width: double.infinity,
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return Container(
              width: double.infinity,
              height: 160,
              alignment: Alignment.center,
              color: Colors.black.withValues(alpha: 0.04),
              child: const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            );
          },
          errorBuilder: (_, __, ___) => _fallbackBox(
            isOutbound,
            Icons.broken_image_rounded,
            'Image unavailable',
          ),
        ),
      ),
    );
  }

  Widget _buildVideo(BuildContext context, String url, bool isOutbound) {
    final filename = _displayFilename();
    return _attachmentTile(
      context,
      icon: Icons.play_circle_outline_rounded,
      filename: filename,
      subtitle: 'Video · Tap to open',
      url: url,
      isOutbound: isOutbound,
    );
  }

  Widget _buildAudio(BuildContext context, String url, bool isOutbound) {
    return _InlineAudioPlayer(
      url: url,
      isOutbound: isOutbound,
    );
  }

  Widget _buildDocument(BuildContext context, String url, bool isOutbound) {
    final filename = _displayFilename();
    return _attachmentTile(
      context,
      icon: Icons.insert_drive_file_rounded,
      filename: filename,
      subtitle: 'Document · Tap to download',
      url: url,
      isOutbound: isOutbound,
    );
  }

  Widget _attachmentTile(
    BuildContext context, {
    required IconData icon,
    required String filename,
    required String subtitle,
    required String url,
    required bool isOutbound,
  }) {
    final fg =
        isOutbound ? Colors.white : Theme.of(context).colorScheme.onSurface;
    final bg = isOutbound
        ? Colors.white.withValues(alpha: 0.14)
        : const Color(0xFF166534).withValues(alpha: 0.08);
    return InkWell(
      onTap: () => _openUrl(url),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        constraints: const BoxConstraints(minWidth: 220),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 28, color: fg.withValues(alpha: 0.9)),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    filename,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: fg,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: fg.withValues(alpha: 0.65),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              Icons.download_rounded,
              size: 18,
              color: fg.withValues(alpha: 0.8),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUnavailable(bool isOutbound) {
    return _fallbackBox(
      isOutbound,
      Icons.cloud_off_rounded,
      'Attachment unavailable',
    );
  }

  bool _isMediaType(String type) {
    switch (type) {
      case 'image':
      case 'video':
      case 'audio':
      case 'document':
      case 'sticker':
        return true;
      default:
        return false;
    }
  }

  Widget _fallbackBox(bool isOutbound, IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color:
            (isOutbound ? Colors.white : Colors.black).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 18,
            color: isOutbound ? Colors.white70 : Colors.black54,
          ),
          const SizedBox(width: 8),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              color: isOutbound ? Colors.white70 : Colors.black54,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openUrl(String url) async {
    if (kIsWeb) {
      webDownloadFile(url, _displayFilename());
      return;
    }
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _buildStatusIcon(String status, ThemeData theme) {
    IconData icon;
    Color color;

    switch (status) {
      case 'sent':
        icon = Icons.check;
        color = Colors.white.withValues(alpha: 0.55);
        break;
      case 'delivered':
        icon = Icons.done_all;
        color = Colors.white.withValues(alpha: 0.55);
        break;
      case 'read':
        icon = Icons.done_all;
        color = const Color(0xFF48DBFB);
        break;
      case 'failed':
        icon = Icons.error_outline;
        color = const Color(0xFFEF4444);
        break;
      default:
        icon = Icons.access_time;
        color = Colors.white.withValues(alpha: 0.40);
    }

    return Icon(icon, size: 14, color: color);
  }

  Widget _buildSystemMessage(ThemeData theme) {
    final content = message.content ?? '';

    // Parse **bold** segments
    final spans = <InlineSpan>[];
    final regex = RegExp(r'\*\*(.+?)\*\*');
    int lastEnd = 0;
    for (final match in regex.allMatches(content)) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(
          text: content.substring(lastEnd, match.start),
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
          ),
        ));
      }
      spans.add(TextSpan(
        text: match.group(1),
        style: theme.textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w700,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
        ),
      ));
      lastEnd = match.end;
    }
    if (lastEnd < content.length) {
      spans.add(TextSpan(
        text: content.substring(lastEnd),
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
        ),
      ));
    }

    final timeStr = '${message.createdAt.month.toString().padLeft(2, '0')}/'
        '${message.createdAt.day.toString().padLeft(2, '0')}/'
        '${message.createdAt.year} '
        '${AppDateTime.time(message.createdAt)}';

    return Align(
      alignment: Alignment.center,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF166534).withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RichText(text: TextSpan(children: spans)),
            const SizedBox(height: 3),
            Text(
              timeStr,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.38),
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// Inline Audio Player - plays audio within the chat bubble
// ═══════════════════════════════════════════════════════════
class _InlineAudioPlayer extends StatefulWidget {
  final String url;
  final bool isOutbound;

  const _InlineAudioPlayer({required this.url, required this.isOutbound});

  @override
  State<_InlineAudioPlayer> createState() => _InlineAudioPlayerState();
}

class _InlineAudioPlayerState extends State<_InlineAudioPlayer> {
  bool _isPlaying = false;
  bool _hasError = false;
  double _position = 0; // 0..1
  Duration _duration = Duration.zero;
  Duration _current = Duration.zero;
  WebAudioHelper? _webHelper;
  ja.AudioPlayer? _nativePlayer;
  final List<StreamSubscription> _subs = [];

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      _webHelper = createAudioHelper();
      _webHelper!.init(widget.url);
      _subs.add(_webHelper!.positionStream.listen((pos) {
        if (mounted) {
          setState(() {
            _position = pos;
            _current = _webHelper!.currentTime;
          });
        }
      }));
      _subs.add(_webHelper!.durationStream.listen((dur) {
        if (mounted) setState(() => _duration = dur);
      }));
      _subs.add(_webHelper!.playingStream.listen((playing) {
        if (mounted) setState(() => _isPlaying = playing);
      }));
      _subs.add(_webHelper!.errorStream.listen((_) {
        if (mounted) {
          setState(() {
            _hasError = true;
            _isPlaying = false;
          });
        }
      }));
    } else {
      _nativePlayer = ja.AudioPlayer();
      _initNativePlayer();
    }
  }

  Future<void> _initNativePlayer() async {
    try {
      await _nativePlayer!.setUrl(widget.url);
      _subs.add(_nativePlayer!.durationStream.listen((dur) {
        if (mounted && dur != null) setState(() => _duration = dur);
      }));
      _subs.add(_nativePlayer!.positionStream.listen((pos) {
        if (mounted) {
          final total = _duration.inMilliseconds;
          setState(() {
            _current = pos;
            _position = total > 0 ? pos.inMilliseconds / total : 0;
          });
        }
      }));
      _subs.add(_nativePlayer!.playerStateStream.listen((state) {
        if (mounted) {
          setState(() {
            _isPlaying = state.playing;
            if (state.processingState == ja.ProcessingState.completed) {
              _isPlaying = false;
              _position = 0;
              _current = Duration.zero;
              _nativePlayer!.seek(Duration.zero);
              _nativePlayer!.pause();
            }
          });
        }
      }));
    } catch (_) {
      if (mounted) setState(() => _hasError = true);
    }
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      sub.cancel();
    }
    _webHelper?.dispose();
    _nativePlayer?.dispose();
    super.dispose();
  }

  Future<void> _togglePlay() async {
    if (_hasError) {
      await _openAudioExternally();
      return;
    }
    if (kIsWeb) {
      if (_webHelper == null) {
        await _openAudioExternally();
        return;
      }
      if (_isPlaying) {
        _webHelper!.pause();
      } else {
        final started = await _webHelper!.play();
        if (!started && mounted) setState(() => _hasError = true);
      }
    } else {
      if (_nativePlayer == null) return;
      if (_isPlaying) {
        _nativePlayer!.pause();
      } else {
        try {
          await _nativePlayer!.play();
        } catch (_) {
          if (mounted) setState(() => _hasError = true);
        }
      }
    }
  }

  Future<void> _openAudioExternally() async {
    final uri = Uri.parse(widget.url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final fg = widget.isOutbound
        ? Colors.white
        : Theme.of(context).colorScheme.onSurface;
    final accent = widget.isOutbound
        ? Colors.white
        : const Color(0xFF166534);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Play/Pause button
        GestureDetector(
          onTap: () => _togglePlay(),
          child: Icon(
            _hasError
                ? Icons.open_in_new_rounded
                : _isPlaying
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
            color: accent,
            size: 32,
          ),
        ),
        const SizedBox(width: 8),
        // Progress bar + duration
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SliderTheme(
                data: SliderThemeData(
                  trackHeight: 3,
                  thumbShape: const RoundSliderThumbShape(
                    enabledThumbRadius: 5,
                  ),
                  overlayShape: const RoundSliderOverlayShape(
                    overlayRadius: 10,
                  ),
                  activeTrackColor: accent,
                  inactiveTrackColor: fg.withValues(alpha: 0.15),
                  thumbColor: accent,
                ),
                child: Slider(
                  value: _position.clamp(0.0, 1.0),
                  onChanged: _hasError
                      ? null
                      : (v) {
                          if (kIsWeb) {
                            _webHelper?.seek(v);
                          } else if (_nativePlayer != null &&
                              _duration.inMilliseconds > 0) {
                            _nativePlayer!.seek(Duration(
                                milliseconds:
                                    (v * _duration.inMilliseconds).round()));
                          }
                        },
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  _hasError
                      ? 'Audio unavailable'
                      : '${_formatDuration(_current)} / ${_formatDuration(_duration)}',
                  style: TextStyle(
                    fontSize: 11,
                    color: fg.withValues(alpha: 0.55),
                  ),
                ),
              ),
            ],
          ),
        ),
        Icon(
          Icons.volume_up_rounded,
          size: 20,
          color: fg.withValues(alpha: 0.4),
        ),
      ],
    );
  }
}

class _MessageActionsButton extends StatelessWidget {
  final bool visible;
  final VoidCallback onCopy;

  const _MessageActionsButton({
    required this.visible,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedOpacity(
      opacity: visible ? 1.0 : 0.0,
      duration: const Duration(milliseconds: 120),
      child: IgnorePointer(
        ignoring: !visible,
        child: SizedBox(
          width: 28,
          height: 28,
          child: PopupMenuButton<String>(
            tooltip: 'More',
            padding: EdgeInsets.zero,
            iconSize: 18,
            splashRadius: 18,
            position: PopupMenuPosition.under,
            icon: Icon(
              Icons.more_horiz_rounded,
              size: 18,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            onSelected: (value) {
              if (value == 'copy') onCopy();
            },
            itemBuilder: (context) => const [
              PopupMenuItem<String>(
                value: 'copy',
                height: 40,
                child: Row(
                  children: [
                    Icon(Icons.copy_rounded, size: 16),
                    SizedBox(width: 10),
                    Text('Copy message', style: TextStyle(fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
