import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:simpulx/core/error/app_exception.dart';
import 'package:simpulx/core/error/failure.dart';
import 'package:simpulx/core/storage/secure_store.dart';
import 'package:simpulx/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:simpulx/features/auth/data/models/auth_session_model.dart';
import 'package:simpulx/features/auth/data/models/auth_user_model.dart';
import 'package:simpulx/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:simpulx/shared/models/user_role.dart';

class _MockRemote extends Mock implements AuthRemoteDataSource {}

class _MockSecureStore extends Mock implements SecureStore {}

void main() {
  group('AuthUserModel', () {
    test('maps snake_case JSON to entity and normalizes empty avatar', () {
      final model = AuthUserModel.fromJson({
        'id': 'u1',
        'org_id': 'o1',
        'role': 'manager',
        'name': 'Jane Doe',
        'email': 'jane@example.com',
        'avatar': '',
        'is_online': true,
      });
      final user = model.toEntity();

      expect(user.id, 'u1');
      expect(user.orgId, 'o1');
      expect(user.role, UserRole.manager);
      expect(user.avatarUrl, isNull);
      expect(user.isOnline, isTrue);
      expect(user.initials, 'JD');
      expect(user.role.isManagerTier, isTrue);
      expect(user.role.isAdminTier, isFalse);
    });
  });

  group('AuthRepositoryImpl.login', () {
    late _MockRemote remote;
    late _MockSecureStore store;
    late AuthRepositoryImpl repo;

    setUp(() {
      remote = _MockRemote();
      store = _MockSecureStore();
      repo = AuthRepositoryImpl(remote: remote, secureStore: store);
    });

    test('persists tokens and returns the user on success', () async {
      const session = AuthSessionModel(
        token: 'access-jwt',
        refreshToken: 'refresh-opaque',
        user: AuthUserModel(
          id: 'u1',
          orgId: 'o1',
          role: 'agent',
          name: 'Agent A',
          email: 'a@example.com',
        ),
      );
      when(() => remote.login(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenAnswer((_) async => session);
      when(() => store.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
          )).thenAnswer((_) async {});

      final result = await repo.login(email: 'a@example.com', password: 'pw');

      expect(result.isOk, isTrue);
      expect(result.valueOrNull?.id, 'u1');
      verify(() => store.saveTokens(
            accessToken: 'access-jwt',
            refreshToken: 'refresh-opaque',
          )).called(1);
    });

    test('maps an UnauthorizedException to AuthFailure', () async {
      when(() => remote.login(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenThrow(const UnauthorizedException('Invalid credentials'));

      final result = await repo.login(email: 'a@example.com', password: 'bad');

      expect(result.isErr, isTrue);
      expect(result.failureOrNull, isA<AuthFailure>());
      verifyNever(() => store.saveTokens(
            accessToken: any(named: 'accessToken'),
            refreshToken: any(named: 'refreshToken'),
          ));
    });
  });
}
