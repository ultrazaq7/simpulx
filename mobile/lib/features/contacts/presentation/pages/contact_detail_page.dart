import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/i18n/stage_label.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../chat/domain/entities/conversation.dart';
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

class _ContactDetailPageState extends ConsumerState<ContactDetailPage>
    with SingleTickerProviderStateMixin {
  final _scrollController = ScrollController();
  final _historyKey = GlobalKey();
  late final TabController _tabController;

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
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.scrollToHistory ? 1 : 0,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final contact = ref.watch(contactByIdProvider(widget.contactId));

    if (contact == null) {
      return Scaffold(
        appBar: AppBar(
          title: Text('Contact'.tr(context)),
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
        title: Text('Contact Details'.tr(context)),
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
            tooltip: 'Edit'.tr(context),
            onPressed: () => showContactForm(context, existing: c),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // ── Fixed header: identity + actions + lead score ──
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
            child: Column(
              children: [
                _IdentityCard(contact: c),
                const SizedBox(height: AppSpacing.md),
                _ActionsRow(
                  onCall: () => _call(context, c.phone),
                  onChat: c.hasConversation
                      ? () => context.push('/chat/${c.conversationId}')
                      : null,
                  onActions: c.hasConversation
                      ? () =>
                          showConversationActions(context, _asConversation(c))
                      : null,
                  onNotes: c.hasConversation
                      ? () => showNotesSheet(context, c.conversationId!)
                      : null,
                ),
                if (c.leadScore != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  _LeadScoreCard(score: c.leadScore!),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          // ── Tab bar ──
          Container(
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(10),
            ),
            padding: const EdgeInsets.all(3),
            child: TabBar(
              controller: _tabController,
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Theme.of(context).colorScheme.surfaceContainerHighest
                    : Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Theme.of(context).brightness == Brightness.dark
                    ? Border.all(color: Colors.white.withValues(alpha: 0.1), width: 1)
                    : null,
                boxShadow: [
                  if (Theme.of(context).brightness == Brightness.light)
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                ],
              ),
              dividerColor: Colors.transparent,
              labelColor: Theme.of(context).colorScheme.onSurface,
              unselectedLabelColor: AppColors.textMuted,
              labelStyle: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600),
              unselectedLabelStyle: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w500),
              tabs: [
                Tab(text: 'Overview'.tr(context)),
                Tab(text: 'History'.tr(context)),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          // ── Tab content ──
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Overview tab
                SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
                  child: _LeadContextCard(contact: c),
                ),
                // History tab
                SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
                  child: _HistoryCard(
                      key: _historyKey, contactId: c.id),
                ),
              ],
            ),
          ),
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
                          AppSnackbar.show(context, 'Phone number copied'.tr(context));
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
                    _Pill(text: c.sourceLabel.tr(context)),
                    for (final t in c.tags) _Pill(text: t),
                    if (c.blacklisted)
                      _Pill(text: 'Blacklisted'.tr(context), danger: true),
                  ],
                ),
              ],
            ),
          ),
        ],
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
                Text(label.tr(context),
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
          _row(context, 'Stage',
              c.stageName != null ? stageLabel(context, c.stageName) : 'Unset'.tr(context)),
          if (c.lostReason != null && c.lostReason!.isNotEmpty)
            _row(context, 'Lost reason',
                (c.lostReason![0].toUpperCase() +
                        c.lostReason!.substring(1).replaceAll('_', ' '))
                    .tr(context)),
          // Only show fields the AI has captured — empty ones are hidden.
          if (c.interestLevel != null && c.interestLevel!.isNotEmpty)
            _row(context, 'Interest',
                c.interestLevel![0].toUpperCase() + c.interestLevel!.substring(1)),
          if (c.carBrand != null && c.carBrand!.isNotEmpty)
            _row(context, 'Brand', c.carBrand!),
          if (c.carModel != null && c.carModel!.isNotEmpty)
            _row(context, 'Model', c.carModel!),
          if (c.city != null && c.city!.isNotEmpty)
            _row(context, 'City', c.city!),
          if (c.purchaseTimeframe != null && c.purchaseTimeframe!.isNotEmpty)
            _row(context, 'Purchase time', c.purchaseTimeframe!),
          _row(context, 'Assigned', c.agentName ?? 'Unassigned'.tr(context)),
          if (c.campaignName != null) _row(context, 'Campaign', c.campaignName!),
          _row(context, 'Source', c.sourceLabel.tr(context)),
          if (c.sourceId != null && c.sourceId!.isNotEmpty)
            _row(context, 'Source ID', c.sourceId!),
          if (c.sourceUrl != null && c.sourceUrl!.isNotEmpty)
            _row(context, 'Source URL', c.sourceUrl!,
                onTap: () => _openUrl(c.sourceUrl!)),
          if (c.lastMessageAt != null)
            _row(context, 'Last activity', formatHistoryTimestamp(c.lastMessageAt!)),
          if (c.createdAt != null)
            _row(context, 'Added', formatHistoryTimestamp(c.createdAt!)),
        ],
      ),
    );
  }

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
            child: Text(label.tr(context),
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
          async.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                  child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))),
            ),
            error: (_, _) => Text('Could not load history'.tr(context),
                style: theme.textTheme.bodySmall?.copyWith(color: muted)),
            data: (raw) {
              if (raw.isEmpty) {
                return Text('No changes yet.'.tr(context),
                    style: theme.textTheme.bodySmall?.copyWith(color: muted));
              }
              // Backend returns newest-first; display oldest-first (ascending).
              final events = raw.reversed.toList();
              final hasMore = events.length > _collapsedCount;
              // Collapsed: show the oldest items (head of the ascending list).
              final shown = _expanded ? events : events.take(_collapsedCount).toList();
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
                                    ? 'Show less'.tr(context)
                                    : 'Show {count} more'.trp(context,
                                        {'count': events.length - _collapsedCount}),
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

/// Translated mirror of [ContactActivity.label]: same shape as the web history,
/// but each phrase is localized and the stage value goes through [stageLabel].
String _activityLabel(BuildContext context, ContactActivity e) {
  String d(String k) => (e.detail[k] ?? '').toString();
  switch (e.type) {
    case 'stage_changed':
      final raw = d('stage_name').isNotEmpty ? d('stage_name') : d('stage_id');
      final v = raw.isNotEmpty ? stageLabel(context, raw) : '-';
      return 'Stage changed to {v}'.trp(context, {'v': v});
    case 'status_changed':
      final v = d('status').isNotEmpty ? d('status') : '-';
      return 'Status set to {v}'.trp(context, {'v': v.tr(context)});
    case 'interest_changed':
      final v = d('interest_level').isNotEmpty ? d('interest_level') : '-';
      return 'Interest set to {v}'.trp(context, {'v': v});
    case 'assigned':
      final a = d('agent_name');
      return a.isNotEmpty
          ? 'Assigned to {a}'.trp(context, {'a': a})
          : 'Assigned'.tr(context);
    case 'closed':
      return 'Conversation closed'.tr(context);
    case 'reopened':
      return 'Conversation reopened'.tr(context);
    case 'handoff':
      return 'Handed off to a human agent'.tr(context);
    default:
      return e.type.replaceAll('_', ' ');
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
    final when = formatHistoryTimestamp(event.createdAt);
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(when,
                style: TextStyle(color: muted, fontSize: 13)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_activityLabel(context, event),
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
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
              Text('Buy potential'.tr(context),
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const Spacer(),
              Text(_band.tr(context),
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
              Text('/100'.tr(context),
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
