import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/utils/animation_constants.dart';
import '../../../../core/utils/haptics.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../../core/widgets/premium_indicators.dart';
import '../../../chat/presentation/controllers/inbox_filter.dart';
import '../../domain/dashboard_cards.dart';
import '../../domain/manager_analytics.dart';
import '../dashboard_providers.dart';

/// Agent-first dashboard: actionable counts with premium animations.
/// Each card drills into the filtered inbox. Designed for <=5s comprehension.
class DashboardPage extends ConsumerStatefulWidget {
  const DashboardPage({super.key});

  @override
  ConsumerState<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends ConsumerState<DashboardPage>
    with TickerProviderStateMixin {
  late AnimationController _headerController;
  late Animation<double> _headerFade;
  late Animation<Offset> _headerSlide;

  @override
  void initState() {
    super.initState();
    _headerController = AnimationController(
      duration: AnimDurations.slow,
      vsync: this,
    );

    _headerFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _headerController, curve: Curves.easeOut),
    );

    _headerSlide = Tween<Offset>(
      begin: const Offset(0, -0.2),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _headerController, curve: AnimCurves.smoothOut),
    );

    _headerController.forward();
  }

  @override
  void dispose() {
    _headerController.dispose();
    super.dispose();
  }

  void _drill(WidgetRef ref, BuildContext context, InboxFilter filter) {
    Haptics.medium;
    ref.read(inboxFilterProvider.notifier).set(filter);
    context.go('/chat');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(dashboardProvider);
    final user = ref.watch(sessionControllerProvider).user;
    final firstName = (user?.name ?? '').split(' ').first;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const _SimpulxWordmark(),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          Haptics.light;
          await ref.read(dashboardProvider.notifier).refresh();
        },
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
            headerController: _headerController,
          ),
        ),
      ),
    );
  }
}

// ── Simpulx wordmark ────────────────────────────────────────────────────────

class _SimpulxWordmark extends StatefulWidget {
  const _SimpulxWordmark();

  @override
  State<_SimpulxWordmark> createState() => _SimpulxWordmarkState();
}

class _SimpulxWordmarkState extends State<_SimpulxWordmark>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(
                      alpha: 0.25 + 0.15 * _controller.value,
                    ),
                    blurRadius: 8 + 4 * _controller.value,
                    offset: Offset(0, 2 + 2 * _controller.value),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset('assets/images/simpulx_logo.png',
                    fit: BoxFit.cover),
              ),
            );
          },
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

// ── Body ──────────────────────────────────────────────────────────────────

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({
    required this.firstName,
    required this.cards,
    required this.showManager,
    required this.onDrill,
    required this.headerController,
  });

  final String firstName;
  final DashboardCards cards;
  final bool showManager;
  final void Function(InboxFilter filter) onDrill;
  final AnimationController headerController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AnimationLimiter(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: AnimationConfiguration.toStaggeredList(
          duration: AnimDurations.slow,
          childAnimationBuilder: (widget) => SlideAnimation(
            verticalOffset: 30.0,
            child: FadeInAnimation(child: widget),
          ),
          children: [
            // ── Greeting ───────────────────────────────────────
            SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, -0.2),
                end: Offset.zero,
              ).animate(
                CurvedAnimation(
                  parent: headerController,
                  curve: AnimCurves.smoothOut,
                ),
              ),
              child: FadeTransition(
                opacity: headerController,
                child: _GreetingSection(
                  firstName: firstName,
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ── Primary stat: Hot leads (most urgent) ─────────
            if (cards.hot > 0) ...[
              HotLeadsBanner(
                count: cards.hot,
                onTap: () => onDrill(InboxFilter.hot),
              ),
              const SizedBox(height: 16),
            ],

            // ── Grid: Open / Follow up / Unread / Need call ─────
            _StatGrid(cards: cards, onDrill: onDrill),

            if (showManager) ...[
              const SizedBox(height: 28),
              const _ManagerSection(),
            ],
          ],
        ),
      ),
    );
  }
}

class _GreetingSection extends StatelessWidget {
  const _GreetingSection({required this.firstName});

