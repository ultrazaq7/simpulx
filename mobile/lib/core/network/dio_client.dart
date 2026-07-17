import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../storage/secure_store.dart';
import 'auth_interceptor.dart';
import 'token_refresher.dart';

/// Configures the app-wide [Dio] instance: base URL from [AppConfig], JWT auth
/// + refresh via [AuthInterceptor], and dev-only request logging.
class DioClient {
  DioClient({
    required AppConfig config,
    required SecureStore secureStore,
    required TokenRefresher refresher,
    FutureOr<void> Function()? onSessionExpired,
  }) {
    final baseOptions = BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 60),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Treat only <400 as success; let the interceptor handle 401 etc.
      validateStatus: (status) => status != null && status < 400,
    );

    dio = Dio(baseOptions);
    dio.interceptors.add(
      AuthInterceptor(
        secureStore: secureStore,
        refresher: refresher,
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
