import '../../../../core/error/result.dart';
import '../../../../core/network/error_mapper.dart';
import '../../domain/entities/contact.dart';
import '../../domain/repositories/contacts_repository.dart';
import '../datasources/contacts_remote_datasource.dart';

class ContactsRepositoryImpl implements ContactsRepository {
  ContactsRepositoryImpl(this._remote);
  final ContactsRemoteDataSource _remote;

  @override
  Future<Result<List<Contact>>> list() => _guard(_remote.list);

  @override
  Future<Result<Contact>> create({
    required String fullName,
    required String phone,
    List<String>? tags,
  }) =>
      _guard(() =>
          _remote.create(fullName: fullName, phone: phone, tags: tags));

  @override
  Future<Result<void>> update(
    String id, {
    String? fullName,
    String? phone,
    List<String>? tags,
    bool? blacklisted,
  }) =>
      _guard(() => _remote.update(
            id,
            fullName: fullName,
            phone: phone,
            tags: tags,
            blacklisted: blacklisted,
          ));

  @override
  Future<Result<void>> delete(String id) => _guard(() => _remote.delete(id));

  Future<Result<T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Result.ok(await call());
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }
}