  final String firstName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _dateLine(),
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.textMuted,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.0,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          firstName.isEmpty ? 'Welcome back' : 'Hi $firstName',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          "Here's what's on your plate today.",
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }

  String _dateLine() {
    const days = [
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
      'SATURDAY', 'SUNDAY',
    ];
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG',
      'SEP', 'OCT', 'NOV', 'DEC',
    ];
    final now = DateTime.now();
    return '${days[now.weekday - 1]} • ${now.day} ${months[now.month - 1]}';
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({
    required this.cards,
    required this.onDrill,
  });

  final DashboardCards cards;
  final void Function(InboxFilter filter) onDrill;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _PremiumStatCard(
                label: 'Open',
                count: cards.open,
                icon: Icons.inbox_rounded,
                color: AppColors.primary,
                onTap: () => onDrill(InboxFilter.all),
                delay: Duration.zero,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _PremiumStatCard(
                label: 'Follow up',
                count: cards.followUp,
                icon: Icons.reply_rounded,
                color: AppColors.warning,
                onTap: () => onDrill(InboxFilter.followUp),
                delay: const Duration(milliseconds: 100),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _PremiumStatCard(
                label: 'Unread',
                count: cards.unread,
                icon: Icons.mark_chat_unread_rounded,
                color: AppColors.info,
                onTap: () => onDrill(InboxFilter.unread),
                delay: const Duration(milliseconds: 200),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _PremiumStatCard(
                label: 'Need a call',
                count: cards.needCall,
                icon: Icons.call_rounded,
                color: AppColors.purple,
                onTap: () => onDrill(InboxFilter.hot),
                delay: const Duration(milliseconds: 300),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Premium stat card with animations ─────────────────────────────────────

class _PremiumStatCard extends StatefulWidget {
  const _PremiumStatCard({
    required this.label,
    required this.count,
    required this.icon,
    required this.color,
    required this.onTap,
    required this.delay,
  });

  final String label;
  final int count;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final Duration delay;

  @override
  State<_PremiumStatCard> createState() => _PremiumStatCardState();
}

class _PremiumStatCardState extends State<_PremiumStatCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;
  late Animation<double> _slideAnimation;
  bool _isPressed = false;
  int _displayCount = 0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.medium,
      vsync: this,
    );

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: AnimCurves.bouncy),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _slideAnimation = Tween<double>(begin: 20.0, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: AnimCurves.smoothOut),
    );

    Future.delayed(widget.delay, () {
      if (mounted) {
        _controller.forward();
        _animateCount();
      }
    });
  }

  void _animateCount() {
    if (!mounted) return;
    final target = widget.count;
    if (target == 0) return;

    const duration = Duration(milliseconds: 600);
    const steps = 15;
    final stepDuration = duration.inMilliseconds ~/ steps;
    final increment = target / steps;

    Future.doWhile(() async {
      if (!mounted) return false;
      await Future.delayed(Duration(milliseconds: stepDuration));
      if (!mounted) return false;
      setState(() {
        _displayCount = (_displayCount + increment).round().clamp(0, target);
      });
      return _displayCount < target;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails _) {
    setState(() => _isPressed = true);
  }

  void _handleTapUp(TapUpDetails _) {
    setState(() => _isPressed = false);
  }

  void _handleTapCancel() {
    setState(() => _isPressed = false);
  }

  void _handleTap() {
    Haptics.select;
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasItems = widget.count > 0;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value * (_isPressed ? 0.97 : 1.0),
          child: Transform.translate(
            offset: Offset(0, _slideAnimation.value),
            child: Opacity(
              opacity: _fadeAnimation.value,
              child: child,
            ),
          ),
        );
      },
      child: GestureDetector(
        onTapDown: _handleTapDown,
        onTapUp: _handleTapUp,
        onTapCancel: _handleTapCancel,
        onTap: _handleTap,
        child: AnimatedContainer(
          duration: AnimDurations.fast,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: hasItems
                  ? widget.color.withValues(alpha: 0.20)
                  : theme.dividerColor,
            ),
            boxShadow: hasItems
                ? [
                    BoxShadow(
                      color: widget.color.withValues(alpha: 0.10),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AnimatedContainer(
                    duration: AnimDurations.fast,
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: widget.color.withValues(alpha: hasItems ? 0.12 : 0.06),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      widget.icon,
                      color: widget.color.withValues(alpha: hasItems ? 1 : 0.5),
                      size: 20,
                    ),
                  ),
                  const Spacer(),
                  if (hasItems)
                    AnimatedBuilder(
                      animation: _controller,
                      builder: (context, _) {
                        return Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: widget.color,
                            shape: BoxShape.circle,
                          ),
                        );
                      },
                    ),
                ],
              ),
              const Spacer(),
              TweenAnimationBuilder<int>(
                tween: IntTween(begin: 0, end: _displayCount),
                duration: AnimDurations.fast,
                builder: (context, value, child) {
                  return Text(
                    '$value',
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      color: hasItems
                          ? widget.color
                          : AppColors.textMuted,
                      height: 1,
                      letterSpacing: -0.5,
                    ),
                  );
                },
              ),
              const SizedBox(height: 4),
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: hasItems
                      ? AppColors.textSecondary
                      : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Manager section ────────────────────────────────────────────────────────

class _ManagerSection extends ConsumerWidget {
  const _ManagerSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(dashboardStatsProvider);
    final analytics = ref.watch(managerAnalyticsProvider);
    final theme = Theme.of(context);

