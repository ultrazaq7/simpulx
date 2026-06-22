import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../../../core/network/error_mapper.dart';
import '../../domain/entities/contact.dart';
import '../models/contact_model.dart';

class ContactsRemoteDataSource {
  ContactsRemoteDataSource(this._dio);
  final Dio _dio;

  /// GET /api/contacts -> bare array (role-scoped, max 500). Search/filter is
  /// applied client-side (the endpoint has no query params).
  Future<List<Contact>> list() async {
    try {
      final res = await _dio.get(ApiEndpoints.contacts);
      final data = res.data;
      final rows = data is List
          ? data
          : (data is Map ? (data['data'] as List? ?? const []) : const []);
      return rows
          .whereType<Map>()
          .map((e) => ContactModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/contacts {full_name, phone, tags?} -> created row.
  Future<Contact> create({
    required String fullName,
    required String phone,
    List<String>? tags,
  }) async {
    try {
      final res = await _dio.post(ApiEndpoints.contacts, data: {
        'full_name': fullName,
        'phone': phone,
        'tags': ?tags,
      });
      return ContactModel.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// PATCH /api/contacts/{id} {full_name?, phone?, tags?, blacklisted?}.
  Future<void> update(
    String id, {
    String? fullName,
    String? phone,
    List<String>? tags,
    bool? blacklisted,
  }) async {
    try {
      await _dio.patch(ApiEndpoints.contact(id), data: {
        'full_name': ?fullName,
        'phone': ?phone,
        'tags': ?tags,
        'blacklisted': ?blacklisted,
      });
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete(ApiEndpoints.contact(id));
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
