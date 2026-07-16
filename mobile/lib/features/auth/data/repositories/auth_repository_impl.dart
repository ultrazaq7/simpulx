import '../../../../core/error/result.dart';
import '../../../../core/network/error_mapper.dart';
import '../../../../core/storage/secure_store.dart';
import '../../../../shared/models/auth_user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required AuthRemoteDataSource remote,
    required SecureStore secureStore,
  })  : _remote = remote,
        _secureStore = secureStore;

  final AuthRemoteDataSource _remote;
  final SecureStore _secureStore;

  @override
  Future<Result<AuthUser>> login({
    required String email,
    required String password,
  }) async {
    try {
      final session = await _remote.login(email: email, password: password);
      await _secureStore.saveTokens(
        accessToken: session.token,
        refreshToken: session.refreshToken,
      );
      return Result.ok(session.user.toEntity());
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<AuthUser>> currentUser() async {
    try {
      final model = await _remote.me();
      return Result.ok(model.toEntity());
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<void>> setPresence(bool online, {String? reason}) async {
    try {
      await _remote.setPresence(online, reason: reason);
      return const Result.ok(null);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _remote.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      return const Result.ok(null);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<void> registerPushToken({
    required String token,
    required String platform,
  }) =>
      _remote.registerFcmToken(token: token, platform: platform);

  @override
  Future<void> unregisterPushToken({required String token}) =>
      _remote.unregisterFcmToken(token: token);

  @override
  Future<Result<void>> forgotPassword(String email) async {
    try {
      await _remote.forgotPassword(email);
      return const Result.ok(null);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<void>> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    try {
      await _remote.resetPassword(token: token, newPassword: newPassword);
      return const Result.ok(null);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<void> signOut() async {
    final refresh = await _secureStore.readRefreshToken();
    if (refresh != null && refresh.isNotEmpty) {
      await _remote.logout(refresh);
    }
    await _secureStore.clear();
  }

  @override
  Future<bool> hasSession() => _secureStore.hasSession;

  @override
  Future<void> syncNativeAuth() => _secureStore.syncNativeAuth();
}
