import 'package:dio/dio.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/features/audit_log/data/models/audit_log_models.dart';

class AuditLogRemoteDataSource {
  final DioClient _client;

  AuditLogRemoteDataSource({required DioClient client}) : _client = client;

  Future<AuditLogPageModel> getAuditLogs({
    String? category,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _client.dio.get(
        ApiConstants.auditLogs,
        queryParameters: {
          'category': category,
          'page': page,
          'limit': limit,
        },
      );

      return AuditLogPageModel.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<PaginatedResult> getMessageHistory({
    int page = 1,
    int limit = 25,
    String? search,
    String? direction,
    String? status,
    List<String>? statuses,
    String? type,
    String? channelId,
    List<String>? channelIds,
    List<String>? departmentIds,
    List<String>? sourceChannels,
    List<String>? tags,
    String? dateFrom,
    String? dateTo,
  }) async {
    try {
      final response = await _client.dio.get(
        ApiConstants.auditLogMessages,
        queryParameters: {
          'page': page,
          'limit': limit,
          if (search != null && search.isNotEmpty) 'search': search,
          if (direction != null) 'direction': direction,
          if (status != null) 'status': status,
          if (statuses != null && statuses.isNotEmpty) 'statuses': statuses.join(','),
          if (type != null) 'type': type,
          if (channelId != null) 'channelId': channelId,
          if (channelIds != null && channelIds.isNotEmpty) 'channelIds': channelIds.join(','),
          if (departmentIds != null && departmentIds.isNotEmpty) 'departmentIds': departmentIds.join(','),
          if (sourceChannels != null && sourceChannels.isNotEmpty) 'sourceChannels': sourceChannels.join(','),
          if (tags != null && tags.isNotEmpty) 'tags': tags.join(','),
          if (dateFrom != null) 'dateFrom': dateFrom,
          if (dateTo != null) 'dateTo': dateTo,
        },
      );
      return PaginatedResult.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<PaginatedResult> getConversationHistory({
    int page = 1,
    int limit = 25,
    String? search,
    String? status,
    List<String>? statuses,
    String? channelId,
    List<String>? channelIds,
    String? departmentId,
    List<String>? departmentIds,
    List<String>? sourceChannels,
    List<String>? tags,
    String? dateFrom,
    String? dateTo,
  }) async {
    try {
      final response = await _client.dio.get(
        ApiConstants.auditLogConversations,
        queryParameters: {
          'page': page,
          'limit': limit,
          if (search != null && search.isNotEmpty) 'search': search,
          if (status != null) 'status': status,
          if (statuses != null && statuses.isNotEmpty) 'statuses': statuses.join(','),
          if (channelId != null) 'channelId': channelId,
          if (channelIds != null && channelIds.isNotEmpty) 'channelIds': channelIds.join(','),
          if (departmentId != null) 'departmentId': departmentId,
          if (departmentIds != null && departmentIds.isNotEmpty) 'departmentIds': departmentIds.join(','),
          if (sourceChannels != null && sourceChannels.isNotEmpty) 'sourceChannels': sourceChannels.join(','),
          if (tags != null && tags.isNotEmpty) 'tags': tags.join(','),
          if (dateFrom != null) 'dateFrom': dateFrom,
          if (dateTo != null) 'dateTo': dateTo,
        },
      );
      return PaginatedResult.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  /// Fetch filter options (departments, source channels) from chat endpoint.
  Future<Map<String, dynamic>> getFilterOptions() async {
    try {
      final response = await _client.dio.get('/chat/conversation-filters');
      return Map<String, dynamic>.from(response.data as Map);
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  String _extractErrorMessage(dynamic error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic> && data.containsKey('message')) {
        final message = data['message'];
        if (message is List) {
          return message.join(', ');
        }
        return message.toString();
      }
      return error.message ?? 'Connection error';
    }

    if (error is Exception) {
      return error.toString().replaceFirst('Exception: ', '');
    }

    return 'An unexpected error occurred';
  }
}
