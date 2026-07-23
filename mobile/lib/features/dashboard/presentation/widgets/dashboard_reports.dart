import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/entrance_fade.dart';
import '../../domain/ad_performance.dart';
import '../../domain/ai_usage.dart';
import '../../domain/subscription_info.dart';
import '../dashboard_providers.dart';

// ── Feature branding (labels + colour), matching the web AI Usage report. ──
String _featureLabel(BuildContext c, String key) {
  switch (key) {
    case 'nurture':
      return 'Nurture reply'.tr(c);
    case 'followup':
      return 'Follow-up'.tr(c);
    case 'transcribe':
      return 'Voice transcript'.tr(c);
    case 'ads_copy':
      return 'Ad copy'.tr(c);
    case 'summary':
      return 'Summary'.tr(c);
    case 'catalog':
      return 'Catalog upload'.tr(c);
    default:
      return key.isEmpty
          ? '-'
          : key[0].toUpperCase() + key.substring(1).replaceAll('_', ' ');
  }
}

const _featureColors = <String, Color>{
  'nurture': Color(0xFF2D8B73),
  'followup': Color(0xFF57B8A1),
  'transcribe': Color(0xFF4E5CD6),
  'ads_copy': Color(0xFFE08D3C),
  'summary': Color(0xFF7C3AED),
  'catalog': Color(0xFFDB4C67),
};
Color _featureColor(String key) => _featureColors[key] ?? AppColors.primary;

/// Segmented switcher for the dashboard: Overview · AI Usage · Campaigns.
class DashboardSwitcher extends ConsumerWidget {
  const DashboardSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(dashboardTabProvider);
    final theme = Theme.of(context);
    // Tab values are stable (0 Overview · 1 Campaigns · 2 AI Usage); AI Usage sits
    // on the far right per design. Campaign performance is manager+ only — an
    // agent sees just their assigned work (Overview) and their own AI usage.
    final isManager =
        ref.watch(sessionControllerProvider).user?.role.isManagerTier ?? false;
    final labels = <(int, String)>[
      (0, 'General Report'.tr(context)),
      if (isManager) (1, 'Campaign Performance'.tr(context)),
      (2, 'AI Usage'.tr(context)),
    ];
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.06)
            : const Color(0xFFEFF1F1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final entry in labels)
            Expanded(
              child: _SwitchTab(
                label: entry.$2,
                selected: tab == entry.$1,
                onTap: () => ref.read(dashboardTabProvider.notifier).set(entry.$1),
              ),
            ),
        ],
      ),
    );
  }
}

/// One segment. A plain, self-contained selected pill (no drop shadow) so
/// switching never leaves a lingering shade behind the way an animated shadow
/// did; only the pill under the finger is ever tinted.
class _SwitchTab extends StatelessWidget {
  const _SwitchTab(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: selected ? theme.colorScheme.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          border: selected
              ? Border.all(
                  color: theme.brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.10)
                      : Colors.black.withValues(alpha: 0.05))
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? theme.colorScheme.onSurface : AppColors.textMuted,
          ),
        ),
      ),
    );
  }
}

