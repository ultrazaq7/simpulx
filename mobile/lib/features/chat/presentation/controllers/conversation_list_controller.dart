import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/app_providers.dart';
import '../../../../core/realtime/realtime_client.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../../../core/storage/app_cache.dart';
import '../../data/models/conversation_model.dart';
import '../../domain/entities/conversation.dart';
import 'chat_actions_providers.dart';
import 'chat_providers.dart';

/// Inbox list. Loads `GET /api/conversations` and keeps it live by folding in
/// realtime `message.persisted` / assignment / status events.
class ConversationListController extends AsyncNotifier<List<Conversation>> {
  // Tracks whether the socket has ever connected, so we can tell a fresh
  // connect (initial load already covers it) from a RE-connect after a drop.
  bool _hasConnected = false;

  // Fetch every status (open/snoozed/closed). Closing or snoozing a lead must
  // KEEP it in the inbox with an updated status badge, not make it vanish; the
  // client-side InboxFilter narrows the view when the user wants. Backend
  // visibility already scopes rows to the caller's role.
  @override
  Future<List<Conversation>> build() async {
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event != null) _onEvent(event);
    });
    // The socket doesn't replay events it missed while disconnected, so a brief
    // drop could leave the inbox stale until the next event. Catch up by
    // refetching whenever the socket RE-connects (not on the first connect,
    // which the initial load already covers) — this is what makes the list
    // stay live 100% without a manual pull-to-refresh.
    ref.listen(realtimeStatusProvider, (_, next) {
      if (next.value != RealtimeStatus.connected) return;
      if (_hasConnected) {
        refresh();
      } else {
        _hasConnected = true;
      }
    });
    // Cache-first: render the last snapshot instantly, then refresh in the
    // background, so opening the inbox doesn't block on the network round-trip.
    final cache = ref.read(appCacheProvider);
    final cached = cache.getJsonList(AppCache.kConversations);
    if (cached != null && cached.isNotEmpty) {
      Future.microtask(refresh);
      return cached
          .whereType<Map>()
          .map((e) => ConversationModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    }
    return _fetch();
  }

  Future<List<Conversation>> _fetch() async {
    final cache = ref.read(appCacheProvider);
    final result =
        await ref.read(chatRepositoryProvider).listConversations();
    if (result.isOk) {
      final list = result.valueOrNull!;
      // Persist a snapshot for the offline fallback.
      await cache.setJson(
        AppCache.kConversations,
        list.map((c) => c.toJson()).toList(),
      );
      return list;
    }
    // Network failed: serve the last cached inbox if we have one.
    final cached = cache.getJsonList(AppCache.kConversations);
    if (cached != null && cached.isNotEmpty) {
      return cached
          .whereType<Map>()
          .map((e) => ConversationModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    }
    throw result.failureOrNull!;
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }

  /// Optimistically apply a lead change (stage/interest/status) so the inbox,
  /// thread header, and lead detail update instantly before the server confirms.
  void patchLocal(
    String conversationId, {
    String? stageName,
    String? interestLevel,
    String? status,
    DateTime? snoozedUntil,
    String? lostReason,
    bool? isBotActive,
    String? agentName,
    String? assignedAgentId,
    String? contactName,
    String? lastOutboundStatus,
  }) {
    final list = state.value;
    if (list == null) return;
    state = AsyncData([
      for (final c in list)
        c.id == conversationId
            ? c.copyWith(
                stageName: stageName,
                interestLevel: interestLevel,
                status: status,
                snoozedUntil: snoozedUntil,
                lostReason: lostReason,
                isBotActive: isBotActive,
                agentName: agentName,
                assignedAgentId: assignedAgentId,
                contactName: contactName,
                lastOutboundStatus: lastOutboundStatus,
              )
            : c,
    ]);
  }

  /// A contact was edited (name/phone) elsewhere: patch every inbox row for that
  /// contact so the displayed name updates live, no refetch.
  void _patchContact(String contactId, {String? name}) {
    if (contactId.isEmpty || name == null || name.isEmpty) return;
    final list = state.value;
    if (list == null) return;
    state = AsyncData([
      for (final c in list)
        c.contactId == contactId ? c.copyWith(contactName: name) : c,
    ]);
  }

  /// Apply a realtime status/stage change in place. If the conversation isn't in
  /// the current list (e.g. a freshly routed lead), re-fetch to pick it up.
  void _patchStatus(
    String conversationId, {
    String? status,
    String? interestLevel,
    String? stageId,
    String? stageNameOverride,
    String? lostReason,
    DateTime? snoozedUntil,
  }) {
    if (conversationId.isEmpty) return;
    final list = state.value;
    if (list == null) return;
    if (!list.any((c) => c.id == conversationId)) {
      refresh();
      return;
    }
    // Prefer the stage NAME carried by the event (covers a stage the client's
    // cached list doesn't know yet); fall back to resolving from cached stages by
    // id when the event only sent the id.
    String? stageName =
        (stageNameOverride != null && stageNameOverride.isNotEmpty)
            ? stageNameOverride
            : null;
    if (stageName == null && stageId != null) {
      final stages = ref.read(stagesProvider).value;
      if (stages != null) {
        for (final s in stages) {
          if (s.id == stageId) {
            stageName = s.name;
            break;
          }
        }
      }
    }
    patchLocal(
      conversationId,
      status: status,
      interestLevel: interestLevel,
      stageName: stageName,
      lostReason: lostReason,
      snoozedUntil: snoozedUntil,
    );
  }

  /// Locally clear the unread badge when a conversation is opened (the server
  /// also resets it on first message fetch).
  void markRead(String conversationId) {
    final list = state.value;
    if (list == null) return;
    state = AsyncData([
      for (final c in list)
        c.id == conversationId ? c.copyWith(unreadCount: 0) : c,
    ]);
  }

  void _onEvent(RealtimeEvent event) {
    // Assignment can move a lead in/out of the agent's visibility scope, so it
    // needs a re-fetch to stay correct.
    if (event.isConversationAssigned) {
      refresh();
      return;
    }
    // Status/stage changes: patch the row in place so a closed/snoozed lead keeps
    // its spot in the inbox (just with a new status), instead of disappearing.
    if (event.isConversationUpdated) {
      final p = ConversationUpdatedPayload(event.data);
      _patchStatus(
        p.conversationId,
        status: p.status,
        interestLevel: p.interestLevel,
        stageId: p.stageId,
        stageNameOverride: p.stageName,
        lostReason: p.lostReason,
        snoozedUntil: p.snoozedUntil,
      );
      // AI takeover/release: apply the new bot state AND the assignee live to the
      // list so an OPEN thread's badge flips to "Manual · {name}" INSTANTLY — the
      // event now carries the agent, so no refetch is needed for the visible state.
      // Still drop the cached by-id copy as a safety net for a conversation that
      // isn't currently in the list (e.g. filtered out).
      if (p.botActive != null) {
        patchLocal(
          p.conversationId,
          isBotActive: p.botActive,
          agentName: p.agentName,
          assignedAgentId: p.assignedAgentId,
        );
        ref.invalidate(conversationByIdProvider(p.conversationId));
      }
      return;
    }
    if (event.isConversationClosed) {
      final p = ConversationClosedPayload(event.data);
      _patchStatus(p.conversationId, status: 'closed');
      return;
    }
    // A campaign's AI toggle (Smart Summary / Auto-reply) changed: re-fetch the
    // list so conversation flags update, and drop cached single-conversation
    // copies so an open thread/notes sheet reflects it live (no app restart).
    if (event.isCampaignUpdated) {
      refresh();
      ref.invalidate(conversationByIdProvider);
      return;
    }
    // Delivery/read receipt: advance the row's last-outbound tick live (WhatsApp
    // sent→delivered→read) — no refetch. The open thread patches its own bubbles.
    if (event.isMessageStatusUpdated) {
      final p = MessageStatusPayload(event.data);
      if (p.conversationId.isNotEmpty && p.status.isNotEmpty) {
        patchLocal(p.conversationId, lastOutboundStatus: p.status);
      }
      return;
    }
    // Pipeline stage config changed (rename/add/reorder/delete): refetch the
    // cached stage list so names/orders stay correct without an app reload.
    if (event.isStagesUpdated) {
      ref.invalidate(stagesProvider);
      return;
    }
    // An internal note added/removed elsewhere: refetch that conversation's notes
    // so a co-viewer sees it appear/disappear live.
    if (event.isNoteCreated || event.isNoteDeleted) {
      final cid = (event.data['conversation_id'] ?? '').toString();
      if (cid.isNotEmpty) ref.invalidate(notesProvider(cid));
      return;
    }
    // A contact edit (name) elsewhere updates every matching inbox row live.
    if (event.isContactUpdated || event.isContactCreated) {
      final p = ContactUpsertPayload(event.data);
      _patchContact(p.contactId, name: p.name);
      return;
    }
    // A deleted contact removes its conversations from the inbox in realtime.
    if (event.isContactDeleted) {
      final ids = ContactDeletedPayload(event.data).conversationIds.toSet();
      final list = state.value;
      if (list != null && ids.isNotEmpty) {
        state = AsyncData(list.where((c) => !ids.contains(c.id)).toList());
      }
      return;
    }
    if (!event.isMessagePersisted) return;

    final list = state.value;
    if (list == null) return;
    final payload = MessagePersistedPayload(event.data);
    // A status-refresh ping (sent -> delivered -> read) carries only the
    // conversation id. It isn't a new message, so it must not bump the row to the
    // top or inflate the unread count.
    if (payload.messageId.isEmpty) return;
    // The async-media re-publish carries the full message (type + preview), so we
    // process it too — otherwise a media/sticker/document whose first (placeholder)
    // event was missed never shows in the list until a manual refresh. It is NOT a
    // new message though, so it must not bump the unread count.
    final isMediaResolve = payload.mediaUpdated;
    final index = list.indexWhere((c) => c.id == payload.conversationId);

    // Unknown conversation (new lead / freshly routed) -> reload to pick it up.
    if (index == -1) {
      refresh();
      return;
    }

    final existing = list[index];

    // Build a display preview matching WhatsApp's style.
    // Priority: preview text → body text → type-based label.
    String? displayPreview = payload.preview.isNotEmpty
        ? payload.preview
        : payload.body.isNotEmpty
            ? payload.body
            : null;

    // If preview AND body are empty, derive from message type.
    if (displayPreview == null || displayPreview.isEmpty) {
      switch (payload.type) {
        case 'image':
          displayPreview = '📷 Photo';
          break;
        case 'video':
          displayPreview = '🎥 Video';
          break;
        case 'audio':
          displayPreview = '🎤 Voice message';
          break;
        case 'sticker':
          displayPreview = 'Sticker';
          break;
        case 'document':
        case 'file':
          displayPreview = '📄 Document';
          break;
        case 'location':
          displayPreview = '📍 Location';
          break;
        case 'contact':
          displayPreview = '👤 Contact';
          break;
        default:
          // text type with empty body (outbound echo) → keep existing preview
          displayPreview = existing.lastMessagePreview ?? '';
          break;
      }
    }

    final updated = existing.copyWith(
      lastMessagePreview: displayPreview,
      lastMessageAt: event.ts,
      lastMessageDirection: payload.isInbound ? 'contact' : 'agent',
      lastSenderType: payload.senderType,
      // Use the authoritative count from the server when available (single
      // source of truth).  Fall back to a local +1 only when the payload
      // doesn't carry the field (backward compat with older server builds).
      unreadCount: (payload.isInbound && !isMediaResolve)
          ? (payload.unreadCount ?? existing.unreadCount + 1)
          : existing.unreadCount,
    );

    final next = [...list]..removeAt(index);
    next.insert(0, updated); // bubble to top
    state = AsyncData(next);
  }
}

final conversationListProvider =
    AsyncNotifierProvider<ConversationListController, List<Conversation>>(
  ConversationListController.new,
);

/// Total unread across the inbox, for the Chat tab badge.
final totalUnreadProvider = Provider<int>((ref) {
  final list = ref.watch(conversationListProvider).value;
  if (list == null) return 0;
  return list.fold(0, (sum, c) => sum + c.unreadCount);
});
