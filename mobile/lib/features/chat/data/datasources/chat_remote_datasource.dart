// ============================================================
// Chat Remote Data Source
// ============================================================
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/features/chat/data/models/chat_models.dart';

class ChatRemoteDataSource {
  final DioClient _client;

  ChatRemoteDataSource({required DioClient client}) : _client = client;

  Future<List<ConversationModel>> getConversations({
    String? status,
    String? search,
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
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (status != null && status.isNotEmpty) queryParams['status'] = status;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;
    if (agentId != null && agentId.isNotEmpty) {
      queryParams['agentId'] = agentId;
    }
    if (contactId != null && contactId.isNotEmpty) {
      queryParams['contactId'] = contactId;
    }
    if (assignment != null && assignment.isNotEmpty) {
      queryParams['assignment'] = assignment;
    }
    if (lastMessageBy != null && lastMessageBy.isNotEmpty) {
      queryParams['lastMessageBy'] = lastMessageBy;
    }
    if (channelId != null && channelId.isNotEmpty) {
      queryParams['channelId'] = channelId;
    }
    if (departmentId != null && departmentId.isNotEmpty) {
      queryParams['departmentId'] = departmentId;
    }
    if (interestLevel != null && interestLevel.isNotEmpty) {
      queryParams['interestLevel'] = interestLevel;
    }
    if (sourceChannel != null && sourceChannel.isNotEmpty) {
      queryParams['sourceChannel'] = sourceChannel;
    }
    if (stageId != null && stageId.isNotEmpty) {
      queryParams['stageId'] = stageId;
    }
    if (followUpDue != null && followUpDue.isNotEmpty) {
      queryParams['followUpDue'] = followUpDue;
    }
    if (sort != null && sort.isNotEmpty) queryParams['sort'] = sort;
    if (tag != null && tag.isNotEmpty) queryParams['tag'] = tag;

    final response = await _client.dio.get(
      ApiConstants.conversations,
      queryParameters: queryParams,
    );

    final data = response.data;
    // Backend may return { data: [...] } or just [...]
    final List<dynamic> list =
        data is List ? data : (data['data'] ?? data['conversations'] ?? []);

    return list
        .map((json) =>
            ConversationModel.fromJson(Map<String, dynamic>.from(json)))
        .toList();
  }

  Future<ChatFilterOptionsModel> getFilterOptions() async {
    final response = await _client.dio.get(ApiConstants.conversationFilters);
    return ChatFilterOptionsModel.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<ContactModel> updateContactTags({
    required String contactId,
    required List<String> tags,
  }) async {
    final response = await _client.dio.patch(
      ApiConstants.contact(contactId),
      data: {'tags': tags},
    );

    return ContactModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<List<MessageModel>> getMessages({
    required String conversationId,
    int page = 1,
    int limit = 100,
  }) async {
    final response = await _client.dio.get(
      ApiConstants.messages(conversationId),
      queryParameters: {'page': page, 'limit': limit},
    );

    final data = response.data;
    final List<dynamic> list =
        data is List ? data : (data['data'] ?? data['messages'] ?? []);

    return list
        .map((json) => MessageModel.fromJson(Map<String, dynamic>.from(json)))
        .toList();
  }

  Future<MessageModel> sendMessage({
    required String conversationId,
    required String content,
    String type = 'text',
  }) async {
    final response = await _client.dio.post(
      ApiConstants.messages(conversationId),
      data: {
        'content': content,
        'type': type,
      },
    );

    return MessageModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<MessageModel> sendTemplate({
    required String conversationId,
    required String templateId,
    Map<String, String>? variables,
  }) async {
    final response = await _client.dio.post(
      ApiConstants.sendTemplate(conversationId),
      data: {
        'templateId': templateId,
        if (variables != null && variables.isNotEmpty) 'variables': variables,
      },
    );

    return MessageModel.fromJson(Map<String, dynamic>.from(response.data));
  }

  Future<List<AgentModel>> getAssignableAgents() async {
    final response = await _client.dio.get(
      ApiConstants.users,
      queryParameters: {
        'status': 'active',
        'page': 1,
        'limit': 200,
      },
    );

    final data = response.data;
    final List<dynamic> list =
        data is List ? data : (data['data'] ?? data['users'] ?? []);

    return list
        .whereType<Map<String, dynamic>>()
        .where((json) {
          final role = json['role'] as String? ?? '';
          return role == 'agent' || role == 'supervisor' || role == 'manager';
        })
        .map(AgentModel.fromJson)
        .toList();
  }

  Future<void> assignAgent({
    required String conversationId,
    String? agentId,
  }) async {
    await _client.dio.patch(
      ApiConstants.assignAgent(conversationId),
      data: {'agentId': agentId},
    );
  }

  Future<void> markAsRead({required String conversationId}) async {
    await _client.dio.patch(ApiConstants.markRead(conversationId));
  }

  Future<void> updateConversationStatus({
    required String conversationId,
    required String status,
    String? stageId,
    String? snoozedUntil,
  }) async {
    final body = <String, dynamic>{'status': status};
    if (stageId != null) body['stageId'] = stageId;
    if (snoozedUntil != null) body['snoozedUntil'] = snoozedUntil;
    await _client.dio.patch(
      ApiConstants.conversationStatus(conversationId),
      data: body,
    );
  }

  Future<void> updateConversationStage({
    required String conversationId,
    String? stageId,
  }) async {
    await _client.dio.patch(
      ApiConstants.conversationStage(conversationId),
      data: {'stageId': stageId},
    );
  }

  Future<void> updateConversationInterestLevel({
    required String conversationId,
    String? interestLevel,
  }) async {
    await _client.dio.patch(
      ApiConstants.conversationInterestLevel(conversationId),
      data: {'interestLevel': interestLevel},
    );
  }

  Future<List<InternalNoteModel>> getInternalNotes({
    required String conversationId,
  }) async {
    final response = await _client.dio.get(
      ApiConstants.conversationNotes(conversationId),
    );
    final data = response.data;
    final List<dynamic> list = data is List ? data : (data['data'] ?? []);
    return list
        .whereType<Map<String, dynamic>>()
        .map(InternalNoteModel.fromJson)
        .toList();
  }

  Future<InternalNoteModel> addInternalNote({
    required String conversationId,
    required String content,
  }) async {
    final response = await _client.dio.post(
      ApiConstants.conversationNotes(conversationId),
      data: {'content': content},
    );
    return InternalNoteModel.fromJson(response.data);
  }

  Future<void> deleteInternalNote({
    required String conversationId,
    required String noteId,
  }) async {
    await _client.dio.delete(
      ApiConstants.conversationNote(conversationId, noteId),
    );
  }
}
