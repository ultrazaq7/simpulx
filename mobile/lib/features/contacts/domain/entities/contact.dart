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
    this.leadScore,
    this.assignedAgentId,
    this.agentName,
    this.conversationId,
    this.campaignName,
    this.lostReason,
    this.sourceId,
    this.sourceUrl,
    this.webApiSourceName,
    this.carBrand,
    this.carModel,
    this.city,
    this.purchaseTimeframe,
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
  final int? leadScore; // buy-potential 0-100 (from the latest conversation)
  final String? assignedAgentId;
  final String? agentName;
  final String? conversationId;
  final String? campaignName;
  final String? lostReason;
  final String? sourceId;
  final String? sourceUrl;
  final String? webApiSourceName;
  final String? carBrand;
  final String? carModel;
  final String? city;
  final String? purchaseTimeframe;

  String get displayName => fullName.trim().isNotEmpty ? fullName : phone;

  /// Accurate lead source label, matching the web: an ad-attributed lead reads
  /// "Ad", a web-API lead reads its source name, otherwise the channel/"Direct"
  /// (so it never just shows the raw channel like "whatsapp").
  String get sourceLabel {
    if (sourceId != null && sourceId!.isNotEmpty) return 'Ad';
    if (webApiSourceName != null && webApiSourceName!.isNotEmpty) {
      return webApiSourceName!;
    }
    if (sourceChannel != null && sourceChannel!.isNotEmpty) {
      return sourceChannel!;
    }
    return 'Direct';
  }
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
        leadScore,
        assignedAgentId,
        agentName,
        conversationId,
        campaignName,
        lostReason,
        sourceId,
        sourceUrl,
        webApiSourceName,
        carBrand,
        carModel,
        city,
        purchaseTimeframe,
      ];
}
