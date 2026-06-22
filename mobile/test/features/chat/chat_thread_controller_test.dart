import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:simpulx/core/error/result.dart';
import 'package:simpulx/core/realtime/realtime_client.dart';
import 'package:simpulx/core/realtime/realtime_event.dart';
import 'package:simpulx/core/realtime/realtime_providers.dart';
import 'package:simpulx/features/chat/domain/entities/conversation.dart';
import 'package:simpulx/features/chat/domain/entities/message.dart';
import 'package:simpulx/features/chat/domain/entities/messages_page.dart';
import 'package:simpulx/features/chat/domain/entities/uploaded_media.dart';
import 'package:simpulx/features/chat/domain/repositories/chat_repository.dart';
import 'package:simpulx/features/chat/presentation/controllers/chat_providers.dart';
import 'package:simpulx/features/chat/presentation/controllers/chat_thread_controller.dart';

class _MockChatRepository extends Mock implements ChatRepository {}

class _MockRealtimeClient extends Mock implements RealtimeClient {}

RealtimeEvent _persisted({
  required String convId,
  required String messageId,
  required String direction,
  required String body,
}) {
  return RealtimeEvent(
    id: 'e',
    type: 'message.persisted',
    orgId: 'o',
    ts: DateTime.now(),
    data: {
      'conversation_id': convId,
      'message_id': messageId,
      'direction': direction,
      'sender_type': direction == 'inbound' ? 'contact' : 'agent',
      'type': 'text',
      'body': body,
      'preview': body,
    },
  );
}

Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 10));

void main() {
  test('RealtimeEvent parses the envelope + message.persisted payload', () {
    final event = RealtimeEvent.tryParse({
      'id': 'e1',
      'type': 'message.persisted',
      'org_id': 'o1',
      'ts': '2026-06-22T10:00:00Z',
      'data': {
        'conversation_id': 'c1',
        'message_id': 'm1',
        'direction': 'inbound',
        'sender_type': 'contact',
        'type': 'text',
        'body': 'hi',
        'preview': 'hi',
      },
    });
    expect(event, isNotNull);
    expect(event!.isMessagePersisted, isTrue);
    final payload = MessagePersistedPayload(event.data);
    expect(payload.conversationId, 'c1');
    expect(payload.messageId, 'm1');
    expect(payload.isInbound, isTrue);
    expect(payload.body, 'hi');
  });

  group('ChatThreadController', () {
    late _MockChatRepository repo;
    late _MockRealtimeClient realtime;
    late StreamController<RealtimeEvent> events;
    late ProviderContainer container;

    setUp(() {
      repo = _MockChatRepository();
      realtime = _MockRealtimeClient();
      events = StreamController<RealtimeEvent>.broadcast();

      when(() => realtime.events).thenAnswer((_) => events.stream);
      when(() => repo.getMessages(any(),
              cursor: any(named: 'cursor'), limit: any(named: 'limit')))
          .thenAnswer(
              (_) async => const Result.ok(MessagesPage(messages: [])));
      when(() => repo.listConversations(status: any(named: 'status')))
          .thenAnswer((_) async => const Result.ok(<Conversation>[]));
      when(() => repo.sendMessage(any(),
              body: any(named: 'body'),
              type: any(named: 'type'),
              mediaUrl: any(named: 'mediaUrl')))
          .thenAnswer((_) async => const Result.ok(null));
      when(() => repo.uploadFile(any(), filename: any(named: 'filename')))
          .thenAnswer((_) async => const Result.ok(
                UploadedMedia(
                    url: 'http://x/img.jpg', type: 'image', name: 'img.jpg'),
              ));

      container = ProviderContainer(overrides: [
        chatRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(realtime),
      ]);
      addTearDown(container.dispose);
    });

    test('optimistic send is reconciled (not duplicated) on persisted event',
        () async {
      final sub =
          container.listen(chatThreadControllerProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      final controller = sub.read();
      await _settle();

      await controller.send('hello');
      expect(controller.state.messages.length, 1);
      expect(controller.state.messages.first.body, 'hello');
      expect(controller.state.messages.first.status, MessageStatus.queued);
      expect(controller.state.messages.first.pending, isTrue);

      events.add(_persisted(
        convId: 'c1',
        messageId: 'real-1',
        direction: 'outbound',
        body: 'hello',
      ));
      await _settle();

      expect(controller.state.messages.length, 1); // reconciled, no duplicate
      expect(controller.state.messages.first.id, 'real-1');
      expect(controller.state.messages.first.status, MessageStatus.sent);
      expect(controller.state.messages.first.pending, isFalse);
    });

    test('inbound persisted event is appended', () async {
      final sub =
          container.listen(chatThreadControllerProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      final controller = sub.read();
      await _settle();

      events.add(_persisted(
        convId: 'c1',
        messageId: 'in-1',
        direction: 'inbound',
        body: 'hi there',
      ));
      await _settle();

      expect(controller.state.messages.any((m) => m.id == 'in-1'), isTrue);
    });

    test('events for other conversations are ignored', () async {
      final sub =
          container.listen(chatThreadControllerProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      final controller = sub.read();
      await _settle();

      events.add(_persisted(
        convId: 'OTHER',
        messageId: 'x',
        direction: 'inbound',
        body: 'not mine',
      ));
      await _settle();

      expect(controller.state.messages, isEmpty);
    });

    test('attachAndSend uploads, sends, and reconciles media', () async {
      final sub =
          container.listen(chatThreadControllerProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      final controller = sub.read();
      await _settle();

      await controller.attachAndSend('/local/img.jpg', filename: 'img.jpg');
      expect(controller.state.messages.length, 1);
      expect(controller.state.messages.first.type, MessageType.image);
      expect(controller.state.messages.first.mediaUrl, 'http://x/img.jpg');
      expect(controller.state.messages.first.status, MessageStatus.queued);

      events.add(RealtimeEvent(
        id: 'e',
        type: 'message.persisted',
        orgId: 'o',
        ts: DateTime.now(),
        data: {
          'conversation_id': 'c1',
          'message_id': 'real-img',
          'direction': 'outbound',
          'sender_type': 'agent',
          'type': 'image',
          'body': '',
          'media_url': 'http://x/img.jpg',
          'preview': '[image]',
        },
      ));
      await _settle();

      expect(controller.state.messages.length, 1); // reconciled
      expect(controller.state.messages.first.id, 'real-img');
      expect(controller.state.messages.first.status, MessageStatus.sent);
    });
  });
}
