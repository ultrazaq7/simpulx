import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../chat/domain/entities/conversation.dart';
import '../../../chat/presentation/controllers/chat_actions_providers.dart';
import '../../../chat/presentation/widgets/conversation_actions_sheet.dart';
import '../../../chat/presentation/widgets/notes_sheet.dart';
import '../../domain/entities/contact.dart';
import '../../domain/entities/contact_activity.dart';
import '../controllers/contacts_providers.dart';
import '../widgets/contact_form_sheet.dart';

/// Lead detail: identity + lead context, with quick actions that reuse the
/// chat feature's action sheet / notes for the linked conversation.
class ContactDetailPage extends ConsumerStatefulWidget {
  const ContactDetailPage({
    super.key,
    required this.contactId,
    this.scrollToHistory = false,
  });

  final String contactId;
  final bool scrollToHistory;

  @override
  ConsumerState<ContactDetailPage> createState() => _ContactDetailPageState();
}

class _ContactDetailPageState extends ConsumerState<ContactDetailPage> {
  final _scrollController = ScrollController();
  final _historyKey = GlobalKey();

  Conversation _asConversation(Contact c) => Conversation(
        id: c.conversationId!,
        status: 'open',
        channel: c.sourceChannel ?? '',
        contactId: c.id,
        contactName: c.fullName,
        contactPhone: c.phone,
        unreadCount: 0,
        interestLevel: c.interestLevel,
        stageName: c.stageName,
        assignedAgentId: c.assignedAgentId,
        agentName: c.agentName,
      );

  Future<void> _call(BuildContext context, String phone) async {
    if (phone.isEmpty) return;
    final uri = Uri.parse('tel:${phone.startsWith('+') ? phone : '+$phone'}');
    // Launch directly: canLaunchUrl(tel:) can return false on Android 11+.
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {/* no dialer available */}
  }

  @override
  void initState() {
    super.initState();
    if (widget.scrollToHistory) {
      // Wait for tree to build, then scroll to the history card.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToHistoryCard();
      });
    }
  }

  void _scrollToHistoryCard() {
    final ctx = _historyKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final contact = ref.watch(contactByIdProvider(widget.contactId));

    if (contact == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Contact'),
          shape: Border(
            bottom: BorderSide(
              color: Theme.of(context).brightness == Brightness.dark 
                  ? AppColors.darkBorder 
                  : AppColors.border,
            ),
          ),
        ),
        body: const AppLoader(),
      );
    }
    final c = contact;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Contact Details'),
        shape: Border(
          bottom: BorderSide(
            color: Theme.of(context).brightness == Brightness.dark 
                ? AppColors.darkBorder 
                : AppColors.border,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit',
            onPressed: () => showContactForm(context, existing: c),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        controller: _scrollController,
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _IdentityCard(contact: c),
          const SizedBox(height: AppSpacing.md),
          _ActionsRow(
            onCall: () => _call(context, c.phone),
            onChat: c.hasConversation
                ? () => context.push('/chat/${c.conversationId}')
                : null,
            onActions: c.hasConversation
                ? () => showConversationActions(context, _asConversation(c))
                : null,
            onNotes: c.hasConversation
                ? () => showNotesSheet(context, c.conversationId!)
                : null,
          ),
          if (c.leadScore != null) ...[
            const SizedBox(height: AppSpacing.md),
            _LeadScoreCard(score: c.leadScore!),
          ],
          const SizedBox(height: AppSpacing.md),
          _LeadContextCard(contact: c),
          if (c.aiSummary != null && c.aiSummary!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            _SummaryCard(summary: c.aiSummary!),
          ],
          const SizedBox(height: AppSpacing.md),
          _HistoryCard(key: _historyKey, contactId: c.id),
        ],
      ),
    );
  }
}


