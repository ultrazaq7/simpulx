import '../../../../core/error/result.dart';
import '../../../../core/network/error_mapper.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/lead_lookups.dart';
import '../../domain/entities/messages_page.dart';
import '../../domain/entities/uploaded_media.dart';
import '../../domain/repositories/chat_repository.dart';
import '../datasources/chat_remote_datasource.dart';

class ChatRepositoryImpl implements ChatRepository {
  ChatRepositoryImpl(this._remote);
  final ChatRemoteDataSource _remote;

  @override
  Future<Result<List<Conversation>>> listConversations({String? status, String? q}) async {
    try {
      final list = await _remote.listConversations(status: status, q: q);
      return Result.ok(list);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<MessagesPage>> getMessages(
    String conversationId, {
    String? cursor,
    int limit = 50,
  }) async {
    try {
      final page = await _remote.getMessages(
        conversationId,
        cursor: cursor,
        limit: limit,
      );
      return Result.ok(page);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  @override
  Future<Result<void>> sendMessage(
    String conversationId, {
    required String body,
    String type = 'text',
    String? mediaUrl,
  }) async {
    try {
      await _remote.sendMessage(
        conversationId,
        body: body,
        type: type,
        mediaUrl: mediaUrl,
      );
      return const Result.ok(null);
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }

  // ── Lookups ────────────────────────────────────────────
  @override
  Future<Result<List<Stage>>> getStages() => _guard(_remote.getStages);

  @override
  Future<Result<List<Disposition>>> getDispositions() =>
      _guard(_remote.getDispositions);

  @override
  Future<Result<List<QuickReply>>> getQuickReplies() =>
      _guard(_remote.getQuickReplies);

  @override
  Future<Result<List<AgentRef>>> getAgents() => _guard(_remote.getAgents);

  @override
  Future<Result<List<Note>>> getNotes(String conversationId) =>
      _guard(() => _remote.getNotes(conversationId));

  @override
  Future<Result<List<MessageTemplate>>> getTemplates() =>
      _guard(_remote.getTemplates);

  @override
  Future<Result<void>> createQuickReply({
    required String shortcut,
    required String title,
    required String body,
  }) =>
      _guard(() => _remote.createQuickReply(
            shortcut: shortcut,
            title: title,
            body: body,
          ));

  // ── Lead actions ───────────────────────────────────────
  @override
  Future<Result<void>> addNote(String conversationId, String body) =>
      _guard(() => _remote.addNote(conversationId, body));

  @override
  Future<Result<void>> patchConversation(
    String conversationId, {
    String? stageId,
    String? dispositionId,
    String? interestLevel,
    String? status,
    String? lostReason,
  }) =>
      _guard(() => _remote.patchConversation(
            conversationId,
            stageId: stageId,
            dispositionId: dispositionId,
            interestLevel: interestLevel,
            status: status,
            lostReason: lostReason,
          ));

  @override
  Future<Result<void>> assign(
    String conversationId, {
    String? agentId,
    bool unassign = false,
  }) =>
      _guard(() =>
          _remote.assign(conversationId, agentId: agentId, unassign: unassign));

  @override
  Future<Result<void>> snooze(String conversationId, DateTime until) =>
      _guard(() => _remote.snooze(conversationId, until));

  @override
  Future<Result<void>> close(String conversationId, {String? reason}) =>
      _guard(() => _remote.close(conversationId, reason: reason));

  @override
  Future<Result<void>> toggleBot(String conversationId, bool active) =>
      _guard(() => _remote.toggleBot(conversationId, active));

  @override
  Future<Result<void>> trackCall(String conversationId,
          {int durationSeconds = 0}) =>
      _guard(() =>
          _remote.trackCall(conversationId, durationSeconds: durationSeconds));

  @override
  Future<Result<UploadedMedia>> uploadFile(String path, {String? filename}) =>
      _guard(() => _remote.uploadFile(path, filename: filename));

  @override
  Stream<String> streamSummary(String conversationId, {String lang = 'en'}) =>
      _remote.streamSummary(conversationId, lang: lang);

  @override
  Stream<String> streamDraftReply(String conversationId, {String lang = 'en'}) =>
      _remote.streamDraftReply(conversationId, lang: lang);

  /// Wraps a datasource call, mapping exceptions to a [Failure].
  Future<Result<T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Result.ok(await call());
    } catch (e) {
      return Result.err(ErrorMapper.toFailure(e));
    }
  }
}
