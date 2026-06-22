import '../../../core/utils/json_parse.dart';

/// Agent action-center counts (`GET /api/dashboard/cards`), role-scoped server
/// side. Drives the clickable dashboard cards.
class DashboardCards {
  const DashboardCards({
    required this.open,
    required this.hot,
    required this.followUp,
    required this.needCall,
    required this.unread,
  });

  final int open;
  final int hot;
  final int followUp;
  final int needCall;
  final int unread;

  factory DashboardCards.fromJson(Map<String, dynamic> json) => DashboardCards(
        open: asInt(json['open']),
        hot: asInt(json['hot']),
        followUp: asInt(json['follow_up']),
        needCall: asInt(json['need_call']),
        unread: asInt(json['unread']),
      );

  static const empty =
      DashboardCards(open: 0, hot: 0, followUp: 0, needCall: 0, unread: 0);
}
