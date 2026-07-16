import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/i18n/stage_label.dart';
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
                  subtitle: Text(live.stageName != null ? stageLabel(context, live.stageName) : 'No stage'.tr(context)),
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
                          AppSnackbar.show(
                              context,
                              'Interest set to {v}'.trp(context, {
                                'v': level[0].toUpperCase() + level.substring(1)
                              }));
                        } else {
                          AppSnackbar.show(context, 'Failed to update interest'.tr(context), isError: true);
                        }
                      }
                    });
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.timeline_rounded,
                      color: AppColors.primary),
                  title: Text('Move stage'.tr(context)),
                  subtitle: Text(live.stageName != null ? stageLabel(context, live.stageName) : 'Not set'.tr(context)),
                  onTap: () => _pickStage(context, ref, actions, convId, live),
                ),
                // The lost reason sits right under the stage while the lead is in
                // the Lost stage.
                if ((live.stageName ?? '').toLowerCase().startsWith('lost') &&
                    (live.lostReason?.isNotEmpty ?? false))
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.info_outline_rounded,
                        color: AppColors.danger),
                    title: Text('Lost reason'.tr(context)),
                    subtitle: Text(_reasonLabel(live.lostReason!).tr(context)),
                  ),
                ListTile(
                  leading: Icon(_statusIcon(live.status),
                      color: _statusColor(live.status)),
                  title: Text('Status'.tr(context)),
                  subtitle: Text(_statusLabel(live.status).tr(context)),
                  onTap: () =>
                      _pickStatus(context, ref, actions, convId, live),
                ),
                // Show the snooze expiry right under Status, only while snoozed.
                if (live.status == 'snoozed' && live.snoozedUntil != null)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.schedule_rounded,
                        color: AppColors.warning),
                    title: Text('Snoozed until'.tr(context)),
                    subtitle: Text(DateFormat('EEE, d MMM • HH:mm')
                        .format(live.snoozedUntil!.toLocal())),
                  ),
                ListTile(
                  leading: const Icon(Icons.sticky_note_2_outlined),
                  title: Text('Internal notes'.tr(context)),
                  onTap: () {
                    Navigator.of(context).pop();
                    showNotesSheet(context, convId,
                        smartSummaryEnabled: live.campaignSmartSummary);
                  },
                ),
                if (role?.isManagerTier ?? false)
                  ListTile(
                    leading: const Icon(Icons.person_add_alt_1_outlined),
                    title: Text('Assign agent'.tr(context)),
                    subtitle: Text(live.agentName ?? 'Unassigned'.tr(context)),
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

  // Premium, state-aware visuals for the Status row.
  static IconData _statusIcon(String s) => switch (s) {
        'closed' => Icons.check_circle_rounded,
        'snoozed' => Icons.snooze_rounded,
        _ => Icons.radio_button_checked_rounded,
      };
  static Color _statusColor(String s) => switch (s) {
        'closed' => AppColors.textMuted,
        'snoozed' => AppColors.warning,
        _ => AppColors.success,
      };
  static String _statusLabel(String s) => switch (s) {
        'closed' => 'Closed',
        'snoozed' => 'Snoozed',
        _ => 'Open',
      };

  // ── Segment-aware lost-reason taxonomy ─────────────────────────────────
  // Mirrors services/ai-agent/segments.py EXACTLY. Each business reason is
  // (code, English label); the English label doubles as the i18n key (see
  // [Tr.tr]). Generic reasons apply to every segment; per-segment extras are
  // appended. The "bought" group => did_purchase=true, "nobuy" => false.

  /// Generic "bought elsewhere" reasons (the Purchase group) for every segment.
  static const List<(String, String)> _lostGenericBought = [
    ('bought_elsewhere', 'Bought elsewhere'),
    ('competitor_promo', 'Competitor promo'),
  ];

  /// Generic "didn't buy" reasons (the Not Purchase group) for every segment.
  static const List<(String, String)> _lostGenericNobuy = [
    ('price_too_high', 'Price too high'),
    ('no_budget', 'No budget'),
    ('postponed', 'Postponed'),
    ('wrong_product', 'Wrong product / spec'),
    ('changed_mind', 'Changed mind'),
    ('out_of_area', 'Out of area'),
  ];

  /// Segment-specific extras, keyed by the normalized (lowercase) campaign
  /// segment. Each entry is (code, English label, isBought).
  static const Map<String, List<(String, String, bool)>> _lostSegmentExtra = {
    'automotive': [
      ('bought_other_brand', 'Another brand', true),
      ('bought_used_car', 'A used car instead', true),
      ('financing_rejected', 'Financing rejected', false),
      ('trade_in_issue', 'Trade-in issue', false),
    ],
    'property / real estate': [
      ('bought_other_unit', 'Another property', true),
      ('financing_rejected', 'Financing rejected', false),
      ('location_mismatch', 'Location mismatch', false),
    ],
    'finance': [
      ('financing_rejected', 'Financing rejected', false),
      ('rate_too_high', 'Rate too high', false),
      ('ineligible', 'Not eligible', false),
    ],
    'insurance': [
      ('already_insured', 'Already insured', true),
      ('premium_too_high', 'Premium too high', false),
      ('coverage_insufficient', 'Coverage insufficient', false),
    ],
    'retail / fmcg': [
      ('found_cheaper', 'Found cheaper', true),
      ('out_of_stock', 'Out of stock', false),
    ],
    'education': [
      ('enrolled_elsewhere', 'Enrolled elsewhere', true),
      ('program_unavailable', 'Program unavailable', false),
      ('schedule_conflict', 'Schedule conflict', false),
    ],
    'healthcare': [
      ('chose_other_provider', 'Chose another provider', true),
      ('schedule_conflict', 'Schedule conflict', false),
    ],
    'travel & hospitality': [
      ('booked_elsewhere', 'Booked elsewhere', true),
      ('dates_unavailable', 'Dates unavailable', false),
    ],
    'food & beverage': [
      ('chose_other_vendor', 'Chose another vendor', true),
      ('date_unavailable', 'Date unavailable', false),
    ],
    'services': [
      ('hired_elsewhere', 'Hired elsewhere', true),
      ('scope_mismatch', 'Scope mismatch', false),
    ],
  };

  /// The two business groups' reason lists for a conversation [segment],
  /// as `(bought, nobuy)`. An empty/unset segment => automotive; a non-empty
  /// UNKNOWN segment => generic reasons only (matches the backend).
  static (List<(String, String)>, List<(String, String)>) _reasonsForSegment(
      String? segment) {
    final key = (segment ?? '').trim().toLowerCase();
    final resolved = key.isEmpty ? 'automotive' : key;
    final bought = <(String, String)>[..._lostGenericBought];
    final nobuy = <(String, String)>[..._lostGenericNobuy];
    for (final r in _lostSegmentExtra[resolved] ?? const <(String, String, bool)>[]) {
      (r.$3 ? bought : nobuy).add((r.$1, r.$2));
    }
    return (bought, nobuy);
  }

  /// Canonical lost-reason code -> English source label, covering EVERY segment
  /// (generic + all segment extras) plus the universal spam/legacy codes. The
  /// English label is a translation key (see [Tr.tr]), so a saved reason
  /// localizes the same way as the picker that set it.
  static final Map<String, String> _lostReasonLabels = {
    for (final r in _lostGenericBought) r.$1: r.$2,
    for (final r in _lostGenericNobuy) r.$1: r.$2,
    for (final list in _lostSegmentExtra.values)
      for (final r in list) r.$1: r.$2,
    // Universal spam/junk group + legacy codes (not in the segment taxonomy).
    'spam_junk': 'Spam',
    'job_seeker': 'Job seeker',
    'abusive': 'Abusive',
    'wrong_number': 'Wrong number',
    'duplicate': 'Duplicate',
    'no_response': 'No response',
  };

  /// The translatable English label for a saved lost-reason code, falling back to
  /// a humanized form of the raw code for anything not in the map.
  static String _reasonLabel(String code) =>
      _lostReasonLabels[code] ?? _humanizeReason(code);

  /// Turn a lost-reason code ("price_too_high") into a readable label.
  static String _humanizeReason(String code) {
    final words = code.replaceAll('_', ' ').trim();
    if (words.isEmpty) return code;
    return words[0].toUpperCase() + words.substring(1);
  }

  Future<void> _do(BuildContext context, BuildContext sheetContext, Future<bool> action, [String? successMsg]) async {
    final navigator = Navigator.of(sheetContext);
    final ok = await action;
    if (!context.mounted) return;
    if (ok) {
      navigator.pop();
      if (successMsg != null) {
        AppSnackbar.show(context, successMsg);
      }
    } else {
      AppSnackbar.show(context, 'Action failed. Try again.'.tr(context), isError: true);
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
      builder: (sheetContext) => Consumer(
        builder: (consumerContext, ref, _) {
          final async = ref.watch(stagesProvider);
          return async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => Padding(
              padding: EdgeInsets.all(24),
              child: Text('Could not load stages'.tr(context)),
            ),
            data: (stages) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final s in stages.where((s) => !s.name.toLowerCase().startsWith('lost')))
                    ListTile(
                      leading: Icon(
                        s.name == conversation.stageName
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_unchecked_rounded,
                        color: s.name == conversation.stageName
                            ? AppColors.primary
                            : AppColors.textMuted,
                      ),
                      title: Text(stageLabel(context, s.name)),
                      selected: s.name == conversation.stageName,
                      onTap: () {
                        ref
                            .read(conversationListProvider.notifier)
                            .patchLocal(convId, stageName: s.name);
                        actions.setStage(s.id).then((ok) {
                          if (context.mounted) {
                            if (ok) {
                              AppSnackbar.show(
                                  context,
                                  'Stage moved to {v}'.trp(
                                      context, {'v': stageLabel(context, s.name)}));
                            } else {
                              AppSnackbar.show(context, 'Failed to update stage'.tr(context), isError: true);
                            }
                          }
                        });
                        Navigator.of(sheetContext).pop();
                      },
                    ),
                  const Divider(),
                  ListTile(
                    leading: const Icon(Icons.cancel_outlined, color: AppColors.danger),
                    title: Text('Mark as Lost'.tr(context), style: TextStyle(color: AppColors.danger)),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _pickLostReason(context, actions, conversation.campaignSegment);
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

  void _pickStatus(BuildContext context, WidgetRef ref,
      ConversationActionsController actions, String convId,
      Conversation conversation) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.check_circle_outline_rounded),
              title: Text('Open'.tr(context)),
              onTap: () => _do(context, sheetContext, actions.reopen(), 'Status set to Open'),
            ),
            ListTile(
              leading: const Icon(Icons.snooze_outlined),
              title: Text('Snooze'.tr(context)),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _pickSnooze(context, actions);
              },
            ),
            ListTile(
              leading: const Icon(Icons.close_rounded),
              title: Text('Close'.tr(context)),
              subtitle: Text('Pick the final stage first'.tr(context)),
              onTap: () {
                // Closing requires recording where the lead ended in the pipeline.
                Navigator.of(sheetContext).pop();
                _pickCloseStage(context, ref, actions, convId, conversation);
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Forced stage selection before closing. The agent must record the final
  /// pipeline stage (or mark Lost) — closing without an outcome is not allowed.
  void _pickCloseStage(
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
      builder: (sheetContext) => Consumer(
        builder: (consumerContext, ref, _) {
          final async = ref.watch(stagesProvider);
          return async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => Padding(
              padding: EdgeInsets.all(24),
              child: Text('Could not load stages'.tr(context)),
            ),
            data: (stages) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  Padding(
                    padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
                    child: Text('Close as'.tr(context),
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Text('Choose the final stage to close this lead.'.tr(context),
                        style: TextStyle(
                            fontSize: 12.5, color: AppColors.textSecondary)),
                  ),
                  const Divider(height: 1),
                  for (final s in stages.where((s) => !s.name.toLowerCase().startsWith('lost')))
                    ListTile(
                      leading: Icon(
                        s.name == conversation.stageName
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_unchecked_rounded,
                        color: s.name == conversation.stageName
                            ? AppColors.primary
                            : AppColors.textMuted,
                      ),
                      title: Text(stageLabel(context, s.name)),
                      onTap: () => _do(context, sheetContext,
                          actions.closeWithStage(s.id), 'Closed as ${s.name}'),
                    ),
                  const Divider(),
                  ListTile(
                    leading: const Icon(Icons.do_not_disturb_on_rounded,
                        color: AppColors.danger),
                    title: Text('Mark as Lost'.tr(context),
                        style: TextStyle(color: AppColors.danger)),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _pickLostReason(context, actions, conversation.campaignSegment);
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
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in presets.entries)
              ListTile(
                title: Text(entry.key.tr(context)),
                trailing: Text(
                  DateFormat('E, MMM d • HH:mm').format(entry.value),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
                onTap: () => _do(context, sheetContext, actions.snooze(entry.value),
                    'Snoozed until {time}'.trp(context, {'time': entry.key.tr(context)})),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.edit_calendar_outlined),
              title: Text('Custom time...'.tr(context)),
              onTap: () async {
                // Default the pickers to the device's current date/time.
                final start = DateTime.now();
                final date = await showDatePicker(
                  context: context,
                  initialDate: start,
                  firstDate: start,
                  lastDate: start.add(const Duration(days: 365)),
                );
                if (date == null || !context.mounted) return;
                final time = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.now(),
                );
                if (time == null || !context.mounted) return;
                final dt = DateTime(
                    date.year, date.month, date.day, time.hour, time.minute);
                // Reject a moment that has already passed.
                if (!dt.isAfter(DateTime.now())) {
                  AppSnackbar.show(
                      context, "Can't snooze to a past time".tr(context),
                      isError: true);
                  return;
                }
                _do(context, sheetContext, actions.snooze(dt),
                    'Snoozed until custom time'.tr(context));
              },
            ),
          ],
        ),
      ),
    );
  }

  void _pickLostReason(BuildContext context,
      ConversationActionsController actions, String? segment) {
    // The Purchase/Not-Purchase reasons are segment-aware (mirror the backend
    // taxonomy); Spam is universal. Three lost TYPES (wizard step 1) -> specific
    // reasons (step 2).
    final (boughtReasons, nobuyReasons) = _reasonsForSegment(segment);
    final groups = <(String, String, IconData, bool, List<(String, String)>)>[
      ('Purchase', 'Bought elsewhere', Icons.shopping_bag_outlined, false,
          boughtReasons),
      ('Not Purchase', "Didn't buy", Icons.cancel_outlined, false, nobuyReasons),
      ('Spam', 'Spam / invalid', Icons.block, true, const [
        ('spam_junk', 'Spam'),
        ('job_seeker', 'Job seeker'),
        ('abusive', 'Abusive'),
        ('wrong_number', 'Wrong number'),
        ('duplicate', 'Duplicate'),
      ]),
    ];
    int? gi; // selected type index; null = step 1 (pick type)
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => DraggableScrollableSheet(
        initialChildSize: 0.55,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => StatefulBuilder(
          builder: (context, setSheetState) {
            if (gi == null) {
              // Step 1: pick the outcome type.
              return ListView(
                controller: scrollController,
                children: [
                  Padding(
                    padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
                    child: Text('Why is this lead lost?'.tr(context),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  ),
                  for (var i = 0; i < groups.length; i++)
                    ListTile(
                      leading: CircleAvatar(
                        backgroundColor:
                            (groups[i].$4 ? AppColors.danger : AppColors.primary)
                                .withValues(alpha: 0.12),
                        child: Icon(groups[i].$3,
                            color: groups[i].$4 ? AppColors.danger : AppColors.primary),
                      ),
                      title: Text(groups[i].$1.tr(context),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(groups[i].$2.tr(context)),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => setSheetState(() => gi = i),
                    ),
                ],
              );
            }
            // Step 2: pick a specific reason within the chosen type.
            final g = groups[gi!];
            return ListView(
              controller: scrollController,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 16, 4),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded),
                        onPressed: () => setSheetState(() => gi = null),
                      ),
                      Text(g.$1.tr(context),
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                for (final r in g.$5)
                  ListTile(
                    title: Text(r.$2.tr(context)),
                    onTap: () {
                      final cat = g.$4 ? 'spam' : 'lost';
                      // The "Purchase" group means lost-but-bought-elsewhere.
                      final didPurchase = gi == 0;
                      _do(
                        context,
                        sheetContext,
                        actions.setDisposition(cat,
                            lostReason: r.$1, didPurchase: didPurchase),
                        'Marked as lost: {reason}'
                            .trp(context, {'reason': r.$2.tr(context)}),
                      );
                    },
                  ),
              ],
            );
          },
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
      builder: (sheetContext) => Consumer(
        builder: (context, ref, _) {
          final async = ref.watch(agentsProvider);
          return async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => Padding(
              padding: EdgeInsets.all(24),
              child: Text('Could not load agents'.tr(context)),
            ),
            data: (agents) => ListView(
              shrinkWrap: true,
              children: [
                ListTile(
                  leading: const Icon(Icons.person_off_outlined),
                  title: Text('Unassign'.tr(context)),
                  onTap: () => _do(context, sheetContext, actions.assign(unassign: true), 'Unassigned conversation'),
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
                    onTap: () => _do(context, sheetContext, actions.assign(agentId: agent.id), 'Assigned to ${agent.name}'),
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
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          Text('Interest'.tr(context), style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(width: 12),
          for (final level in const ['hot', 'warm', 'cold'])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(level[0].toUpperCase() + level.substring(1)),
                selected: current == level,
                // A faint alpha wash on a light background left the label
                // nearly invisible in light mode. Selected = solid, saturated
                // fill with white text (readable regardless of theme); the
                // unselected label still resolves per-brightness (see
                // AppTheme.chipTheme) so it stays legible in dark mode too.
                selectedColor: AppColors.forInterest(level),
                labelStyle: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: current == level
                      ? Colors.white
                      : theme.colorScheme.onSurfaceVariant,
                ),
                onSelected: (_) => onPick(level),
              ),
            ),
        ],
      ),
    );
  }
}
