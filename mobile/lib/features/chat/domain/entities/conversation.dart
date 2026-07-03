import 'package:equatable/equatable.dart';

/// A conversation / lead as shown in the inbox list. Fields mirror the
/// `GET /api/conversations` row (verified against `services/gateway/api.go`).
class Conversation extends Equatable {
  const Conversation({
    required this.id,
    required this.status,
    required this.channel,
    required this.contactId,
    required this.contactName,
    required this.contactPhone,
    required this.unreadCount,
    this.lastMessageAt,
    this.lastContactMessageAt,
    this.lastMessagePreview,
    this.lastMessageDirection,
    this.lastSenderType,
    this.interestLevel,
    this.stageName,
    this.assignedAgentId,
    this.agentName,
    this.leadScore,
    this.suggestedAction,
    this.isBotActive = false,
    this.snoozedUntil,
    this.lostReason,
    this.campaignName,
    this.lastOutboundStatus,
  });

  final String id;
  final String status; // open | pending | closed
  final String channel; // whatsapp | instagram | ...
  final String contactId;
  final String contactName;
  final String contactPhone;
  final int unreadCount;
  final DateTime? lastMessageAt;
  final DateTime? lastContactMessageAt; // last inbound msg -> 24h window anchor
  final String? lastMessagePreview;
  final String? lastMessageDirection; // agent | contact
  final String? lastSenderType; // contact | agent | bot | system (latest msg)
  final String? interestLevel; // hot | warm | cold
  final String? stageName;
  final String? assignedAgentId;
  final String? agentName;
  final double? leadScore;
  final String? suggestedAction; // call | message | wait | handoff
  final bool isBotActive;
  final DateTime? snoozedUntil;
  final String? lostReason; // set when a closed lead was marked Lost/Spam
  final String? campaignName;
  final String? lastOutboundStatus; // sent | delivered | read | failed

  /// A closed lead that carries a lost reason is a "Lost" lead, not just closed.
  bool get isLost => status == 'closed' && (lostReason?.isNotEmpty ?? false);

  bool get hasUnread => unreadCount > 0;
  bool get isUnassigned => assignedAgentId == null || assignedAgentId!.isEmpty;

  /// Serialized with the same keys the backend uses, so a cached list can be
  /// re-parsed by `ConversationModel.fromJson` (offline inbox fallback).
  Map<String, dynamic> toJson() => {
        'id': id,
        'status': status,
        'channel': channel,
        'contact_id': contactId,
        'contact_name': contactName,
        'contact_phone': contactPhone,
        'unread_count': unreadCount,
        'last_message_at': lastMessageAt?.toIso8601String(),
        'last_contact_message_at': lastContactMessageAt?.toIso8601String(),
        'last_message_preview': lastMessagePreview,
        'last_message_direction': lastMessageDirection,
        'last_sender_type': lastSenderType,
        'interest_level': interestLevel,
        'stage_name': stageName,
        'assigned_agent_id': assignedAgentId,
        'agent_name': agentName,
        'lead_score': leadScore,
        'suggested_action': suggestedAction,
        'is_bot_active': isBotActive,
        'snoozed_until': snoozedUntil?.toIso8601String(),
        'lost_reason': lostReason,
        'campaign_name': campaignName,
        'last_outbound_status': lastOutboundStatus,
      };

  String get displayName =>
      contactName.trim().isNotEmpty ? contactName : contactPhone;

  Conversation copyWith({
    int? unreadCount,
    DateTime? lastMessageAt,
    String? lastMessagePreview,
    String? lastMessageDirection,
    String? status,
    String? assignedAgentId,
    String? agentName,
    String? interestLevel,
    String? stageName,
    bool? isBotActive,
    DateTime? snoozedUntil,
    String? lostReason,
    String? campaignName,
    String? lastOutboundStatus,
  }) {
    return Conversation(
      id: id,
      status: status ?? this.status,
      channel: channel,
      contactId: contactId,
      contactName: contactName,
      contactPhone: contactPhone,
      unreadCount: unreadCount ?? this.unreadCount,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
      lastMessageDirection: lastMessageDirection ?? this.lastMessageDirection,
      interestLevel: interestLevel ?? this.interestLevel,
      stageName: stageName ?? this.stageName,
      assignedAgentId: assignedAgentId ?? this.assignedAgentId,
      agentName: agentName ?? this.agentName,
      leadScore: leadScore,
      suggestedAction: suggestedAction,
      isBotActive: isBotActive ?? this.isBotActive,
      snoozedUntil: snoozedUntil ?? this.snoozedUntil,
      lostReason: lostReason ?? this.lostReason,
      campaignName: campaignName ?? this.campaignName,
      lastOutboundStatus: lastOutboundStatus ?? this.lastOutboundStatus,
    );
  }

  @override
  List<Object?> get props => [
        id,
        status,
        channel,
        contactId,
        contactName,
        contactPhone,
        unreadCount,
        lastMessageAt,
        lastContactMessageAt,
        lastMessagePreview,
        lastMessageDirection,
        lastSenderType,
        interestLevel,
        stageName,
        assignedAgentId,
        agentName,
        leadScore,
        suggestedAction,
        isBotActive,
        snoozedUntil,
        lostReason,
        campaignName,
        lastOutboundStatus,
      ];
}