// ── AI Usage ──────────────────────────────────────────────
class AiUsageView extends ConsumerWidget {
  const AiUsageView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(aiUsageProvider);
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(top: 60),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.only(top: 40),
        child: AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.invalidate(aiUsageProvider),
        ),
      ),
      data: (u) => Column(
        children: [
          EntranceFade(
            delay: const Duration(milliseconds: 40),
            child: _CreditHero(
                usage: u, sub: ref.watch(subscriptionProvider).value),
          ),
          const SizedBox(height: 12),
          if (u.byFeature.isNotEmpty)
            EntranceFade(
              delay: const Duration(milliseconds: 100),
              child: _FeatureBreakdown(features: u.byFeature),
            ),
          if (u.daily.isNotEmpty) ...[
            const SizedBox(height: 12),
            EntranceFade(
              delay: const Duration(milliseconds: 160),
              child: _DailyTrend(daily: u.daily),
            ),
          ],
          if (u.byCampaign.isNotEmpty) ...[
            const SizedBox(height: 12),
            EntranceFade(
              delay: const Duration(milliseconds: 220),
              child: _UsageByCampaign(campaigns: u.byCampaign),
            ),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _CreditHero extends StatelessWidget {
  const _CreditHero({required this.usage, this.sub});
  final AiUsage usage;
  final SubscriptionInfo? sub;

  @override
  Widget build(BuildContext context) {
    // Prefer the plan quota (the billing truth) for total/remaining; fall back to
    // the sum of per-campaign allocations when the subscription can't be read.
    final used = sub?.usedCredits ?? usage.totalUsed;
    final allocated =
        (sub != null && sub!.totalCredits > 0) ? sub!.totalCredits : usage.totalAllocated;
    final remaining =
        sub != null ? sub!.remaining : usage.totalRemaining;
    final frac = allocated > 0 ? (used / allocated).clamp(0.0, 1.0) : 0.0;
    return _ReportCard(
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(
                width: 108,
                height: 108,
                child: CustomPaint(
                  painter: _GaugePainter(
                    fraction: frac.toDouble(),
                    track: AppColors.primary.withValues(alpha: 0.12),
                    fill: AppColors.primary,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('$used',
                            style: const TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w800,
                                height: 1)),
                        Text('used'.tr(context),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AI credits'.tr(context),
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                        allocated > 0
                            ? '{used} of {total} used'.trp(context,
                                {'used': '$used', 'total': '$allocated'})
                            : '{used} credits used'
                                .trp(context, {'used': '$used'}),
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                            child: _HeroStat(
                                label: 'Remaining'.tr(context),
                                value: '$remaining',
                                color: AppColors.success)),
                        const SizedBox(width: 8),
                        Expanded(
                            child: _HeroStat(
                                label: 'Replies (mo)'.tr(context),
                                value: '${usage.repliesThisMonth}',
                                color: AppColors.ai)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _ExpiryBanner(expiry: sub?.expiry),
        ],
      ),
    );
  }
}

/// Credits DO NOT roll over, so the plan's expiry date is surfaced prominently:
/// a calm chip normally, an amber warning within 7 days, red once expired, and a
/// clear "not set" when the org hasn't configured a renewal date yet.
class _ExpiryBanner extends StatelessWidget {
  const _ExpiryBanner({this.expiry});
  final DateTime? expiry;

  @override
  Widget build(BuildContext context) {
    Color color;
    IconData icon;
    String text;
    if (expiry == null) {
      color = AppColors.textMuted;
      icon = Icons.event_busy_rounded;
      text = 'Credit expiry not set'.tr(context);
    } else {
      final now = DateTime.now();
      final days = expiry!.difference(DateTime(now.year, now.month, now.day)).inDays;
      final dateStr = _fmtDate(expiry!);
      if (days < 0) {
        color = AppColors.danger;
        icon = Icons.error_outline_rounded;
        text = 'Credits expired on {date}'.trp(context, {'date': dateStr});
      } else if (days == 0) {
        color = AppColors.danger;
        icon = Icons.warning_amber_rounded;
        text = 'Credits expire today · no rollover'.tr(context);
      } else if (days <= 7) {
        color = AppColors.warning;
        icon = Icons.warning_amber_rounded;
        text = 'Credits expire in {n}d ({date}) · no rollover'
            .trp(context, {'n': '$days', 'date': dateStr});
      } else {
        color = AppColors.primary;
        icon = Icons.event_available_rounded;
        text = 'Credits expire {date} · no rollover'
            .trp(context, {'date': dateStr});
      }
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600, color: color)),
          ),
        ],
      ),
    );
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  String _fmtDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: color)),
          Text(label,
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

class _FeatureBreakdown extends StatelessWidget {
  const _FeatureBreakdown({required this.features});
  final List<FeatureUsage> features;

  @override
  Widget build(BuildContext context) {
    final max = features.fold<int>(1, (m, f) => f.count > m ? f.count : m);
    return _ReportCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardTitle('Credits by feature'.tr(context)),
          const SizedBox(height: 12),
          for (final f in features) ...[
            Row(
              children: [
                Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                        color: _featureColor(f.feature),
                        shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(_featureLabel(context, f.feature),
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500))),
                Text('${f.count}',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _featureColor(f.feature))),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (f.count / max).clamp(0, 1).toDouble(),
                minHeight: 6,
                backgroundColor:
                    Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06),
                valueColor: AlwaysStoppedAnimation(_featureColor(f.feature)),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _DailyTrend extends StatelessWidget {
  const _DailyTrend({required this.daily});
  final List<DailyUsage> daily;

  @override
  Widget build(BuildContext context) {
    // Collapse per-feature rows to a per-day total, last 14 days.
    final totals = <String, int>{};
    for (final d in daily) {
      totals[d.date] = (totals[d.date] ?? 0) + d.count;
    }
    final dates = totals.keys.toList()..sort();
    final recent = dates.length > 14 ? dates.sublist(dates.length - 14) : dates;
    final values = [for (final d in recent) totals[d] ?? 0];
    final total = values.fold<int>(0, (s, v) => s + v);
    return _ReportCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _CardTitle('Daily credits'.tr(context))),
              Text('{n} total'.trp(context, {'n': '$total'}),
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary)),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 68,
            child: CustomPaint(
              size: Size.infinite,
              painter: _BarsPainter(values: values, color: AppColors.primary),
            ),
          ),
          const SizedBox(height: 4),
          if (recent.isNotEmpty)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_shortDate(recent.first),
                    style:
                        const TextStyle(fontSize: 10, color: AppColors.textMuted)),
                Text(_shortDate(recent.last),
                    style:
                        const TextStyle(fontSize: 10, color: AppColors.textMuted)),
              ],
            ),
        ],
      ),
    );
  }

  String _shortDate(String iso) {
    final parts = iso.split('-');
    return parts.length == 3 ? '${parts[2]}/${parts[1]}' : iso;
  }
}

