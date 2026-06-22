import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../storage/secure_store.dart';
import 'auth_interceptor.dart';

/// Configures the app-wide [Dio] instance: base URL from [AppConfig], JWT auth
/// + refresh via [AuthInterceptor], and dev-only request logging.
class DioClient {
  DioClient({
    required AppConfig config,
    required SecureStore secureStore,
    FutureOr<void> Function()? onSessionExpired,
  }) {
    final baseOptions = BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Treat only <400 as success; let the interceptor handle 401 etc.
      validateStatus: (status) => status != null && status < 400,
    );

    // Plain Dio used for token refresh + retry (no AuthInterceptor -> no loop).
    final refreshDio = Dio(baseOptions);

    dio = Dio(baseOptions);
    dio.interceptors.add(
      AuthInterceptor(
        secureStore: secureStore,
        refreshDio: refreshDio,
        onSessionExpired: onSessionExpired,
      ),
    );

    if (config.enableNetworkLogs && kDebugMode) {
      dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          requestHeader: false,
          responseHeader: false,
          logPrint: (o) => debugPrint('[dio] $o'),
        ),
      );
    }
  }

  late final Dio dio;
}
