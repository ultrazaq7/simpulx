import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_empty_state.dart';
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
  bool _adding = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
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
      (f) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(f.message))),
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
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Internal notes',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
              return ListView.builder(
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
              );
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
