import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_spacing.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../chat/domain/entities/conversation.dart';
import '../../../chat/presentation/widgets/conversation_actions_sheet.dart';
import '../../../chat/presentation/widgets/notes_sheet.dart';
import '../../domain/entities/contact.dart';
import '../controllers/contacts_providers.dart';
import '../widgets/contact_form_sheet.dart';

/// Lead detail: identity + lead context, with quick actions that reuse the
/// chat feature's action sheet / notes for the linked conversation.
class ContactDetailPage extends ConsumerWidget {
  const ContactDetailPage({super.key, required this.contactId});

  final String contactId;

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
  Widget build(BuildContext context, WidgetRef ref) {
    final contact = ref.watch(contactByIdProvider(contactId));

    if (contact == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Contact')),
        body: const AppLoader(),
      );
    }
    final c = contact;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lead'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit',
            onPressed: () => showContactForm(context, existing: c),
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'delete') {
                final ok = await _confirmDelete(context);
                if (ok != true) return;
                final deleted = await ref
                    .read(contactsProvider.notifier)
                    .deleteContact(c.id);
                if (deleted && context.mounted) context.pop();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'delete', child: Text('Delete contact')),
            ],
          ),
        ],
      ),
      body: ListView(
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
        ],
      ),
    );
  }

  Future<bool?> _confirmDelete(BuildContext context) {
    return showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete contact?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete'),
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
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Phone number copied to clipboard'),
                              duration: Duration(seconds: 2),
                            ),
                          );
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
                    if (c.sourceChannel != null)
                      _Pill(text: c.sourceChannel!),
                    for (final t in c.tags) _Pill(text: t),
                    if (c.blacklisted)
                      const _Pill(text: 'Blacklisted', danger: true),
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
          _row(context, 'Stage', c.stageName ?? 'Not set'),
          if (c.interestLevel != null)
            _row(context, 'Interest',
                c.interestLevel![0].toUpperCase() + c.interestLevel!.substring(1)),
          _row(context, 'Assigned', c.agentName ?? 'Unassigned'),
          if (c.campaignName != null) _row(context, 'Campaign', c.campaignName!),
          if (c.lastMessageAt != null)
            _row(context, 'Last activity',
                '${formatDayLabel(c.lastMessageAt!)} ${formatBubbleTime(c.lastMessageAt!)}'),
          if (c.createdAt != null)
            _row(context, 'Added', formatDayLabel(c.createdAt!)),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) {
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
            child: Text(value,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600)),
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
