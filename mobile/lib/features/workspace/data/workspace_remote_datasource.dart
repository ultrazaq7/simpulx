import 'package:dio/dio.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/error_mapper.dart';
import '../domain/broadcast_summary.dart';

class WorkspaceRemoteDataSource {
  WorkspaceRemoteDataSource(this._dio);
  final Dio _dio;

  /// GET /api/broadcasts -> bare array (newest first, max 200).
  Future<List<BroadcastSummary>> listBroadcasts() async {
    try {
      final res = await _dio.get(ApiEndpoints.broadcasts);
      final data = res.data;
      final rows = data is List
          ? data
          : (data is Map ? (data['data'] as List? ?? const []) : const []);
      return rows
          .whereType<Map>()
          .map((e) => BroadcastSummary.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/broadcasts/{id}/send (no body) - queues a draft/scheduled/failed.
  Future<void> sendBroadcast(String id) async {
    try {
      await _dio.post('${ApiEndpoints.broadcasts}/$id/send');
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
