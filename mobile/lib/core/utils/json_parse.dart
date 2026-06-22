/// Defensive coercion helpers for loosely-typed JSON map responses
/// (numbers may arrive as int or num, timestamps as strings, nulls explicit).
library;

String asString(dynamic v) => v?.toString() ?? '';

String? asStringOrNull(dynamic v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

int asInt(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse('$v') ?? 0;
}

double? asDoubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse('$v');
}

bool asBool(dynamic v) => v == true || v == 'true' || v == 1;

DateTime? asDateOrNull(dynamic v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v)?.toLocal();
  return null;
}