class _UsageByCampaign extends StatelessWidget {
  const _UsageByCampaign({required this.campaigns});
  final List<CampaignUsage> campaigns;

  @override
  Widget build(BuildContext context) {
    return _ReportCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardTitle('Usage by campaign'.tr(context)),
          const SizedBox(height: 10),
          for (final c in campaigns) ...[
            Row(
              children: [
                Expanded(
                    child: Text(c.campaign,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600))),
                Text(
                    '{used}/{alloc}'.trp(
                        context, {'used': '${c.used}', 'alloc': '${c.allocated}'}),
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary)),
              ],
            ),
            const SizedBox(height: 5),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: c.usedFraction.toDouble(),
                minHeight: 6,
                backgroundColor:
                    Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06),
                valueColor: AlwaysStoppedAnimation(
                    c.usedFraction > 0.85 ? AppColors.danger : AppColors.primary),
              ),
            ),
            const SizedBox(height: 4),
            Text(
                '{rem} left · {rep} replies this month'.trp(context,
                    {'rem': '${c.remaining}', 'rep': '${c.replies}'}),
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

// ── Campaign Performance (mirrors the web marketing report) ──
String _rp(double n) {
  if (n >= 1000000000) return 'Rp ${(n / 1000000000).toStringAsFixed(1)}M';
  if (n >= 1000000) return 'Rp ${(n / 1000000).toStringAsFixed(1)}jt';
  if (n >= 1000) return 'Rp ${(n / 1000).round()}rb';
  return 'Rp ${n.round()}';
}

String _num(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}rb';
  return '$n';
}

