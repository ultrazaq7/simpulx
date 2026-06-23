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

  /// Full agent name
  String get agentName => agent;

  /// Agent initials (first letter of first and last name)
  String get agentNameInitials {
    final parts = agent.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.isNotEmpty ? parts.first[0].toUpperCase() : '?';
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

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
  const LostReason(this.reason, this.count);
  final String reason;
  final int count;
}

/// Lead-intelligence summary (`GET /api/analytics`): funnel + leaderboard +
/// response time + lost reasons. Only the manager-facing subset is mapped.
class ManagerAnalytics {
  const ManagerAnalytics({
    required this.total,
    required this.replied,
    required this.engaged,
    required this.won,
    required this.lost,
    required this.hot,
    required this.warm,
    required this.cold,
    required this.medianRtMin,
    required this.within5Pct,
    required this.agents,
    required this.lostReasons,
  });

  final int total;
  final int replied;
  final int engaged;
  final int won;
  final int lost;
  final int hot;
  final int warm;
  final int cold;
  final double medianRtMin;
  final double within5Pct;
  final List<AgentPerformance> agents;
  final List<LostReason> lostReasons;

  factory ManagerAnalytics.fromJson(Map<String, dynamic> j) {
    final funnel = (j['funnel'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rt = (j['rt'] as Map?)?.cast<String, dynamic>() ?? const {};
    final agents = (j['agents'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => AgentPerformance.fromJson(e.cast<String, dynamic>()))
        // Drop agents with no activity to keep the leaderboard meaningful.
        .where((a) => a.leads > 0)
        .toList()
      ..sort((a, b) => b.leads.compareTo(a.leads));
    final lost = (j['lost_reasons'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => LostReason(
            asString(e['reason']), asInt(e['count'])))
        .toList();

    return ManagerAnalytics(
      total: asInt(funnel['total']),
      replied: asInt(funnel['replied']),
      engaged: asInt(funnel['engaged']),
      won: asInt(funnel['won']),
      lost: asInt(funnel['lost']),
      hot: asInt(funnel['hot']),
      warm: asInt(funnel['warm']),
      cold: asInt(funnel['cold']),
      medianRtMin: asDoubleOrNull(rt['median_min']) ?? 0,
      within5Pct: asDoubleOrNull(rt['within_5_min_pct']) ?? 0,
      agents: agents,
      lostReasons: lost,
    );
  }
}
