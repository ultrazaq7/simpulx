import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/realtime/realtime_client.dart';
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
    final client = ref.read(realtimeClientProvider);
    _sub = client.events.listen(_onEvent);
    // The open thread stayed live ONLY off the socket's event stream, so any
    // message that landed while the socket was down (app backgrounded, signal
    // blip) was simply absent from the thread until you left and reopened it —
    // the inbox refetches on reconnect but the thread never did. Reconcile the
    // thread too, on both a reconnect and a proven sequence gap.
    _statusSub = client.status.listen(_onStatus);
    _gapSub = client.gaps.listen((_) => _reconcile());
    // App resumed from background: reconcile the OPEN thread NOW (in parallel with
    // the socket reconnect) so any message that landed while backgrounded appears
    // the instant the app opens, without waiting on the WS handshake.
    ref.listen(appResumeTickProvider, (_, _) => _reconcile());
    load();
  }

  final Ref ref;
  final String conversationId;
  late final StreamSubscription<RealtimeEvent> _sub;
  late final StreamSubscription<RealtimeStatus> _statusSub;
  late final StreamSubscription<int> _gapSub;
  // Only reconcile on a RE-connect, not the first connect (load() covers that).
  bool _everConnected = false;

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

  Future<void> send(String text,
      {String? replyToMessageId, Map<String, dynamic>? replyToMeta}) async {
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
      // Show the quote immediately; the persisted message carries the same snapshot.
      metadata: replyToMeta == null ? null : {'reply_to': replyToMeta},
    );
    _emit(_withMessages([..._state.messages, optimistic]));

    final result = await _repo.sendMessage(conversationId,
        body: trimmed, replyToMessageId: replyToMessageId);
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
    String? caption,
  }) async {
    final cap = (caption ?? '').trim();
    final tempId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final now = DateTime.now();
    _emit(_withMessages([
      ..._state.messages,
      Message(
        id: tempId,
        direction: MessageDirection.outbound,
        senderType: MessageSenderType.agent,
        type: previewType,
        body: cap,
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
        body: cap,
        mediaUrl: media.url,
        status: MessageStatus.sending,
        createdAt: m.createdAt,
        pending: true,
      ),
    );

    final sent = await _repo.sendMessage(
      conversationId,
      body: cap,
      type: media.type,
      mediaUrl: media.url,
    );
    sent.fold(
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.failed)),
      (_) => _replace(tempId, (m) => m.copyWith(status: MessageStatus.queued)),
    );
  }

  /// Share a pinned location (type=location). Draws the map card straight away
  /// like any other send — waiting for the round-trip left the thread empty for a
  /// beat, which reads as a dropped message. The realtime `message.persisted`
  /// reconciles this bubble by its location payload.
  Future<void> sendLocation(double latitude, double longitude,
      {String? name, String? address}) async {
    final tempId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    _emit(_withMessages([
      ..._state.messages,
      Message(
        id: tempId,
        direction: MessageDirection.outbound,
        senderType: MessageSenderType.agent,
        type: MessageType.location,
        body: '',
        metadata: {
          'location': {
            'latitude': latitude,
            'longitude': longitude,
            'name': name ?? '',
            'address': address ?? '',
          }
        },
        status: MessageStatus.sending,
        createdAt: DateTime.now(),
        pending: true,
      ),
    ]));
    try {
      await ref.read(chatRemoteDataSourceProvider).sendLocation(
            conversationId,
            latitude: latitude,
            longitude: longitude,
            name: name,
            address: address,
          );
      _replace(tempId, (m) => m.copyWith(status: MessageStatus.queued));
    } catch (_) {
      _replace(tempId, (m) => m.copyWith(status: MessageStatus.failed));
    }
  }

  void _onStatus(RealtimeStatus s) {
    if (s != RealtimeStatus.connected) return;
    if (_everConnected) {
      _reconcile(); // catch up anything missed while the socket was down
    } else {
      _everConnected = true;
    }
  }

  /// Pull the latest page and merge in anything the live stream missed. Preserves
  /// already-loaded older history AND local pending (optimistic) bubbles, and
  /// won't duplicate an outbound message that still has a pending local twin
  /// (its status event reconciles that bubble). Cheap: a no-op when nothing's new.
  Future<void> _reconcile() async {
    final page = (await _repo.getMessages(conversationId, limit: 50)).valueOrNull;
    if (page == null) return;
    final existingIds = _state.messages.map((m) => m.id).toSet();
    final pendingBodies = _state.messages
        .where((m) => m.pending && m.direction == MessageDirection.outbound)
        .map((m) => m.body.trim().toLowerCase())
        .toSet();
    final toAdd = <Message>[];
    for (final m in page.messages) {
      if (existingIds.contains(m.id)) continue;
      if (m.direction == MessageDirection.outbound &&
          pendingBodies.contains(m.body.trim().toLowerCase())) {
        continue; // still-pending local twin; _onEvent will fold it in
      }
      toAdd.add(m);
    }
    if (toAdd.isEmpty) return;
    final merged = [..._state.messages, ...toAdd]
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    _emit(_withMessages(merged));
    // A caught-up inbound clears the inbox badge for this thread.
    ref.read(conversationListProvider.notifier).markRead(conversationId);
  }

  /// Reconcile optimistic bubbles and append inbound/other messages.
  void _onEvent(RealtimeEvent event) {
    // Delivery/read receipt: advance the exact bubble's tick live (WhatsApp
    // sent→delivered→read), only forward — never regress a further-along tick.
    if (event.isMessageStatusUpdated) {
      final p = MessageStatusPayload(event.data);
      if (p.conversationId != conversationId || p.messageId.isEmpty) return;
      final st = switch (p.status) {
        'sent' => MessageStatus.sent,
        'delivered' => MessageStatus.delivered,
        'read' => MessageStatus.read,
        'failed' => MessageStatus.failed,
        _ => null,
      };
      if (st == null) return;
      final messages = [..._state.messages];
      final idx = messages.indexWhere((m) => m.id == p.messageId);
      if (idx != -1 && st.index > messages[idx].status.index) {
        messages[idx] = messages[idx].copyWith(status: st);
        _emit(_withMessages(messages));
      }
      return;
    }
    if (!event.isMessagePersisted) return;
    final payload = MessagePersistedPayload(event.data);
    if (payload.conversationId != conversationId) return;
    // A status-refresh ping (sent -> delivered -> read) is published as a pseudo
    // message.persisted carrying ONLY the conversation id. It's not a real
    // message, so appending it would draw a blank "Unsupported message" bubble.
    if (payload.messageId.isEmpty) return;

    final messages = [..._state.messages];

    if (!payload.isInbound) {
      final hasMedia =
          payload.mediaUrl != null && payload.mediaUrl!.isNotEmpty;
      // Find optimistic message to reconcile - match by media URL or trimmed body
      final idx = messages.lastIndexWhere((m) {
        if (!m.pending) return false;
        // A shared location carries no body or media, so match it by type —
        // otherwise its empty body would reconcile against an unrelated bubble.
        if (payload.type == 'location') return m.type == MessageType.location;
        if (hasMedia) return m.hasMedia;
        // Compare trimmed bodies (backend may normalize whitespace)
        return m.body.trim().toLowerCase() == payload.body.trim().toLowerCase();
      });
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

    final dupIdx = messages.indexWhere((m) => m.id == payload.messageId);
    if (dupIdx != -1) {
      // Async media resolved: swap the placeholder for the real file in place.
      final murl = payload.mediaUrl;
      if (murl != null && murl.isNotEmpty && messages[dupIdx].mediaUrl != murl) {
        messages[dupIdx] = messages[dupIdx].copyWith(mediaUrl: murl);
        _emit(_withMessages(messages));
      }
      return; // dedupe
    }

    messages.add(Message(
      id: payload.messageId,
      direction: directionFromWire(payload.direction),
      senderType: senderTypeFromWire(payload.senderType),
      type: messageTypeFromWire(payload.type),
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      metadata: payload.metadata,
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
    _statusSub.cancel();
    _gapSub.cancel();
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
