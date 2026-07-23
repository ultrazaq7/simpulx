import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
import '../../../core/realtime/realtime_client.dart';
import '../../../core/realtime/realtime_providers.dart';
import '../../../core/storage/app_cache.dart';
import '../data/dashboard_remote_datasource.dart';
import '../domain/ad_performance.dart';
import '../domain/ai_usage.dart';
import '../domain/campaign_summary.dart';
import '../domain/dashboard_cards.dart';
import '../domain/manager_analytics.dart';
import '../domain/subscription_info.dart';

final _dashboardDataSourceProvider = Provider<DashboardRemoteDataSource>(
  (ref) => DashboardRemoteDataSource(ref.watch(dioProvider)),
);

/// Org ops snapshot (manager+ view). Lazily loaded when the section builds.
final dashboardStatsProvider = FutureProvider<DashboardStats>(
  (ref) => ref.read(_dashboardDataSourceProvider).getStats(),
);

/// Lead-intelligence analytics (manager+ view).
final managerAnalyticsProvider = FutureProvider<ManagerAnalytics>(
  (ref) => ref.read(_dashboardDataSourceProvider).getAnalytics(),
);

/// AI credit usage (role-scoped) for the mobile AI Usage screen.
final aiUsageProvider = FutureProvider<AiUsage>(
  (ref) => ref.read(_dashboardDataSourceProvider).getAiUsage(),
);

/// Campaign list (role-scoped) for the mobile Campaigns performance screen.
final campaignsSummaryProvider = FutureProvider<List<CampaignSummary>>(
  (ref) => ref.read(_dashboardDataSourceProvider).getCampaigns(),
);

/// Plan quota + expiry for the AI Usage header (credits don't roll over, so the
/// expiry date matters). Nullable-friendly: the UI falls back to usage totals if
/// the subscription can't be read.
final subscriptionProvider = FutureProvider<SubscriptionInfo>(
  (ref) => ref.read(_dashboardDataSourceProvider).getSubscription(),
);

/// Selected dashboard view: 0 = General Report, 1 = Campaign Performance,
/// 2 = AI Usage.
class DashboardTab extends Notifier<int> {
  @override
  int build() => 0;
  void set(int v) => state = v;
}

final dashboardTabProvider = NotifierProvider<DashboardTab, int>(DashboardTab.new);

/// Date window (days) for Campaign Performance: 7 / 30 / 90. Default 30, like web.
class CampaignRange extends Notifier<int> {
  @override
  int build() => 30;
  void set(int v) => state = v;
}

final campaignRangeProvider =
    NotifierProvider<CampaignRange, int>(CampaignRange.new);

/// Per-campaign ad performance for the selected window (role-scoped).
final adPerformanceProvider = FutureProvider<AdPerformance>((ref) {
  final days = ref.watch(campaignRangeProvider);
  final to = DateTime.now();
  final from = to.subtract(Duration(days: days - 1));
  String f(DateTime d) => d.toIso8601String().substring(0, 10);
  return ref.read(_dashboardDataSourceProvider).getAdPerformance(f(from), f(to));
});

/// Agent action-center counts. Refreshable (pull-to-refresh / on resume) and
/// kept live: any message / stage / status / assignment change refreshes the
/// cards and invalidates the manager snapshot + analytics so every number on
/// the dashboard stays in sync with the backend. Debounced so a burst of
/// message events triggers a single refetch.
class DashboardController extends AsyncNotifier<DashboardCards> {
  Timer? _debounce;
  bool _hasConnected = false;

  @override
  Future<DashboardCards> build() async {
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e == null) return;
      if (e.isMessagePersisted ||
          e.isConversationUpdated ||
          e.isConversationClosed ||
          e.isConversationAssigned ||
          // A new lead (contact) and a pipeline-config change both move the
          // funnel / lead totals, so refresh the manager snapshot for those too.
          e.isContactCreated ||
          e.isStagesUpdated) {
        _scheduleRefresh();
      }
    });
    // Catch up on any counts that changed while the socket was briefly down:
    // refetch on every RE-connect (the first connect is covered by the load).
    ref.listen(realtimeStatusProvider, (_, next) {
      if (next.value != RealtimeStatus.connected) return;
      if (_hasConnected) {
        _scheduleRefresh();
      } else {
        _hasConnected = true;
      }
    });
    // App returned to the foreground: refetch the cards + manager snapshot NOW so
    // the dashboard is current the instant it's shown, without waiting on the
    // socket handshake.
    ref.listen(appResumeTickProvider, (_, _) {
      refresh();
      ref.invalidate(dashboardStatsProvider);
      ref.invalidate(managerAnalyticsProvider);
      ref.invalidate(aiUsageProvider);
      ref.invalidate(subscriptionProvider);
      ref.invalidate(campaignsSummaryProvider);
    });
    ref.onDispose(() => _debounce?.cancel());
    // Cache-first: paint the last counts instantly, then refresh in the
    // background so the dashboard never opens on a spinner.
    final cache = ref.read(appCacheProvider);
    final cached = cache.getJson(AppCache.kDashboard);
    if (cached != null) {
      Future.microtask(refresh);
      return DashboardCards.fromJson(cached);
    }
    return _fetch();
  }

  Future<DashboardCards> _fetch() async {
    final cards = await ref.read(_dashboardDataSourceProvider).getCards();
    ref.read(appCacheProvider).setJson(AppCache.kDashboard, cards.toJson());
    return cards;
  }

  void _scheduleRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(seconds: 2), () {
      refresh();
      ref.invalidate(dashboardStatsProvider);
      ref.invalidate(managerAnalyticsProvider);
      ref.invalidate(aiUsageProvider);
      ref.invalidate(subscriptionProvider);
      ref.invalidate(campaignsSummaryProvider);
    });
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }
}

final dashboardProvider =
    AsyncNotifierProvider<DashboardController, DashboardCards>(
  DashboardController.new,
);
