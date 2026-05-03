// ============================================================
// Auth Repository Interface (Domain layer)
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/auth/domain/entities/auth_entities.dart';

abstract class AuthRepository {
  Future<Either<Failure, AuthSession>> login({
    required String email,
    required String password,
  });

  Future<Either<Failure, String>> forgotPassword({
    required String email,
  });

  Future<Either<Failure, String>> resetPassword({
    required String token,
    required String newPassword,
  });

  Future<Either<Failure, AuthSession>> refreshToken();
  Future<Either<Failure, void>> logout();
  Future<Either<Failure, AuthSession?>> getStoredSession();
  Future<void> updateStoredSession(AuthSession session);
}
