// ============================================================
// Contact Repository Implementation
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/contacts/data/datasources/contact_remote_datasource.dart';
import 'package:simpulx/features/contacts/domain/entities/contact_entity.dart';
import 'package:simpulx/features/contacts/domain/repositories/contact_repository.dart';

class ContactRepositoryImpl implements ContactRepository {
  final ContactRemoteDataSource _remoteDataSource;

  ContactRepositoryImpl({required ContactRemoteDataSource remoteDataSource})
      : _remoteDataSource = remoteDataSource;

  @override
  Future<Either<Failure, ContactListResult>> getContacts({
    int page = 1,
    int limit = 50,
    String? search,
    String? tag,
  }) async {
    try {
      final result = await _remoteDataSource.getContacts(
        page: page,
        limit: limit,
        search: search,
        tag: tag,
      );
      return Right(ContactListResult(
        contacts: (result['contacts'] as List).cast<ContactEntity>(),
        total: result['total'] as int,
        page: result['page'] as int,
        limit: result['limit'] as int,
      ));
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, ContactEntity>> getContact(String id) async {
    try {
      final contact = await _remoteDataSource.getContact(id);
      return Right(contact);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, ContactEntity>> createContact({
    String? name,
    String? phone,
    String? email,
    String? whatsappId,
  }) async {
    try {
      final contact = await _remoteDataSource.createContact({
        if (name != null) 'name': name,
        if (phone != null) 'phone': phone,
        if (email != null) 'email': email,
        if (whatsappId != null) 'whatsappId': whatsappId,
      });
      return Right(contact);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Either<Failure, ContactEntity>> updateContact(
    String id, {
    String? name,
    String? phone,
    String? email,
    String? notes,
    List<String>? tags,
  }) async {
    try {
      final contact = await _remoteDataSource.updateContact(id, {
        if (name != null) 'name': name,
        if (phone != null) 'phone': phone,
        if (email != null) 'email': email,
        if (notes != null) 'notes': notes,
        if (tags != null) 'tags': tags,
      });
      return Right(contact);
    } catch (e) {
      return Left(ServerFailure(message: e.toString()));
    }
  }
}
