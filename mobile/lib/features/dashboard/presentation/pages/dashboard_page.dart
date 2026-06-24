import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../chat/presentation/controllers/inbox_filter.dart';
import '../../domain/dashboard_cards.dart';
import '../../domain/manager_analytics.dart';
import '../dashboard_providers.dart';

/// Agent-first dashboard: a greeting + actionable counts. Each card drills into
/// the filtered inbox. Built for <=5s comprehension.
class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  void _drill(WidgetRef ref, BuildContext context, InboxFilter filter) {
    ref.read(inboxFilterProvider.notifier).set(filter);
    context.go('/chat');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
    final user = ref.watch(sessionControllerProvider).user;
    final firstName = (user?.name ?? '').split(' ').first;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const _SimpulxWordmark(),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(dashboardProvider.notifier).refresh(),
        child: async.when(
          loading: () => const AppLoader(),
          error: (e, _) => ListView(children: [
            SizedBox(height: MediaQuery.of(context).size.height * 0.25),
            AppErrorView(
              failure: e is Failure ? e : null,
              onRetry: () => ref.read(dashboardProvider.notifier).refresh(),
            ),
          ]),
          data: (cards) => _DashboardBody(
            firstName: firstName,
            cards: cards,
            showManager: user?.role.isManagerTier ?? false,
            onDrill: (filter) => _drill(ref, context, filter),
          ),
        ),
      ),
    );
  }
}

/// Simpulx brand wordmark: icon mark + "Simpul" with an orange "x".
class _SimpulxWordmark extends StatelessWidget {
  const _SimpulxWordmark();

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.asset(
            'assets/images/simpulx_logo.png',
            width: 30,
            height: 30,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(width: 8),
        RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
            children: [
              TextSpan(text: 'Simpul', style: TextStyle(color: onSurface)),
              const TextSpan(
                  text: 'x', style: TextStyle(color: AppColors.warning)),
            ],
          ),
        ),
      ],
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({
    required this.firstName,
    required this.cards,
    required this.showManager,
    required this.onDrill,
  });

  final String firstName;
  final DashboardCards cards;
  final bool showManager;
  final void Function(InboxFilter filter) onDrill;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = <_CardData>[
      _CardData('Open leads', cards.open, Icons.inbox_rounded,
          AppColors.primary, InboxFilter.all),
      _CardData('Hot', cards.hot, Icons.local_fire_department_rounded,
          AppColors.hot, InboxFilter.hot),
      _CardData('Follow up now', cards.followUp, Icons.reply_rounded,
          AppColors.warning, InboxFilter.followUp),
      _CardData('Need a call', cards.needCall, Icons.call_rounded,
          AppColors.info, InboxFilter.hot),
      _CardData('Unread', cards.unread, Icons.mark_chat_unread_rounded,
          AppColors.brandGreenDark, InboxFilter.unread),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          _dateLine(),
          style: theme.textTheme.labelMedium?.copyWith(
            color: AppColors.textMuted,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          firstName.isEmpty ? 'Welcome back' : 'Hi $firstName',
          style: theme.textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 2),
        Text(
          'Here is what needs you right now.',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 18),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.45,
          children: [
            for (final item in items)
              _ActionCard(data: item, onTap: () => onDrill(item.filter)),
          ],
        ),
        if (showManager) const _ManagerSection(),
      ],
    );
  }

  String _dateLine() {
    const days = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
      'Sunday'
    ];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
      'Nov', 'Dec'
    ];
    final now = DateTime.now();
    return '${days[now.weekday - 1]}, ${now.day} ${months[now.month - 1]}'
        .toUpperCase();
  }
}

