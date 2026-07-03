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

/// Compact "time left" until [until] for countdowns (snooze badge): "2h 15m",
/// "45m", "<1m", or "due" once elapsed. Day-scale gaps collapse to "Nd".
String formatTimeLeft(DateTime? until) {
  if (until == null) return '';
  final diff = until.toLocal().difference(DateTime.now());
  if (diff.isNegative || diff.inSeconds <= 0) return 'due';
  if (diff.inMinutes < 1) return '<1m';
  if (diff.inHours < 1) return '${diff.inMinutes}m';
  if (diff.inHours < 24) {
    final m = diff.inMinutes.remainder(60);
    return m > 0 ? '${diff.inHours}h ${m}m' : '${diff.inHours}h';
  }
  final h = diff.inHours.remainder(24);
  return h > 0 ? '${diff.inDays}d ${h}h' : '${diff.inDays}d';
}

/// International absolute timestamp: MM/dd/yyyy HH:mm:ss (24h clock, local).
String formatSessionTimestamp(DateTime? dt) {
  if (dt == null) return '';
  return DateFormat('MM/dd/yyyy HH:mm:ss').format(dt.toLocal());
}

/// Live countdown of the 24h WhatsApp session window from [lastMessageAt]:
/// "Xh Ym Zs" while the window is open, or null once elapsed (the caller then
/// shows [formatSessionTimestamp]).
String? formatWindowCountdown(DateTime? lastMessageAt) {
  if (lastMessageAt == null) return null;
  final remaining = lastMessageAt
      .toLocal()
      .add(const Duration(hours: 24))
      .difference(DateTime.now());
  if (remaining.isNegative || remaining.inSeconds <= 0) return null;
  final h = remaining.inHours;
  final m = remaining.inMinutes.remainder(60);
  final s = remaining.inSeconds.remainder(60);
  return '${h}h ${m}m ${s}s';
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

/// Full date + time for media viewer header: "Today, 14:30" or "Jun 5, 14:30".
String formatFullDateTime(DateTime dt) {
  final now = DateTime.now();
  final local = dt.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(local.year, local.month, local.day);
  final diff = today.difference(that).inDays;
  final time = DateFormat.Hm().format(local);
  if (diff == 0) return 'Today, $time';
  if (diff == 1) return 'Yesterday, $time';
  return '${DateFormat.yMMMd().format(local)}, $time';
}
