import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../../../core/network/error_mapper.dart';
import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/contact.dart';
import '../../domain/entities/contact_activity.dart';
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

  /// GET /api/contacts/{id} -> one contact. Fallback for the detail screen when
  /// the contact isn't in the loaded (leads-only) list, e.g. a non-lead contact
  /// opened from a chat — otherwise the detail page hangs on a spinner.
  Future<Contact> get(String id) async {
    try {
      final res = await _dio.get(ApiEndpoints.contact(id));
      return ContactModel.fromJson((res.data as Map).cast<String, dynamic>());
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

  /// GET /api/contacts/{id}/activity -> the contact's history timeline.
  Future<List<ContactActivity>> activity(String id) async {
    try {
      final res = await _dio.get(ApiEndpoints.contactActivity(id));
      final data = res.data;
      final rows = data is List
          ? data
          : (data is Map ? (data['data'] as List? ?? const []) : const []);
      return rows.whereType<Map>().map((e) {
        final m = e.cast<String, dynamic>();
        final rawDetail = m['detail'];
        return ContactActivity(
          type: asString(m['type']),
          detail: rawDetail is Map
              ? rawDetail.cast<String, dynamic>()
              : const <String, dynamic>{},
          createdAt: asDateOrNull(m['created_at']),
          actorName: asStringOrNull(m['actor_name']),
        );
      }).toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
