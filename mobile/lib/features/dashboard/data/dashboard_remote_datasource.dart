import 'package:dio/dio.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/error_mapper.dart';
import '../domain/ad_performance.dart';
import '../domain/ai_usage.dart';
import '../domain/campaign_summary.dart';
import '../domain/dashboard_cards.dart';
import '../domain/manager_analytics.dart';
import '../domain/subscription_info.dart';

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
  /// The analytics query is heavier than the KPI cards, so a transient upstream
  /// blip (e.g. a 502 during a deploy, or a timeout) can fail it while the rest
  /// of the dashboard loads. Retry transient failures a couple of times with
  /// backoff before surfacing "Could not load".
  Future<ManagerAnalytics> getAnalytics() async {
    for (var attempt = 0; ; attempt++) {
      try {
        final res = await _dio.get(ApiEndpoints.analytics);
        final data = res.data;
        if (data is! Map) {
          throw StateError('unexpected analytics payload');
        }
        return ManagerAnalytics.fromJson(data.cast<String, dynamic>());
      } on DioException catch (e) {
        final code = e.response?.statusCode ?? 0;
        final transient = code == 502 ||
            code == 503 ||
            code == 504 ||
            e.type == DioExceptionType.receiveTimeout ||
            e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.connectionError;
        if (transient && attempt < 2) {
          await Future<void>.delayed(Duration(milliseconds: 400 * (attempt + 1)));
          continue;
        }
        throw ErrorMapper.fromDio(e);
      }
    }
  }

  /// GET /api/subscription/usage -> AI credit usage (role-scoped): daily per
  /// feature, totals per feature, and per-campaign credit/reply breakdown.
  Future<AiUsage> getAiUsage() async {
    try {
      final res = await _dio.get(ApiEndpoints.subscriptionUsage);
      return AiUsage.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/subscription -> plan quota (total credits), used, and expiry.
  Future<SubscriptionInfo> getSubscription() async {
    try {
      final res = await _dio.get(ApiEndpoints.subscription);
      return SubscriptionInfo.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/ad-performance?from=&to= -> per-campaign ad performance
  /// (role-scoped): spend, leads, impressions, clicks. Powers the mobile
  /// Campaign Performance screen (mirrors the web marketing report).
  Future<AdPerformance> getAdPerformance(String from, String to) async {
    try {
      final res = await _dio.get(ApiEndpoints.adPerformance,
          queryParameters: {'from': from, 'to': to});
      return AdPerformance.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/campaigns -> campaign list (role-scoped) for the Campaigns screen.
  Future<List<CampaignSummary>> getCampaigns() async {
    try {
      final res = await _dio.get(ApiEndpoints.campaigns);
      final list = res.data is List ? res.data as List : const [];
      return list
          .whereType<Map>()
          .map((e) => CampaignSummary.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
