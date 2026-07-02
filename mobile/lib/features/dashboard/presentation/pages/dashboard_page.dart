import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';


import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/widgets/entrance_fade.dart';
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
        const SizedBox(height: 18),
        EntranceFade(
          delay: const Duration(milliseconds: 40),
          child: GridView.count(
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
        ),
        EntranceFade(
          delay: const Duration(milliseconds: 130),
          child: showManager
              ? const _ManagerSection()
              : const _AgentAnalyticsSection(),
        ),
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
        analytics.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (_, _) => GestureDetector(
            onTap: () => ref.invalidate(managerAnalyticsProvider),
            child: const _Card(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.refresh, size: 16, color: AppColors.textSecondary),
                  SizedBox(width: 8),
                  Text('Could not load analytics. Tap to retry.',
                      style: TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
          ),
          data: (a) => Column(
            children: [
              // Stage Funnel
              if (a.funnelStages.isNotEmpty) ...[
                _StageFunnelCard(stages: a.funnelStages, lostCount: a.lost),
                const SizedBox(height: 12),
              ],
              // Stage Split
              if (a.stages.isNotEmpty) ...[
                _StageSplitCard(stages: a.stages),
                const SizedBox(height: 12),
              ],
              // Interest Funnel
              _FunnelCard(a),
              const SizedBox(height: 12),
              // Response Time
              _ResponseCard(a),
              const SizedBox(height: 12),
              // Lost Analysis
              _LostAnalysisCard(analytics: a),
              if (a.lostReasons.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LostReasonsCard(reasons: a.lostReasons),
              ],
              if (a.agents.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LeaderboardCard(agents: a.agents),
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

// ── Stage Funnel (like web's LeadFunnel) ─────────────────────
const _funnelColors = [
  Color(0xFFA7DACE), Color(0xFF7FC9B8), Color(0xFF57B8A1),
  Color(0xFF2D8B73), Color(0xFF26735F), Color(0xFF1E5C4C), Color(0xFF174539),
];

class _StageFunnelCard extends StatelessWidget {
  const _StageFunnelCard({required this.stages, required this.lostCount});
  final List<FunnelStageStat> stages;
  final int lostCount;

  @override
  Widget build(BuildContext context) {
    final top = stages.isNotEmpty ? stages.first.reached : 1;
    final maxReached = top > 0 ? top : 1;
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Lead Funnel',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text('Stage-to-stage conversion',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(height: 14),
          for (var i = 0; i < stages.length; i++) ...[
            _buildFunnelRow(context, stages[i], i, maxReached),
            if (i < stages.length - 1) const SizedBox(height: 8),
          ],
          if (lostCount > 0) ...[
            const SizedBox(height: 8),
            _buildLostRow(context, lostCount, maxReached),
          ],
        ],
      ),
    );
  }

  Widget _buildLostRow(BuildContext context, int lost, int maxReached) {
    final pct = (lost / maxReached * 100).clamp(0, 100).toDouble();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Lost',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
            Text('$lost',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Container(
            height: 20,
            width: double.infinity,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: pct / 100,
              child: Container(color: AppColors.danger),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFunnelRow(BuildContext context, FunnelStageStat s, int idx, int maxReached) {
    final pct = (s.reached / maxReached * 100).clamp(0, 100).toDouble();
    final convPct = idx == 0
        ? null
        : (stages[idx - 1].reached > 0
            ? (s.reached / stages[idx - 1].reached * 100)
            : 0.0);
    final color = _funnelColors[idx % _funnelColors.length];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(s.name,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (convPct != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: convPct >= 50
                          ? AppColors.success.withValues(alpha: 0.12)
                          : convPct >= 25
                              ? AppColors.warning.withValues(alpha: 0.12)
                              : AppColors.textMuted.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('${convPct.round()}%',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: convPct >= 50
                              ? AppColors.success
                              : convPct >= 25
                                  ? AppColors.warning
                                  : AppColors.textMuted,
                        )),
                  ),
                Text('${s.reached}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
              ],
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Container(
            height: 20,
            width: double.infinity,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: pct / 100,
              child: Container(color: color),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Stage Split (leads per pipeline stage) ─────────────────────
class _StageSplitCard extends StatelessWidget {
  const _StageSplitCard({required this.stages});
  final List<StageStat> stages;

  @override
  Widget build(BuildContext context) {
    // "Lost" is now a stage in the list, so the total is simply the stage sum
    // and every row's share adds up to 100%.
    final total = stages.fold<int>(0, (s, x) => s + x.count);
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Stage Breakdown',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 12),
          for (var i = 0; i < stages.length; i++)
            _buildStageRow(context, stages[i], i, total),
        ],
      ),
    );
  }

  Widget _buildStageRow(BuildContext context, StageStat s, int idx, int total) {
    // Lost stages (Lost Purchase / Lost Not Purchase) -> always render in red.
    final color = s.name.toLowerCase().startsWith('lost')
        ? AppColors.danger
        : _funnelColors[idx % _funnelColors.length];
    final pct = total > 0 ? (s.count / total * 100) : 0.0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Expanded(child: Text(s.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
          SizedBox(
            width: 100,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (pct / 100).clamp(0, 1),
                minHeight: 6,
                backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 30,
            child: Text('${s.count}', textAlign: TextAlign.right,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
          ),
        ],
      ),
    );
  }

}

// ── Lost Analysis Card (matching web) ─────────────────────
class _LostAnalysisCard extends StatelessWidget {
  const _LostAnalysisCard({required this.analytics});
  final ManagerAnalytics analytics;

  @override
  Widget build(BuildContext context) {
    final lossRate = analytics.total > 0
        ? (analytics.lost / analytics.total * 100).round()
        : 0;
    final purchaseRate = analytics.total > 0
        ? (analytics.won / analytics.total * 100).round()
        : 0;

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.trending_down_rounded, size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              const Text('Lost Analysis',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text('${analytics.lost}',
                  style: const TextStyle(
                      fontSize: 36, fontWeight: FontWeight.w800, color: AppColors.danger)),
              const SizedBox(width: 8),
              Text('total lost leads',
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              if (analytics.junk > 0) ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.block, size: 12, color: AppColors.warning),
                      const SizedBox(width: 4),
                      Text('${analytics.junk} spam',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.warning)),
                    ],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Text('$lossRate%',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.danger)),
                      const Text('Loss rate',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.danger)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Text('$purchaseRate%',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.success)),
                      const Text('Purchase rate',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.success)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
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
          const Text('Interest Split',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
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

String _fmtDuration(double minutes) {
  if (minutes < 1) return '${(minutes * 60).round()}s';
  if (minutes < 60) return '${minutes.round()}m';
  final h = (minutes / 60).floor();
  final m = (minutes % 60).round();
  return m > 0 ? '${h}h ${m}m' : '${h}h';
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
              label: 'Avg response',
              value: _fmtDuration(a.avgRtMin),
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
          Row(
            children: [
              const Icon(Icons.groups_rounded, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              const Text('Team Performance',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ],
          ),
          const SizedBox(height: 12),
          // Table header
          const Padding(
            padding: EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(flex: 3, child: Text('Agent', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted))),
                Expanded(flex: 1, child: Text('Leads', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted))),
                Expanded(flex: 1, child: Text('Won', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted))),
                Expanded(flex: 1, child: Text('Avg RT', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted))),
                Expanded(flex: 1, child: Text('<5m', textAlign: TextAlign.right, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted))),
              ],
            ),
          ),
          const Divider(height: 1),
          for (final ag in top)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(ag.agent,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text('${ag.leads}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12)),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text('${ag.won}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.success)),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text(_fmtDuration(ag.avgRtMin),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12)),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text('${ag.within5Pct.toStringAsFixed(0)}%',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: ag.within5Pct >= 70
                                ? AppColors.success
                                : null)),
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
    final maxCount = reasons.fold<int>(1, (mx, r) => r.count > mx ? r.count : mx);
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Lost Reasons',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 12),
          for (var i = 0; i < reasons.take(6).length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(reasons[i].reason,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                      ),
                      Text('${reasons[i].count}',
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.danger)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: (reasons[i].count / maxCount).clamp(0, 1),
                      minHeight: 5,
                      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation(
                        i == 0 ? AppColors.danger : i == 1 ? AppColors.warning : const Color(0xFFFBBF24),
                      ),
                    ),
                  ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).dividerColor),
        // Layered, low-opacity shadow (Stripe/Linear style) for crisp depth.
        boxShadow: isDark
            ? null
            : const [
                BoxShadow(
                  color: Color(0x0A0B1220),
                  blurRadius: 2,
                  offset: Offset(0, 1),
                ),
                BoxShadow(
                  color: Color(0x140B1220),
                  blurRadius: 16,
                  spreadRadius: -6,
                  offset: Offset(0, 8),
                ),
              ],
      ),
      child: child,
    );
  }
}

