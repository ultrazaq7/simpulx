import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/conversation.dart';

/// Maps a `GET /api/conversations` row to a [Conversation].
class ConversationModel {
  ConversationModel._();

  static Conversation fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: asString(json['id']),
      status: asString(json['status']),
      channel: asString(json['channel']),
      contactId: asString(json['contact_id']),
      contactName: asString(json['contact_name']),
      contactPhone: asString(json['contact_phone']),
      unreadCount: asInt(json['unread_count']),
      lastMessageAt: asDateOrNull(json['last_message_at']),
      lastMessagePreview: asStringOrNull(json['last_message_preview']),
      lastMessageDirection: asStringOrNull(json['last_message_direction']),
      interestLevel: asStringOrNull(json['interest_level']),
      stageName: asStringOrNull(json['stage_name']),
      assignedAgentId: asStringOrNull(json['assigned_agent_id']),
      agentName: asStringOrNull(json['agent_name']),
      leadScore: asDoubleOrNull(json['lead_score']),
      suggestedAction: asStringOrNull(json['suggested_action']),
      isBotActive: asBool(json['is_bot_active']),
      snoozedUntil: asDateOrNull(json['snoozed_until']),
      lostReason: asStringOrNull(json['lost_reason']),
    );
  }
}
