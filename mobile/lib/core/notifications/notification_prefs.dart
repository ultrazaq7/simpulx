import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/app_providers.dart';
import 'notification_payload.dart';

/// Per-category notification toggles, persisted locally. Gates foreground
/// display (background delivery is OS-managed).
class NotificationPrefs {
  const NotificationPrefs({
    this.messages = true,
    this.leads = true,
    this.followUps = true,
    this.assignments = true,
    this.performance = true,
  });

  final bool messages;
  final bool leads;
  final bool followUps;
  final bool assignments;
  final bool performance;

  bool isEnabled(NotificationCategory cat) => switch (cat) {
        NotificationCategory.incomingMessage => messages,
        NotificationCategory.newLead => leads,
        NotificationCategory.followUp => followUps,
        NotificationCategory.assignment => assignments,
        NotificationCategory.performance => performance,
      };

  NotificationPrefs copyWith({
    bool? messages,
    bool? leads,
    bool? followUps,
    bool? assignments,
    bool? performance,
  }) =>
      NotificationPrefs(
        messages: messages ?? this.messages,
        leads: leads ?? this.leads,
        followUps: followUps ?? this.followUps,
        assignments: assignments ?? this.assignments,
        performance: performance ?? this.performance,
      );

  Map<String, dynamic> toJson() => {
        'messages': messages,
        'leads': leads,
        'followUps': followUps,
        'assignments': assignments,
        'performance': performance,
      };

  factory NotificationPrefs.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const NotificationPrefs();
    bool b(String k) => json[k] != false; // default true
    return NotificationPrefs(
      messages: b('messages'),
      leads: b('leads'),
      followUps: b('followUps'),
      assignments: b('assignments'),
      performance: b('performance'),
    );
  }
}

class NotificationPrefsController extends Notifier<NotificationPrefs> {
  static const _key = 'notification_prefs';

  @override
  NotificationPrefs build() {
    return NotificationPrefs.fromJson(
      ref.read(appCacheProvider).getJson(_key),
    );
  }

  Future<void> _save(NotificationPrefs prefs) async {
    state = prefs;
    await ref.read(appCacheProvider).setJson(_key, prefs.toJson());
  }

  Future<void> setMessages(bool v) => _save(state.copyWith(messages: v));
  Future<void> setLeads(bool v) => _save(state.copyWith(leads: v));
  Future<void> setFollowUps(bool v) => _save(state.copyWith(followUps: v));
  Future<void> setAssignments(bool v) => _save(state.copyWith(assignments: v));
  Future<void> setPerformance(bool v) => _save(state.copyWith(performance: v));
}

final notificationPrefsProvider =
    NotifierProvider<NotificationPrefsController, NotificationPrefs>(
  NotificationPrefsController.new,
);
