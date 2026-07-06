import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../../../core/network/error_mapper.dart';
import '../../../../core/utils/time_format.dart';
import '../models/auth_session_model.dart';
import '../models/auth_user_model.dart';

/// Thin transport for auth endpoints. Throws typed `AppException`s (via
/// [ErrorMapper]); the repository converts those to `Failure`s.
class AuthRemoteDataSource {
  AuthRemoteDataSource(this._dio);
  final Dio _dio;

  /// POST /auth/login -> {token, refresh_token, user}.
  Future<AuthSessionModel> login({
    required String email,
    required String password,
  }) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.login,
        data: {'email': email, 'password': password},
      );
      return AuthSessionModel.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/me -> current user profile.
  Future<AuthUserModel> me() async {
    try {
      final res = await _dio.get(ApiEndpoints.me);
      final user = AuthUserModel.fromJson(res.data as Map<String, dynamic>);
      await loadOrgDateFormat(); // best-effort; applies the org date format
      return user;
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/organization -> apply the org date format to the app formatters.
  /// Best-effort: on any failure the default (MM/DD/YYYY) is kept.
  Future<void> loadOrgDateFormat() async {
    try {
      final res = await _dio.get(ApiEndpoints.organization);
      final data = res.data;
      if (data is Map && data['settings'] is Map) {
        setAppDateFormat((data['settings'] as Map)['date_format'] as String?);
      }
    } catch (_) {
      // Keep the default date format on any error.
    }
  }

  /// PATCH /api/users/me/presence {online: bool}.
  Future<void> setPresence(bool online) async {
    try {
      await _dio.patch(ApiEndpoints.presence, data: {'online': online});
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/account/password {current_password, new_password}.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        ApiEndpoints.accountPassword,
        data: {
          'current_password': currentPassword,
          'new_password': newPassword,
        },
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/users/fcm-token {token, platform}.
  Future<void> registerFcmToken({
    required String token,
    required String platform,
  }) async {
    try {
      await _dio.post(
        ApiEndpoints.fcmToken,
        data: {'token': token, 'platform': platform},
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// DELETE /api/users/fcm-token {token} — unregister on logout.
  Future<void> unregisterFcmToken({required String token}) async {
    try {
      await _dio.delete(
        ApiEndpoints.fcmToken,
        data: {'token': token},
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /auth/forgot-password {email}.
  Future<void> forgotPassword(String email) async {
    try {
      await _dio.post(ApiEndpoints.forgotPassword, data: {'email': email});
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /auth/reset-password {token, newPassword}. Note: the backend uses
  /// the camelCase `newPassword` key here (an intentional match, not a typo).
  Future<void> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        ApiEndpoints.resetPassword,
        data: {'token': token, 'newPassword': newPassword},
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /auth/logout {refresh_token} (best-effort).
  Future<void> logout(String refreshToken) async {
    try {
      await _dio.post(
        ApiEndpoints.logout,
        data: {'refresh_token': refreshToken},
      );
    } on DioException catch (_) {
      // Logout is best-effort; ignore transport errors.
    }
  }
}
