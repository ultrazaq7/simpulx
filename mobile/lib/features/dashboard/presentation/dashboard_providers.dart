import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
import '../../../core/realtime/realtime_providers.dart';
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

  @override
  Future<DashboardCards> build() {
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
    ref.onDispose(() => _debounce?.cancel());
    return ref.read(_dashboardDataSourceProvider).getCards();
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
    state = await AsyncValue.guard(
      () => ref.read(_dashboardDataSourceProvider).getCards(),
    );
  }
}

final dashboardProvider =
    AsyncNotifierProvider<DashboardController, DashboardCards>(
  DashboardController.new,
);
