// ============================================================
// Chat Data Models (JSON Serializable)
// ============================================================
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/core/utils/app_datetime.dart';

class ConversationModel extends ConversationEntity {
  const ConversationModel({
    required super.id,
    required super.contactId,
    super.assignedAgentId,
    super.departmentId,
    super.whatsappChannelId,
    super.metaChannelId,
    required super.channel,
    super.channelName,
    super.departmentName,
    required super.status,
    super.subject,
    super.lastMessageAt,
    super.lastMessagePreview,
    super.lastMessageSenderType,
    super.lastMessageStatus,
    super.lastMessageDirection,
    super.unreadCount,
    super.referralAdSetId,
    super.referralCampaignId,
    super.referralHeadline,
    super.stageId,
    super.stageName,
    super.stageColor,
    super.stageCategory,
    super.interestLevel,
    super.firstReplyAt,
    super.sourceChannel,
    super.snoozedUntil,
    super.contact,
    super.assignedAgent,
  });

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    final whatsappChannel = json['whatsappChannel'];
    final department = json['department'];
    final stage = json['stage'];

    return ConversationModel(
      id: json['id'] as String,
      contactId: json['contactId'] ?? json['contact_id'] ?? '',
      assignedAgentId: json['assignedAgentId'] ?? json['assigned_agent_id'],
      departmentId: json['departmentId'] ?? json['department_id'],
      whatsappChannelId:
          json['whatsappChannelId'] ?? json['whatsapp_channel_id'],
      metaChannelId: json['metaChannelId'] ?? json['meta_channel_id'],
      channel: json['channel'] as String? ?? 'whatsapp',
      channelName: json['channelName'] ??
          json['channel_name'] ??
          (whatsappChannel is Map<String, dynamic>
              ? whatsappChannel['name'] as String?
              : null),
      departmentName: json['departmentName'] ??
          json['department_name'] ??
          (department is Map<String, dynamic>
              ? department['name'] as String?
              : null),
      status: json['status'] as String? ?? 'open',
      subject: json['subject'] as String?,
      lastMessageAt: json['lastMessageAt'] != null
          ? AppDateTime.parseLocal(json['lastMessageAt'])
          : null,
      lastMessagePreview: json['lastMessagePreview'] as String?,
      lastMessageSenderType: json['lastMessageSenderType'] as String?,
      lastMessageStatus: json['lastMessageStatus'] as String?,
      lastMessageDirection: json['lastMessageDirection'] as String?,
      unreadCount: json['unreadCount'] as int? ?? 0,
      referralAdSetId: json['referralAdSetId'] ?? json['referral_ad_set_id'],
      referralCampaignId:
          json['referralCampaignId'] ?? json['referral_campaign_id'],
      referralHeadline: json['referralHeadline'] ?? json['referral_headline'],
      stageId: json['stageId'] ?? json['stage_id'],
      stageName: json['stageName'] ??
          (stage is Map<String, dynamic> ? stage['name'] as String? : null),
      stageColor: json['stageColor'] ??
          (stage is Map<String, dynamic> ? stage['color'] as String? : null),
      stageCategory: json['stageCategory'] ??
          (stage is Map<String, dynamic> ? stage['category'] as String? : null),
      interestLevel: json['interestLevel'] as String?,
      firstReplyAt: json['firstReplyAt'] != null
          ? AppDateTime.parseLocal(json['firstReplyAt'])
          : null,
      sourceChannel: json['sourceChannel'] ?? json['source_channel'],
      snoozedUntil: json['snoozedUntil'] != null
          ? AppDateTime.parseLocal(json['snoozedUntil'])
          : null,
      contact: json['contact'] != null
          ? ContactModel.fromJson(json['contact'])
          : null,
      assignedAgent: json['assignedAgent'] != null
          ? AgentModel.fromJson(json['assignedAgent'])
          : null,
    );
  }
}

