import '../../../core/utils/json_parse.dart';

/// A broadcast row from `GET /api/broadcasts`.
class BroadcastSummary {
  const BroadcastSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.audience,
    required this.totalRecipients,
    required this.sentCount,
    required this.failedCount,
    this.templateName,
    this.createdAt,
  });

  final String id;
  final String name;
  final String status; // draft | scheduled | queued | sending | completed | failed
  final String audience;
  final int totalRecipients;
  final int sentCount;
  final int failedCount;
  final String? templateName;
  final DateTime? createdAt;

  /// Whether "Send now" applies (draft/scheduled/failed).
  bool get canSend =>
      status == 'draft' || status == 'scheduled' || status == 'failed';

  /// Delivered fraction 0..1.
  double get deliveryRate =>
      totalRecipients == 0 ? 0 : (sentCount / totalRecipients).clamp(0.0, 1.0);

  factory BroadcastSummary.fromJson(Map<String, dynamic> j) => BroadcastSummary(
        id: asString(j['id']),
        name: asString(j['name']),
        status: asString(j['status']),
        audience: asString(j['audience']),
        totalRecipients: asInt(j['total_recipients']),
        sentCount: asInt(j['sent_count']),
        failedCount: asInt(j['failed_count']),
        templateName: asStringOrNull(j['template_name']),
        createdAt: asDateOrNull(j['created_at']),
      );
}
