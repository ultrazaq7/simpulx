// ============================================================
// Chat Repository Interface (Domain)
// ============================================================
import 'package:dartz/dartz.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';

abstract class ChatRepository {
  Future<Either<Failure, List<ConversationEntity>>> getConversations({
    String? status,
    String? agentId,
    String? contactId,
    String? assignment,
    String? lastMessageBy,
    String? channelId,
    String? departmentId,
    String? interestLevel,
    String? sourceChannel,
    String? stageId,
    String? followUpDue,
    String? sort,
    String? tag,
    int page,
    int limit,
    String? search,
  });

  Future<Either<Failure, List<MessageEntity>>> getMessages({
    required String conversationId,
    int page,
    int limit,
  });

  Future<Either<Failure, MessageEntity>> sendMessage({
    required String conversationId,
    required String content,
    String type,
  });

  Future<Either<Failure, MessageEntity>> sendTemplate({
    required String conversationId,
    required String templateId,
    Map<String, String>? variables,
  });

  Future<Either<Failure, void>> assignAgent({
    required String conversationId,
    String? agentId,
  });

  Future<Either<Failure, List<AgentEntity>>> getAssignableAgents();

  Future<Either<Failure, ChatFilterOptionsEntity>> getFilterOptions();

  Future<Either<Failure, ContactEntity>> updateContactTags({
    required String contactId,
    required List<String> tags,
  });

  Future<Either<Failure, void>> markAsRead({
    required String conversationId,
  });

  Future<Either<Failure, void>> updateConversationStatus({
    required String conversationId,
    required String status,
    String? stageId,
    String? snoozedUntil,
  });

  Future<Either<Failure, void>> updateConversationStage({
    required String conversationId,
    String? stageId,
  });

  Future<Either<Failure, void>> updateConversationInterestLevel({
    required String conversationId,
    String? interestLevel,
  });

  Future<Either<Failure, List<InternalNoteEntity>>> getInternalNotes({
    required String conversationId,
  });

  Future<Either<Failure, InternalNoteEntity>> addInternalNote({
    required String conversationId,
    required String content,
  });

  Future<Either<Failure, void>> deleteInternalNote({
    required String conversationId,
    required String noteId,
  });

  Stream<MessageEntity> get messageStream;
  Stream<ConversationEntity> get conversationUpdateStream;
}
