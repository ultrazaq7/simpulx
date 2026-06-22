import 'package:equatable/equatable.dart';

/// A lead/contact row from `GET /api/contacts`. The backend LATERAL-joins the
/// contact's most recent conversation, so a contact carries lead context
/// (stage, interest, assigned agent, conversation_id) alongside identity.
class Contact extends Equatable {
  const Contact({
    required this.id,
    required this.fullName,
    required this.phone,
    this.sourceChannel,
    this.channelName,
    this.tags = const [],
    this.blacklisted = false,
    this.createdAt,
    this.lastMessageAt,
    this.interestLevel,
    this.stageName,
    this.aiSummary,
    this.assignedAgentId,
    this.agentName,
    this.conversationId,
    this.campaignName,
  });

  final String id;
  final String fullName;
  final String phone;
  final String? sourceChannel; // whatsapp | manual | web_api | ...
  final String? channelName;
  final List<String> tags;
  final bool blacklisted;
  final DateTime? createdAt;
  final DateTime? lastMessageAt;
  final String? interestLevel; // hot | warm | cold
  final String? stageName;
  final String? aiSummary;
  final String? assignedAgentId;
  final String? agentName;
  final String? conversationId;
  final String? campaignName;

  String get displayName => fullName.trim().isNotEmpty ? fullName : phone;
  bool get hasConversation =>
      conversationId != null && conversationId!.isNotEmpty;

  String get initials {
    final parts = displayName
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  @override
  List<Object?> get props => [
        id,
        fullName,
        phone,
        sourceChannel,
        channelName,
        tags,
        blacklisted,
        createdAt,
        lastMessageAt,
        interestLevel,
        stageName,
        aiSummary,
        assignedAgentId,
        agentName,
        conversationId,
        campaignName,
      ];
}