// ── Agent analytics (personal funnel + avg response) ─────────
class _AgentAnalyticsSection extends ConsumerWidget {
  const _AgentAnalyticsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(managerAnalyticsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Text('My Performance',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        analytics.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (_, _) => GestureDetector(
            onTap: () => ref.invalidate(managerAnalyticsProvider),
            child: const _Card(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.refresh, size: 16, color: AppColors.textSecondary),
                  SizedBox(width: 8),
                  Text('Could not load analytics. Tap to retry.',
                      style: TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
          ),
          data: (a) => Column(
            children: [
              // Personal response time
              _Card(
                child: Row(
                  children: [
                    Expanded(
                      child: _Metric(
                        label: 'Avg response',
                        value: _fmtDuration(a.avgRtMin),
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
              ),
              const SizedBox(height: 12),
              // Personal interest split
              _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.trending_up_rounded, size: 16, color: AppColors.primary),
                        const SizedBox(width: 6),
                        const Text('My Leads',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const Spacer(),
                        Text('${a.total} total',
                            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _Dot(AppColors.hot, 'Hot ${a.hot}'),
                        const SizedBox(width: 12),
                        _Dot(AppColors.warm, 'Warm ${a.warm}'),
                        const SizedBox(width: 12),
                        _Dot(AppColors.cold, 'Cold ${a.cold}'),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _Dot(AppColors.success, 'Won ${a.won}'),
                        const SizedBox(width: 12),
                        _Dot(AppColors.danger, 'Lost ${a.lost}'),
                      ],
                    ),
                  ],
                ),
              ),
              // Personal stage pipeline breakdown
              if (a.stages.isNotEmpty) ...[
                const SizedBox(height: 12),
                _StageSplitCard(stages: a.stages),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

