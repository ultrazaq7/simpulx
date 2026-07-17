import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/secure_store.dart';
import 'api_endpoints.dart';
import 'token_refresher.dart';

/// Attaches the JWT access token and transparently refreshes it on 401.
///
/// Correct backend contract (verified against `services/gateway/auth.go`):
///   - Refresh: `POST /auth/refresh` with a JSON body `{"refresh_token": ...}`
///     (`handleRefresh` decodes it from the body). The server rotates the
///     refresh token: the presented one is revoked and a new pair returned.
///   - Response: `{ "token": ..., "refresh_token": ... }` (snake_case). The
///     legacy app used `{refreshToken}`/`{accessToken}` and was silently broken.
///
/// A single-flight lock prevents a burst of concurrent 401s from firing
/// multiple refreshes. On refresh failure, tokens are cleared and
/// [onSessionExpired] is invoked so the app can route to login.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required SecureStore secureStore,
    required TokenRefresher refresher,
    this.onSessionExpired,
  })  : _secureStore = secureStore,
        _refresher = refresher;

  final SecureStore _secureStore;
  final TokenRefresher _refresher;
  final FutureOr<void> Function()? onSessionExpired;

  static const _retriedFlag = 'x-retried';

  bool _isPublic(String path) =>
      ApiEndpoints.public.any((p) => path.endsWith(p));

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isPublic(options.path)) {
      final token = await _secureStore.readAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final response = err.response;
    final shouldRefresh = response?.statusCode == 401 &&
        !_isPublic(err.requestOptions.path) &&
        err.requestOptions.extra[_retriedFlag] != true;

    if (!shouldRefresh) {
      return handler.next(err);
    }

    final newToken = await _refresher.refresh();
    if (newToken == null) {
      await _secureStore.clear();
      await onSessionExpired?.call();
      return handler.next(err);
    }

    try {
      final retried = await _retry(err.requestOptions, newToken);
      return handler.resolve(retried);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }

  Future<Response<dynamic>> _retry(
    RequestOptions options,
    String accessToken,
  ) {
    final headers = Map<String, dynamic>.from(options.headers)
      ..['Authorization'] = 'Bearer $accessToken';
    // Retry on the bare Dio (no AuthInterceptor -> no refresh loop).
    return _refresher.dio.fetch(
      options.copyWith(
        headers: headers,
        extra: {...options.extra, _retriedFlag: true},
      ),
    );
  }
}
