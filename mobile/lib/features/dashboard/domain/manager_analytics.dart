import '../../../core/utils/json_parse.dart';

/// Org operations snapshot (`GET /api/stats`), role-scoped.
class DashboardStats {
  const DashboardStats({
    required this.active,
    required this.unassigned,
    required this.team,
    required this.contacts,
    required this.broadcasts,
  });

  final int active;
  final int unassigned;
  final int team;
  final int contacts;
  final int broadcasts;

  factory DashboardStats.fromJson(Map<String, dynamic> j) => DashboardStats(
        active: asInt(j['active']),
        unassigned: asInt(j['unassigned']),
        team: asInt(j['team']),
        contacts: asInt(j['contacts']),
        broadcasts: asInt(j['broadcasts']),
      );
}

/// One agent's performance row from `GET /api/analytics` -> `agents[]`.
class AgentPerformance {
  const AgentPerformance({
    required this.agent,
    required this.leads,
    required this.replied,
    required this.won,
    required this.hot,
    required this.avgRtMin,
    required this.within5Pct,
  });

  final String agent;
  final int leads;
  final int replied;
  final int won;
  final int hot;
  final double avgRtMin;
  final double within5Pct;

  factory AgentPerformance.fromJson(Map<String, dynamic> j) =>
      AgentPerformance(
        agent: asString(j['agent']),
        leads: asInt(j['leads']),
        replied: asInt(j['replied']),
        won: asInt(j['won']),
        hot: asInt(j['hot']),
        avgRtMin: asDoubleOrNull(j['avg_rt_min']) ?? 0,
        within5Pct: asDoubleOrNull(j['within_5_pct']) ?? 0,
      );
}

class LostReason {
  const LostReason(this.reason, this.count, {this.rawReason});
  final String reason;
  final int count;
  /// Raw API value (e.g. "no_response") for matching against Conversation.lostReason.
  final String? rawReason;
}

/// One pipeline stage's count (`GET /api/analytics` -> `stages[]`).
class StageStat {
  const StageStat({required this.name, required this.count, required this.sortOrder, this.systemKey});
  final String name;
  final int count;
  final int sortOrder;
  final String? systemKey;

  factory StageStat.fromJson(Map<String, dynamic> j) => StageStat(
        name: asString(j['name']),
        count: asInt(j['count']),
        sortOrder: asInt(j['sort_order']),
        systemKey: j['system_key'] as String?,
      );
}

/// Stage-level funnel with cumulative "reached" count (`analytics.funnel_stages[]`).
class FunnelStageStat {
  const FunnelStageStat({required this.name, required this.reached, this.systemKey});
  final String name;
  final int reached;
  final String? systemKey;

  factory FunnelStageStat.fromJson(Map<String, dynamic> j) => FunnelStageStat(
        name: asString(j['name']),
        reached: asInt(j['reached']),
        systemKey: j['system_key'] as String?,
      );
}

/// Lead-intelligence summary (`GET /api/analytics`): funnel + leaderboard +
/// response time + lost reasons + stage funnel. Only the manager-facing subset is mapped.
class ManagerAnalytics {
  const ManagerAnalytics({
    required this.total,
    required this.replied,
    required this.engaged,
    required this.won,
    required this.lost,
    required this.junk,
    required this.hot,
    required this.warm,
    required this.cold,
    required this.medianRtMin,
    required this.avgRtMin,
    required this.within5Pct,
    required this.agents,
    required this.lostReasons,
    required this.stages,
    required this.funnelStages,
  });

  final int total;
  final int replied;
  final int engaged;
  final int won;
  final int lost;
  final int junk;
  final int hot;
  final int warm;
  final int cold;
  final double medianRtMin;
  final double avgRtMin;
  final double within5Pct;
  final List<AgentPerformance> agents;
  final List<LostReason> lostReasons;
  final List<StageStat> stages;
  final List<FunnelStageStat> funnelStages;

  factory ManagerAnalytics.fromJson(Map<String, dynamic> j) {
    final funnel = (j['funnel'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rt = (j['response_time'] as Map?)?.cast<String, dynamic>() ??
        (j['rt'] as Map?)?.cast<String, dynamic>() ??
        const {};
    final agents = (j['agents'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => AgentPerformance.fromJson(e.cast<String, dynamic>()))
        // Drop agents with no activity to keep the leaderboard meaningful.
        .where((a) => a.leads > 0)
        .toList()
      ..sort((a, b) => b.leads.compareTo(a.leads));
    String formatReason(String raw) {
      if (raw.isEmpty) return 'Unknown';
      final clean = raw.replaceAll('lost_reason_', '').replaceAll('_', ' ');
      if (clean.isEmpty) return 'Unknown';
      return clean[0].toUpperCase() + clean.substring(1);
    }

    final lost = (j['lost_reasons'] as List? ?? const [])
        .whereType<Map>()
        .map((e) {
          final raw = asString(e['reason']);
          return LostReason(
              formatReason(raw), asInt(e['count']), rawReason: raw);
        })
        .toList();

    final stageList = (j['stages'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => StageStat.fromJson(e.cast<String, dynamic>()))
        .toList()
      // "Lost" is a real stage but a terminal outcome (sort_order 0), so pin it
      // to the BOTTOM instead of letting its low sort_order float it to the top.
      ..sort((a, b) {
        final al = (a.systemKey?.startsWith('lost') ?? a.name.toLowerCase().startsWith('lost')) ? 1 : 0;
        final bl = (b.systemKey?.startsWith('lost') ?? b.name.toLowerCase().startsWith('lost')) ? 1 : 0;
        if (al != bl) return al - bl;
        return a.sortOrder.compareTo(b.sortOrder);
      });

    final funnelStageList = (j['funnel_stages'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => FunnelStageStat.fromJson(e.cast<String, dynamic>()))
        .toList();

    return ManagerAnalytics(
      total: asInt(funnel['total']),
      replied: asInt(funnel['replied']),
      engaged: asInt(funnel['engaged']),
      won: asInt(funnel['won']),
      lost: asInt(funnel['lost']),
      junk: asInt(j['junk']),
      hot: asInt(funnel['hot']),
      warm: asInt(funnel['warm']),
      cold: asInt(funnel['cold']),
      medianRtMin: asDoubleOrNull(rt['median_min']) ?? 0,
      avgRtMin: asDoubleOrNull(rt['avg_min']) ?? 0,
      within5Pct: asDoubleOrNull(rt['within_5_min_pct']) ?? 0,
      agents: agents,
      lostReasons: lost,
      stages: stageList,
      funnelStages: funnelStageList,
    );
  }
}

