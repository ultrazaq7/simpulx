import '../../../core/utils/json_parse.dart';

/// Agent action-center counts (`GET /api/dashboard/cards`), role-scoped server
/// side. Drives the clickable dashboard cards.
class DashboardCards {
  const DashboardCards({
    required this.open,
    required this.hot,
    required this.unreplied,
    required this.unread,
  });

  final int open;
  final int hot;

  /// Customer sent the last message and the agent hasn't replied, while the 24h
  /// window is still open (past that a free reply is impossible).
  final int unreplied;
  final int unread;

  factory DashboardCards.fromJson(Map<String, dynamic> json) => DashboardCards(
        open: asInt(json['open']),
        hot: asInt(json['hot']),
        unreplied: asInt(json['unreplied']),
        unread: asInt(json['unread']),
      );

  static const empty =
      DashboardCards(open: 0, hot: 0, unreplied: 0, unread: 0);
}
