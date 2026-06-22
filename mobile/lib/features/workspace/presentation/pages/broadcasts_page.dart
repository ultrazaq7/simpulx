import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../domain/broadcast_summary.dart';
import '../workspace_providers.dart';

/// Broadcast monitor: status + delivery, with "Send now" for drafts.
class BroadcastsPage extends ConsumerWidget {
  const BroadcastsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(broadcastsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Broadcasts')),
      body: async.when(
        loading: () => const AppLoader(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(broadcastsProvider.notifier).refresh(),
        ),
        data: (list) => RefreshIndicator(
          onRefresh: () => ref.read(broadcastsProvider.notifier).refresh(),
          child: list.isEmpty
              ? ListView(children: [
                  SizedBox(height: MediaQuery.of(context).size.height * 0.2),
                  const AppEmptyState(
                    icon: Icons.campaign_outlined,
                    title: 'No broadcasts',
                    message: 'Create campaigns on the web; monitor and send here.',
                  ),
                ])
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) => _BroadcastCard(
                    broadcast: list[i],
                    onSend: () => _confirmSend(context, ref, list[i]),
                  ),
                ),
        ),
      ),
    );
  }

  Future<void> _confirmSend(
    BuildContext context,
    WidgetRef ref,
    BroadcastSummary b,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Send "${b.name}"?'),
        content: Text(
            'This will queue the broadcast to ${b.totalRecipients} recipients.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Send')),
        ],
      ),
    );
    if (ok != true) return;
    final sent = await ref.read(broadcastsProvider.notifier).send(b.id);
    messenger.showSnackBar(SnackBar(
      content: Text(sent ? 'Broadcast queued' : 'Could not send broadcast'),
    ));
  }
}

class _BroadcastCard extends StatelessWidget {
  const _BroadcastCard({required this.broadcast, required this.onSend});
  final BroadcastSummary broadcast;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final b = broadcast;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(b.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15)),
              ),
              _StatusChip(status: b.status),
            ],
          ),
          if (b.createdAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(formatDayLabel(b.createdAt!),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textMuted)),
            ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: b.deliveryRate,
              minHeight: 6,
              backgroundColor: AppColors.surfaceAlt,
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('${b.sentCount}/${b.totalRecipients} sent',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              if (b.failedCount > 0) ...[
                const SizedBox(width: 10),
                Text('${b.failedCount} failed',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.danger)),
              ],
              const Spacer(),
              if (b.canSend)
                FilledButton.tonal(
                  onPressed: onSend,
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                  child: const Text('Send now'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  Color get _color => switch (status) {
        'completed' => AppColors.success,
        'sending' || 'queued' => AppColors.info,
        'failed' => AppColors.danger,
        'scheduled' => AppColors.warning,
        _ => AppColors.textMuted,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(status,
          style: TextStyle(
              fontSize: 11, color: _color, fontWeight: FontWeight.w700)),
    );
  }
}
