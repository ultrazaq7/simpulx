// ============================================================
// Facebook Embedded Signup - JS Interop for Flutter Web
// ============================================================
import 'dart:convert';
import 'dart:js_interop';

@JS('launchWhatsAppSignup')
external JSPromise<JSString> _launchWhatsAppSignup(JSString configId);

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

/// Launches the Meta WhatsApp Embedded Signup flow.
/// Returns the auth code + session data (WABA ID, phone number ID).
Future<EmbeddedSignupResult> launchEmbeddedSignup(String configId) async {
  final jsResult = await _launchWhatsAppSignup(configId.toJS).toDart;
  final map = jsonDecode(jsResult.toDart) as Map<String, dynamic>;

  return EmbeddedSignupResult(
    code: map['code'] as String,
    phoneNumberId: map['phoneNumberId'] as String?,
    wabaId: map['wabaId'] as String?,
  );
}
