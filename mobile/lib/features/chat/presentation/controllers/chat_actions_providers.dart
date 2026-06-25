import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/error/result.dart';
import '../../../contacts/presentation/controllers/contacts_providers.dart';
import '../../domain/entities/lead_lookups.dart';
import '../../domain/repositories/chat_repository.dart';
import 'chat_providers.dart';
import 'conversation_list_controller.dart';

Future<List<T>> _unwrap<T>(
  Future<Result<List<T>>> Function(ChatRepository repo) call,
  Ref ref,
) async {
  final result = await call(ref.watch(chatRepositoryProvider));
  return result.fold((f) => throw f, (v) => v);
}

/// Org pipeline stages (cached for the session).
final stagesProvider = FutureProvider<List<Stage>>(
  (ref) => _unwrap<Stage>((r) => r.getStages(), ref),
);

/// Org dispositions/outcomes (cached).
final dispositionsProvider = FutureProvider<List<Disposition>>(
  (ref) => _unwrap<Disposition>((r) => r.getDispositions(), ref),
);

/// The agent's saved quick replies (cached).
final quickRepliesProvider = FutureProvider<List<QuickReply>>(
  (ref) => _unwrap<QuickReply>((r) => r.getQuickReplies(), ref),
);

/// WhatsApp message templates (cached).
final templatesProvider = FutureProvider<List<MessageTemplate>>(
  (ref) => _unwrap<MessageTemplate>((r) => r.getTemplates(), ref),
);

/// Assignable agents (manager+ assignment UI).
final agentsProvider = FutureProvider<List<AgentRef>>(
  (ref) => _unwrap<AgentRef>((r) => r.getAgents(), ref),
);

/// Internal notes for one conversation. Invalidate after adding.
final notesProvider =
    FutureProvider.autoDispose.family<List<Note>, String>((ref, convId) async {
  final result = await ref.watch(chatRepositoryProvider).getNotes(convId);
  return result.fold((f) => throw f, (v) => v);
});

/// Performs lead actions for one conversation, then refreshes the inbox so the
/// list reflects stage/interest/status changes. Exposes a [busy] flag + last
/// [error] for the action sheet UI.
class ConversationActionsController extends ChangeNotifier {
  ConversationActionsController(this.ref, this.conversationId);

  final Ref ref;
  final String conversationId;

  bool _busy = false;
  bool get busy => _busy;
  Failure? lastError;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  ConversationListController get _inbox =>
      ref.read(conversationListProvider.notifier);

  Future<bool> setStage(String stageId) {
    // Optimistically reflect the stage name from the cached pipeline stages.
    String? stageName;
    final stages = ref.read(stagesProvider).value;
    if (stages != null) {
      for (final s in stages) {
        if (s.id == stageId) {
          stageName = s.name;
          break;
        }
      }
    }
    _inbox.patchLocal(conversationId, stageName: stageName);
    return _run(() => _repo.patchConversation(conversationId, stageId: stageId));
  }

  Future<bool> setInterest(String level) {
    _inbox.patchLocal(conversationId, interestLevel: level);
    return _run(
        () => _repo.patchConversation(conversationId, interestLevel: level));
  }

  Future<bool> setDisposition(String category, {String? lostReason}) {
    _inbox.patchLocal(conversationId, status: 'closed');
    return _run(() => _repo.patchConversation(
          conversationId,
          status: 'closed',
          lostReason: lostReason ?? category,
        ));
  }

  Future<bool> snooze(DateTime until) {
    _inbox.patchLocal(conversationId, status: 'snoozed', snoozedUntil: until);
    return _run(() => _repo.snooze(conversationId, until));
  }

  Future<bool> resolve({String? reason}) {
    _inbox.patchLocal(conversationId, status: 'closed');
    return _run(() => _repo.close(conversationId, reason: reason));
  }

  Future<bool> reopen() {
    _inbox.patchLocal(conversationId, status: 'open');
    return _run(() => _repo.patchConversation(conversationId, status: 'open'));
  }

  Future<bool> toggleBot(bool active) =>
      _run(() => _repo.toggleBot(conversationId, active));

  Future<bool> assign({String? agentId, bool unassign = false}) => _run(
      () => _repo.assign(conversationId, agentId: agentId, unassign: unassign),
      // Assignment can change which leads the agent may see -> re-fetch.
      refreshOnSuccess: true);

  Future<bool> _run(
    Future<Result<void>> Function() action, {
    bool refreshOnSuccess = false,
  }) async {
    _busy = true;
    lastError = null;
    notifyListeners();
    final result = await action();
    final ok = result.isOk;
    if (!ok) lastError = result.failureOrNull;
    _busy = false;
    notifyListeners();
    if (ok) {
      // The optimistic patchLocal already updated the inbox instantly, and the
      // backend echoes a realtime conversation.updated/closed event to every
      // client. Only re-fetch when visibility may have changed (assignment).
      if (refreshOnSuccess) _inbox.refresh();
      ref.invalidate(contactsProvider);
    } else {
      // Roll the optimistic change back to server truth.
      _inbox.refresh();
    }
    return ok;
  }
}

final conversationActionsProvider = Provider.autoDispose
    .family<ConversationActionsController, String>((ref, convId) {
  final controller = ConversationActionsController(ref, convId);
  ref.onDispose(controller.dispose);
  return controller;
});
