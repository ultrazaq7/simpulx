import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';


import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/i18n/stage_label.dart';
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

  void _drillChat(WidgetRef ref, BuildContext context, InboxFilter filter) {
    ref.read(inboxFilterProvider.notifier).set(filter);
    context.go('/chat');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // One screen: the agent/manager report. Campaign Performance and AI Usage
    // were removed from mobile — they belong on the web dashboard, where there's
    // room to make them readable.
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const _SimpulxWordmark(),
      ),
      body: SafeArea(top: false, child: _overview(context, ref)),
    );
  }

  Widget _overview(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
    final user = ref.watch(sessionControllerProvider).user;
    final firstName = (user?.name ?? '').split(' ').first;
    return RefreshIndicator(
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
          onDrillChat: (filter) => _drillChat(ref, context, filter),
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
    required this.onDrillChat,
  });

  final String firstName;
  final DashboardCards cards;
  final bool showManager;
  final void Function(InboxFilter filter) onDrillChat;

  @override
  Widget build(BuildContext context) {
    final items = <_CardData>[
      _CardData('Active', cards.open, Icons.inbox_rounded,
          AppColors.primary, InboxFilter.open),
      _CardData('Hot', cards.hot, Icons.local_fire_department_rounded,
          AppColors.hot, InboxFilter.hot),
      _CardData('Awaiting reply', cards.unreplied, Icons.reply_rounded,
          AppColors.warning, InboxFilter.unreplied),
      _CardData('Unread', cards.unread, Icons.mark_chat_unread_rounded,
          AppColors.brandGreenDark, InboxFilter.unread),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      children: [
        EntranceFade(
          delay: const Duration(milliseconds: 40),
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            // Shorter tiles: the count and label need little height, and the extra
            // padding made the gap to the cards below look inconsistent.
            childAspectRatio: 1.85,
            children: [
              for (final item in items)
                _ActionCard(data: item, onTap: () => onDrillChat(item.filter)),
            ],
          ),
        ),
        EntranceFade(
          delay: const Duration(milliseconds: 130),
          child: showManager
              ? _ManagerSection(onDrill: onDrillChat)
              : _AgentAnalyticsSection(onDrill: onDrillChat),
        ),
      ],
    );
  }

}

