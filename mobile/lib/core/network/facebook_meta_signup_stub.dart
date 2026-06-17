// Stub for non-web platforms - Meta OAuth login is web-only

class MetaLoginResult {
  final String code;

  MetaLoginResult({required this.code});
}

Future<MetaLoginResult> launchMetaLogin() async {
  throw UnsupportedError('Meta OAuth login is only available on web');
}
