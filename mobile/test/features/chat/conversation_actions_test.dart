import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:simpulx/core/error/failure.dart';
import 'package:simpulx/core/error/result.dart';
import 'package:simpulx/core/realtime/realtime_client.dart';
import 'package:simpulx/core/realtime/realtime_event.dart';
import 'package:simpulx/core/realtime/realtime_providers.dart';
import 'package:simpulx/features/chat/domain/entities/conversation.dart';
import 'package:simpulx/features/chat/domain/repositories/chat_repository.dart';
import 'package:simpulx/features/chat/presentation/controllers/chat_actions_providers.dart';
import 'package:simpulx/features/chat/presentation/controllers/chat_providers.dart';

class _MockChatRepository extends Mock implements ChatRepository {}

class _MockRealtimeClient extends Mock implements RealtimeClient {}

void main() {
  late _MockChatRepository repo;
  late _MockRealtimeClient realtime;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer container;

  setUp(() {
    repo = _MockChatRepository();
    realtime = _MockRealtimeClient();
    events = StreamController<RealtimeEvent>.broadcast();
    when(() => realtime.events).thenAnswer((_) => events.stream);
    when(() => repo.listConversations(status: any(named: 'status')))
        .thenAnswer((_) async => const Result.ok(<Conversation>[]));

    container = ProviderContainer(overrides: [
      chatRepositoryProvider.overrideWithValue(repo),
      realtimeClientProvider.overrideWithValue(realtime),
    ]);
    addTearDown(container.dispose);
  });

  ConversationActionsController controllerFor(String id) {
    final sub = container.listen(conversationActionsProvider(id), (_, _) {});
    addTearDown(sub.close);
    return sub.read();
  }

  test('setStage success returns true, clears error, calls repo', () async {
    when(() => repo.patchConversation(any(),
        stageId: any(named: 'stageId'),
        dispositionId: any(named: 'dispositionId'),
        interestLevel: any(named: 'interestLevel'),
        status: any(named: 'status'),
        lostReason: any(named: 'lostReason'))).thenAnswer(
      (_) async => const Result.ok(null),
    );

    final controller = controllerFor('c1');
    final ok = await controller.setStage('stage-1');

    expect(ok, isTrue);
    expect(controller.busy, isFalse);
    expect(controller.lastError, isNull);
    verify(() => repo.patchConversation('c1',
        stageId: 'stage-1',
        dispositionId: any(named: 'dispositionId'),
        interestLevel: any(named: 'interestLevel'),
        status: any(named: 'status'),
        lostReason: any(named: 'lostReason'))).called(1);
  });

  test('failed action returns false and surfaces the failure', () async {
    when(() => repo.patchConversation(any(),
        stageId: any(named: 'stageId'),
        dispositionId: any(named: 'dispositionId'),
        interestLevel: any(named: 'interestLevel'),
        status: any(named: 'status'),
        lostReason: any(named: 'lostReason'))).thenAnswer(
      (_) async => const Result.err(NetworkFailure()),
    );

    final controller = controllerFor('c1');
    final ok = await controller.setInterest('hot');

    expect(ok, isFalse);
    expect(controller.lastError, isA<NetworkFailure>());
  });

  test('resolve closes the conversation', () async {
    when(() => repo.close(any(), reason: any(named: 'reason')))
        .thenAnswer((_) async => const Result.ok(null));

    final controller = controllerFor('c1');
    final ok = await controller.resolve();

    expect(ok, isTrue);
    verify(() => repo.close('c1', reason: any(named: 'reason'))).called(1);
  });
}