/// Table header cell: single line, ellipsis rather than a mid-word break.
class _Th extends StatelessWidget {
  const _Th(this.text, this.align);
  final String text;
  final TextAlign align;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: align,
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            color: AppColors.textMuted),
      );
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
                data.label.tr(context),
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
  const _ManagerSection({required this.onDrill});
  final void Function(InboxFilter filter) onDrill;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(dashboardStatsProvider);
    final analytics = ref.watch(managerAnalyticsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Same 16 gap the agent view uses between the KPI grid and the first
        // card below it - stacking 24 here and another 16 inside made the
        // manager dashboard open with a visibly wider hole than the agent one.
        const SizedBox(height: 16),
        analytics.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (_, _) => GestureDetector(
            onTap: () => ref.invalidate(managerAnalyticsProvider),
            child: _Card(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.refresh, size: 16, color: AppColors.textSecondary),
                  SizedBox(width: 8),
                  Text('Could not load analytics. Tap to retry.'.tr(context),
                      style: TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
          ),
          data: (a) => Column(
            children: [
              // Response time first (the same card the agent view opens with),
              // then the team, then the pipeline itself.
              _ResponseCard(a),
              const SizedBox(height: 12),
              if (a.agents.isNotEmpty) ...[
                _LeaderboardCard(agents: a.agents, onDrill: onDrill),
                const SizedBox(height: 12),
              ],
              _InterestSplitCard(a, onDrill: onDrill),
              const SizedBox(height: 12),
              if (a.stages.isNotEmpty) ...[
                _StageSplitCard(stages: a.stages, onDrill: onDrill),
                const SizedBox(height: 12),
              ],
              // Lost Analysis
              _LostAnalysisCard(analytics: a, onDrill: onDrill),
              if (a.lostReasons.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LostReasonsCard(reasons: a.lostReasons, onDrill: onDrill),
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


// ── Stage Split (leads per pipeline stage) ─────────────────────
class _StageSplitCard extends StatelessWidget {
  const _StageSplitCard({required this.stages, this.onDrill});
  final List<StageStat> stages;
  final void Function(InboxFilter filter)? onDrill;

  @override
  Widget build(BuildContext context) {
    // "Lost" is now a stage in the list, so the total is simply the stage sum
    // and every row's share adds up to 100%.
    final total = stages.fold<int>(0, (s, x) => s + x.count);

    final activeStages = stages.where((s) => !s.name.toLowerCase().startsWith('lost')).toList();
    final lostStages = stages.where((s) => s.name.toLowerCase().startsWith('lost')).toList();
    final lostCount = lostStages.fold<int>(0, (sum, s) => sum + s.count);
    if (lostStages.isNotEmpty) {
      activeStages.add(StageStat(name: 'Lost', count: lostCount, sortOrder: 99));
    }

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Stage Breakdown'.tr(context),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
              _TotalBadge(total),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < activeStages.length; i++)
            _buildStageRow(context, activeStages[i], i, total),
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
    return InkWell(
      onTap: onDrill != null
          ? () {
              if (s.name == 'Lost') {
                onDrill!(const InboxFilter(status: 'closed'));
              } else {
                onDrill!(InboxFilter(stageName: s.name));
              }
            }
          : null,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Expanded(
            flex: 7,
            child: Text(stageLabel(context, s.name),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 5,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (pct / 100).clamp(0, 1),
                minHeight: 6,
                backgroundColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
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
          if (onDrill != null)
            Icon(Icons.chevron_right, size: 14, color: AppColors.textMuted),
        ],
      ),
      ),
    );
  }

}

// ── Lost Analysis Card (matching web) ─────────────────────
class _LostAnalysisCard extends StatelessWidget {
  const _LostAnalysisCard({required this.analytics, required this.onDrill});
  final ManagerAnalytics analytics;
  final void Function(InboxFilter filter) onDrill;

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
              Text('Lost Analysis'.tr(context),
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              GestureDetector(
                onTap: () => onDrill(const InboxFilter(status: 'closed')),
                child: Text('${analytics.lost}',
                    style: const TextStyle(
                        fontSize: 36, fontWeight: FontWeight.w800, color: AppColors.danger)),
              ),
              const SizedBox(width: 8),
              // Spam is folded into Lost now (no separate junk badge), matching web.
              Text('total lost leads'.tr(context),
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
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
                      Text('Loss rate'.tr(context),
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
                      Text('Purchase rate'.tr(context),
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

class _InterestSplitCard extends StatelessWidget {
  const _InterestSplitCard(this.a, {required this.onDrill});
  final ManagerAnalytics a;
  final void Function(InboxFilter filter) onDrill;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Interest Split'.tr(context),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
              _TotalBadge(a.total),
            ],
          ),
          const SizedBox(height: 14),
          _InterestRow('Hot', a.hot, a.total, color: AppColors.hot,
              onTap: () => onDrill(const InboxFilter(interestLevel: 'hot'))),
          _InterestRow('Warm', a.warm, a.total, color: AppColors.warm,
              onTap: () => onDrill(const InboxFilter(interestLevel: 'warm'))),
          _InterestRow('Cold', a.cold, a.total, color: AppColors.cold,
              onTap: () => onDrill(const InboxFilter(interestLevel: 'cold'))),
          _InterestRow('Unclassified'.tr(context), a.unknown, a.total, color: AppColors.textMuted,
              onTap: null), // Unclassified usually doesn't have a direct filter or is just empty string
        ],
      ),
    );
  }
}

/// Small pill showing a breakdown card's total lead count, top-right of the header.
class _TotalBadge extends StatelessWidget {
  const _TotalBadge(this.total);
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '{count} leads'.trp(context, {'count': total}),
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

class _InterestRow extends StatelessWidget {
  const _InterestRow(this.label, this.value, this.total, {required this.color, this.onTap});
  final String label;
  final int value;
  final int total;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 12),
            SizedBox(
                width: 112,
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w500))),
            Expanded(
              flex: 2,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  backgroundColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 28,
              child: Text('$value',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700, color: color)),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded,
                size: 16,
                color: onTap != null
                    ? AppColors.textMuted.withValues(alpha: 0.4)
                    : Colors.transparent),
          ],
        ),
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
        Text(label.tr(context),
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _LeaderboardCard extends StatelessWidget {
  const _LeaderboardCard({required this.agents, required this.onDrill});
  final List<AgentPerformance> agents;
  final void Function(InboxFilter filter) onDrill;

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
              Text('Team Performance'.tr(context),
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ],
          ),
          const SizedBox(height: 12),
          // Table header
          // Headers never wrap: on a phone the metric columns are narrow enough
          // that a word like "Prospek" used to break mid-word ("Prospe k").
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(flex: 5, child: _Th('Agent'.tr(context), TextAlign.left)),
                Expanded(flex: 3, child: _Th('Leads'.tr(context), TextAlign.center)),
                Expanded(flex: 3, child: _Th('Won'.tr(context), TextAlign.center)),
                Expanded(flex: 3, child: _Th('Avg RT'.tr(context), TextAlign.center)),
                Expanded(flex: 2, child: _Th('<5m'.tr(context), TextAlign.right)),
              ],
            ),
          ),
          const Divider(height: 1),
          for (final ag in top)
            InkWell(
              onTap: () => onDrill(InboxFilter(agentName: ag.agent)),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    Expanded(
                      flex: 5,
                      child: Text(ag.agent,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      flex: 3,
                      child: Text('${ag.leads}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12)),
                    ),
                    Expanded(
                      flex: 3,
                      child: Text('${ag.won}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.success)),
                    ),
                    Expanded(
                      flex: 3,
                      child: Text(_fmtDuration(ag.avgRtMin),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12)),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text('${ag.within5Pct.toStringAsFixed(0)}%',
                          textAlign: TextAlign.right,
                          maxLines: 1,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: ag.within5Pct >= 70
                                  ? AppColors.success
                                  : null)),
                    ),
                    Icon(Icons.chevron_right, size: 14, color: AppColors.textMuted),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _LostReasonsCard extends StatelessWidget {
  const _LostReasonsCard({required this.reasons, this.onDrill});
  final List<LostReason> reasons;
  final void Function(InboxFilter filter)? onDrill;

  @override
  Widget build(BuildContext context) {
    final maxCount = reasons.fold<int>(1, (mx, r) => r.count > mx ? r.count : mx);
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Lost Reasons'.tr(context),
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 12),
          for (var i = 0; i < reasons.take(6).length; i++)
            InkWell(
              onTap: onDrill != null && reasons[i].rawReason != null
                  ? () => onDrill!(InboxFilter(lostReason: reasons[i].rawReason))
                  : null,
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(reasons[i].reason.tr(context),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                      ),
                      Text('${reasons[i].count}',
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.danger)),
                      if (onDrill != null) ...[
                        const SizedBox(width: 2),
                        Icon(Icons.chevron_right, size: 14, color: AppColors.textMuted),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: (reasons[i].count / maxCount).clamp(0, 1),
                      minHeight: 5,
                      backgroundColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
                      valueColor: AlwaysStoppedAnimation(
                        i == 0 ? AppColors.danger : i == 1 ? AppColors.warning : const Color(0xFFFBBF24),
                      ),
                    ),
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
        color: AppColors.brandGreenDark.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brandGreenDark.withValues(alpha: 0.10)),
      ),
      child: child,
    );
  }
}

// ── Agent analytics (personal funnel + avg response) ─────────
class _AgentAnalyticsSection extends ConsumerWidget {
  const _AgentAnalyticsSection({required this.onDrill});
  final void Function(InboxFilter filter) onDrill;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(managerAnalyticsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        analytics.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (_, _) => GestureDetector(
            onTap: () => ref.invalidate(managerAnalyticsProvider),
            child: _Card(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.refresh, size: 16, color: AppColors.textSecondary),
                  SizedBox(width: 8),
                  Text('Could not load analytics. Tap to retry.'.tr(context),
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
              // Personal interest split (same style as manager)
              _InterestSplitCard(a, onDrill: onDrill),
              // Personal stage pipeline breakdown
              if (a.stages.isNotEmpty) ...[
                const SizedBox(height: 12),
                _StageSplitCard(stages: a.stages, onDrill: onDrill),
              ],
              // Personal lost reasons
              if (a.lostReasons.isNotEmpty) ...[
                const SizedBox(height: 12),
                _LostReasonsCard(reasons: a.lostReasons, onDrill: onDrill),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

