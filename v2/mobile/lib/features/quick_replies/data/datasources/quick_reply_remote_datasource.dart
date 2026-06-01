// ============================================================
// Quick Reply Remote Data Source
// ============================================================
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/features/quick_replies/data/models/quick_reply_model.dart';

class QuickReplyRemoteDataSource {
  final DioClient _client;

  QuickReplyRemoteDataSource({required DioClient client}) : _client = client;

  Future<List<QuickReplyModel>> getAll({String? search, String? category}) async {
    final params = <String, dynamic>{};
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (category != null && category.isNotEmpty) params['category'] = category;

    final response = await _client.dio.get(ApiConstants.quickReplies, queryParameters: params);
    final List<dynamic> list = response.data is List ? response.data : response.data['data'] ?? [];
    return list.map((e) => QuickReplyModel.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<QuickReplyModel> create(Map<String, dynamic> data) async {
    final response = await _client.dio.post(ApiConstants.quickReplies, data: data);
    return QuickReplyModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<QuickReplyModel> update(String id, Map<String, dynamic> data) async {
    final response = await _client.dio.patch(ApiConstants.quickReply(id), data: data);
    return QuickReplyModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<void> delete(String id) async {
    await _client.dio.delete(ApiConstants.quickReply(id));
  }

  Future<List<String>> getCategories() async {
    final response = await _client.dio.get(ApiConstants.quickReplyCategories);
    final List<dynamic> list = response.data is List ? response.data : [];
    return list.cast<String>();
  }
}
