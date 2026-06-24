import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../domain/entities/conversation.dart';
import '../controllers/chat_actions_providers.dart';
import '../controllers/conversation_list_controller.dart';
import 'notes_sheet.dart';

/// Lead action sheet opened from the thread header: interest, stage, snooze,
/// notes, resolve/reopen, and assignment (manager+).
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
    // Live conversation so stage/interest changes reflect instantly here too.
    Conversation live = conversation;
    final list = ref.watch(conversationListProvider).value;
    if (list != null) {
      for (final c in list) {
        if (c.id == convId) {
          live = c;
          break;
        }
      }
    }
    final isClosed = live.status == 'closed';

    return SafeArea(
      child: ListenableBuilder(
        listenable: actions,
        builder: (context, _) {
          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  title: Text(live.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(live.stageName ?? 'No stage'),
                  trailing: actions.busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : null,
                ),
                const Divider(height: 1),
                _InterestRow(
                  current: live.interestLevel,
                  onPick: (level) {
                    // Optimistic: update inbox + this sheet instantly.
                    ref
                        .read(conversationListProvider.notifier)
                        .patchLocal(convId, interestLevel: level);
                    actions.setInterest(level).then((ok) {
                      if (context.mounted) {
                        if (ok) {
                          AppSnackbar.show(context, 'Interest set to ${level[0].toUpperCase()}${level.substring(1)}');
                        } else {
                          AppSnackbar.show(context, 'Failed to update interest', isError: true);
                        }
                      }
                    });
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.flag_outlined),
                  title: const Text('Move stage'),
                  subtitle: Text(live.stageName ?? 'Not set'),
                  onTap: () => _pickStage(context, ref, actions, convId, live),
                ),
                ListTile(
                  leading: const Icon(Icons.rule_folder_outlined),
                  title: const Text('Status'),
                  subtitle: Text(live.status == 'closed' ? 'Closed' : (live.status == 'snoozed' ? 'Snoozed' : 'Open')),
                  onTap: () => _pickStatus(context, actions, live.status == 'closed'),
                ),
                ListTile(
                  leading: const Icon(Icons.sticky_note_2_outlined),
                  title: const Text('Internal notes'),
                  onTap: () {
                    Navigator.of(context).pop();
                    showNotesSheet(context, convId);
                  },
                ),
                if (role?.isManagerTier ?? false)
                  ListTile(
                    leading: const Icon(Icons.person_add_alt_1_outlined),
                    title: const Text('Assign agent'),
                    subtitle: Text(live.agentName ?? 'Unassigned'),
                    onTap: () => _pickAgent(context, ref, actions),
                  ),
                const SizedBox(height: 8),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _do(BuildContext context, Future<bool> action, [String? successMsg]) async {
    final navigator = Navigator.of(context);
    final ok = await action;
    if (!context.mounted) return;
    if (ok) {
      navigator.pop();
      if (successMsg != null) {
        AppSnackbar.show(context, successMsg);
      }
    } else {
      AppSnackbar.show(context, 'Action failed. Try again.', isError: true);
    }
  }

  void _pickStage(
    BuildContext context,
    WidgetRef ref,
    ConversationActionsController actions,
    String convId,
    Conversation conversation,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
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
            data: (stages) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final s in stages)
                    ListTile(
                      leading: const Icon(Icons.flag_outlined),
                      title: Text(s.name),
                      selected: s.name == conversation.stageName,
                      onTap: () {
                        ref
                            .read(conversationListProvider.notifier)
                            .patchLocal(convId, stageName: s.name);
                        actions.setStage(s.id).then((ok) {
                          if (context.mounted) {
                            if (ok) {
                              AppSnackbar.show(context, 'Stage moved to ${s.name}');
                            } else {
                              AppSnackbar.show(context, 'Failed to update stage', isError: true);
                            }
                          }
                        });
                        Navigator.of(context).pop();
                      },
                    ),
                  const Divider(),
                  ListTile(
                    leading: const Icon(Icons.cancel_outlined, color: AppColors.danger),
                    title: const Text('Mark as Lost', style: TextStyle(color: AppColors.danger)),
                    onTap: () {
                      Navigator.of(context).pop();
                      _pickLostReason(context, actions);
                    },
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _pickStatus(BuildContext context, ConversationActionsController actions, bool isClosed) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.check_circle_outline_rounded),
              title: const Text('Open'),
              onTap: () => _do(context, actions.reopen(), 'Status set to Open'),
            ),
            ListTile(
              leading: const Icon(Icons.snooze_outlined),
              title: const Text('Snooze'),
              onTap: () {
                Navigator.of(context).pop();
                _pickSnooze(context, actions);
              },
            ),
            ListTile(
              leading: const Icon(Icons.close_rounded),
              title: const Text('Close'),
              onTap: () => _do(context, actions.resolve(), 'Status set to Closed'),
            ),
          ],
        ),
      ),
    );
  }

  void _pickSnooze(BuildContext context, ConversationActionsController actions) {
    final now = DateTime.now();
    final presets = <String, DateTime>{
      '1 hour': now.add(const Duration(hours: 1)),
      '3 hours': now.add(const Duration(hours: 3)),
      'Tomorrow 9am': DateTime(now.year, now.month, now.day + 1, 9),
      'In 3 days': DateTime(now.year, now.month, now.day + 3, 9),
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
            const Divider(),
            ListTile(
              leading: const Icon(Icons.calendar_month_outlined),
              title: const Text('Custom Date & Time'),
              onTap: () async {
                Navigator.of(context).pop();
                final date = await showDatePicker(
                  context: context,
                  initialDate: now,
                  firstDate: now,
                  lastDate: now.add(const Duration(days: 365)),
                );
                if (date == null || !context.mounted) return;
                final time = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.now(),
                );
                if (time == null || !context.mounted) return;

                final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
                _do(context, actions.snooze(combined));
              },
            ),
          ],
        ),
      ),
    );
  }

  void _pickLostReason(BuildContext context, ConversationActionsController actions) {
    final lostReasons = [
      'Bought elsewhere: Another brand',
      'Bought elsewhere: A used car instead',
      'Bought elsewhere: Same brand, other dealer',
      'Bought elsewhere: Competitor promo',
      'Didn\'t buy: Out of area',
      'Didn\'t buy: Price too high',
      'Didn\'t buy: Financing rejected',
      'Didn\'t buy: No budget / postponed',
      'Didn\'t buy: Wrong product / spec',
      'Didn\'t buy: Changed mind / not buying',
      'Didn\'t buy: Trade-in issue',
      'Spam: Spam',
      'Spam: Job seeker',
      'Spam: Abusive',
      'Spam: Wrong number',
      'Spam: Duplicate',
    ];
    final values = [
      'bought_other_brand',
      'bought_used_car',
      'bought_elsewhere',
      'competitor_promo',
      'out_of_area',
      'price_too_high',
      'financing_rejected',
      'no_budget',
      'wrong_product',
      'changed_mind',
      'trade_in_issue',
      'spam_junk',
      'job_seeker',
      'abusive',
      'wrong_number',
      'duplicate',
    ];
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => ListView.builder(
          controller: scrollController,
          itemCount: lostReasons.length,
          itemBuilder: (context, i) => ListTile(
            title: Text(lostReasons[i]),
            onTap: () {
              final cat = values[i].startsWith('spam') || values[i] == 'job_seeker' || values[i] == 'abusive' || values[i] == 'wrong_number' || values[i] == 'duplicate' ? 'spam' : 'lost';
              _do(context, actions.setDisposition(cat, lostReason: values[i]));
            },
          ),
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
