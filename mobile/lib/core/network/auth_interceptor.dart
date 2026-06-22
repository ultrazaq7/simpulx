import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/secure_store.dart';
import 'api_endpoints.dart';

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
    required Dio refreshDio,
    this.onSessionExpired,
  })  : _secureStore = secureStore,
        _refreshDio = refreshDio;

  final SecureStore _secureStore;
  final Dio _refreshDio;
  final FutureOr<void> Function()? onSessionExpired;

  Completer<String?>? _refreshCompleter;

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

    final newToken = await _refreshToken();
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

  /// Single-flight refresh: concurrent callers await the same result.
  Future<String?> _refreshToken() {
    final existing = _refreshCompleter;
    if (existing != null) return existing.future;

    final completer = Completer<String?>();
    _refreshCompleter = completer;

    _performRefresh().then((token) {
      completer.complete(token);
    }).catchError((_) {
      completer.complete(null);
    }).whenComplete(() {
      _refreshCompleter = null;
    });

    return completer.future;
  }

  Future<String?> _performRefresh() async {
    final refreshToken = await _secureStore.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return null;

    final res = await _refreshDio.post(
      ApiEndpoints.refresh,
      data: {'refresh_token': refreshToken},
    );

    final data = res.data;
    if (data is! Map) return null;
    final access = data['token'] as String?;
    final newRefresh = data['refresh_token'] as String?;
    if (access == null || access.isEmpty) return null;

    await _secureStore.saveTokens(
      accessToken: access,
      refreshToken: (newRefresh != null && newRefresh.isNotEmpty)
          ? newRefresh
          : refreshToken,
    );
    return access;
  }

  Future<Response<dynamic>> _retry(
    RequestOptions options,
    String accessToken,
  ) {
    final headers = Map<String, dynamic>.from(options.headers)
      ..['Authorization'] = 'Bearer $accessToken';
    return _refreshDio.fetch(
      options.copyWith(
        headers: headers,
        extra: {...options.extra, _retriedFlag: true},
      ),
    );
  }
}
