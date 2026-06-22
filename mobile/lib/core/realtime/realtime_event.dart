/// A decoded realtime event from the WebSocket hub.
///
/// The server forwards the raw `events.Envelope`:
///   `{ "id", "type", "org_id", "ts", "data": {...} }`
/// where `type` is the NATS subject minus the `events.` prefix, e.g.
/// `message.persisted`, `conversation.assigned`, `conversation.closed`,
/// `call.updated`.
class RealtimeEvent {
  const RealtimeEvent({
    required this.id,
    required this.type,
    required this.orgId,
    required this.ts,
    required this.data,
  });

  final String id;
  final String type;
  final String orgId;
  final DateTime ts;
  final Map<String, dynamic> data;

  bool get isMessagePersisted => type == 'message.persisted';
  bool get isConversationAssigned => type == 'conversation.assigned';
  bool get isConversationClosed => type == 'conversation.closed';
  bool get isCallUpdated => type == 'call.updated';

  static RealtimeEvent? tryParse(Map<String, dynamic> json) {
    final type = json['type'];
    if (type is! String) return null;
    return RealtimeEvent(
      id: (json['id'] ?? '') as String,
      type: type,
      orgId: (json['org_id'] ?? '') as String,
      ts: DateTime.tryParse((json['ts'] ?? '') as String)?.toLocal() ??
          DateTime.now(),
      data: (json['data'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

/// Typed view over a `message.persisted` payload (see backend
/// `events.MessagePersisted`). Note the field is `message_id`, and the payload
/// carries no `created_at`/`status`.
class MessagePersistedPayload {
  const MessagePersistedPayload(this._d);
  final Map<String, dynamic> _d;

  String get conversationId => (_d['conversation_id'] ?? '') as String;
  String get contactId => (_d['contact_id'] ?? '') as String;
  String get messageId => (_d['message_id'] ?? '') as String;
  String get direction => (_d['direction'] ?? 'inbound') as String;
  String get senderType => (_d['sender_type'] ?? 'contact') as String;
  String get type => (_d['type'] ?? 'text') as String;
  String get body => (_d['body'] ?? '') as String;
  String? get mediaUrl => _d['media_url'] as String?;
  String get preview => (_d['preview'] ?? '') as String;
  String? get assignedAgentId => _d['assigned_agent_id'] as String?;

  bool get isInbound => direction == 'inbound';
}

/// Typed view over a `conversation.assigned` payload.
class ConversationAssignedPayload {
  const ConversationAssignedPayload(this._d);
  final Map<String, dynamic> _d;

  String get conversationId => (_d['conversation_id'] ?? '') as String;
  String get agentId => (_d['agent_id'] ?? '') as String;
  String get agentName => (_d['agent_name'] ?? '') as String;
}

/// Typed view over a `call.updated` payload (see backend `events.CallUpdated`).
class CallUpdatedPayload {
  const CallUpdatedPayload(this._d);
  final Map<String, dynamic> _d;

  String? _s(String k) {
    final v = _d[k];
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  String get callId => _s('call_id') ?? '';
  String get conversationId => _s('conversation_id') ?? '';
  String get direction => _s('direction') ?? 'outbound'; // inbound | outbound
  String? get agentId => _s('agent_id');
  String? get contactName => _s('contact_name');
  String? get contactPhone => _s('contact_phone');
  String? get permissionStatus => _s('permission_status'); // pending|granted|rejected
  String get callStatus => _s('call_status') ?? ''; // requesting|ringing|connected|ended|...
  String? get sdpOffer => _s('sdp_offer');
  String? get sdpAnswer => _s('sdp_answer');
  String? get endReason => _s('end_reason');

  bool get isInbound => direction == 'inbound';
}
