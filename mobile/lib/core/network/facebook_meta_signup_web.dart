// ============================================================
// Facebook Meta Login - JS Interop for Flutter Web
// (Instagram DM + Facebook Messenger OAuth)
// ============================================================
import 'dart:convert';
import 'dart:js_interop';

@JS('launchMetaLogin')
external JSPromise<JSString> _launchMetaLogin();

class MetaLoginResult {
  final String code;

  MetaLoginResult({required this.code});
}

/// Launches the Meta OAuth login flow to grant page + Instagram permissions.
/// Returns the auth code that the backend will exchange for a user access token.
Future<MetaLoginResult> launchMetaLogin() async {
  final jsResult = await _launchMetaLogin().toDart;
  final map = jsonDecode(jsResult.toDart) as Map<String, dynamic>;
  return MetaLoginResult(code: map['code'] as String);
}
