import '../../../../core/error/result.dart';
import '../entities/contact.dart';

abstract class ContactsRepository {
  Future<Result<List<Contact>>> list();

  Future<Result<Contact>> create({
    required String fullName,
    required String phone,
    List<String>? tags,
  });

  Future<Result<void>> update(
    String id, {
    String? fullName,
    String? phone,
    List<String>? tags,
    bool? blacklisted,
  });

  Future<Result<void>> delete(String id);
}
