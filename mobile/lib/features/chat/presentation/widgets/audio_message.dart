import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

/// Inline audio player for voice-note bubbles: play/pause, progress, time.
/// Loads lazily on first play to avoid spinning up a player per bubble.
class AudioMessage extends StatefulWidget {
  const AudioMessage({super.key, required this.url, required this.fg});

  final String url;
  final Color fg;

  @override
  State<AudioMessage> createState() => _AudioMessageState();
}

class _AudioMessageState extends State<AudioMessage> {
  AudioPlayer? _player;
  bool _loading = false;

  bool get _isLocal => !widget.url.startsWith('http');

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  Future<void> _ensureLoaded() async {
    if (_player != null) return;
    setState(() => _loading = true);
    final player = AudioPlayer();
    try {
      if (_isLocal) {
        await player.setFilePath(widget.url);
      } else {
        await player.setUrl(widget.url);
      }
      player.playerStateStream.listen((s) {
        if (s.processingState == ProcessingState.completed) {
          player.seek(Duration.zero);
          player.pause();
        }
      });
      _player = player;
    } catch (_) {
      player.dispose();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle() async {
    await _ensureLoaded();
    final player = _player;
    if (player == null) return;
    if (player.playing) {
      await player.pause();
    } else {
      await player.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    final fg = widget.fg;
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 180, maxWidth: 240),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            _PlayButton(
              loading: _loading,
              player: _player,
              fg: fg,
              onTap: _toggle,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _Progress(player: _player, fg: fg),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlayButton extends StatelessWidget {
  const _PlayButton({
    required this.loading,
    required this.player,
    required this.fg,
    required this.onTap,
  });
  final bool loading;
  final AudioPlayer? player;
  final Color fg;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return SizedBox(
        width: 32,
        height: 32,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: CircularProgressIndicator(strokeWidth: 2, color: fg),
        ),
      );
    }
    return StreamBuilder<PlayerState>(
      stream: player?.playerStateStream,
      builder: (context, snapshot) {
        final playing = snapshot.data?.playing ?? false;
        return InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Icon(
            playing ? Icons.pause_circle_filled : Icons.play_circle_fill,
            color: fg,
            size: 32,
          ),
        );
      },
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.player, required this.fg});
  final AudioPlayer? player;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Duration>(
      stream: player?.positionStream,
      builder: (context, posSnap) {
        final pos = posSnap.data ?? Duration.zero;
        final dur = player?.duration ?? Duration.zero;
        final progress = dur.inMilliseconds == 0
            ? 0.0
            : (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 3,
                backgroundColor: fg.withValues(alpha: 0.25),
                valueColor: AlwaysStoppedAnimation(fg),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              _fmt(dur == Duration.zero ? pos : (player!.playing ? pos : dur)),
              style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 11),
            ),
          ],
        );
      },
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString();
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
