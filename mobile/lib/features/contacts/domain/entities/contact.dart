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
    this.webApiSourcePlatform,
    this.carBrand,
    this.carModel,
    this.city,
    this.purchaseTimeframe,
    this.leadFields = const {},
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
  final String? webApiSourcePlatform; // meta | tiktok | google | other
  final String? carBrand;
  final String? carModel;
  final String? city;
  final String? purchaseTimeframe;
  // Non-automotive segment qualifiers (property, finance, ...) extracted by the
  // AI into conversation.metadata.lead_fields. Empty for automotive.
  final Map<String, String> leadFields;

  /// Serializes back to the `GET /api/contacts` row shape so the list can be
  /// cached on disk and restored via [ContactModel.fromJson] (cache-first).
  Map<String, dynamic> toJson() => {
        'id': id,
        'full_name': fullName,
        'phone': phone,
        'source_channel': sourceChannel,
        'channel_name': channelName,
        'tags': tags,
        'blacklisted': blacklisted,
        'created_at': createdAt?.toIso8601String(),
        'last_message_at': lastMessageAt?.toIso8601String(),
        'interest_level': interestLevel,
        'stage_name': stageName,
        'ai_summary': aiSummary,
        'lead_score': leadScore,
        'assigned_agent_id': assignedAgentId,
        'agent_name': agentName,
        'conversation_id': conversationId,
        'campaign_name': campaignName,
        'lost_reason': lostReason,
        'source_id': sourceId,
        'source_url': sourceUrl,
        'web_api_source_name': webApiSourceName,
        'web_api_source_platform': webApiSourcePlatform,
        'car_brand': carBrand,
        'car_model': carModel,
        'city': city,
        'purchase_timeframe': purchaseTimeframe,
      };

  String get displayName => fullName.trim().isNotEmpty ? fullName : phone;

  /// Accurate, specific lead source label (matches the web): a CTWA referral
  /// is always Meta by definition (WhatsApp click-to-chat is a Meta-only
  /// feature) so it reads "Meta Ads"; a Web API lead reads its tagged
  /// platform (Meta/TikTok/Google Ads, or "Website"); otherwise the
  /// channel/"Direct" (so it never just shows the raw channel like "whatsapp").
  String get sourceLabel {
    if (sourceId != null && sourceId!.isNotEmpty) return 'Meta Ads';
    switch (webApiSourcePlatform) {
      case 'meta':
        return 'Meta Ads';
      case 'tiktok':
        return 'TikTok Ads';
      case 'google':
        return 'Google Ads';
      case 'other':
        return 'Website';
    }
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
        webApiSourcePlatform,
        carBrand,
        carModel,
        city,
        purchaseTimeframe,
        leadFields,
      ];
}
