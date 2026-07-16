import 'package:flutter/widgets.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/i18n/stage_label.dart';
import '../domain/entities/contact_activity.dart';

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Localized mirror of [ContactActivity.label]: same shape as the web history,
/// but each phrase is translated, the stage value goes through [stageLabel], and
/// status/interest values are Capitalized (and localized where a translation
/// exists) so the timeline never shows raw lowercase codes like "open"/"cold".
String activityLabel(BuildContext context, ContactActivity e) {
  String d(String k) => (e.detail[k] ?? '').toString();
  switch (e.type) {
    case 'stage_changed':
      final raw = d('stage_name').isNotEmpty ? d('stage_name') : d('stage_id');
      final v = raw.isNotEmpty ? stageLabel(context, raw) : '-';
      return 'Stage changed to {v}'.trp(context, {'v': v});
    case 'status_changed':
      final raw = d('status');
      final v = raw.isNotEmpty ? _cap(raw).tr(context) : '-';
      return 'Status set to {v}'.trp(context, {'v': v});
    case 'interest_changed':
      final raw = d('interest_level');
      // Hot / Warm / Cold stay English by design; just capitalize.
      final v = raw.isNotEmpty ? _cap(raw).tr(context) : '-';
      return 'Interest set to {v}'.trp(context, {'v': v});
    case 'assigned':
      final a = d('agent_name');
      return a.isNotEmpty
          ? 'Assigned to {a}'.trp(context, {'a': a})
          : 'Assigned'.tr(context);
    case 'closed':
      return 'Conversation closed'.tr(context);
    case 'reopened':
      return 'Conversation reopened'.tr(context);
    case 'handoff':
      return 'Handed off to a human agent'.tr(context);
    case 'bot_takeover':
      return 'Agent took over'.tr(context);
    case 'bot_released':
      return 'Handed to Simpuler'.tr(context);
    default:
      // Never show a raw lowercase code — Title-Case the event type.
      return e.type.split('_').map(_cap).join(' ');
  }
}
