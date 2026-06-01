// ============================================================
// Auth Bloc - State Management
// ============================================================
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/auth/domain/entities/auth_entities.dart';
import 'package:simpulx/features/auth/domain/repositories/auth_repository.dart';
import 'package:simpulx/core/network/websocket_service.dart';
import 'package:simpulx/core/network/notification_service.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';

// ── Events ──────────────────────────────────────────────
abstract class AuthEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class CheckAuthStatusEvent extends AuthEvent {}

class LoginEvent extends AuthEvent {
  final String email;
  final String password;

  LoginEvent({required this.email, required this.password});

  @override
  List<Object?> get props => [email, password];
}

class ForgotPasswordEvent extends AuthEvent {
  final String email;
  ForgotPasswordEvent({required this.email});

  @override
  List<Object?> get props => [email];
}

class ResetPasswordEvent extends AuthEvent {
  final String token;
  final String newPassword;
  ResetPasswordEvent({required this.token, required this.newPassword});

  @override
  List<Object?> get props => [token, newPassword];
}

class LogoutEvent extends AuthEvent {}

class UpdatePermissionsEvent extends AuthEvent {
  final Map<String, Map<String, bool>> rolePermissions;
  UpdatePermissionsEvent({required this.rolePermissions});

  @override
  List<Object?> get props => [rolePermissions];
}

// ── States ──────────────────────────────────────────────
abstract class AuthState extends Equatable {
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}

class AuthAuthenticated extends AuthState {
  final AuthSession session;
  AuthAuthenticated({required this.session});

  @override
  List<Object?> get props => [session];
}

class AuthUnauthenticated extends AuthState {}

class AuthError extends AuthState {
  final String message;
  AuthError({required this.message});

  @override
  List<Object?> get props => [message];
}

class AuthPasswordResetSent extends AuthState {
  final String message;
  AuthPasswordResetSent({required this.message});
}

class AuthPasswordResetSuccess extends AuthState {
  final String message;
  AuthPasswordResetSuccess({required this.message});
}

// ── Bloc ────────────────────────────────────────────────
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository _authRepository;
  final WebSocketService _wsService;

  AuthBloc({
    required AuthRepository authRepository,
    required WebSocketService wsService,
  })  : _authRepository = authRepository,
        _wsService = wsService,
        super(AuthInitial()) {
    on<CheckAuthStatusEvent>(_onCheckAuthStatus);
    on<LoginEvent>(_onLogin);
    on<ForgotPasswordEvent>(_onForgotPassword);
    on<ResetPasswordEvent>(_onResetPassword);
    on<LogoutEvent>(_onLogout);
    on<UpdatePermissionsEvent>(_onUpdatePermissions);
  }

  Future<void> _onCheckAuthStatus(
    CheckAuthStatusEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    final result = await _authRepository.getStoredSession();
    result.fold(
      (failure) => emit(AuthUnauthenticated()),
      (session) {
        if (session != null) {
          _wsService.connect();
          NotificationService.registerTokenAfterLogin();
          emit(AuthAuthenticated(session: session));
          // Fetch fresh permissions in background
          _refreshPermissions(session, emit);
        } else {
          emit(AuthUnauthenticated());
        }
      },
    );
  }

  Future<void> _refreshPermissions(
    AuthSession session,
    Emitter<AuthState> emit,
  ) async {
    try {
      final dio = di.sl<DioClient>().dio;
      final resp = await dio.get(ApiConstants.rolePermissions);
      final rawPerms = resp.data as Map<String, dynamic>? ?? {};
      final perms = rawPerms.map<String, Map<String, bool>>((role, val) {
        final inner = (val as Map<String, dynamic>).map<String, bool>(
          (k, v) => MapEntry(k, v == true),
        );
        return MapEntry(role, inner);
      });
      final newOrg = OrganizationEntity(
        id: session.organization.id,
        name: session.organization.name,
        slug: session.organization.slug,
        plan: session.organization.plan,
        rolePermissions: perms,
      );
      final newSession = AuthSession(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
        organization: newOrg,
      );
      await _authRepository.updateStoredSession(newSession);
      emit(AuthAuthenticated(session: newSession));
    } catch (_) {
      // Silently fail - keep old permissions from local storage
    }
  }

  Future<void> _onLogin(LoginEvent event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    final result = await _authRepository.login(
      email: event.email,
      password: event.password,
    );
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (session) {
        _wsService.connect();
        NotificationService.registerTokenAfterLogin();
        emit(AuthAuthenticated(session: session));
      },
    );
  }

  Future<void> _onForgotPassword(
    ForgotPasswordEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    final result = await _authRepository.forgotPassword(email: event.email);
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (message) => emit(AuthPasswordResetSent(message: message)),
    );
  }

  Future<void> _onResetPassword(
    ResetPasswordEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    final result = await _authRepository.resetPassword(
      token: event.token,
      newPassword: event.newPassword,
    );
    await result.fold(
      (failure) async => emit(AuthError(message: failure.message)),
      (message) async {
        // Clear any existing session so the user is forced to log in with
        // their new password.
        _wsService.disconnect();
        await _authRepository.logout();
        emit(AuthPasswordResetSuccess(message: message));
      },
    );
  }

  Future<void> _onLogout(LogoutEvent event, Emitter<AuthState> emit) async {
    _wsService.disconnect();
    await _authRepository.logout();
    emit(AuthUnauthenticated());
  }

  Future<void> _onUpdatePermissions(
    UpdatePermissionsEvent event,
    Emitter<AuthState> emit,
  ) async {
    if (state is AuthAuthenticated) {
      final old = (state as AuthAuthenticated).session;
      final newOrg = OrganizationEntity(
        id: old.organization.id,
        name: old.organization.name,
        slug: old.organization.slug,
        plan: old.organization.plan,
        rolePermissions: event.rolePermissions,
      );
      final newSession = AuthSession(
        accessToken: old.accessToken,
        refreshToken: old.refreshToken,
        user: old.user,
        organization: newOrg,
      );
      // Persist updated session
      await _authRepository.updateStoredSession(newSession);
      emit(AuthAuthenticated(session: newSession));
    }
  }
}
