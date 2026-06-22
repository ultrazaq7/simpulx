import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../domain/entities/message.dart';
import '../../domain/entities/uploaded_media.dart';
import '../../domain/repositories/chat_repository.dart';
import 'chat_providers.dart';
import 'conversation_list_controller.dart';

/// Immutable UI state for one conversation thread (messages ASC).
@immutable
class ThreadUiState {
  const ThreadUiState({
    this.messages = const [],
    this.nextCursor,
    this.initialLoading = true,
    this.loadingMore = false,
    this.error,
  });

  final List<Message> messages;
  final String? nextCursor;
  final bool initialLoading;
  final bool loadingMore;
  final Failure? error;

  bool get hasMore => nextCursor != null;
  bool get isEmpty => messages.isEmpty && !initialLoading && error == null;
}

/// Owns a single conversation thread: initial load, older-history pagination,
/// optimistic send, and realtime reconciliation. Exposed via an autoDispose
/// family so leaving the screen frees it.
class ChatThreadController extends ChangeNotifier {
  ChatThreadController({required this.ref, required this.conversationId}) {
    _sub = ref.read(realtimeClientProvider).events.listen(_onEvent);
    load();
  }

  final Ref ref;
  final String conversationId;
  late final StreamSubscription<RealtimeEvent> _sub;

  ThreadUiState _state = const ThreadUiState();
  ThreadUiState get state => _state;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  void _emit(ThreadUiState next) {
    _state = next;
    notifyListeners();
  }

  Future<void> load() async {
    _emit(ThreadUiState(
      messages: _state.messages,
      nextCursor: _state.nextCursor,
      initialLoading: true,
    ));
    final result = await _repo.getMessages(conversationId, limit: 50);
    result.fold(
      (failure) => _emit(ThreadUiState(
        messages: _state.messages,
        initialLoading: false,
        error: failure,
      )),
      (page) {
        _emit(ThreadUiState(
          messages: page.messages,
          nextCursor: page.nextCursor,
          initialLoading: false,
        ));
        // Opening the thread clears its inbox badge (server resets on fetch).
        ref
            .read(conversationListProvider.notifier)
            .markRead(conversationId);
      },
    );
  }

  Future<void> loadOlder() async {
    if (_state.loadingMore || !_state.hasMore) return;
    _emit(ThreadUiState(
      messages: _state.messages,
      nextCursor: _state.nextCursor,
      initialLoading: false,
      loadingMore: true,
    ));
    final result =
        await _repo.getMessages(conversationId, cursor: _state.nextCursor);
    result.fold(
      (_) => _emit(ThreadUiState(
        messages: _state.messages,
        nextCursor: _state.nextCursor,
        initialLoading: false,
      )),
      (page) => _emit(ThreadUiState(
        messages: [...page.messages, ..._state.messages],
        nextCursor: page.nextCursor,
        initialLoading: false,
      )),
    );
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    final tempId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final optimistic = Message(
      id: tempId,
      direction: MessageDirection.outbound,
      senderType: MessageSenderType.agent,
      type: MessageType.text,
      body: trimmed,
      status: MessageStatus.sending,
      createdAt: DateTime.now(),
      pending: true,
    );
    _emit(_withMessages([..._state.messages, optimistic]));

    final result = await _repo.sendMessage(conversationId, body: trimmed);
    result.fold(
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.failed)),
      // Stays "queued" until the realtime `message.persisted` reconciles it.
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.queued)),
    );
  }

  /// Optimistically show a local media preview, upload it, then send a media
  /// message. The persisted message reconciles by media (see [_onEvent]).
  Future<void> attachAndSend(
    String filePath, {
    String? filename,
    MessageType previewType = MessageType.image,
  }) async {
    final tempId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final now = DateTime.now();
    _emit(_withMessages([
      ..._state.messages,
      Message(
        id: tempId,
        direction: MessageDirection.outbound,
        senderType: MessageSenderType.agent,
        type: previewType,
        body: '',
        mediaUrl: filePath, // local path until uploaded
        status: MessageStatus.sending,
        createdAt: now,
        pending: true,
      ),
    ]));

    final upload = await _repo.uploadFile(filePath, filename: filename);
    final UploadedMedia? media = upload.valueOrNull;
    if (media == null) {
      _replace(tempId, (m) => m.copyWith(status: MessageStatus.failed));
      return;
    }

    // Swap the local preview for the served URL + real media type.
    _replace(
      tempId,
      (m) => Message(
        id: tempId,
        direction: MessageDirection.outbound,
        senderType: MessageSenderType.agent,
        type: messageTypeFromWire(media.type),
        body: '',
        mediaUrl: media.url,
        status: MessageStatus.sending,
        createdAt: m.createdAt,
        pending: true,
      ),
    );

    final sent = await _repo.sendMessage(
      conversationId,
      body: '',
      type: media.type,
      mediaUrl: media.url,
    );
    sent.fold(
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.failed)),
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.queued)),
    );
  }

  /// Reconcile optimistic bubbles and append inbound/other messages.
  void _onEvent(RealtimeEvent event) {
    if (!event.isMessagePersisted) return;
    final payload = MessagePersistedPayload(event.data);
    if (payload.conversationId != conversationId) return;

    final messages = [..._state.messages];

    if (!payload.isInbound) {
      final hasMedia =
          payload.mediaUrl != null && payload.mediaUrl!.isNotEmpty;
      final idx = messages.lastIndexWhere(
        (m) => m.pending &&
            (hasMedia ? m.hasMedia : (!m.hasMedia && m.body == payload.body)),
      );
      if (idx != -1) {
        messages[idx] = messages[idx].copyWith(
          id: payload.messageId,
          status: MessageStatus.sent,
          pending: false,
        );
        _emit(_withMessages(messages));
        return;
      }
    }

    if (messages.any((m) => m.id == payload.messageId)) return; // dedupe

    messages.add(Message(
      id: payload.messageId,
      direction: directionFromWire(payload.direction),
      senderType: senderTypeFromWire(payload.senderType),
      type: messageTypeFromWire(payload.type),
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      status: payload.isInbound ? MessageStatus.delivered : MessageStatus.sent,
      createdAt: event.ts,
    ));
    _emit(_withMessages(messages));

    if (payload.isInbound) {
      ref.read(conversationListProvider.notifier).markRead(conversationId);
    }
  }

  ThreadUiState _withMessages(List<Message> messages) => ThreadUiState(
        messages: messages,
        nextCursor: _state.nextCursor,
        initialLoading: false,
        loadingMore: _state.loadingMore,
      );

  void _replace(String id, Message Function(Message) transform) {
    _emit(_withMessages([
      for (final m in _state.messages) m.id == id ? transform(m) : m,
    ]));
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

final chatThreadControllerProvider = Provider.autoDispose
    .family<ChatThreadController, String>((ref, conversationId) {
  final controller =
      ChatThreadController(ref: ref, conversationId: conversationId);
  ref.onDispose(controller.dispose);
  return controller;
});
