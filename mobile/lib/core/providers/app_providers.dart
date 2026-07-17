import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../network/dio_client.dart';
import '../network/token_refresher.dart';
import '../session/session_controller.dart';
import '../storage/app_cache.dart';
import '../storage/secure_store.dart';

/// Active environment/flavor configuration. Pure compile-time resolution.
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.resolve());

/// Encrypted token storage.
final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

/// Hive-backed cache. Overridden in `bootstrap` with the initialized instance
/// (Hive init is async, so it cannot be created lazily here).
final appCacheProvider = Provider<AppCache>(
  (ref) => throw UnimplementedError('appCacheProvider must be overridden'),
);

/// Shared single-flight token refresher, used by BOTH the REST interceptor and
/// the realtime WebSocket so the two never race to rotate the refresh token.
final tokenRefresherProvider = Provider<TokenRefresher>((ref) {
  final config = ref.watch(appConfigProvider);
  // Bare Dio: no AuthInterceptor, so refresh/retry never re-enters the refresh.
  final refreshDio = Dio(BaseOptions(
    baseUrl: config.apiBaseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 60),
    sendTimeout: const Duration(seconds: 60),
    headers: const {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    validateStatus: (status) => status != null && status < 400,
  ));
  return TokenRefresher(
    secureStore: ref.watch(secureStoreProvider),
    refreshDio: refreshDio,
  );
});

/// App-wide [Dio] with auth + refresh. On unrecoverable 401 it routes the
/// session to expired so the router redirects to login.
final dioProvider = Provider<Dio>((ref) {
  final client = DioClient(
    config: ref.watch(appConfigProvider),
    secureStore: ref.watch(secureStoreProvider),
    refresher: ref.watch(tokenRefresherProvider),
    onSessionExpired: () {
      ref.read(sessionControllerProvider.notifier).markExpired();
    },
  );
  return client.dio;
});
