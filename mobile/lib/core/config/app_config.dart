/// Environment + flavor configuration.
///
/// Values resolve from compile-time `--dart-define`s so the same binary code
/// can target dev / staging / prod without hardcoded URLs (a defect in the
/// legacy app). Defaults assume the Android emulator loopback (`10.0.2.2`)
/// against the local gateway (:8080) and realtime hub (:8082).
///
/// Override at run/build time, e.g.:
///   flutter run --dart-define=FLAVOR=prod \
///     --dart-define=API_BASE_URL=https://app.simpulx.com \
///     --dart-define=WS_BASE_URL=wss://app.simpulx.com
library;

enum AppFlavor { dev, staging, prod }

class AppConfig {
  const AppConfig({
    required this.flavor,
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    required this.enableNetworkLogs,
  });

  /// Active flavor.
  final AppFlavor flavor;

  /// REST gateway base, no trailing slash. e.g. `http://10.0.2.2:8080`.
  final String apiBaseUrl;

  /// Realtime WebSocket base, no trailing slash. e.g. `ws://10.0.2.2:8082`.
  /// The `/ws?token=` path + query is appended by the realtime client.
  final String wsBaseUrl;

  /// Verbose Dio request/response logging (dev only by default).
  final bool enableNetworkLogs;

  bool get isProd => flavor == AppFlavor.prod;
  bool get isDev => flavor == AppFlavor.dev;

  /// Full WebSocket endpoint for a given JWT.
  Uri wsUri(String token) =>
      Uri.parse('$wsBaseUrl/ws').replace(queryParameters: {'token': token});

  /// Resolve the active config from `--dart-define` values, falling back to
  /// per-flavor defaults.
  factory AppConfig.resolve() {
    final flavor = _parseFlavor(
      const String.fromEnvironment('FLAVOR', defaultValue: 'dev'),
    );

    final defaults = _defaultsFor(flavor);

    const apiOverride = String.fromEnvironment('API_BASE_URL');
    const wsOverride = String.fromEnvironment('WS_BASE_URL');
    const logsOverride =
        String.fromEnvironment('NETWORK_LOGS', defaultValue: '');

    return AppConfig(
      flavor: flavor,
      apiBaseUrl: apiOverride.isNotEmpty ? apiOverride : defaults.apiBaseUrl,
      wsBaseUrl: wsOverride.isNotEmpty ? wsOverride : defaults.wsBaseUrl,
      enableNetworkLogs: logsOverride.isNotEmpty
          ? logsOverride == 'true'
          : defaults.enableNetworkLogs,
    );
  }

  static AppFlavor _parseFlavor(String raw) {
    switch (raw.toLowerCase()) {
      case 'prod':
      case 'production':
        return AppFlavor.prod;
      case 'staging':
      case 'stage':
        return AppFlavor.staging;
      default:
        return AppFlavor.dev;
    }
  }

  static AppConfig _defaultsFor(AppFlavor flavor) {
    switch (flavor) {
      case AppFlavor.prod:
        return const AppConfig(
          flavor: AppFlavor.prod,
          apiBaseUrl: 'https://app.simpulx.com',
          wsBaseUrl: 'wss://app.simpulx.com',
          enableNetworkLogs: false,
        );
      case AppFlavor.staging:
        return const AppConfig(
          flavor: AppFlavor.staging,
          apiBaseUrl: 'https://staging.simpulx.com',
          wsBaseUrl: 'wss://staging.simpulx.com',
          enableNetworkLogs: true,
        );
      case AppFlavor.dev:
        return const AppConfig(
          flavor: AppFlavor.dev,
          // Android emulator loopback to host machine.
          apiBaseUrl: 'http://10.0.2.2:8080',
          wsBaseUrl: 'ws://10.0.2.2:8082',
          enableNetworkLogs: true,
        );
    }
  }
}
