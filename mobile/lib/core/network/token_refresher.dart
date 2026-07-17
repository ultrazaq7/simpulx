import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/secure_store.dart';
import 'api_endpoints.dart';

/// Single-flight access-token refresh, SHARED by the REST interceptor and the
/// realtime WebSocket.
///
/// The access token is short-lived (15 min). REST refreshes it transparently on
/// a 401, but the WebSocket doesn't go through Dio — so before this, a socket
/// that dropped after the token expired reconnected with the STALE token, the
/// server rejected it ("token is expired"), and realtime stayed dead until some
/// REST call happened to refresh the token. That's the "have to pull-to-refresh
/// every ~15 min" bug.
///
/// The refresh token is rotated server-side on every use, so two concurrent
/// refreshes with the same token revoke each other and force a spurious logout —
/// funnelling every caller through ONE in-flight refresh here is what prevents
/// that. Returns the new access token, or null if there's no refresh token or the
/// refresh failed.
class TokenRefresher {
  TokenRefresher({required SecureStore secureStore, required Dio refreshDio})
      : _secureStore = secureStore,
        _refreshDio = refreshDio;

  final SecureStore _secureStore;
  final Dio _refreshDio;

  /// Bare Dio (no AuthInterceptor). Also used by the interceptor to retry the
  /// original request without re-entering the refresh path.
  Dio get dio => _refreshDio;

  Completer<String?>? _inFlight;

  Future<String?> refresh() {
    final existing = _inFlight;
    if (existing != null) return existing.future;
    final completer = Completer<String?>();
    _inFlight = completer;
    _perform()
        .then(completer.complete)
        .catchError((_) => completer.complete(null))
        .whenComplete(() => _inFlight = null);
    return completer.future;
  }

  Future<String?> _perform() async {
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
}
