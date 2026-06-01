// ============================================================
// Chat Domain Entities
// ============================================================
import 'package:equatable/equatable.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;

class ConversationEntity extends Equatable {
  final String id;
  final String contactId;
  final String? assignedAgentId;
  final String? departmentId;
  final String? whatsappChannelId;
  final String? metaChannelId;
  final String channel;
  final String? channelName;
  final String? departmentName;
  final String status;
  final String? subject;
  final DateTime? lastMessageAt;
  final String? lastMessagePreview;
  final String? lastMessageSenderType;
  final String? lastMessageStatus;
  final String? lastMessageDirection;
  final int unreadCount;
  final String? referralAdSetId;
  final String? referralCampaignId;
  final String? referralHeadline;
  final String? stageId;
  final String? stageName;
  final String? stageColor;
  final String? stageCategory;
  final String? interestLevel;
  final DateTime? firstReplyAt;
  final String? sourceChannel;
  final DateTime? snoozedUntil;
  final ContactEntity? contact;
  final AgentEntity? assignedAgent;

  const ConversationEntity({
    required this.id,
    required this.contactId,
    this.assignedAgentId,
    this.departmentId,
    this.whatsappChannelId,
    this.metaChannelId,
    required this.channel,
    this.channelName,
    this.departmentName,
    required this.status,
    this.subject,
    this.lastMessageAt,
    this.lastMessagePreview,
    this.lastMessageSenderType,
    this.lastMessageStatus,
    this.lastMessageDirection,
    this.unreadCount = 0,
    this.referralAdSetId,
    this.referralCampaignId,
    this.referralHeadline,
    this.stageId,
    this.stageName,
    this.stageColor,
    this.stageCategory,
    this.interestLevel,
    this.firstReplyAt,
    this.sourceChannel,
    this.snoozedUntil,
    this.contact,
    this.assignedAgent,
  });

  bool get isUnassigned => assignedAgentId == null && departmentId == null;

  String get displayChannel {
    final name = channelName?.trim();
    if (name != null && name.isNotEmpty) return name;
    if (channel == 'whatsapp') return 'WhatsApp';
    if (channel == 'instagram') return 'Instagram';
    if (channel == 'meta_messenger') return 'Messenger';
    return channel;
  }

  String? get sourceLabel {
    final code = src.normalizeSourceChannel(sourceChannel);
    // Don't show a badge for direct WhatsApp (the default channel).
    if (code == null || code == src.SourceChannel.whatsappDirect) return null;
    return src.prettySourceChannel(code);
  }

  @override
  List<Object?> get props => [
        id,
        contactId,
        assignedAgentId,
        departmentId,
        whatsappChannelId,
        channel,
        channelName,
        departmentName,
        status,
        unreadCount,
        lastMessageAt,
        lastMessageStatus,
        lastMessageDirection,
        referralAdSetId,
        stageId,
        interestLevel,
        firstReplyAt,
        sourceChannel,
        snoozedUntil,
        contact,
      ];
}

class MessageEntity extends Equatable {
  final String id;
  final String conversationId;
  final String senderType;
  final String? senderId;
  final String direction;
  final String type;
  final String? content;
  final String? mediaUrl;
  final String? mediaFilename;
  final String status;
  final String? replyToId;
  final DateTime createdAt;

  const MessageEntity({
    required this.id,
    required this.conversationId,
    required this.senderType,
    this.senderId,
    required this.direction,
    required this.type,
    this.content,
    this.mediaUrl,
    this.mediaFilename,
    required this.status,
    this.replyToId,
    required this.createdAt,
  });

  bool get isInbound => direction == 'inbound';
  bool get isOutbound => direction == 'outbound';

  @override
  List<Object?> get props => [id, conversationId, status, createdAt];
}

class ContactEntity extends Equatable {
  final String id;
  final String? whatsappId;
  final String? instagramId;
  final String? facebookId;
  final String? phone;
  final String? email;
  final String? name;
  final String? avatarUrl;
  final List<String> tags;
  final String? notes;
  final bool isBlocked;
  final DateTime? firstSeenAt;
  final DateTime? lastSeenAt;
  final String? sourceChannel;

  const ContactEntity({
    required this.id,
    this.whatsappId,
    this.instagramId,
    this.facebookId,
    this.phone,
    this.email,
    this.name,
    this.avatarUrl,
    this.tags = const [],
    this.notes,
    this.isBlocked = false,
    this.firstSeenAt,
    this.lastSeenAt,
    this.sourceChannel,
  });

  String get displayName => name ?? phone ?? whatsappId ?? 'Unknown';

  @override
  List<Object?> get props => [
        id,
        name,
        phone,
        email,
        whatsappId,
        tags,
        notes,
        isBlocked,
        firstSeenAt,
        lastSeenAt,
      ];
}

class AgentEntity extends Equatable {
  final String id;
  final String fullName;
  final String? avatarUrl;
  final bool isOnline;

  const AgentEntity({
    required this.id,
    required this.fullName,
    this.avatarUrl,
    this.isOnline = false,
  });

  @override
  List<Object?> get props => [id, fullName, isOnline];
}

class ChatFilterOptionEntity extends Equatable {
  final String id;
  final String label;
  final int? count;

  const ChatFilterOptionEntity({
    required this.id,
    required this.label,
    this.count,
  });

  @override
  List<Object?> get props => [id, label, count];
}

class StageOptionEntity extends Equatable {
  final String id;
  final String label;
  final String color;
  final String category; // 'progressing' | 'lost'

  const StageOptionEntity({
    required this.id,
    required this.label,
    required this.color,
    required this.category,
  });

  @override
  List<Object?> get props => [id, label, color, category];
}

class ChatFilterOptionsEntity extends Equatable {
  final List<ChatFilterOptionEntity> channels;
  final List<ChatFilterOptionEntity> departments;
  final List<String> tags;
  final List<String> sourceChannels;
  final List<StageOptionEntity> stages;

  const ChatFilterOptionsEntity({
    this.channels = const [],
    this.departments = const [],
    this.tags = const [],
    this.sourceChannels = const [],
    this.stages = const [],
  });

  @override
  List<Object?> get props => [channels, departments, tags, sourceChannels, stages];
}

class InternalNoteEntity extends Equatable {
  final String id;
  final String conversationId;
  final String agentId;
  final String agentName;
  final String content;
  final DateTime createdAt;

  const InternalNoteEntity({
    required this.id,
    required this.conversationId,
    required this.agentId,
    required this.agentName,
    required this.content,
    required this.createdAt,
  });

  @override
  List<Object?> get props => [id, content];
}
