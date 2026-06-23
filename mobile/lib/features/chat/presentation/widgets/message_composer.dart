import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../domain/entities/lead_lookups.dart';
import '../controllers/chat_actions_providers.dart';
import '../controllers/chat_providers.dart';
import '../controllers/voice_recorder.dart';

/// Bottom message input: text, attachments, push-to-record voice, and an inline
/// quick-reply popup triggered by typing "/" (WhatsApp-style).
class MessageComposer extends ConsumerStatefulWidget {
  const MessageComposer({
    super.key,
    required this.onSend,
    this.onAttach,
    this.onSendVoice,
  });

  final void Function(String text) onSend;
  final VoidCallback? onAttach;

  /// Called with the recorded voice-note file path when sent.
  final void Function(String path)? onSendVoice;

  @override
  ConsumerState<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends ConsumerState<MessageComposer> {
  final _controller = TextEditingController();
  final _voice = VoiceRecorder();
  bool _canSend = false;
  String? _slashQuery; // non-null while the text is a "/..." shortcut query

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTextChanged);
    _voice.addListener(_onVoiceChanged);
  }

  void _onTextChanged() {
    final text = _controller.text;
    final can = text.trim().isNotEmpty;
    final query = text.startsWith('/') ? text.substring(1).toLowerCase() : null;
    if (can != _canSend || query != _slashQuery) {
      setState(() {
        _canSend = can;
        _slashQuery = query;
      });
    }
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
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

  void _applyQuickReply(QuickReply reply) {
    _controller.text = reply.body;
    _controller.selection =
        TextSelection.collapsed(offset: _controller.text.length);
    setState(() => _slashQuery = null);
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_slashQuery != null && !_voice.recording)
              _QuickReplyPopup(
                query: _slashQuery!,
                onPick: _applyQuickReply,
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              child: _voice.recording ? _recordingBar() : _inputBar(),
            ),
          ],
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
        Expanded(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 120),
            child: TextField(
              controller: _controller,
              minLines: 1,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              decoration: const InputDecoration(
                hintText: 'Message  (type / for quick replies)',
                isDense: true,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        showMic
            ? _RoundButton(
                icon: Icons.mic_rounded, filled: false, onTap: _startRecording)
            : _RoundButton(
                icon: Icons.send_rounded,
                filled: _canSend,
                onTap: _canSend ? _send : null),
      ],
    );
  }

  Widget _recordingBar() {
    final m = _voice.elapsed.inMinutes.remainder(60).toString();
    final s = _voice.elapsed.inSeconds.remainder(60).toString().padLeft(2, '0');
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
        Text('$m:$s', style: const TextStyle(fontWeight: FontWeight.w600)),
        const Spacer(),
        const Text('Recording...',
            style: TextStyle(color: AppColors.textSecondary)),
        const SizedBox(width: 8),
        _RoundButton(
            icon: Icons.send_rounded, filled: true, onTap: _stopAndSend),
      ],
    );
  }
}

/// Inline filtered quick-reply list shown above the input when typing "/".
class _QuickReplyPopup extends ConsumerWidget {
  const _QuickReplyPopup({required this.query, required this.onPick});
  final String query;
  final void Function(QuickReply) onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(quickRepliesProvider).value ?? const [];
    final matches = query.isEmpty
        ? all
        : all
            .where((q) =>
                q.shortcut.toLowerCase().contains(query) ||
                q.title.toLowerCase().contains(query) ||
                q.body.toLowerCase().contains(query))
            .toList();

    return Container(
      constraints: const BoxConstraints(maxHeight: 240),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: ListView(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        children: [
          ListTile(
            dense: true,
            leading: const Icon(Icons.add_rounded, color: AppColors.primary),
            title: const Text('New shortcut',
                style: TextStyle(
                    color: AppColors.primary, fontWeight: FontWeight.w700)),
            onTap: () => showCreateShortcut(context, ref),
          ),
          if (matches.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Center(
                child: Text('No shortcuts yet, add one above.',
                    style: TextStyle(color: AppColors.textSecondary)),
              ),
            )
          else
            for (final q in matches)
              ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                  child: const Text('/',
                      style: TextStyle(
                          color: AppColors.primaryDark,
                          fontWeight: FontWeight.w700,
                          fontSize: 12)),
                ),
                title: Text(q.shortcut.isNotEmpty ? '/${q.shortcut}' : q.title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13)),
                subtitle:
                    Text(q.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () => onPick(q),
              ),
        ],
      ),
    );
  }
}

/// Create-shortcut form (shortcut / title / message), mirroring the web.
Future<void> showCreateShortcut(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
      child: _CreateShortcutForm(parentRef: ref),
    ),
  );
}

class _CreateShortcutForm extends StatefulWidget {
  const _CreateShortcutForm({required this.parentRef});
  final WidgetRef parentRef;

  @override
  State<_CreateShortcutForm> createState() => _CreateShortcutFormState();
}

class _CreateShortcutFormState extends State<_CreateShortcutForm> {
  final _shortcut = TextEditingController();
  final _title = TextEditingController();
  final _body = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _shortcut.dispose();
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final shortcut = _shortcut.text.trim();
    final body = _body.text.trim();
    if (shortcut.isEmpty || body.isEmpty) return;
    setState(() => _saving = true);
    final result = await widget.parentRef
        .read(chatRepositoryProvider)
        .createQuickReply(
          shortcut: shortcut,
          title: _title.text.trim(),
          body: body,
        );
    if (!mounted) return;
    result.fold(
      (f) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(f.message)));
      },
      (_) {
        widget.parentRef.invalidate(quickRepliesProvider);
        Navigator.of(context).pop();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('New shortcut',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          TextField(
            controller: _shortcut,
            decoration: const InputDecoration(
                hintText: '/shortcut', prefixText: '/'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _title,
            decoration: const InputDecoration(hintText: 'Title (optional)'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _body,
            minLines: 2,
            maxLines: 5,
            decoration: const InputDecoration(hintText: 'Message text'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Save'),
          ),
        ],
      ),
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
          child: Icon(icon,
              size: 20,
              color: filled ? Colors.white : AppColors.textSecondary),
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
            color: AppColors.danger, shape: BoxShape.circle),
      ),
    );
  }
}
