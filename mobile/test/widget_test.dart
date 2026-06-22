import 'package:flutter_test/flutter_test.dart';

import 'package:simpulx/core/config/app_config.dart';
import 'package:simpulx/core/error/result.dart';
import 'package:simpulx/core/error/failure.dart';

void main() {
  group('AppConfig', () {
    test('resolves a dev config by default with no hardcoded prod URL', () {
      final config = AppConfig.resolve();
      expect(config.flavor, AppFlavor.dev);
      expect(config.apiBaseUrl, isNotEmpty);
      expect(config.wsBaseUrl, startsWith('ws'));
    });

    test('builds a ws uri carrying the JWT', () {
      final config = AppConfig.resolve();
      final uri = config.wsUri('jwt123');
      expect(uri.path, endsWith('/ws'));
      expect(uri.queryParameters['token'], 'jwt123');
    });
  });

  group('Result', () {
    test('Ok carries a value and folds to success', () {
      const result = Result.ok(42);
      expect(result.isOk, isTrue);
      expect(result.valueOrNull, 42);
      expect(result.fold((_) => 'err', (v) => 'ok $v'), 'ok 42');
    });

    test('Err carries a failure and folds to error', () {
      const result = Result<int>.err(NetworkFailure());
      expect(result.isErr, isTrue);
      expect(result.failureOrNull, isA<NetworkFailure>());
    });
  });
}
