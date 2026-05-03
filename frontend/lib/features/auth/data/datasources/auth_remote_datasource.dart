// ============================================================
// Auth Data Source (Remote via Dio)
// ============================================================
import 'package:dio/dio.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/auth/data/models/auth_models.dart';

class AuthRemoteDataSource {
  final DioClient _client;

  AuthRemoteDataSource({required DioClient client}) : _client = client;

  Future<AuthSessionModel> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiConstants.login,
        data: {
          'email': email,
          'password': password,
        },
      );
      return AuthSessionModel.fromJson(response.data);
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> forgotPassword({required String email}) async {
    try {
      final response = await _client.dio.post(
        '${ApiConstants.baseUrl}/auth/forgot-password',
        data: {'email': email},
      );
      return response.data['message'] ?? 'Reset link sent';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    try {
      final response = await _client.dio.post(
        '${ApiConstants.baseUrl}/auth/reset-password',
        data: {'token': token, 'newPassword': newPassword},
      );
      return response.data['message'] ?? 'Password reset successfully';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> createAccount({
    required String email,
    required String fullName,
    String role = 'agent',
    String? departmentId,
  }) async {
    try {
      final data = <String, dynamic>{
        'email': email,
        'fullName': fullName,
        'role': role,
      };
      if (departmentId != null && departmentId.isNotEmpty) {
        data['departmentId'] = departmentId;
      }
      final response = await _client.dio.post(
        ApiConstants.createAccount,
        data: data,
      );
      return response.data['message'] ?? 'Account created successfully';
    } catch (e) {
      throw ServerException(message: _extractErrorMessage(e));
    }
  }

  Future<String> inviteAgent({
    required String email,
    required String fullName,
    String role = 'agent',
    String? departmentId,
  }) {
    return createAccount(
      email: email,
      fullName: fullName,
      role: role,
      departmentId: departmentId,
    );
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
        case 401:
          return 'Invalid credentials';
        case 403:
          return 'Access denied';
        case 404:
          return 'Service not found';
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
