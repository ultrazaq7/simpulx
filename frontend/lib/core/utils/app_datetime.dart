import 'package:intl/intl.dart';

class AppDateTime {
  AppDateTime._();

  static DateTime? parseLocal(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString())?.toLocal();
  }

  static DateTime parseLocalOrNow(dynamic value) {
    return parseLocal(value) ?? DateTime.now();
  }

  static String time(DateTime value) {
    return DateFormat('h:mm a').format(value.toLocal());
  }

  static String timeWithSeconds(DateTime value) {
    return DateFormat('h:mm:ss a').format(value.toLocal());
  }

  static String shortDateTime(DateTime value) {
    return DateFormat('dd MMM yy HH:mm').format(value.toLocal());
  }

  static String mediumDate(DateTime value) {
    return DateFormat('dd MMM yyyy').format(value.toLocal());
  }

  static String deviceTimezoneLabel() {
    final now = DateTime.now();
    final offset = now.timeZoneOffset;
    final sign = offset.isNegative ? '-' : '+';
    final abs = offset.abs();
    final hours = abs.inHours.toString().padLeft(2, '0');
    final minutes = abs.inMinutes.remainder(60).toString().padLeft(2, '0');
    return '${now.timeZoneName} (UTC$sign$hours:$minutes)';
  }
}
