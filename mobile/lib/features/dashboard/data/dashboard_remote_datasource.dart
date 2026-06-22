import 'package:dio/dio.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/error_mapper.dart';
import '../domain/dashboard_cards.dart';
import '../domain/manager_analytics.dart';

class DashboardRemoteDataSource {
  DashboardRemoteDataSource(this._dio);
  final Dio _dio;

  /// GET /api/dashboard/cards -> single counts object (role-scoped).
  Future<DashboardCards> getCards() async {
    try {
      final res = await _dio.get(ApiEndpoints.dashboardCards);
      return DashboardCards.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/stats -> org ops snapshot.
  Future<DashboardStats> getStats() async {
    try {
      final res = await _dio.get(ApiEndpoints.stats);
      return DashboardStats.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/analytics -> funnel + leaderboard + response time + lost reasons.
  Future<ManagerAnalytics> getAnalytics() async {
    try {
      final res = await _dio.get(ApiEndpoints.analytics);
      return ManagerAnalytics.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
