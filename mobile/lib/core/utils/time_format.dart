import 'package:intl/intl.dart';

/// Org-wide date format (Settings > General on the web). Set once from the org
/// settings after login so the numeric date formatters below render in the same
/// order everywhere. Defaults to MM/DD/YYYY (unchanged behaviour until set).
String _dateOrder = 'MM/DD/YYYY';
void setAppDateFormat(String? fmt) {
  if (fmt == 'MM/DD/YYYY' || fmt == 'DD/MM/YYYY' || fmt == 'YYYY/MM/DD') {
    _dateOrder = fmt!;
  }
}

String _datePattern() {
  switch (_dateOrder) {
    case 'DD/MM/YYYY':
      return 'dd/MM/yyyy';
    case 'YYYY/MM/DD':
      return 'yyyy/MM/dd';
    default:
      return 'MM/dd/yyyy';
  }
}

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

/// Date-only timestamp for the chat list, in the org date order (local).
String formatSessionTimestamp(DateTime? dt) {
  if (dt == null) return '';
  return DateFormat(_datePattern()).format(dt.toLocal());
}

/// Absolute timestamp in the org date order, plus HH:mm:ss (local).
String formatAbsoluteTimestamp(DateTime? dt) {
  if (dt == null) return '';
  return DateFormat('${_datePattern()} HH:mm:ss').format(dt.toLocal());
}

/// History timestamp: dd MMM, HH:mm
String formatHistoryTimestamp(DateTime? dt) {
  if (dt == null) return '';
  return DateFormat('dd MMM, HH:mm').format(dt.toLocal());
}

/// Elapsed time since [lastMessageAt], counting UP from 0 while inside the 24h
/// WhatsApp session window ("Xh Ym Zs"); returns null once 24h has passed (the
/// caller then shows the closed-window state + [formatSessionTimestamp]).
String? formatWindowCountdown(DateTime? lastMessageAt) {
  if (lastMessageAt == null) return null;
  var elapsed = DateTime.now().difference(lastMessageAt.toLocal());
  if (elapsed.isNegative) elapsed = Duration.zero;
  if (elapsed.inHours >= 24) return null;
  final h = elapsed.inHours;
  final m = elapsed.inMinutes.remainder(60);
  final s = elapsed.inSeconds.remainder(60);
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
