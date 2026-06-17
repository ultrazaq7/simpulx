// ============================================================
// Auth Repository Implementation
// ============================================================
import 'dart:convert';
import 'package:dartz/dartz.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/auth/domain/entities/auth_entities.dart';
import 'package:simpulx/features/auth/domain/repositories/auth_repository.dart';
import 'package:simpulx/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:simpulx/features/auth/data/models/auth_models.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource _remoteDataSource;
  final FlutterSecureStorage _storage;

  AuthRepositoryImpl({
    required AuthRemoteDataSource remoteDataSource,
    required FlutterSecureStorage storage,
  })  : _remoteDataSource = remoteDataSource,
        _storage = storage;

  @override
  Future<Either<Failure, AuthSession>> login({
    required String email,
    required String password,
  }) async {
    try {
      final session = await _remoteDataSource.login(
        email: email,
        password: password,
      );
      await _storeSession(session);
      return Right(session);
    } on ServerException catch (e) {
      return Left(AuthFailure(message: e.message));
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, String>> forgotPassword({required String email}) async {
    try {
      final message = await _remoteDataSource.forgotPassword(email: email);
      return Right(message);
    } on ServerException catch (e) {
      return Left(AuthFailure(message: e.message));
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, String>> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    try {
      final message = await _remoteDataSource.resetPassword(
        token: token,
        newPassword: newPassword,
      );
      return Right(message);
    } on ServerException catch (e) {
      return Left(AuthFailure(message: e.message));
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, AuthSession>> refreshToken() async {
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) {
        return const Left(AuthFailure(message: 'No refresh token'));
      }
      return const Left(AuthFailure(message: 'Refresh handled by interceptor'));
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> logout() async {
    try {
      await _storage.deleteAll();
      return const Right(null);
    } catch (e) {
      return Left(CacheFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, AuthSession?>> getStoredSession() async {
    try {
      final token = await _storage.read(key: 'access_token');
      final userData = await _storage.read(key: 'user_data');
      final orgData = await _storage.read(key: 'org_data');
      final refreshTokenStr = await _storage.read(key: 'refresh_token');

      if (token == null || userData == null || orgData == null) {
        return const Right(null);
      }

      final user = UserModel.fromJson(jsonDecode(userData));
      final org = OrganizationModel.fromJson(jsonDecode(orgData));

      return Right(AuthSessionModel(
        accessToken: token,
        refreshToken: refreshTokenStr ?? '',
        user: user,
        organization: org,
      ));
    } catch (e) {
      return const Right(null);
    }
  }

  Future<void> _storeSession(AuthSessionModel session) async {
    await _storage.write(key: 'access_token', value: session.accessToken);
    await _storage.write(key: 'refresh_token', value: session.refreshToken);
    await _storage.write(
      key: 'user_data',
      value: jsonEncode((session.user as UserModel).toJson()),
    );
    await _storage.write(
      key: 'org_data',
      value: jsonEncode((session.organization as OrganizationModel).toJson()),
    );
  }

  @override
  Future<void> updateStoredSession(AuthSession session) async {
    // Re-serialize the org data so rolePermissions are persisted locally
    final orgModel = OrganizationModel(
      id: session.organization.id,
      name: session.organization.name,
      slug: session.organization.slug,
      plan: session.organization.plan,
      rolePermissions: session.organization.rolePermissions,
    );
    await _storage.write(
      key: 'org_data',
      value: jsonEncode(orgModel.toJson()),
    );
  }
}
