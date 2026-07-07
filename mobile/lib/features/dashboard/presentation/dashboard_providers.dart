import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
import '../../../core/realtime/realtime_client.dart';
import '../../../core/realtime/realtime_providers.dart';
import '../../../core/storage/app_cache.dart';
import '../data/dashboard_remote_datasource.dart';
import '../domain/dashboard_cards.dart';
import '../domain/manager_analytics.dart';

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
          e.isConversationAssigned) {
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