    return AnimationLimiter(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: AnimationConfiguration.toStaggeredList(
          duration: AnimDurations.slow,
          delay: const Duration(milliseconds: 400),
          childAnimationBuilder: (widget) => SlideAnimation(
            horizontalOffset: 30.0,
            child: FadeInAnimation(child: widget),
          ),
          children: [
            // Section header
            Row(
              children: [
                Container(
                  width: 4,
                  height: 20,
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Team overview',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Quick stats: Active / Unassigned / Total
            stats.maybeWhen(
              data: (s) => Row(
                children: [
                  _MiniStat(
                      label: 'Active', value: s.active, color: AppColors.success),
                  const SizedBox(width: 8),
                  _MiniStat(
                      label: 'Unassigned',
                      value: s.unassigned,
                      color: AppColors.warning),
                  const SizedBox(width: 8),
                  _MiniStat(label: 'Team', value: s.team, color: AppColors.info),
                ],
              ),
              orElse: () => const SizedBox.shrink(),
            ),

            const SizedBox(height: 16),

            // Analytics
            analytics.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: Center(
                    child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))),
              ),
              error: (_, _) => const _EmptyCard(
                message: 'Could not load analytics',
              ),
              data: (a) => Column(
                children: [
                  // Funnel
                  _Card(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Text('Funnel',
                                style:
                                    TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                            const Spacer(),
                            // Hot/warm/cold summary
                            _InterestDots(a),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _FunnelBar(
                            label: 'Total', value: a.total, total: a.total),
                        _FunnelBar(label: 'Replied', value: a.replied, total: a.total),
                        _FunnelBar(
                            label: 'Engaged', value: a.engaged, total: a.total),
                        _FunnelBar(label: 'Won', value: a.won, total: a.total, color: AppColors.success),
                        _FunnelBar(label: 'Lost', value: a.lost, total: a.total, color: AppColors.danger),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Response time
                  _Card(
                    child: Row(
                      children: [
                        Expanded(
                          child: _ResponseMetric(
                            label: 'Median response',
                            value: '${a.medianRtMin.toStringAsFixed(0)}m',
                          ),
                        ),
                        Container(width: 1, height: 40, color: Theme.of(context).dividerColor),
                        Expanded(
                          child: _ResponseMetric(
                            label: 'Within 5 min',
                            value: '${a.within5Pct.toStringAsFixed(0)}%',
                            highlight: a.within5Pct >= 70,
                          ),
                        ),
                      ],
                    ),
                  ),

                  if (a.agents.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _Card(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Agent leaderboard',
                              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                          const SizedBox(height: 12),
                          for (final ag in a.agents.take(5))
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 14,
                                    backgroundColor:
                                        AppColors.primary.withValues(alpha: 0.12),
                                    child: Text(ag.agentNameInitials,
                                        style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.primary)),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(ag.agentName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600)),
                                  ),
                                  Text('${ag.leads} leads',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.textSecondary)),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${ag.within5Pct.toStringAsFixed(0)}%',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: ag.within5Pct >= 70
                                          ? AppColors.success
                                          : AppColors.warning,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: child,
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(
      {required this.label, required this.value, required this.color});
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$value',
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color),
            ),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class _FunnelBar extends StatelessWidget {
  const _FunnelBar({
    required this.label,
    required this.value,
    required this.total,
    this.color,
  });
  final String label;
  final int value;
  final int total;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    final barColor = color ?? AppColors.primary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    style:
                        const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ),
              Text('$value',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.0, end: pct),
              duration: AnimDurations.slower,
              curve: AnimCurves.smoothOut,
              builder: (context, animatedPct, child) {
                return LinearProgressIndicator(
                  value: animatedPct,
                  minHeight: 6,
                  backgroundColor: AppColors.surfaceAlt,
                  valueColor: AlwaysStoppedAnimation(barColor),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ResponseMetric extends StatelessWidget {
  const _ResponseMetric({required this.label, required this.value, this.highlight = false});
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: highlight ? AppColors.success : AppColors.textPrimary,
            )),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(
                fontSize: 11, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _InterestDots extends StatelessWidget {
  const _InterestDots(this.a);
  final ManagerAnalytics a;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _InterestDot(AppColors.hot, a.hot),
        const SizedBox(width: 10),
        _InterestDot(AppColors.warm, a.warm),
        const SizedBox(width: 10),
        _InterestDot(AppColors.cold, a.cold),
      ],
    );
  }
}

class _InterestDot extends StatelessWidget {
  const _InterestDot(this.color, this.count);
  final Color color;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
            width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text('$count',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: color)),
      ],
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(message,
              style: const TextStyle(color: AppColors.textSecondary)),
        ),
      ),
    );
  }
}
