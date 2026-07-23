import '../../../core/utils/json_parse.dart';

/// A campaign row for the mobile Campaigns performance screen, from
/// `GET /api/campaigns` (role-scoped). Carries identity + lead volume; the
/// per-campaign AI credit/reply facts come from [AiUsage.byCampaign], merged by
/// campaign id in the view.
class CampaignSummary {
  const CampaignSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.conversations,
    required this.agentCount,
    required this.channelName,
  });

  final String id;
  final String name;
  final String status;
  final int conversations;
  final int agentCount;
  final String channelName;

  factory CampaignSummary.fromJson(Map<String, dynamic> j) => CampaignSummary(
        id: asString(j['id']),
        name: asString(j['name']),
        status: asString(j['status']),
        conversations: asInt(j['conversations']),
        agentCount: asInt(j['agent_count']),
        channelName: asString(j['channel_name']),
      );
}