class MessageModel extends MessageEntity {
  const MessageModel({
    required super.id,
    required super.conversationId,
    required super.senderType,
    super.senderId,
    required super.direction,
    required super.type,
    super.content,
    super.mediaUrl,
    super.mediaFilename,
    required super.status,
    super.replyToId,
    required super.createdAt,
  });

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id'] as String,
      conversationId: json['conversationId'] ?? json['conversation_id'] ?? '',
      senderType: json['senderType'] ?? json['sender_type'] ?? 'contact',
      senderId: json['senderId'] ?? json['sender_id'],
      direction: json['direction'] as String? ?? 'inbound',
      type: json['type'] as String? ?? 'text',
      content: json['content'] as String?,
      mediaUrl: json['mediaUrl'] ?? json['media_url'],
      mediaFilename: json['mediaFilename'] ?? json['media_filename'],
      status: json['status'] as String? ?? 'sent',
      replyToId: json['replyToId'] ?? json['reply_to_id'],
      createdAt: json['createdAt'] != null
          ? AppDateTime.parseLocal(json['createdAt']) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class ContactModel extends ContactEntity {
  const ContactModel({
    required super.id,
    super.whatsappId,
    super.instagramId,
    super.facebookId,
    super.phone,
    super.email,
    super.name,
    super.avatarUrl,
    super.tags,
    super.notes,
    super.isBlocked,
    super.firstSeenAt,
    super.lastSeenAt,
    super.sourceChannel,
  });

  factory ContactModel.fromJson(Map<String, dynamic> json) {
    return ContactModel(
      id: json['id'] as String,
      whatsappId: json['whatsappId'] ?? json['whatsapp_id'],
      instagramId: json['instagramId'] ?? json['instagram_id'],
      facebookId: json['facebookId'] ?? json['facebook_id'],
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] ?? json['avatar_url'],
      tags: (json['tags'] as List<dynamic>?)?.cast<String>() ?? [],
      notes: json['notes'] as String?,
      isBlocked: json['isBlocked'] ?? json['is_blocked'] ?? false,
      firstSeenAt: _parseDate(json['firstSeenAt'] ?? json['first_seen_at']),
      lastSeenAt: _parseDate(json['lastSeenAt'] ?? json['last_seen_at']),
      sourceChannel: json['sourceChannel'] ?? json['source_channel'],
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    return AppDateTime.parseLocal(value);
  }
}

class AgentModel extends AgentEntity {
  const AgentModel({
    required super.id,
    required super.fullName,
    super.avatarUrl,
    super.isOnline,
  });

  factory AgentModel.fromJson(Map<String, dynamic> json) {
    return AgentModel(
      id: json['id'] as String,
      fullName: json['fullName'] ?? json['full_name'] ?? '',
      avatarUrl: json['avatarUrl'] ?? json['avatar_url'],
      isOnline: json['isOnline'] ?? json['is_online'] ?? false,
    );
  }
}

class ChatFilterOptionModel extends ChatFilterOptionEntity {
  const ChatFilterOptionModel({
    required super.id,
    required super.label,
    super.count,
  });

  factory ChatFilterOptionModel.fromJson(Map<String, dynamic> json) {
    return ChatFilterOptionModel(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ??
          json['name']?.toString() ??
          json['phoneNumber']?.toString() ??
          '',
      count: json['count'] is int ? json['count'] as int : null,
    );
  }
}

class StageOptionModel extends StageOptionEntity {
  const StageOptionModel({
    required super.id,
    required super.label,
    required super.color,
    required super.category,
  });

  factory StageOptionModel.fromJson(Map<String, dynamic> json) {
    return StageOptionModel(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? json['name']?.toString() ?? '',
      color: json['color']?.toString() ?? '#3B82F6',
      category: json['category']?.toString() ?? 'progressing',
    );
  }
}

class ChatFilterOptionsModel extends ChatFilterOptionsEntity {
  const ChatFilterOptionsModel({
    super.channels,
    super.departments,
    super.tags,
    super.sourceChannels,
    super.stages,
  });

  factory ChatFilterOptionsModel.fromJson(Map<String, dynamic> json) {
    final channels = json['channels'] as List<dynamic>? ?? const [];
    final departments = json['departments'] as List<dynamic>? ?? const [];
    final tags = json['tags'] as List<dynamic>? ?? const [];
    final sourceChannels = json['sourceChannels'] as List<dynamic>? ?? const [];
    final stagesRaw = json['stages'] as List<dynamic>? ?? const [];

    return ChatFilterOptionsModel(
      channels: channels
          .whereType<Map>()
          .map((json) =>
              ChatFilterOptionModel.fromJson(Map<String, dynamic>.from(json)))
          .where((option) => option.id.isNotEmpty && option.label.isNotEmpty)
          .toList(),
      departments: departments
          .whereType<Map>()
          .map((json) =>
              ChatFilterOptionModel.fromJson(Map<String, dynamic>.from(json)))
          .where((option) => option.id.isNotEmpty && option.label.isNotEmpty)
          .toList(),
      tags: tags
          .map((tag) => tag.toString().trim())
          .where((tag) => tag.isNotEmpty)
          .toList(),
      sourceChannels: sourceChannels
          .map((s) => s.toString().trim())
          .where((s) => s.isNotEmpty)
          .toList(),
      stages: stagesRaw
          .whereType<Map>()
          .map((json) =>
              StageOptionModel.fromJson(Map<String, dynamic>.from(json)))
          .where((option) => option.id.isNotEmpty && option.label.isNotEmpty)
          .toList(),
    );
  }
}

class InternalNoteModel extends InternalNoteEntity {
  const InternalNoteModel({
    required super.id,
    required super.conversationId,
    required super.agentId,
    required super.agentName,
    required super.content,
    required super.createdAt,
  });

  factory InternalNoteModel.fromJson(Map<String, dynamic> json) {
    return InternalNoteModel(
      id: json['id'] as String,
      conversationId: json['conversationId'] ?? json['conversation_id'] ?? '',
      agentId: json['agentId'] ?? json['agent_id'] ?? '',
      agentName: json['agentName'] ?? json['agent_name'] ?? '',
      content: json['content'] as String? ?? '',
      createdAt: json['createdAt'] != null
          ? AppDateTime.parseLocal(json['createdAt']) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
