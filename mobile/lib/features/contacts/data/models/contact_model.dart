import 'dart:convert';

import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/contact.dart';

/// Maps a `GET /api/contacts` row to a [Contact].
class ContactModel {
  ContactModel._();

  static Contact fromJson(Map<String, dynamic> json) {
    return Contact(
      id: asString(json['id']),
      fullName: asString(json['full_name']),
      phone: asString(json['phone']),
      sourceChannel: asStringOrNull(json['source_channel']),
      channelName: asStringOrNull(json['channel_name']),
      tags: _tags(json['tags']),
      blacklisted: asBool(json['blacklisted']),
      createdAt: asDateOrNull(json['created_at']),
      lastMessageAt: asDateOrNull(json['last_message_at']),
      interestLevel: asStringOrNull(json['interest_level']),
      stageName: asStringOrNull(json['stage_name']),
      aiSummary: asStringOrNull(json['ai_summary']),
      leadScore: asIntOrNull(json['lead_score']),
      assignedAgentId: asStringOrNull(json['assigned_agent_id']),
      agentName: asStringOrNull(json['agent_name']),
      conversationId: asStringOrNull(json['conversation_id']),
      campaignName: asStringOrNull(json['campaign_name']),
      lostReason: asStringOrNull(json['lost_reason']),
      sourceId: asStringOrNull(json['source_id']),
      sourceUrl: asStringOrNull(json['source_url']),
      webApiSourceName: asStringOrNull(json['web_api_source_name']),
      webApiSourcePlatform: asStringOrNull(json['web_api_source_platform']),
      leadFields: _leadFields(json['lead_fields']),
    );
  }

  static List<String> _tags(dynamic v) {
    if (v is List) return v.map((e) => e.toString()).toList();
    return const [];
  }

  /// Non-automotive segment qualifiers. Comes as a JSON object (or a JSON string
  /// depending on the driver); coerce every value to a non-empty String.
  static Map<String, String> _leadFields(dynamic v) {
    dynamic m = v;
    if (m is String) {
      if (m.trim().isEmpty) return const {};
      try {
        m = jsonDecode(m);
      } catch (_) {
        return const {};
      }
    }
    if (m is Map) {
      final out = <String, String>{};
      m.forEach((k, val) {
        final s = val?.toString().trim() ?? '';
        if (s.isNotEmpty) out[k.toString()] = s;
      });
      return out;
    }
    return const {};
  }
}
