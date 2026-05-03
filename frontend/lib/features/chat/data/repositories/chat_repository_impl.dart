// ============================================================
// Chat Repository Implementation
// ============================================================
import 'dart:async';
import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import 'package:simpulx/core/error/failures.dart';
import 'package:simpulx/core/network/websocket_service.dart';
import 'package:simpulx/features/chat/data/datasources/chat_remote_datasource.dart';
import 'package:simpulx/features/chat/data/models/chat_models.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/domain/repositories/chat_repository.dart';

class ChatRepositoryImpl implements ChatRepository {
  final ChatRemoteDataSource _remoteDataSource;
  final WebSocketService _wsService;

  final _messageStreamController = StreamController<MessageEntity>.broadcast();
  final _conversationStreamController =
      StreamController<ConversationEntity>.broadcast();
  late final String Function(Object) _errorExtractor;

  ChatRepositoryImpl({
    required ChatRemoteDataSource remoteDataSource,
    required WebSocketService wsService,
  })  : _remoteDataSource = remoteDataSource,
        _wsService = wsService {

    // Extract user-friendly error message from exceptions
    String _extractError(Object e) {
      if (e is DioException && e.response?.data is Map) {
        final msg = (e.response!.data as Map)['message'];
        if (msg is String && msg.isNotEmpty) return msg;
        if (msg is List && msg.isNotEmpty) return msg.join(', ');
      }
      return 'Something went wrong';
    }
    _errorExtractor = _extractError;
    // Forward WebSocket messages to typed streams
    _wsService.messageStream.listen((data) {
      if (data['message'] != null) {
        final msg =
            MessageModel.fromJson(Map<String, dynamic>.from(data['message']));
        _messageStreamController.add(msg);
      }
    });

    _wsService.conversationStream.listen((data) {
      if (data['conversation'] != null) {
        final conv = ConversationModel.fromJson(
            Map<String, dynamic>.from(data['conversation']));
        _conversationStreamController.add(conv);
      }
    });
  }

  @override
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
    int page = 1,
    int limit = 50,
    String? search,
  }) async {
    try {
      final conversations = await _remoteDataSource.getConversations(
        status: status,
        search: search,
        agentId: agentId,
        contactId: contactId,
        assignment: assignment,
        lastMessageBy: lastMessageBy,
        channelId: channelId,
        departmentId: departmentId,
        interestLevel: interestLevel,
        sourceChannel: sourceChannel,
        stageId: stageId,
        followUpDue: followUpDue,
        sort: sort,
        tag: tag,
        page: page,
        limit: limit,
      );
      return Right(conversations);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, List<MessageEntity>>> getMessages({
    required String conversationId,
    int page = 1,
    int limit = 100,
  }) async {
    try {
      final messages = await _remoteDataSource.getMessages(
        conversationId: conversationId,
        page: page,
        limit: limit,
      );
      return Right(messages);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, MessageEntity>> sendMessage({
    required String conversationId,
    required String content,
    String type = 'text',
  }) async {
    try {
      final message = await _remoteDataSource.sendMessage(
        conversationId: conversationId,
        content: content,
        type: type,
      );
      return Right(message);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, MessageEntity>> sendTemplate({
    required String conversationId,
    required String templateId,
    Map<String, String>? variables,
  }) async {
    try {
      final message = await _remoteDataSource.sendTemplate(
        conversationId: conversationId,
        templateId: templateId,
        variables: variables,
      );
      return Right(message);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> assignAgent({
    required String conversationId,
    String? agentId,
  }) async {
    try {
      await _remoteDataSource.assignAgent(
        conversationId: conversationId,
        agentId: agentId,
      );
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, List<AgentEntity>>> getAssignableAgents() async {
    try {
      final agents = await _remoteDataSource.getAssignableAgents();
      return Right(agents);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, ChatFilterOptionsEntity>> getFilterOptions() async {
    try {
      final options = await _remoteDataSource.getFilterOptions();
      return Right(options);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, ContactEntity>> updateContactTags({
    required String contactId,
    required List<String> tags,
  }) async {
    try {
      final contact = await _remoteDataSource.updateContactTags(
        contactId: contactId,
        tags: tags,
      );
      return Right(contact);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> markAsRead({
    required String conversationId,
  }) async {
    try {
      await _remoteDataSource.markAsRead(conversationId: conversationId);
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> updateConversationStatus({
    required String conversationId,
    required String status,
    String? stageId,
    String? snoozedUntil,
  }) async {
    try {
      await _remoteDataSource.updateConversationStatus(
        conversationId: conversationId,
        status: status,
        stageId: stageId,
        snoozedUntil: snoozedUntil,
      );
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> updateConversationStage({
    required String conversationId,
    String? stageId,
  }) async {
    try {
      await _remoteDataSource.updateConversationStage(
        conversationId: conversationId,
        stageId: stageId,
      );
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> updateConversationInterestLevel({
    required String conversationId,
    String? interestLevel,
  }) async {
    try {
      await _remoteDataSource.updateConversationInterestLevel(
        conversationId: conversationId,
        interestLevel: interestLevel,
      );
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, List<InternalNoteEntity>>> getInternalNotes({
    required String conversationId,
  }) async {
    try {
      final notes = await _remoteDataSource.getInternalNotes(
        conversationId: conversationId,
      );
      return Right(notes);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, InternalNoteEntity>> addInternalNote({
    required String conversationId,
    required String content,
  }) async {
    try {
      final note = await _remoteDataSource.addInternalNote(
        conversationId: conversationId,
        content: content,
      );
      return Right(note);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Future<Either<Failure, void>> deleteInternalNote({
    required String conversationId,
    required String noteId,
  }) async {
    try {
      await _remoteDataSource.deleteInternalNote(
        conversationId: conversationId,
        noteId: noteId,
      );
      return const Right(null);
    } catch (e) {
      return Left(ServerFailure(message: _errorExtractor(e)));
    }
  }

  @override
  Stream<MessageEntity> get messageStream => _messageStreamController.stream;

  @override
  Stream<ConversationEntity> get conversationUpdateStream =>
      _conversationStreamController.stream;
}
