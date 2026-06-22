import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/models/auth_user.dart';

/// Coarse auth status that drives the router redirect.
enum SessionStatus { unknown, authenticated, unauthenticated }

class SessionState {
  const SessionState({required this.status, this.user});
  const SessionState.unknown()
      : status = SessionStatus.unknown,
        user = null;

  final SessionStatus status;
  final AuthUser? user;

  bool get isAuthenticated => status == SessionStatus.authenticated;
  bool get isResolved => status != SessionStatus.unknown;
}

/// Single source of truth for whether a session exists + who is signed in.
///
/// Pure state holder (depends only on `shared/`). The auth feature's
/// `AuthController` performs login/logout/refresh-from-`/api/me` and pushes
/// results here; the network layer calls [markExpired] on refresh failure.
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState.unknown();

  void setAuthenticated(AuthUser user) {
    state = SessionState(status: SessionStatus.authenticated, user: user);
  }

  void updateUser(AuthUser user) {
    if (state.status == SessionStatus.authenticated) {
      state = SessionState(status: SessionStatus.authenticated, user: user);
    }
  }

  void setUnauthenticated() {
    state = const SessionState(status: SessionStatus.unauthenticated);
  }

  /// Invoked by the network layer when token refresh fails irrecoverably.
  void markExpired() => setUnauthenticated();
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
