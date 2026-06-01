import 'package:dio/dio.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/features/settings/data/models/settings_models.dart';

class SettingsRemoteDataSource {
  final DioClient _client;

  SettingsRemoteDataSource({required DioClient client}) : _client = client;

  Future<List<SettingsDepartmentModel>> getDepartments() async {
    try {
      final response = await _client.dio.get(ApiConstants.departments);
      final departments = response.data as List<dynamic>? ?? const [];
      return departments
          .whereType<Map<String, dynamic>>()
          .map(SettingsDepartmentModel.fromJson)
          .toList();
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<SettingsDepartmentModel> createDepartment({
    required String name,
    String? description,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConstants.departments,
        data: {
          'name': name,
          'description': description,
        },
      );
      return SettingsDepartmentModel.fromJson(
        response.data as Map<String, dynamic>,
      );
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<SettingsDepartmentModel> updateDepartment({
    required String id,
    required String name,
    String? description,
  }) async {
    try {
      final response = await _client.dio.patch(
        ApiConstants.department(id),
        data: {
          'name': name,
          'description': description,
        },
      );
      return SettingsDepartmentModel.fromJson(
        response.data as Map<String, dynamic>,
      );
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> deleteDepartment(String id) async {
    try {
      final response = await _client.dio.delete(ApiConstants.department(id));
      return response.data['message'] as String? ?? 'Department deleted';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<SettingsTeamPageModel> getUsers({
    String? search,
    String? role,
    String? status,
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final response = await _client.dio.get(
        ApiConstants.users,
        queryParameters: {
          'search': search?.trim().isEmpty ?? true ? null : search?.trim(),
          'role': role,
          'status': status,
          'page': page,
          'limit': limit,
        },
      );
      return SettingsTeamPageModel.fromJson(
        response.data as Map<String, dynamic>,
      );
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> createAccount({
    required String email,
    required String fullName,
    required String role,
    String? departmentId,
    String? supervisorId,
    String? password,
    int? maxConcurrentChats,
    bool? availableForRoundRobin,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConstants.createAccount,
        data: {
          'email': email,
          'fullName': fullName,
          'role': role,
          'departmentId': departmentId,
          'supervisorId': supervisorId,
          if (password != null && password.trim().isNotEmpty)
            'password': password.trim(),
          if (maxConcurrentChats != null)
            'maxConcurrentChats': maxConcurrentChats,
          if (availableForRoundRobin != null)
            'availableForRoundRobin': availableForRoundRobin,
        },
      );
      return response.data['message'] as String? ??
          'Account created successfully';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<SettingsTeamMemberModel> updateUser({
    required String id,
    required String fullName,
    required String role,
    String? departmentId,
    String? supervisorId,
    int? maxConcurrentChats,
    bool? availableForRoundRobin,
  }) async {
    try {
      final response = await _client.dio.patch(
        ApiConstants.user(id),
        data: {
          'fullName': fullName,
          'role': role,
          'departmentId': departmentId,
          'supervisorId': supervisorId,
          'maxConcurrentChats': maxConcurrentChats,
          if (availableForRoundRobin != null)
            'availableForRoundRobin': availableForRoundRobin,
        },
      );
      return SettingsTeamMemberModel.fromJson(
        response.data as Map<String, dynamic>,
      );
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> deactivateUser(String id) async {
    try {
      final response = await _client.dio.delete(ApiConstants.user(id));
      return response.data['message'] as String? ?? 'User deactivated';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> deleteUserPermanent(String id) async {
    try {
      final response =
          await _client.dio.delete(ApiConstants.deleteUserPermanent(id));
      return response.data['message'] as String? ?? 'User permanently deleted';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> reactivateUser(String id) async {
    try {
      final response = await _client.dio.patch(ApiConstants.reactivateUser(id));
      return response.data['message'] as String? ?? 'User reactivated';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final response = await _client.dio.patch(
        ApiConstants.changePassword,
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );
      return response.data['message'] as String? ??
          'Password changed successfully';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  String _extractErrorMessage(dynamic error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic> && data.containsKey('message')) {
        return data['message'] is List
            ? (data['message'] as List).join(', ')
            : data['message'].toString();
      }

      switch (error.response?.statusCode) {
        case 400:
          return 'The request could not be processed';
        case 401:
          return 'Your session has expired. Please sign in again.';
        case 403:
          return 'You do not have permission to do that';
        case 404:
          return 'The requested resource was not found';
        case 500:
          return 'Server error, please try again later';
        default:
          return error.message ?? 'Connection error';
      }
    }

    if (error is Exception) {
      return error.toString().replaceFirst('Exception: ', '');
    }

    return 'An unexpected error occurred';
  }
}
