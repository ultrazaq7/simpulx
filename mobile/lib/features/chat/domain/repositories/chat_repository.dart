import '../../../../core/error/result.dart';
import '../entities/conversation.dart';
import '../entities/lead_lookups.dart';
import '../entities/message.dart';
import '../entities/messages_page.dart';
import '../entities/uploaded_media.dart';

abstract class ChatRepository {
  /// Inbox list, optionally filtered by status (open/pending/closed) and search query [q].
  Future<Result<List<Conversation>>> listConversations(
      {String? status, String? q, String? contact});

  /// A single conversation by id (used when opened without a cached copy, e.g.
  /// from a push notification before the inbox list has synced).
  Future<Result<Conversation>> getConversation(String id);

  /// Message history page (ASC). Pass [cursor] to load older messages.
  Future<Result<MessagesPage>> getMessages(
    String conversationId, {
    String? cursor,
    int limit,
  });

  /// Search messages by date and/or text query
  Future<Result<List<Message>>> searchMessages(
    String conversationId, {
    String? q,
    DateTime? date,
  });

  /// Queue an outbound message. The persisted message arrives via realtime.
  Future<Result<void>> sendMessage(
    String conversationId, {
    required String body,
    String type,
    String? mediaUrl,
  });

  // ── Lookups ────────────────────────────────────────────
  Future<Result<List<Stage>>> getStages();
  Future<Result<List<Disposition>>> getDispositions();
  Future<Result<List<QuickReply>>> getQuickReplies();
  Future<Result<List<AgentRef>>> getAgents();
  Future<Result<List<Note>>> getNotes(String conversationId);
  Future<Result<List<MessageTemplate>>> getTemplates();

  Future<Result<void>> createQuickReply({
    required String shortcut,
    required String title,
    required String body,
  });

  // ── Lead actions ───────────────────────────────────────
  Future<Result<void>> addNote(String conversationId, String body);

  Future<Result<void>> patchConversation(
    String conversationId, {
    String? stageId,
    String? dispositionId,
    String? interestLevel,
    String? status,
    String? lostReason,
  });

  Future<Result<void>> assign(
    String conversationId, {
    String? agentId,
    bool unassign,
  });

  Future<Result<void>> snooze(String conversationId, DateTime until);
  Future<Result<void>> close(String conversationId, {String? reason});
  Future<Result<void>> toggleBot(String conversationId, bool active);
  Future<Result<void>> trackCall(String conversationId, {int durationSeconds});

  /// Upload a local file to object storage; returns the served URL + media type.
  Future<Result<UploadedMedia>> uploadFile(String path, {String? filename});

  /// Stream the AI lead summary (SSE text deltas).
  Stream<String> streamSummary(String conversationId, {String lang});
}