class _IdentityCard extends StatelessWidget {
  const _IdentityCard({required this.contact});
  final Contact contact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = contact;
    return _Card(
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(c.initials,
                style: const TextStyle(
                    color: AppColors.primaryDark,
                    fontWeight: FontWeight.w700,
                    fontSize: 18)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.displayName,
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700)),
                if (c.phone.isNotEmpty)
                  Row(
                    children: [
                      Text(c.phone,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      const SizedBox(width: 4),
                      GestureDetector(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: c.phone));
                          AppSnackbar.show(context, 'Phone number copied');
                        },
                        child: Icon(Icons.copy_rounded, size: 14, color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (c.channelName != null)
                      _Pill(text: c.channelName!),
                    // Accurate source (e.g. "Ad"), not the raw channel.
                    _Pill(text: c.sourceLabel),
                    for (final t in c.tags) _Pill(text: t),
                    if (c.blacklisted)
                      const _Pill(text: 'Blacklisted', danger: true),
                  ],
                ),
                _StageChip(contact: c),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Editable pipeline-stage chip under the identity (mirrors the chat header
/// stage chip). Tapping opens a stage picker that patches the contact's linked
/// conversation. Hidden when the lead has no conversation yet.
class _StageChip extends ConsumerWidget {
  const _StageChip({required this.contact});
  final Contact contact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!contact.hasConversation) return const SizedBox.shrink();
    final label = contact.stageName ?? 'Set stage';
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => _pick(context, ref),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                    color: AppColors.primary, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              Text(label,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryDark)),
              const SizedBox(width: 2),
              const Icon(Icons.expand_more_rounded,
                  size: 16, color: AppColors.primaryDark),
            ],
          ),
        ),
      ),
    );
  }

  void _pick(BuildContext context, WidgetRef ref) {
    final convId = contact.conversationId;
    if (convId == null) return;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => Consumer(
        builder: (_, sheetRef, _) {
          final async = sheetRef.watch(stagesProvider);
          return async.when(
            loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
            error: (_, _) => const Padding(
                padding: EdgeInsets.all(24),
                child: Text('Could not load stages')),
            data: (stages) => SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 4, 20, 8),
                    child: Text('Pipeline stage',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  for (final s in stages
                      .where((s) => !s.name.toLowerCase().startsWith('lost')))
                    ListTile(
                      leading: Icon(
                        s.name == contact.stageName
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_unchecked_rounded,
                        color: s.name == contact.stageName
                            ? AppColors.primary
                            : AppColors.textMuted,
                      ),
                      title: Text(s.name),
                      selected: s.name == contact.stageName,
                      onTap: () {
                        ref
                            .read(conversationActionsProvider(convId))
                            .setStage(s.id)
                            .then((ok) {
                          if (context.mounted) {
                            AppSnackbar.show(
                                context,
                                ok
                                    ? 'Stage moved to ${s.name}'
                                    : 'Failed to update stage',
                                isError: !ok);
                          }
                          ref.read(contactsProvider.notifier).refresh();
                          ref.invalidate(contactActivityProvider(contact.id));
                        });
                        Navigator.of(sheetContext).pop();
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
}

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({
    required this.onCall,
    this.onChat,
    this.onActions,
    this.onNotes,
  });
  final VoidCallback onCall;
  final VoidCallback? onChat;
  final VoidCallback? onActions;
  final VoidCallback? onNotes;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ActionButton(icon: Icons.call_rounded, label: 'Call', onTap: onCall),
        _ActionButton(
            icon: Icons.chat_bubble_rounded, label: 'Chat', onTap: onChat),
        _ActionButton(
            icon: Icons.tune_rounded, label: 'Actions', onTap: onActions),
        _ActionButton(
            icon: Icons.sticky_note_2_outlined,
            label: 'Notes',
            onTap: onNotes),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.label, this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Icon(icon,
                    color: enabled ? AppColors.primary : AppColors.textMuted,
                    size: 22),
                const SizedBox(height: 4),
                Text(label,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color:
                            enabled ? theme.colorScheme.onSurface : theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LeadContextCard extends StatelessWidget {
  const _LeadContextCard({required this.contact});
  final Contact contact;

  @override
  Widget build(BuildContext context) {
    final c = contact;
    return _Card(
      child: Column(
        children: [
          // ── Lead qualification (AI-generated), matching the web ──
          _row(context, 'Stage', c.stageName ?? 'Unset'),
          if (c.lostReason != null && c.lostReason!.isNotEmpty)
            _row(context, 'Lost reason',
                c.lostReason![0].toUpperCase() + c.lostReason!.substring(1).replaceAll('_', ' ')),
          _row(context, 'Interest',
              c.interestLevel != null && c.interestLevel!.isNotEmpty
                  ? c.interestLevel![0].toUpperCase() + c.interestLevel!.substring(1)
                  : '-'),
          _row(context, 'Brand', _orDash(c.carBrand)),
          _row(context, 'Model', _orDash(c.carModel)),
          _row(context, 'City', _orDash(c.city)),
          _row(context, 'Purchase time', _orDash(c.purchaseTimeframe)),
          _row(context, 'Assigned', c.agentName ?? 'Unassigned'),
          if (c.campaignName != null) _row(context, 'Campaign', c.campaignName!),
          _row(context, 'Source', c.sourceLabel),
          if (c.sourceId != null && c.sourceId!.isNotEmpty)
            _row(context, 'Source ID', c.sourceId!),
          if (c.sourceUrl != null && c.sourceUrl!.isNotEmpty)
            _row(context, 'Source URL', c.sourceUrl!,
                onTap: () => _openUrl(c.sourceUrl!)),
          if (c.lastMessageAt != null)
            _row(context, 'Last activity',
                '${formatDayLabel(c.lastMessageAt!)} ${formatBubbleTime(c.lastMessageAt!)}'),
          if (c.createdAt != null)
            _row(context, 'Added', formatDayLabel(c.createdAt!)),
        ],
      ),
    );
  }

  String _orDash(String? v) =>
      (v != null && v.trim().isNotEmpty) ? v : '-';

  Future<void> _openUrl(String url) async {
    var u = url.trim();
    if (!u.startsWith('http')) u = 'https://$u';
    final uri = Uri.tryParse(u);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {/* no browser available */}
  }

  Widget _row(BuildContext context, String label, String value,
      {VoidCallback? onTap}) {
    final isLink = onTap != null;
    final valueWidget = Text(
      value,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: isLink ? AppColors.primary : null,
        decoration: isLink ? TextDecoration.underline : null,
        decorationColor: AppColors.primary,
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
          ),
          Expanded(
            child: isLink
                ? GestureDetector(onTap: onTap, child: valueWidget)
                : valueWidget,
          ),
        ],
      ),
    );
  }
}

/// History timeline of stage/status/interest/assignment changes for the lead,
/// mirroring the web contact-details History tab. Collapsed to a few rows by
/// default with a Show more / Show less toggle so it never grows unbounded.
class _HistoryCard extends ConsumerStatefulWidget {
  const _HistoryCard({super.key, required this.contactId});
  final String contactId;

  @override
  ConsumerState<_HistoryCard> createState() => _HistoryCardState();
}

class _HistoryCardState extends ConsumerState<_HistoryCard> {
  static const _collapsedCount = 5;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final async = ref.watch(contactActivityProvider(widget.contactId));
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.history_rounded,
                  size: 16, color: AppColors.primary),
              const SizedBox(width: 6),
              const Text('History',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          async.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                  child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))),
            ),
            error: (_, _) => Text('Could not load history',
                style: theme.textTheme.bodySmall?.copyWith(color: muted)),
            data: (raw) {
              if (raw.isEmpty) {
                return Text('No changes yet.',
                    style: theme.textTheme.bodySmall?.copyWith(color: muted));
              }
              // Backend returns newest-first; display oldest-first (ascending).
              final events = raw.reversed.toList();
              final hasMore = events.length > _collapsedCount;
              // Collapsed: show the most recent items (tail), still ascending.
              final start = _expanded
                  ? 0
                  : (events.length - _collapsedCount).clamp(0, events.length);
              final shown = events.sublist(start);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < shown.length; i++)
                    _HistoryRow(
                      event: shown[i],
                      isLast: i == shown.length - 1,
                    ),
                  if (hasMore)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: InkWell(
                        onTap: () => setState(() => _expanded = !_expanded),
                        borderRadius: BorderRadius.circular(6),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              vertical: 6, horizontal: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _expanded
                                    ? 'Show less'
                                    : 'Show ${events.length - _collapsedCount} more',
                                style: const TextStyle(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12.5),
                              ),
                              const SizedBox(width: 2),
                              Icon(
                                  _expanded
                                      ? Icons.keyboard_arrow_up_rounded
                                      : Icons.keyboard_arrow_down_rounded,
                                  size: 18,
                                  color: AppColors.primary),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.event, required this.isLast});
  final ContactActivity event;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final when = event.createdAt != null
        ? '${formatDayLabel(event.createdAt!)} ${formatBubbleTime(event.createdAt!)}'
        : '';
    final actor =
        (event.actorName != null && event.actorName!.isNotEmpty) ? event.actorName! : '';
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                margin: const EdgeInsets.only(top: 3),
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                    color: AppColors.primary, shape: BoxShape.circle),
              ),
              if (!isLast)
                Expanded(
                  child: Container(width: 1, color: theme.dividerColor),
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.label,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(
                    [when, actor].where((s) => s.isNotEmpty).join('  ·  '),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: muted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Buy-potential lead score (0-100) with a colored strength bar.
class _LeadScoreCard extends StatelessWidget {
  const _LeadScoreCard({required this.score});
  final int score;

  Color get _color {
    if (score >= 70) return AppColors.success;
    if (score >= 40) return AppColors.warning;
    return AppColors.textMuted;
  }

  String get _band {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }

  @override
  Widget build(BuildContext context) {
    final pct = (score.clamp(0, 100)) / 100.0;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.insights_rounded,
                  size: 16, color: AppColors.primary),
              const SizedBox(width: 6),
              const Text('Buy potential',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const Spacer(),
              Text(_band,
                  style: TextStyle(
                      color: _color,
                      fontWeight: FontWeight.w700,
                      fontSize: 12)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('$score',
                  style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      color: _color,
                      height: 1)),
              const SizedBox(width: 2),
              Text('/100',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: AppColors.surfaceAlt,
              valueColor: AlwaysStoppedAnimation(_color),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});
  final String summary;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.auto_awesome_outlined,
                  size: 16, color: AppColors.primary),
              SizedBox(width: 6),
              Text('Summary',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 8),
          Text(summary,
              style: const TextStyle(fontSize: 13, height: 1.5)),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: child,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, this.danger = false});
  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? AppColors.danger : AppColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
