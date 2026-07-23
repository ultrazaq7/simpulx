import '../../../core/utils/json_parse.dart';

/// Org subscription snapshot for the AI Usage header: the plan's credit quota,
/// how much is used, and the renewal/expiry date. Credits DO NOT roll over, so
/// the expiry date is shown prominently. From `GET /api/subscription`.
class SubscriptionInfo {
  const SubscriptionInfo({
    required this.packageName,
    required this.status,
    required this.totalCredits,
    required this.usedCredits,
    required this.expiry,
  });

  final String packageName;
  final String status;
  final int totalCredits;
  final int usedCredits;
  final DateTime? expiry;

  int get remaining => (totalCredits - usedCredits).clamp(0, totalCredits);
  double get usedFraction =>
      totalCredits > 0 ? (usedCredits / totalCredits).clamp(0, 1) : 0;

  factory SubscriptionInfo.fromJson(Map<String, dynamic> j) {
    final quotas = j['quotas'];
    int total = 0;
    if (quotas is Map) {
      total = asInt(quotas['simpuler_credits']);
    }
    final raw = asStringOrNull(j['renewal_date']);
    return SubscriptionInfo(
      packageName: asString(j['package_name']),
      status: asString(j['status']),
      totalCredits: total,
      usedCredits: asInt(j['used_simpuler_credits']),
      expiry: raw == null ? null : DateTime.tryParse(raw),
    );
  }
}
