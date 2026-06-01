// ============================================================
// Contact Remote Data Source
// ============================================================
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/features/contacts/data/models/contact_model.dart';

class ContactRemoteDataSource {
  final DioClient _client;

  ContactRemoteDataSource({required DioClient client}) : _client = client;

  Future<Map<String, dynamic>> getContacts({
    int page = 1,
    int limit = 50,
    String? search,
    String? tag,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (tag != null && tag.isNotEmpty) queryParams['tag'] = tag;

    final response = await _client.dio.get(
      ApiConstants.contacts,
      queryParameters: queryParams,
    );

    final data = response.data;
    final List<dynamic> list = data['contacts'] ?? data['data'] ?? [];
    final int total = data['total'] ?? list.length;

    return {
      'contacts': list
          .map((json) => ContactModel.fromJson(Map<String, dynamic>.from(json)))
          .toList(),
      'total': total,
      'page': data['page'] ?? page,
      'limit': data['limit'] ?? limit,
    };
  }

  Future<ContactModel> getContact(String id) async {
    final response = await _client.dio.get(ApiConstants.contact(id));
    return ContactModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<ContactModel> createContact(Map<String, dynamic> data) async {
    final response = await _client.dio.post(ApiConstants.contacts, data: data);
    return ContactModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<ContactModel> updateContact(String id, Map<String, dynamic> data) async {
    final response = await _client.dio.patch(ApiConstants.contact(id), data: data);
    return ContactModel.fromJson(Map<String, dynamic>.from(response.data));
  }
}
