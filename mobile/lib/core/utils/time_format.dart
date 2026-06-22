import 'package:intl/intl.dart';

/// Compact, WhatsApp-style timestamp for list rows: time today, weekday this
/// week, otherwise a short date.
String formatListTime(DateTime? dt) {
  if (dt == null) return '';
  final now = DateTime.now();
  final local = dt.toLocal();
  final isToday = local.year == now.year &&
      local.month == now.month &&
      local.day == now.day;
  if (isToday) return DateFormat.Hm().format(local); // 14:30
  final diff = now.difference(local);
  if (diff.inDays < 7) return DateFormat.E().format(local); // Mon
  if (local.year == now.year) return DateFormat.MMMd().format(local); // Jun 5
  return DateFormat.yMd().format(local);
}

/// Clock time for a message bubble (HH:mm).
String formatBubbleTime(DateTime dt) => DateFormat.Hm().format(dt.toLocal());

/// Day separator label for a message group.
String formatDayLabel(DateTime dt) {
  final now = DateTime.now();
  final local = dt.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(local.year, local.month, local.day);
  final diff = today.difference(that).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return DateFormat.EEEE().format(local); // Monday
  return DateFormat.yMMMd().format(local); // Jun 5, 2026
}
