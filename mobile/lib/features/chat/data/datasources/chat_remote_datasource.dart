import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../../../core/network/error_mapper.dart';
import '../../../../core/network/sse.dart';
import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/lead_lookups.dart';
import '../../domain/entities/messages_page.dart';
import '../../domain/entities/uploaded_media.dart';
import '../models/conversation_model.dart';
import '../models/message_model.dart';

class ChatRemoteDataSource {
  ChatRemoteDataSource(this._dio);
  final Dio _dio;

  /// GET /api/conversations[?status=] -> bare JSON array (max 100).
  Future<List<Conversation>> listConversations({String? status, String? q}) async {
    try {
      final res = await _dio.get(
        ApiEndpoints.conversations,
        queryParameters: {
          if (status != null && status.isNotEmpty) 'status': status,
          if (q != null && q.isNotEmpty) 'q': q,
        },
      );
      final data = res.data;
      final list = data is List
          ? data
          : (data is Map ? (data['data'] as List? ?? const []) : const []);
      return list
          .whereType<Map>()
          .map((e) => ConversationModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// GET /api/conversations/{id}/messages?limit&cursor -> {data, next_cursor}.
  /// `data` is chronological ASC; pass [cursor] = previous `nextCursor` to load
  /// older history.
  Future<MessagesPage> getMessages(
    String conversationId, {
    String? cursor,
    int limit = 50,
  }) async {
    try {
      final res = await _dio.get(
        ApiEndpoints.messages(conversationId),
        queryParameters: {
          'limit': limit,
          if (cursor != null) 'cursor': cursor,
        },
      );
      final map = (res.data as Map).cast<String, dynamic>();
      final messages = (map['data'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => MessageModel.fromJson(e.cast<String, dynamic>()))
          .toList();
      return MessagesPage(
        messages: messages,
        nextCursor: map['next_cursor'] as String?,
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  Future<List<MessageModel>> searchMessages(
    String conversationId, {
    String? q,
    DateTime? date,
  }) async {
    try {
      final res = await _dio.get(
        ApiEndpoints.messageSearch(conversationId),
        queryParameters: {
          if (q != null && q.trim().isNotEmpty) 'q': q,
          if (date != null) 'date': date.toIso8601String().split('T').first,
        },
      );
      final map = (res.data as Map).cast<String, dynamic>();
      return (map['data'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => MessageModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/conversations/{id}/messages -> {status: queued}. The persisted
  /// message arrives over the realtime WebSocket as `message.persisted`.
  Future<void> sendMessage(
    String conversationId, {
    required String body,
    String type = 'text',
    String? mediaUrl,
  }) async {
    try {
      await _dio.post(
        ApiEndpoints.messages(conversationId),
        data: {
          'body': body,
          'type': type,
          if (mediaUrl != null && mediaUrl.isNotEmpty) 'media_url': mediaUrl,
        },
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  // ── Lookups (bare arrays) ──────────────────────────────

  Future<List<Stage>> getStages() => _list(
        ApiEndpoints.stages,
        (m) => Stage(id: asString(m['id']), name: asString(m['name'])),
      );

  Future<List<Disposition>> getDispositions() => _list(
        ApiEndpoints.dispositions,
        (m) => Disposition(
          id: asString(m['id']),
          name: asString(m['name']),
          category: asString(m['category']),
        ),
      );

  Future<List<QuickReply>> getQuickReplies() => _list(
        ApiEndpoints.quickReplies,
        (m) => QuickReply(
          id: asString(m['id']),
          shortcut: asString(m['shortcut']),
          title: asString(m['title']),
          body: asString(m['body']),
        ),
      );

  Future<List<AgentRef>> getAgents() => _list(
        ApiEndpoints.agents,
        (m) => AgentRef(
          id: asString(m['id']),
          name: asString(m['full_name']),
          isOnline: asBool(m['is_online']),
          openCount: asInt(m['open_count']),
        ),
      );

  Future<List<Note>> getNotes(String conversationId) => _list(
        ApiEndpoints.notes(conversationId),
        (m) => Note(
          id: asString(m['id']),
          body: asString(m['body']),
          author: asString(m['author']),
          createdAt: asDateOrNull(m['created_at']) ?? DateTime.now(),
        ),
      );

  Future<List<MessageTemplate>> getTemplates() => _list(
        ApiEndpoints.templates,
        (m) => MessageTemplate(
          id: asString(m['id']),
          name: asString(m['name']),
          language: asString(m['language']),
          body: asString(m['body']),
          status: asString(m['status']),
          variables: m['variables'] is List
              ? (m['variables'] as List).map((e) => e.toString()).toList()
              : const [],
        ),
      );

  /// POST /api/quick-replies {shortcut, title, body} -> creates a shortcut.
  Future<void> createQuickReply({
    required String shortcut,
    required String title,
    required String body,
  }) =>
      _post(ApiEndpoints.quickReplies,
          {'shortcut': shortcut, 'title': title, 'body': body});

  Future<List<T>> _list<T>(
    String path,
    T Function(Map<String, dynamic>) map,
  ) async {
    try {
      final res = await _dio.get(path);
      final data = res.data;
      final list = data is List
          ? data
          : (data is Map ? (data['data'] as List? ?? const []) : const []);
      return list
          .whereType<Map>()
          .map((e) => map(e.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  // ── Mutations ──────────────────────────────────────────

  Future<void> addNote(String conversationId, String body) =>
      _post(ApiEndpoints.notes(conversationId), {'body': body});

  /// PATCH /api/conversations/{id}. Only non-null fields are applied.
  Future<void> patchConversation(
    String conversationId, {
    String? stageId,
    String? dispositionId,
    String? interestLevel,
    String? status,
    String? lostReason,
  }) async {
    try {
      await _dio.patch(
        ApiEndpoints.conversation(conversationId),
        data: {
          if (stageId != null) 'stage_id': stageId,
          if (dispositionId != null) 'disposition_id': dispositionId,
          if (interestLevel != null) 'interest_level': interestLevel,
          if (status != null) 'status': status,
          if (lostReason != null) 'lost_reason': lostReason,
        },
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/conversations/{id}/assign (manager+). Empty [agentId] auto-picks.
  Future<void> assign(
    String conversationId, {
    String? agentId,
    bool unassign = false,
  }) =>
      _post(ApiEndpoints.assign(conversationId), {
        if (unassign)
          'unassign': true
        else if (agentId != null)
          'agent_id': agentId,
      });

  Future<void> snooze(String conversationId, DateTime until) => _post(
        ApiEndpoints.snooze(conversationId),
        {'until': until.toUtc().toIso8601String()},
      );

  Future<void> close(String conversationId, {String? reason}) =>
      _post(ApiEndpoints.close(conversationId), reason != null ? {'reason': reason} : {});

  Future<void> toggleBot(String conversationId, bool active) =>
      _post(ApiEndpoints.bot(conversationId), {'active': active});

  /// POST /api/conversations/{id}/calls {duration_seconds} - logs a call
  /// attempt (increments call_attempts; duration unknown for a dialer redirect).
  Future<void> trackCall(String conversationId, {int durationSeconds = 0}) =>
      _post(ApiEndpoints.calls(conversationId),
          {'duration_seconds': durationSeconds});

  Future<void> _post(String path, Map<String, dynamic> body) async {
    try {
      await _dio.post(path, data: body);
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// Stream the AI lead summary (SSE). Yields text deltas; completes on
  /// `{"done": true}`, throws on `{"error": ...}`.
  Stream<String> streamSummary(String conversationId, {String lang = 'en'}) =>
      _sseText(ApiEndpoints.summary(conversationId), lang);

  /// Stream a suggested customer-facing reply draft (SSE).
  Stream<String> streamDraftReply(String conversationId, {String lang = 'en'}) =>
      _sseText(ApiEndpoints.draftReply(conversationId), lang);

  /// POSTs to an SSE endpoint and yields `text` deltas (see [decodeSseText]).
  Stream<String> _sseText(String path, String lang) async* {
    final response = await _dio.post<ResponseBody>(
      path,
      queryParameters: {'lang': lang},
      options: Options(
        responseType: ResponseType.stream,
        headers: {'Accept': 'text/event-stream'},
      ),
    );
    yield* decodeSseText(response.data!.stream);
  }

  /// POST /api/uploads (multipart "file") -> {url, type, name}.
  Future<UploadedMedia> uploadFile(String path, {String? filename}) async {
    try {
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(path, filename: filename),
      });
      final res = await _dio.post(ApiEndpoints.uploads, data: form);
      final m = (res.data as Map).cast<String, dynamic>();
      return UploadedMedia(
        url: asString(m['url']),
        type: asString(m['type']),
        name: asString(m['name']),
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
