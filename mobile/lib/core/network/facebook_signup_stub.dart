// Stub for non-web platforms - Facebook Embedded Signup is web-only

class EmbeddedSignupResult {
  final String code;
  final String? phoneNumberId;
  final String? wabaId;

  EmbeddedSignupResult({
    required this.code,
    this.phoneNumberId,
    this.wabaId,
  });
}

Future<EmbeddedSignupResult> launchEmbeddedSignup(String configId) async {
  throw UnsupportedError('Facebook Embedded Signup is only available on web');
}
