// ============================================================
// Quick Reply Repository Implementation
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/quick_replies/domain/entities/quick_reply_entity.dart';
import 'package:simpulx/features/quick_replies/domain/repositories/quick_reply_repository.dart';
import 'package:simpulx/features/quick_replies/data/datasources/quick_reply_remote_datasource.dart';

class QuickReplyRepositoryImpl implements QuickReplyRepository {
  final QuickReplyRemoteDataSource _remoteDataSource;

  QuickReplyRepositoryImpl({required QuickReplyRemoteDataSource remoteDataSource})
      : _remoteDataSource = remoteDataSource;

  @override
  Future<Either<Failure, List<QuickReplyEntity>>> getAll({String? search, String? category}) async {
    try {
      final result = await _remoteDataSource.getAll(search: search, category: category);
      return Right(result);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, QuickReplyEntity>> create(Map<String, dynamic> data) async {
    try {
      final result = await _remoteDataSource.create(data);
      return Right(result);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, QuickReplyEntity>> update(String id, Map<String, dynamic> data) async {
    try {
      final result = await _remoteDataSource.update(id, data);
      return Right(result);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, void>> delete(String id) async {
    try {
      await _remoteDataSource.delete(id);
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, List<String>>> getCategories() async {
    try {
      final result = await _remoteDataSource.getCategories();
      return Right(result);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }
}
