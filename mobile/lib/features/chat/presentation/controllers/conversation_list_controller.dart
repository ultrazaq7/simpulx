import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/app_providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../../../core/storage/app_cache.dart';
import '../../data/models/conversation_model.dart';
import '../../domain/entities/conversation.dart';
import 'chat_providers.dart';

/// Inbox list. Loads `GET /api/conversations` and keeps it live by folding in
/// realtime `message.persisted` / assignment / close events.
class ConversationListController extends AsyncNotifier<List<Conversation>> {
  // Backend visibility already scopes to the caller's role, so 'open' is the
  // agent's working set. (Filter UI lands in a later pass.)
  static const _status = 'open';

  @override
  Future<List<Conversation>> build() async {
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event != null) _onEvent(event);
    });
    return _fetch();
  }

  Future<List<Conversation>> _fetch() async {
    final cache = ref.read(appCacheProvider);
    final result =
        await ref.read(chatRepositoryProvider).listConversations(status: _status);
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
              )
            : c,
    ]);
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
    if (event.isConversationAssigned || event.isConversationClosed) {
      refresh();
      return;
    }
    if (!event.isMessagePersisted) return;

    final list = state.value;
    if (list == null) return;
    final payload = MessagePersistedPayload(event.data);
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
      unreadCount:
          payload.isInbound ? existing.unreadCount + 1 : existing.unreadCount,
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
