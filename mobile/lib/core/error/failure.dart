import 'package:equatable/equatable.dart';

/// Domain-level error surfaced to the presentation layer.
///
/// Repositories translate transport/exceptions into a [Failure] so UI never
/// depends on Dio types. Keep messages user-presentable.
sealed class Failure extends Equatable {
  const Failure(this.message, [this.code]);

  /// Human-readable, already localizable-or-localized message.
  final String message;

  /// Optional machine code (HTTP status or backend error key).
  final int? code;

  @override
  List<Object?> get props => [message, code];
}

/// No connectivity / timeout / socket error.
class NetworkFailure extends Failure {
  const NetworkFailure([super.message = 'No internet connection']);
}

/// Backend returned 5xx or an unexpected server error.
class ServerFailure extends Failure {
  const ServerFailure([super.message = 'Something went wrong']);
  const ServerFailure.withCode(super.message, super.code);
}

/// 401/403 - session invalid or insufficient permission.
class AuthFailure extends Failure {
  const AuthFailure([super.message = 'Your session has expired']);
}

/// 422 / field validation error.
class ValidationFailure extends Failure {
  const ValidationFailure(super.message, {this.fieldErrors});

  /// Optional per-field messages keyed by field name.
  final Map<String, String>? fieldErrors;

  @override
  List<Object?> get props => [message, code, fieldErrors];
}

/// 404 - resource not found (also used for IDOR-guarded responses).
class NotFoundFailure extends Failure {
  const NotFoundFailure([super.message = 'Not found']);
}

/// Anything not otherwise categorized.
class UnknownFailure extends Failure {
  const UnknownFailure([super.message = 'Unexpected error']);
}
