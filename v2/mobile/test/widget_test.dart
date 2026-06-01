import 'package:flutter_test/flutter_test.dart';
import 'package:simpulx/core/constants/api_constants.dart';

void main() {
  test('Simpulx API endpoints are configured', () {
    expect(ApiConstants.baseUrl, 'https://app.simpulx.com/api/v1');
    expect(ApiConstants.wsUrl, 'https://app.simpulx.com');
  });
}
