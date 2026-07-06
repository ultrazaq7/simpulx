import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../controllers/chat_actions_providers.dart';
import '../controllers/chat_providers.dart';

/// Internal notes for a conversation: timeline + add field.
Future<void> showNotesSheet(BuildContext context, String conversationId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (modalContext) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(modalContext).viewInsets.bottom,
      ),
      child: FractionallySizedBox(
        heightFactor: 0.85,
        child: _NotesSheet(conversationId: conversationId),
      ),
    ),
  );
}

class _NotesSheet extends ConsumerStatefulWidget {
  const _NotesSheet({required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<_NotesSheet> createState() => _NotesSheetState();
}

class _NotesSheetState extends ConsumerState<_NotesSheet> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _adding = false;
  bool _summarizing = false;
  bool _showScrollTop = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final show = _scrollController.hasClients && _scrollController.offset > 300;
      if (show != _showScrollTop) setState(() => _showScrollTop = show);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  // Generate an AI Smart Summary and drop it into the note field for review
  // before the agent posts it (mirrors the web composer's Smart Summary).
  Future<void> _generateSummary() async {
    setState(() => _summarizing = true);
    final buf = StringBuffer();
    try {
      await for (final delta
          in ref.read(chatRepositoryProvider).streamSummary(widget.conversationId)) {
        buf.write(delta);
      }
      if (!mounted) return;
      _controller.text = buf.toString().trim();
    } catch (_) {
      if (mounted) AppSnackbar.show(context, 'Could not generate summary', isError: true);
    } finally {
      if (mounted) setState(() => _summarizing = false);
    }
  }

  Future<void> _add() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _adding = true);
    final result = await ref
        .read(chatRepositoryProvider)
        .addNote(widget.conversationId, text);
    if (!mounted) return;
    setState(() => _adding = false);
    result.fold(
      (f) => AppSnackbar.show(context, f.message, isError: true),
      (_) {
        _controller.clear();
        ref.invalidate(notesProvider(widget.conversationId));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notesProvider(widget.conversationId));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text('Internal notes',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              TextButton.icon(
                onPressed: _summarizing ? null : _generateSummary,
                icon: _summarizing
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_awesome, size: 18),
                label: const Text('Smart Summary'),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: async.when(
            loading: () =>
                const Center(child: CircularProgressIndicator(strokeWidth: 2)),
            error: (_, _) => const AppEmptyState(
              icon: Icons.sticky_note_2_outlined,
              title: 'Could not load notes',
            ),
            data: (notes) {
              if (notes.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.sticky_note_2_outlined,
                  title: 'No notes yet',
                  message: 'Notes are visible only to your team.',
                );
              }
              return Stack(children: [
                ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(12),
                itemCount: notes.length,
                itemBuilder: (context, i) {
                  final n = notes[i];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppColors.brandAmber.withValues(alpha: 0.5),
                        width: 1,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(n.body, style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
                        const SizedBox(height: 6),
                        Text(
                          '${n.author} - ${formatDayLabel(n.createdAt)} ${formatBubbleTime(n.createdAt)}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  );
                },
              ),
              if (_showScrollTop)
                Positioned(
                  right: 16,
                  bottom: 16,
                  child: FloatingActionButton.small(
                    heroTag: 'notesScrollTop',
                    onPressed: () => _scrollController.animateTo(0,
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut),
                    child: const Icon(Icons.arrow_upward),
                  ),
                ),
              ]);
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Add a note for your team',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _adding ? null : _add,
                  icon: _adding
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
