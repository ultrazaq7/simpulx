/// One entry in a contact's history timeline (from
/// `GET /api/contacts/{id}/activity` -> conversation_events).
class ContactActivity {
  const ContactActivity({
    required this.type,
    required this.detail,
    this.createdAt,
    this.actorName,
  });

  final String type; // stage_changed | status_changed | interest_changed | ...
  final Map<String, dynamic> detail;
  final DateTime? createdAt;
  final String? actorName;

  String _d(String k) => (detail[k] ?? '').toString();

  /// Human label, mirroring the web contact-details history.
  String get label {
    switch (type) {
      case 'stage_changed':
        final v = _d('stage_name').isNotEmpty ? _d('stage_name') : _d('stage_id');
        return 'Stage changed to ${v.isNotEmpty ? v : '-'}';
      case 'status_changed':
        return 'Status set to ${_d('status').isNotEmpty ? _d('status') : '-'}';
      case 'interest_changed':
        return 'Interest set to ${_d('interest_level').isNotEmpty ? _d('interest_level') : '-'}';
      case 'assigned':
        final a = _d('agent_name');
        return a.isNotEmpty ? 'Assigned to $a' : 'Assigned';
      case 'closed':
        return 'Conversation closed';
      case 'reopened':
        return 'Conversation reopened';
      case 'handoff':
        return 'Handed off to a human agent';
      default:
        return type.replaceAll('_', ' ');
    }
  }
}
