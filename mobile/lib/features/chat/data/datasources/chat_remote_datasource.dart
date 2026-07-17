import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../../../core/network/error_mapper.dart';
import '../../../../core/network/sse.dart';
import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/lead_lookups.dart';
import '../../domain/entities/message.dart';
import '../../domain/entities/messages_page.dart';
import '../../domain/entities/uploaded_media.dart';
import '../models/conversation_model.dart';
import '../models/message_model.dart';

class ChatRemoteDataSource {
  ChatRemoteDataSource(this._dio);
  final Dio _dio;

  /// GET /api/conversations[?status=&limit=] -> bare JSON array. The server
  /// defaults to 500 (was a silent hard cap of 100 that hid older chats once an
  /// org grew); ask for the full 1000 cap so a busy inbox loads whole. The list
  /// page windows the render, so a longer list stays cheap.
  Future<List<Conversation>> listConversations({String? status, String? q}) async {
    try {
      final res = await _dio.get(
        ApiEndpoints.conversations,
        queryParameters: {
          if (status != null && status.isNotEmpty) 'status': status,
          if (q != null && q.isNotEmpty) 'q': q,
          'limit': 1000,
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

  /// GET /api/conversations/{id} -> a single conversation (same shape as a list
  /// row). Used to resolve a conversation opened without a cached copy — e.g.
  /// tapping a push notification for a brand-new lead before the inbox list has
  /// synced — so the thread header shows the real contact instead of a blank.
  Future<Conversation> getConversation(String id) async {
    try {
      final res = await _dio.get(ApiEndpoints.conversation(id));
      final map = (res.data as Map).cast<String, dynamic>();
      return ConversationModel.fromJson(map);
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
          'cursor': ?cursor,
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

  Future<List<Message>> searchMessages(
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
          'stage_id': ?stageId,
          'disposition_id': ?dispositionId,
          'interest_level': ?interestLevel,
          'status': ?status,
          'lost_reason': ?lostReason,
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
        else 'agent_id': ?agentId,
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
      // Dio does NOT auto-detect a multipart part's content type; without this
      // the server sees application/octet-stream and files (esp. video) get
      // stored as "document" instead of "video"/"image", so the bubble never
      // renders a player. Set it explicitly from the extension.
      final ct = _contentTypeFor(filename ?? path);
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          path,
          filename: filename,
          contentType: DioMediaType.parse(ct),
        ),
      });
      final res = await _dio.post(
        ApiEndpoints.uploads,
        data: form,
        // Media (up to ~100MB video) can far outlast the default 60s send window
        // on mobile data; give large uploads room so they don't false-fail.
        options: Options(
          sendTimeout: const Duration(minutes: 5),
          receiveTimeout: const Duration(minutes: 5),
        ),
      );
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

  /// Best-effort MIME from a filename/path extension. Covers the media the app
  /// actually sends (image_picker JPGs, iOS .mov/.mp4 video, voice notes, common
  /// documents); anything unknown falls back to octet-stream (-> "document").
  static String _contentTypeFor(String name) {
    final i = name.lastIndexOf('.');
    final ext = i >= 0 ? name.substring(i + 1).toLowerCase() : '';
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'heic':
        return 'image/heic';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'm4v':
        return 'video/x-m4v';
      case '3gp':
        return 'video/3gpp';
      case 'm4a':
        return 'audio/mp4';
      case 'mp3':
        return 'audio/mpeg';
      case 'ogg':
        return 'audio/ogg';
      case 'aac':
        return 'audio/aac';
      case 'wav':
        return 'audio/wav';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }
}