/// Ad performance per campaign — spend, leads, CPL, impressions, clicks — the
/// same picture the web Campaign Performance report shows, on a 7/30/90 window.
/// Manager+ only (the switcher hides it from agents).
class CampaignsView extends ConsumerWidget {
  const CampaignsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final days = ref.watch(campaignRangeProvider);
    final async = ref.watch(adPerformanceProvider);
    return Column(
      children: [
        // Window picker
        Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: 6,
            children: [
              for (final d in [7, 30, 90])
                GestureDetector(
                  onTap: () => ref.read(campaignRangeProvider.notifier).set(d),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: days == d
                          ? AppColors.primary
                          : AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('{n}d'.trp(context, {'n': '$d'}),
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: days == d ? Colors.white : AppColors.primary)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.only(top: 50),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.only(top: 30),
            child: AppErrorView(
              failure: e is Failure ? e : null,
              onRetry: () => ref.invalidate(adPerformanceProvider),
            ),
          ),
          data: (p) {
            if (p.campaigns.isEmpty) {
              return Padding(
                padding: const EdgeInsets.only(top: 50),
                child: Center(
                  child: Text('No ad data for this period'.tr(context),
                      style: const TextStyle(color: AppColors.textSecondary)),
                ),
              );
            }
            final sorted = [...p.campaigns]
              ..sort((a, b) => b.spend.compareTo(a.spend));
            return Column(
              children: [
                EntranceFade(
                  delay: const Duration(milliseconds: 40),
                  child: _ReportCard(
                    child: Column(
                      children: [
                        Row(
                          children: [
                            _Metric(
                                icon: Icons.payments_rounded,
                                label: 'Spend'.tr(context),
                                value: _rp(p.totalSpend),
                                color: AppColors.warning),
                            _Metric(
                                icon: Icons.groups_rounded,
                                label: 'Leads'.tr(context),
                                value: '${p.totalLeads}',
                                color: AppColors.primary),
                            _Metric(
                                icon: Icons.sell_rounded,
                                label: 'CPL'.tr(context),
                                value: _rp(p.avgCpl),
                                color: AppColors.ai),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _Metric(
                                icon: Icons.visibility_rounded,
                                label: 'Impressions'.tr(context),
                                value: _num(p.totalImpressions),
                                color: AppColors.brandGreenDark),
                            _Metric(
                                icon: Icons.ads_click_rounded,
                                label: 'Clicks'.tr(context),
                                value: _num(p.totalClicks),
                                color: AppColors.info),
                            _Metric(
                                icon: Icons.percent_rounded,
                                label: 'CTR'.tr(context),
                                value: '${p.ctr.toStringAsFixed(2)}%',
                                color: AppColors.success),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                for (var i = 0; i < sorted.length; i++)
                  EntranceFade(
                    delay: Duration(milliseconds: 80 + i * 40),
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CampaignPerfCard(campaign: sorted[i]),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _CampaignPerfCard extends StatelessWidget {
  const _CampaignPerfCard({required this.campaign});
  final AdPerfCampaign campaign;

  @override
  Widget build(BuildContext context) {
    final c = campaign;
    return _ReportCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.name.isEmpty ? '-' : c.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              _Metric(
                  icon: Icons.payments_rounded,
                  label: 'Spend'.tr(context),
                  value: _rp(c.spend),
                  color: AppColors.warning),
              _Metric(
                  icon: Icons.groups_rounded,
                  label: 'Leads'.tr(context),
                  value: '${c.leads}',
                  color: AppColors.primary),
              _Metric(
                  icon: Icons.sell_rounded,
                  label: 'CPL'.tr(context),
                  value: _rp(c.cpl),
                  color: AppColors.ai),
            ],
          ),
          const SizedBox(height: 10),
          Divider(
              height: 1,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06)),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Mini(label: 'Impressions'.tr(context), value: _num(c.impressions)),
              _Mini(label: 'Clicks'.tr(context), value: _num(c.clicks)),
              _Mini(label: 'CTR'.tr(context), value: '${c.ctr.toStringAsFixed(2)}%'),
              if (c.sales > 0)
                _Mini(label: 'Sales'.tr(context), value: '${c.sales}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        Text(label,
            style: const TextStyle(fontSize: 10.5, color: AppColors.textMuted)),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(
      {required this.icon,
      required this.label,
      required this.value,
      required this.color});
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(label,
              style: const TextStyle(fontSize: 10.5, color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

// ── Shared bits ───────────────────────────────────────────
class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
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

class _CardTitle extends StatelessWidget {
  const _CardTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700));
}

/// 270° speedometer-style gauge for the used fraction of allocated credits.
class _GaugePainter extends CustomPainter {
  _GaugePainter({required this.fraction, required this.track, required this.fill});
  final double fraction;
  final Color track;
  final Color fill;

  static const _start = math.pi * 0.75; // 135°
  static const _sweep = math.pi * 1.5; // 270°

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = 10.0;
    final rect = Rect.fromLTWH(stroke / 2, stroke / 2, size.width - stroke,
        size.height - stroke);
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = track;
    canvas.drawArc(rect, _start, _sweep, false, base);
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = fill;
    canvas.drawArc(rect, _start, _sweep * fraction.clamp(0.0, 1.0), false, fg);
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.fraction != fraction || old.fill != fill;
}

/// Compact bar chart (daily credits). The tallest bar is emphasised.
class _BarsPainter extends CustomPainter {
  _BarsPainter({required this.values, required this.color});
  final List<int> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final max = values.reduce(math.max).clamp(1, 1 << 30);
    final n = values.length;
    final gap = 3.0;
    final barW = (size.width - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) {
      final h = (values[i] / max) * size.height;
      final x = i * (barW + gap);
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, size.height - h, barW, h == 0 ? 2 : h),
        const Radius.circular(2),
      );
      final isPeak = values[i] == max && max > 1;
      canvas.drawRRect(
          rect,
          Paint()
            ..color = color.withValues(alpha: isPeak ? 1.0 : 0.45));
    }
  }

  @override
  bool shouldRepaint(covariant _BarsPainter old) => old.values != values;
}
