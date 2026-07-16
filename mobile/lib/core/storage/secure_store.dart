import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Encrypted storage for sensitive values (JWT access + refresh tokens).
///
/// Backed by Keychain (iOS) / EncryptedSharedPreferences (Android). Tokens
/// must never go in Hive/SharedPreferences.
///
/// On Android the tokens are also mirrored into a native-owned encrypted store
/// (via [_nativeChannel]) so the background notification reply/reject path can
/// authenticate without reading flutter_secure_storage's internal files, whose
/// name/key format changed across major versions and broke native token reads.
class SecureStore {
  SecureStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _storage;

  static const _kAccessToken = 'access_token';
  static const _kRefreshToken = 'refresh_token';
  static const _kDeviceId = 'device_id';
  static const _nativeChannel = MethodChannel('simpulx_notification');

  /// Stable per-install device id, sent with the FCM token so the server keeps
  /// ONE token row per device (a reinstall/refresh replaces it) — prevents the
  /// duplicate push notifications caused by accumulated stale tokens. Generated
  /// once with a CSPRNG (no extra package); persisted and NOT wiped by clear(),
  /// so it survives logout.
  Future<String> deviceId() async {
    var id = await _storage.read(key: _kDeviceId);
    if (id == null || id.isEmpty) {
      final r = Random.secure();
      id = List<int>.generate(16, (_) => r.nextInt(256))
          .map((b) => b.toRadixString(16).padLeft(2, '0'))
          .join();
      await _storage.write(key: _kDeviceId, value: id);
    }
    return id;
  }

  Future<String?> readAccessToken() => _storage.read(key: _kAccessToken);
  Future<String?> readRefreshToken() => _storage.read(key: _kRefreshToken);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _kAccessToken, value: accessToken);
    await _storage.write(key: _kRefreshToken, value: refreshToken);
    await _mirrorToNative(accessToken, refreshToken);
  }

  Future<void> saveAccessToken(String accessToken) async {
    await _storage.write(key: _kAccessToken, value: accessToken);
    await _mirrorToNative(accessToken, await readRefreshToken());
  }

  Future<bool> get hasSession async =>
      (await readAccessToken())?.isNotEmpty ?? false;

  /// Wipe all tokens (logout / failed refresh).
  Future<void> clear() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kRefreshToken);
    if (Platform.isAndroid) {
      try {
        await _nativeChannel.invokeMethod('clearNativeAuth');
      } catch (_) {}
    }
  }

  /// Push the current tokens to the native store. Called on app start so an
  /// already-logged-in user (who won't re-save until the next refresh) still
  /// has a valid native token for background replies.
  Future<void> syncNativeAuth() async {
    final access = await readAccessToken();
    final refresh = await readRefreshToken();
    if (access == null || access.isEmpty) return;
    await _mirrorToNative(access, refresh);
  }

  Future<void> _mirrorToNative(String access, String? refresh) async {
    if (!Platform.isAndroid) return;
    try {
      await _nativeChannel.invokeMethod('saveNativeAuth', {
        'access': access,
        'refresh': refresh,
      });
    } catch (_) {
      // Best-effort; the in-app path still works via flutter_secure_storage.
    }
  }
}
