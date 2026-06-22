import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
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

/// Agent action-center counts. Refreshable (pull-to-refresh / on resume).
class DashboardController extends AsyncNotifier<DashboardCards> {
  @override
  Future<DashboardCards> build() =>
      ref.read(_dashboardDataSourceProvider).getCards();

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
