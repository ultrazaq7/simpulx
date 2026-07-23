import '../../../core/utils/json_parse.dart';

/// AI credit usage (role-scoped: agent sees their campaigns, manager theirs,
/// owner/admin the whole org), mirroring the web AI Usage report. Sourced from
/// `GET /api/subscription/usage` — the same ledger as each campaign's Credits &
/// Usage tab, so the numbers never tell a different story.
class AiUsage {
  const AiUsage({
    required this.daily,
    required this.byFeature,
    required this.byCampaign,
  });

  final List<DailyUsage> daily;
  final List<FeatureUsage> byFeature;
  final List<CampaignUsage> byCampaign;

  int get totalUsed => byCampaign.fold(0, (s, c) => s + c.used);
  int get totalAllocated => byCampaign.fold(0, (s, c) => s + c.allocated);
  int get totalRemaining => byCampaign.fold(0, (s, c) => s + c.remaining);
  int get repliesThisMonth => byCampaign.fold(0, (s, c) => s + c.replies);

  factory AiUsage.fromJson(Map<String, dynamic> j) {
    List<Map<String, dynamic>> rows(String k) => (j[k] as List? ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    return AiUsage(
      daily: rows('daily').map(DailyUsage.fromJson).toList(),
      byFeature: rows('by_feature').map(FeatureUsage.fromJson).toList(),
      byCampaign: rows('by_campaign').map(CampaignUsage.fromJson).toList(),
    );
  }
}

class DailyUsage {
  const DailyUsage({required this.date, required this.feature, required this.count});
  final String date;
  final String feature;
  final int count;

  factory DailyUsage.fromJson(Map<String, dynamic> j) => DailyUsage(
        date: asString(j['date']),
        feature: asString(j['feature']),
        count: asInt(j['count']),
      );
}

class FeatureUsage {
  const FeatureUsage({required this.feature, required this.count});
  final String feature;
  final int count;

  factory FeatureUsage.fromJson(Map<String, dynamic> j) => FeatureUsage(
        feature: asString(j['feature']),
        count: asInt(j['count']),
      );
}

class CampaignUsage {
  const CampaignUsage({
    required this.campaignId,
    required this.campaign,
    required this.allocated,
    required this.used,
    required this.remaining,
    required this.replies,
  });

  final String campaignId;
  final String campaign;
  final int allocated;
  final int used;
  final int remaining;
  final int replies;

  double get usedFraction => allocated > 0 ? (used / allocated).clamp(0, 1) : 0;

  factory CampaignUsage.fromJson(Map<String, dynamic> j) => CampaignUsage(
        campaignId: asString(j['campaign_id']),
        campaign: asString(j['campaign']),
        allocated: asInt(j['allocated_credits']),
        used: asInt(j['used_credits']),
        remaining: asInt(j['remaining']),
        replies: asInt(j['replies']),
      );
}