class _CardData {
  const _CardData(this.label, this.count, this.icon, this.color, this.filter);
  final String label;
  final int count;
  final IconData icon;
  final Color color;
  final InboxFilter filter;
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.data, required this.onTap});
  final _CardData data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = data.count > 0;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            color: data.color.withValues(alpha: active ? 0.10 : 0.05),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
                color: data.color.withValues(alpha: active ? 0.22 : 0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: data.color,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: data.color.withValues(alpha: 0.35),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Icon(data.icon, color: Colors.white, size: 20),
                  ),
                  const Spacer(),
                  Text(
                    '${data.count}',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: active ? data.color : AppColors.textMuted,
                      height: 1,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Text(
                data.label,
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurface),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Manager analytics (role-gated) ─────────────────────────

class _ManagerSection extends ConsumerWidget {
  const _ManagerSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(dashboardStatsProvider);
    final analytics = ref.watch(managerAnalyticsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Text('Team overview',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        stats.maybeWhen(
          data: (s) => Row(
            children: [
              _MiniStat('Active', s.active, AppColors.primary),
              _MiniStat('Unassigned', s.unassigned, AppColors.warning),
              _MiniStat('Team', s.team, AppColors.info),
            ],
          ),
          orElse: () => const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        analytics.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (_, _) => const _Card(
            child: Text('Could not load analytics',
                style: TextStyle(color: AppColors.textSecondary)),
          ),
          data: (a) => Column(
            children: [
              _FunnelCard(a),
              const SizedBox(height: 12),
              _ResponseCard(a),
              if (a.agents.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LeaderboardCard(agents: a.agents),
              ],
              if (a.lostReasons.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LostReasonsCard(reasons: a.lostReasons),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.label, this.value, this.color);
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value',
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            Text(label,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class _FunnelCard extends StatelessWidget {
  const _FunnelCard(this.a);
  final ManagerAnalytics a;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Funnel',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 10),
          _FunnelRow('Total leads', a.total, a.total),
          _FunnelRow('Replied', a.replied, a.total),
          _FunnelRow('Engaged', a.engaged, a.total),
          _FunnelRow('Won', a.won, a.total, color: AppColors.success),
          _FunnelRow('Lost', a.lost, a.total, color: AppColors.danger),
          const Divider(height: 18),
          Row(
            children: [
              _Dot(AppColors.hot, 'Hot ${a.hot}'),
              const SizedBox(width: 12),
              _Dot(AppColors.warm, 'Warm ${a.warm}'),
              const SizedBox(width: 12),
              _Dot(AppColors.cold, 'Cold ${a.cold}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _FunnelRow extends StatelessWidget {
  const _FunnelRow(this.label, this.value, this.total, {this.color});
  final String label;
  final int value;
  final int total;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    final c = color ?? AppColors.primary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
              width: 86,
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 8,
                backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                valueColor: AlwaysStoppedAnimation(c),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 36,
            child: Text('$value',
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

class _ResponseCard extends StatelessWidget {
  const _ResponseCard(this.a);
  final ManagerAnalytics a;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          Expanded(
            child: _Metric(
              label: 'Median response',
              value: '${a.medianRtMin.toStringAsFixed(0)}m',
            ),
          ),
          Container(width: 1, height: 36, color: Theme.of(context).colorScheme.outlineVariant),
          Expanded(
            child: _Metric(
              label: 'Within 5 min',
              value: '${a.within5Pct.toStringAsFixed(0)}%',
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        Text(label,
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _LeaderboardCard extends StatelessWidget {
  const _LeaderboardCard({required this.agents});
  final List<AgentPerformance> agents;

  @override
  Widget build(BuildContext context) {
    final top = agents.take(6).toList();
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Agent leaderboard',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 8),
          for (final ag in top)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Text(ag.agent,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text('${ag.leads} leads',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text('${ag.within5Pct.toStringAsFixed(0)}% <5m',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: ag.within5Pct >= 70
                                ? AppColors.success
                                : AppColors.textPrimary)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LostReasonsCard extends StatelessWidget {
  const _LostReasonsCard({required this.reasons});
  final List<LostReason> reasons;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Top lost reasons',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 8),
          for (final r in reasons.take(5))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                      child: Text(r.reason,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13))),
                  Text('${r.count}',
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot(this.color, this.label);
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}
