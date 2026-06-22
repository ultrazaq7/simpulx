import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../controllers/voice_recorder.dart';

/// Bottom message input: text, attachments, quick replies, suggested reply
/// (streamed), and push-to-record voice notes.
class MessageComposer extends StatefulWidget {
  const MessageComposer({
    super.key,
    required this.onSend,
    this.onPickQuickReply,
    this.onAttach,
    this.onSuggestReply,
    this.onSendVoice,
  });

  final void Function(String text) onSend;
  final Future<String?> Function()? onPickQuickReply;
  final VoidCallback? onAttach;
  final Stream<String> Function()? onSuggestReply;

  /// Called with the recorded voice-note file path when sent.
  final void Function(String path)? onSendVoice;

  @override
  State<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends State<MessageComposer> {
  final _controller = TextEditingController();
  final _voice = VoiceRecorder();
  bool _canSend = false;
  bool _suggesting = false;
  StreamSubscription<String>? _suggestSub;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final can = _controller.text.trim().isNotEmpty;
      if (can != _canSend) setState(() => _canSend = can);
    });
    _voice.addListener(_onVoiceChanged);
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _suggestSub?.cancel();
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  Future<void> _pickQuickReply() async {
    final picked = await widget.onPickQuickReply?.call();
    if (picked == null || picked.isEmpty) return;
    final existing = _controller.text;
    _controller.text =
        existing.isEmpty ? picked : '$existing $picked'.trimLeft();
    _controller.selection =
        TextSelection.collapsed(offset: _controller.text.length);
  }

  void _suggest() {
    if (_suggesting) {
      _suggestSub?.cancel();
      setState(() => _suggesting = false);
      return;
    }
    final source = widget.onSuggestReply;
    if (source == null) return;
    setState(() => _suggesting = true);
    _controller.clear();
    _suggestSub = source().listen(
      (delta) {
        _controller.text += delta;
        _controller.selection =
            TextSelection.collapsed(offset: _controller.text.length);
      },
      onError: (_) {
        if (!mounted) return;
        setState(() => _suggesting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not generate a suggestion')),
        );
      },
      onDone: () {
        if (mounted) setState(() => _suggesting = false);
      },
      cancelOnError: true,
    );
  }

  Future<void> _startRecording() async {
    final ok = await _voice.start();
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Microphone permission is required')),
      );
    }
  }

  Future<void> _stopAndSend() async {
    final path = await _voice.stop();
    if (path != null) widget.onSendVoice?.call(path);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          child: _voice.recording ? _recordingBar() : _inputBar(),
        ),
      ),
    );
  }

  Widget _inputBar() {
    final showMic = !_canSend && widget.onSendVoice != null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        IconButton(
          icon: const Icon(Icons.add_circle_outline_rounded),
          color: AppColors.textSecondary,
          onPressed: widget.onAttach,
          tooltip: 'Attach',
        ),
        if (widget.onSuggestReply != null)
          IconButton(
            icon: Icon(_suggesting
                ? Icons.stop_circle_outlined
                : Icons.auto_awesome_outlined),
            color: _suggesting ? AppColors.primary : AppColors.textSecondary,
            onPressed: _suggest,
            tooltip: 'Suggest reply',
          ),
        Expanded(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 120),
            child: TextField(
              controller: _controller,
              minLines: 1,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              decoration: InputDecoration(
                hintText: 'Message',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                suffixIcon: widget.onPickQuickReply == null
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.bolt_outlined, size: 20),
                        color: AppColors.textSecondary,
                        onPressed: _pickQuickReply,
                        tooltip: 'Quick replies',
                      ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        showMic
            ? _RoundButton(
                icon: Icons.mic_rounded,
                filled: false,
                onTap: _startRecording,
              )
            : _RoundButton(
                icon: Icons.send_rounded,
                filled: _canSend,
                onTap: _canSend ? _send : null,
              ),
      ],
    );
  }

  Widget _recordingBar() {
    final m = _voice.elapsed.inMinutes.remainder(60).toString();
    final s =
        _voice.elapsed.inSeconds.remainder(60).toString().padLeft(2, '0');
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.delete_outline_rounded),
          color: AppColors.danger,
          onPressed: _voice.cancel,
          tooltip: 'Cancel',
        ),
        const _PulsingDot(),
        const SizedBox(width: 8),
        Text('$m:$s',
            style: const TextStyle(
                fontWeight: FontWeight.w600, fontFeatures: [])),
        const Spacer(),
        const Text('Recording...',
            style: TextStyle(color: AppColors.textSecondary)),
        const SizedBox(width: 8),
        _RoundButton(icon: Icons.send_rounded, filled: true, onTap: _stopAndSend),
      ],
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.filled,
    required this.onTap,
  });
  final IconData icon;
  final bool filled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? AppColors.primary : AppColors.surfaceAlt,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Icon(
            icon,
            size: 20,
            color: filled ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.35, end: 1).animate(_c),
      child: Container(
        width: 12,
        height: 12,
        decoration: const BoxDecoration(
          color: AppColors.danger,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
