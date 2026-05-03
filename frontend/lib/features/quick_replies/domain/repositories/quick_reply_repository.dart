// ============================================================
// Quick Reply Repository (Domain interface)
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/quick_replies/domain/entities/quick_reply_entity.dart';

abstract class QuickReplyRepository {
  Future<Either<Failure, List<QuickReplyEntity>>> getAll({String? search, String? category});
  Future<Either<Failure, QuickReplyEntity>> create(Map<String, dynamic> data);
  Future<Either<Failure, QuickReplyEntity>> update(String id, Map<String, dynamic> data);
  Future<Either<Failure, void>> delete(String id);
  Future<Either<Failure, List<String>>> getCategories();
}
