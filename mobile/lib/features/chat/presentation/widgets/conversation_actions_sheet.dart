import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/session/session_controller.dart';
import '../../domain/entities/conversation.dart';
import '../controllers/chat_actions_providers.dart';
import 'notes_sheet.dart';

/// Lead action sheet opened from the thread header: interest, stage, snooze,
/// notes, bot toggle, resolve/reopen, and assignment (manager+).
Future<void> showConversationActions(
  BuildContext context,
  Conversation conversation,
) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _ActionsSheet(conversation: conversation),
  );
}

class _ActionsSheet extends ConsumerWidget {
  const _ActionsSheet({required this.conversation});
  final Conversation conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convId = conversation.id;
    final actions = ref.watch(conversationActionsProvider(convId));
    final role = ref.watch(sessionControllerProvider).user?.role;
    final isClosed = conversation.status == 'closed';

    return SafeArea(
      child: ListenableBuilder(
        listenable: actions,
        builder: (context, _) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(conversation.displayName,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(conversation.stageName ?? 'No stage'),
                trailing: actions.busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : null,
              ),
              const Divider(height: 1),
              _InterestRow(
                current: conversation.interestLevel,
                onPick: (level) => _do(context, actions.setInterest(level)),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.flag_outlined),
                title: const Text('Move stage'),
                subtitle: Text(conversation.stageName ?? 'Not set'),
                onTap: () => _pickStage(context, ref, actions),
              ),
              ListTile(
                leading: const Icon(Icons.snooze_outlined),
                title: const Text('Snooze'),
                onTap: () => _pickSnooze(context, actions),
              ),
              ListTile(
                leading: const Icon(Icons.sticky_note_2_outlined),
                title: const Text('Internal notes'),
                onTap: () {
                  Navigator.of(context).pop();
                  showNotesSheet(context, convId);
                },
              ),
              SwitchListTile.adaptive(
                secondary: const Icon(Icons.smart_toy_outlined),
                title: const Text('Bot replies'),
                value: conversation.isBotActive,
                onChanged: (v) => _do(context, actions.toggleBot(v)),
              ),
              ListTile(
                leading: Icon(isClosed
                    ? Icons.refresh_rounded
                    : Icons.check_circle_outline_rounded),
                title: Text(isClosed ? 'Reopen' : 'Resolve'),
                onTap: () => _do(
                  context,
                  isClosed ? actions.reopen() : actions.resolve(),
                ),
              ),
              if (role?.isManagerTier ?? false)
                ListTile(
                  leading: const Icon(Icons.person_add_alt_1_outlined),
                  title: const Text('Assign agent'),
                  subtitle: Text(conversation.agentName ?? 'Unassigned'),
                  onTap: () => _pickAgent(context, ref, actions),
                ),
              const SizedBox(height: 8),
            ],
          );
        },
      ),
    );
  }

  Future<void> _do(BuildContext context, Future<bool> action) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final ok = await action;
    if (!context.mounted) return;
    if (ok) {
      navigator.pop();
    } else {
      messenger.showSnackBar(
        const SnackBar(content: Text('Action failed. Try again.')),
      );
    }
  }

  void _pickStage(
    BuildContext context,
    WidgetRef ref,
    ConversationActionsController actions,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => Consumer(
        builder: (context, ref, _) {
          final async = ref.watch(stagesProvider);
          return async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => const Padding(
              padding: EdgeInsets.all(24),
              child: Text('Could not load stages'),
            ),
            data: (stages) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final s in stages)
                  ListTile(
                    leading: const Icon(Icons.flag_outlined),
                    title: Text(s.name),
                    selected: s.name == conversation.stageName,
                    onTap: () => _do(context, actions.setStage(s.id)),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _pickSnooze(BuildContext context, ConversationActionsController actions) {
    final now = DateTime.now();
    final presets = <String, DateTime>{
      '1 hour': now.add(const Duration(hours: 1)),
      '3 hours': now.add(const Duration(hours: 3)),
      'Tomorrow 9am':
          DateTime(now.year, now.month, now.day + 1, 9),
      'In 3 days':
          DateTime(now.year, now.month, now.day + 3, 9),
    };
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in presets.entries)
              ListTile(
                leading: const Icon(Icons.schedule_rounded),
                title: Text(entry.key),
                onTap: () => _do(context, actions.snooze(entry.value)),
              ),
          ],
        ),
      ),
    );
  }

  void _pickAgent(
    BuildContext context,
    WidgetRef ref,
    ConversationActionsController actions,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => Consumer(
        builder: (context, ref, _) {
          final async = ref.watch(agentsProvider);
          return async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => const Padding(
              padding: EdgeInsets.all(24),
              child: Text('Could not load agents'),
            ),
            data: (agents) => ListView(
              shrinkWrap: true,
              children: [
                ListTile(
                  leading: const Icon(Icons.person_off_outlined),
                  title: const Text('Unassign'),
                  onTap: () => _do(context, actions.assign(unassign: true)),
                ),
                const Divider(height: 1),
                for (final agent in agents)
                  ListTile(
                    leading: CircleAvatar(
                      radius: 16,
                      backgroundColor:
                          AppColors.primary.withValues(alpha: 0.12),
                      child: Icon(
                        agent.isOnline
                            ? Icons.circle
                            : Icons.circle_outlined,
                        size: 12,
                        color: agent.isOnline
                            ? AppColors.success
                            : AppColors.textMuted,
                      ),
                    ),
                    title: Text(agent.name),
                    subtitle: Text('${agent.openCount} open'),
                    onTap: () => _do(context, actions.assign(agentId: agent.id)),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InterestRow extends StatelessWidget {
  const _InterestRow({required this.current, required this.onPick});
  final String? current;
  final void Function(String level) onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          const Text('Interest', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(width: 12),
          for (final level in const ['hot', 'warm', 'cold'])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(level[0].toUpperCase() + level.substring(1)),
                selected: current == level,
                selectedColor: AppColors.forInterest(level).withValues(alpha: 0.18),
                onSelected: (_) => onPick(level),
              ),
            ),
        ],
      ),
    );
  }
}
