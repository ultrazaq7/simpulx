import '../../../../core/error/result.dart';
import '../../../../shared/models/auth_user.dart';

/// Auth domain contract. Implemented in `data/`, consumed by the presentation
/// controller. Returns [Result] so the UI never sees transport exceptions.
abstract class AuthRepository {
  /// Authenticate and persist tokens. Returns the signed-in user.
  Future<Result<AuthUser>> login({
    required String email,
    required String password,
  });

  /// Hydrate the current user from `/api/me` (used on cold start).
  Future<Result<AuthUser>> currentUser();

  /// Set online/offline presence.
  Future<Result<void>> setPresence(bool online, {String? reason});

  /// Change the signed-in user's password (proves the current one).
  Future<Result<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  });

  /// Register this device's push token after login.
  Future<void> registerPushToken({
    required String token,
    required String platform,
    String? deviceId,
  });

  /// Unregister this device's push token on logout so the backend stops pushing.
  Future<void> unregisterPushToken({required String token});

  /// Request a password reset email.
  Future<Result<void>> forgotPassword(String email);

  /// Complete a password reset using a token from the email link.
  Future<Result<void>> resetPassword({
    required String token,
    required String newPassword,
  });

  /// Revoke the refresh token (best-effort) and clear local tokens.
  Future<void> signOut();

  /// Whether a token exists locally (no network).
  Future<bool> hasSession();

  /// Mirror the stored JWT into the native store (Android) so background
  /// notification actions can authenticate. Call on cold start.
  Future<void> syncNativeAuth();
}
