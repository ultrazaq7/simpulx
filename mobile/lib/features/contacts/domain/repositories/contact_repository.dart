// ============================================================
// Contact Repository Interface (Domain)
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/contacts/domain/entities/contact_entity.dart';

class ContactListResult {
  final List<ContactEntity> contacts;
  final int total;
  final int page;
  final int limit;

  const ContactListResult({
    required this.contacts,
    required this.total,
    required this.page,
    required this.limit,
  });
}

abstract class ContactRepository {
  Future<Either<Failure, ContactListResult>> getContacts({
    int page,
    int limit,
    String? search,
    String? tag,
  });

  Future<Either<Failure, ContactEntity>> getContact(String id);

  Future<Either<Failure, ContactEntity>> createContact({
    String? name,
    String? phone,
    String? email,
    String? whatsappId,
  });

  Future<Either<Failure, ContactEntity>> updateContact(
    String id, {
    String? name,
    String? phone,
    String? email,
    String? notes,
    List<String>? tags,
  });
}
