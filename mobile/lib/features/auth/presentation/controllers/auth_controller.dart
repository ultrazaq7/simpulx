import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/notifications/notification_providers.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/session/session_controller.dart';
import '../../data/datasources/auth_remote_datasource.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';

final authRemoteDataSourceProvider = Provider<AuthRemoteDataSource>(
  (ref) => AuthRemoteDataSource(ref.watch(dioProvider)),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(
    remote: ref.watch(authRemoteDataSourceProvider),
    secureStore: ref.watch(secureStoreProvider),
  ),
);

/// Login form / action state.
class AuthActionState {
  const AuthActionState({this.isSubmitting = false, this.errorMessage});
  final bool isSubmitting;
  final String? errorMessage;

  AuthActionState copyWith({bool? isSubmitting, String? errorMessage}) =>
      AuthActionState(
        isSubmitting: isSubmitting ?? this.isSubmitting,
        errorMessage: errorMessage,
      );
}

/// Orchestrates auth operations and pushes results into the global
/// [SessionController]. Owns transient login UI state.
class AuthController extends Notifier<AuthActionState> {
  @override
  AuthActionState build() => const AuthActionState();

  AuthRepository get _repo => ref.read(authRepositoryProvider);
  SessionController get _session =>
      ref.read(sessionControllerProvider.notifier);

  /// Resolve the session on cold start: hydrate `/api/me` if a token exists.
  Future<void> bootstrap() async {
    if (!await _repo.hasSession()) {
      _session.setUnauthenticated();
      return;
    }
    // Mirror the JWT to the native store so background notification replies work
    // even if the app is later killed (best-effort; Android only).
    await _repo.syncNativeAuth();
    final result = await _repo.currentUser();
    result.fold(
      (_) => _session.setUnauthenticated(),
      (user) => _session.setAuthenticated(user),
    );
  }

  Future<bool> login({required String email, required String password}) async {
    state = const AuthActionState(isSubmitting: true);
    final result = await _repo.login(email: email, password: password);
    return result.fold(
      (failure) {
        state = AuthActionState(errorMessage: failure.message);
        return false;
      },
      (user) {
        state = const AuthActionState();
        _session.setAuthenticated(user);
        return true;
      },
    );
  }

  Future<void> signOut() async {
    // Unregister this device's push token while still authenticated, so the
    // backend immediately stops pushing to it. Best-effort: never block logout.
    try {
      final token = await ref.read(pushServiceProvider).getToken();
      if (token != null && token.isNotEmpty) {
        await _repo.unregisterPushToken(token: token);
      }
    } catch (_) {/* ignore; the local deleteToken + server pruning still apply */}
    await _repo.signOut();
    _session.setUnauthenticated();
  }

  /// Optimistically flip presence, reverting on failure.
  Future<void> setPresence(bool online) async {
    final current = ref.read(sessionControllerProvider).user;
    if (current != null) {
      _session.updateUser(current.copyWith(isOnline: online));
    }
    final result = await _repo.setPresence(online);
    result.fold(
      (_) {
        if (current != null) _session.updateUser(current);
      },
      (_) {},
    );
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthActionState>(AuthController.new);
