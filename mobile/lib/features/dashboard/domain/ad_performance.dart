import '../../../core/utils/json_parse.dart';

/// Ad performance for the mobile Campaign Performance screen — the same
/// `GET /api/ad-performance` the web marketing report uses (role-scoped). Per
/// campaign: spend, leads, impressions, clicks, and derived CPL / CTR.
class AdPerformance {
  const AdPerformance({required this.campaigns, required this.daily});

  final List<AdPerfCampaign> campaigns;
  final List<AdPerfDaily> daily;

  double get totalSpend => campaigns.fold(0, (s, c) => s + c.spend);
  int get totalLeads => campaigns.fold(0, (s, c) => s + c.leads);
  int get totalImpressions => campaigns.fold(0, (s, c) => s + c.impressions);
  int get totalClicks => campaigns.fold(0, (s, c) => s + c.clicks);
  int get totalSales => campaigns.fold(0, (s, c) => s + c.sales);
  double get avgCpl => totalLeads > 0 ? totalSpend / totalLeads : 0;
  double get ctr =>
      totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0;

  factory AdPerformance.fromJson(Map<String, dynamic> j) {
    List<Map<String, dynamic>> rows(String k) => (j[k] as List? ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    return AdPerformance(
      campaigns: rows('campaigns').map(AdPerfCampaign.fromJson).toList(),
      daily: rows('daily').map(AdPerfDaily.fromJson).toList(),
    );
  }
}

class AdPerfCampaign {
  const AdPerfCampaign({
    required this.id,
    required this.name,
    required this.spend,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.leads,
    required this.sales,
  });

  final String id;
  final String name;
  final double spend;
  final int impressions;
  final int reach;
  final int clicks;
  final int leads;
  final int sales;

  double get cpl => leads > 0 ? spend / leads : 0;
  double get ctr => impressions > 0 ? clicks / impressions * 100 : 0;

  factory AdPerfCampaign.fromJson(Map<String, dynamic> j) => AdPerfCampaign(
        id: asString(j['campaign_id']),
        name: asString(j['campaign_name']),
        spend: (j['spend'] as num?)?.toDouble() ?? 0,
        impressions: asInt(j['impressions']),
        reach: asInt(j['reach']),
        clicks: asInt(j['clicks']),
        leads: asInt(j['leads']),
        sales: asInt(j['sales']),
      );
}

class AdPerfDaily {
  const AdPerfDaily(
      {required this.date, required this.spend, required this.leads});

  final String date;
  final double spend;
  final int leads;

  factory AdPerfDaily.fromJson(Map<String, dynamic> j) => AdPerfDaily(
        date: asString(j['date']),
        spend: (j['spend'] as num?)?.toDouble() ?? 0,
        leads: asInt(j['leads']),
      );
}
