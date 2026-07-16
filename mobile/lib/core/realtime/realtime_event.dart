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
  bool get isConversationUpdated => type == 'conversation.updated';
  bool get isCampaignUpdated => type == 'campaign.updated';
  bool get isCallUpdated => type == 'call.updated';
  bool get isContactDeleted => type == 'contact.deleted';
  bool get isAiActivity => type == 'ai.activity';

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
  /// True for the async-media re-publish that only fills media_url in.
  bool get mediaUpdated => _d['media_updated'] == true;
  Map<String, dynamic>? get metadata =>
      _d['metadata'] is Map ? Map<String, dynamic>.from(_d['metadata'] as Map) : null;
  String get preview => (_d['preview'] ?? '') as String;
  String? get assignedAgentId => _d['assigned_agent_id'] as String?;
  /// Authoritative unread count from the DB after the increment.
  /// Returns null for older payloads that don't carry it yet (backward compat).
  int? get unreadCount {
    final v = _d['unread_count'];
    return v is int ? v : null;
  }

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

/// Typed view over a `conversation.updated` payload (see backend
/// `events.ConversationUpdated`). Empty fields mean "unchanged".
class ConversationUpdatedPayload {
  const ConversationUpdatedPayload(this._d);
  final Map<String, dynamic> _d;

  String? _s(String k) {
    final v = _d[k];
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  String get conversationId => _s('conversation_id') ?? '';
  String? get status => _s('status');
  String? get stageId => _s('stage_id');
  // Stage NAME carried directly so a freshly-created stage (unknown to a client's
  // cached stage list) renders immediately without a lookup/refetch.
  String? get stageName => _s('stage_name');
  String? get interestLevel => _s('interest_level');
  String? get lostReason => _s('lost_reason');
  // AI takeover/release: true = bot on, false = human took over, null = unchanged.
  bool? get botActive {
    final v = _d['bot_active'];
    return v is bool ? v : null;
  }
  // Carried alongside botActive on takeover so "Manual · {name}" shows instantly
  // (no refetch). Empty/absent when unchanged.
  String? get agentName => _s('agent_name');
  String? get assignedAgentId => _s('assigned_agent_id');
  DateTime? get snoozedUntil {
    final raw = _s('snoozed_until');
    return raw == null ? null : DateTime.tryParse(raw);
  }
}

/// Typed view over a `campaign.updated` payload (see backend
/// `events.CampaignUpdated`). Only changed AI-toggle fields are set.
class CampaignUpdatedPayload {
  const CampaignUpdatedPayload(this._d);
  final Map<String, dynamic> _d;

  String get campaignId => (_d['campaign_id'] ?? '') as String;
  bool? get smartSummary => _d['smart_summary'] as bool?;
  bool? get autoReply => _d['auto_reply'] as bool?;
}

/// Typed view over a `conversation.closed` payload.
class ConversationClosedPayload {
  const ConversationClosedPayload(this._d);
  final Map<String, dynamic> _d;

  String get conversationId => (_d['conversation_id'] ?? '') as String;
  String get reason => (_d['reason'] ?? '') as String;
}

/// Typed view over a `contact.deleted` payload (see backend
/// `events.ContactDeleted`). Carries the deleted contact + its conversation ids
/// so the inbox and contacts lists can drop the matching rows in realtime.
class ContactDeletedPayload {
  const ContactDeletedPayload(this._d);
  final Map<String, dynamic> _d;

  String get contactId => (_d['contact_id'] ?? '') as String;
  List<String> get conversationIds {
    final raw = _d['conversation_ids'];
    return raw is List ? raw.map((e) => e.toString()).toList() : const [];
  }
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

/// Typed view over an `ai.activity` payload (Simpuler typing indicator).
class AiActivityPayload {
  const AiActivityPayload(this._d);
  final Map<String, dynamic> _d;

  String get conversationId => (_d['conversation_id'] ?? '') as String;
  String get phase => (_d['phase'] ?? '') as String;
}
