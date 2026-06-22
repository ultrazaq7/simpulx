import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:simpulx/core/error/app_exception.dart';
import 'package:simpulx/core/error/failure.dart';
import 'package:simpulx/features/contacts/data/datasources/contacts_remote_datasource.dart';
import 'package:simpulx/features/contacts/data/models/contact_model.dart';
import 'package:simpulx/features/contacts/data/repositories/contacts_repository_impl.dart';
import 'package:simpulx/features/contacts/domain/entities/contact.dart';

class _MockRemote extends Mock implements ContactsRemoteDataSource {}

void main() {
  group('ContactModel', () {
    test('maps a lead row with joined conversation context', () {
      final contact = ContactModel.fromJson({
        'id': 'c1',
        'full_name': 'Budi Santoso',
        'phone': '628123456789',
        'source_channel': 'whatsapp',
        'channel_name': 'Main WA',
        'tags': ['vip', 'jakarta'],
        'blacklisted': false,
        'interest_level': 'hot',
        'stage_name': 'Negotiation',
        'ai_summary': 'Wants a test drive this week.',
        'assigned_agent_id': 'a1',
        'agent_name': 'Sari',
        'conversation_id': 'conv-9',
      });

      expect(contact.id, 'c1');
      expect(contact.displayName, 'Budi Santoso');
      expect(contact.initials, 'BS');
      expect(contact.interestLevel, 'hot');
      expect(contact.stageName, 'Negotiation');
      expect(contact.tags, ['vip', 'jakarta']);
      expect(contact.hasConversation, isTrue);
      expect(contact.conversationId, 'conv-9');
    });

    test('falls back to phone when name is empty', () {
      final contact = ContactModel.fromJson({
        'id': 'c2',
        'full_name': '',
        'phone': '628999',
      });
      expect(contact.displayName, '628999');
      expect(contact.hasConversation, isFalse);
    });
  });

  group('ContactsRepositoryImpl', () {
    late _MockRemote remote;
    late ContactsRepositoryImpl repo;

    setUp(() {
      remote = _MockRemote();
      repo = ContactsRepositoryImpl(remote);
    });

    test('create returns the new contact on success', () async {
      when(() => remote.create(
            fullName: any(named: 'fullName'),
            phone: any(named: 'phone'),
            tags: any(named: 'tags'),
          )).thenAnswer((_) async => const Contact(
            id: 'new-1',
            fullName: 'New Lead',
            phone: '628111',
          ));

      final result =
          await repo.create(fullName: 'New Lead', phone: '628111');

      expect(result.isOk, isTrue);
      expect(result.valueOrNull?.id, 'new-1');
    });

    test('list maps a thrown exception to a Failure', () async {
      when(remote.list).thenThrow(const ServerException('boom'));
      final result = await repo.list();
      expect(result.isErr, isTrue);
      expect(result.failureOrNull, isA<ServerFailure>());
    });
  });
}
