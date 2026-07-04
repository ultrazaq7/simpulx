/// Notification categories. Each maps to a dedicated Android channel so users
/// can tune importance per type and we can route taps correctly.
enum NotificationCategory {
  incomingMessage,
  incomingCall,
  newLead,
  followUp,
  assignment,
  performance;

  /// Android channel id (must be stable; channels persist once created).
  String get channelId => switch (this) {
        NotificationCategory.incomingMessage => 'incoming_message',
        NotificationCategory.incomingCall => 'incoming_call',
        NotificationCategory.newLead => 'new_lead',
        NotificationCategory.followUp => 'follow_up',
        NotificationCategory.assignment => 'assignment',
        NotificationCategory.performance => 'performance',
      };

  String get channelName => switch (this) {
        NotificationCategory.incomingMessage => 'Incoming messages',
        NotificationCategory.incomingCall => 'Incoming calls',
        NotificationCategory.newLead => 'New leads',
        NotificationCategory.followUp => 'Follow-up reminders',
        NotificationCategory.assignment => 'Assignments',
        NotificationCategory.performance => 'Performance alerts',
      };

  static NotificationCategory fromType(String? type, {String? body}) {
    switch (type) {
      case 'call_ended':
      case 'call_end':
      case 'ended':
        // Ended / declined / missed calls are handled specially (dismiss the
        // ring). Never classify them as an incoming call to be rung, and don't
        // let the body heuristic below turn "voice call" into a ring.
        return NotificationCategory.incomingMessage;
      case 'call':
      case 'incoming_call':
      case 'voice_call':
      case 'call_ringing':
        return NotificationCategory.incomingCall;
      case 'new_lead':
        return NotificationCategory.newLead;
      case 'follow_up':
      case 'follow_up_reminder':
      case 'snooze_due':
      case 'snooze_reminder':
        return NotificationCategory.followUp;
      case 'assignment':
      case 'assignment_change':
      case 'conversation.assigned':
        return NotificationCategory.assignment;
      case 'performance':
      case 'performance_alert':
        return NotificationCategory.performance;
      case 'new_message':
      default:
        // Heuristic: detect call from body text when type is generic
        if (body != null) {
          final b = body.toLowerCase();
          if (b.contains('incoming call') ||
              b.contains('incoming voice call') ||
              b.contains('voice call') ||
              b.contains('panggilan masuk')) {
            return NotificationCategory.incomingCall;
          }
        }
        return NotificationCategory.incomingMessage;
    }
  }
}

/// Parsed push data (the backend sends data-only messages:
/// `{title, body, conversationId, contactId, type}`).
class NotificationPayload {
  const NotificationPayload({
    required this.category,
    required this.title,
    required this.body,
    this.conversationId,
    this.contactId,
    this.rawType,
    this.callStatus,
    this.missed = false,
    this.contactName,
  });

  final NotificationCategory category;
  final String title;
  final String body;
  final String? conversationId;
  final String? contactId;
  final String? rawType;
  final String? callStatus;
  final bool missed;
  final String? contactName;

  /// A call that has ended / been declined / missed (never a fresh ring).
  bool get isEndedCall =>
      rawType == 'call_ended' ||
      rawType == 'ended' ||
      callStatus == 'ended';

  factory NotificationPayload.fromData(Map<String, dynamic> data) {
    String? str(String k) {
      final v = data[k];
      if (v == null) return null;
      final s = v.toString();
      return s.isEmpty ? null : s;
    }

    return NotificationPayload(
      category: NotificationCategory.fromType(str('type'), body: str('body')),
      title: str('title') ?? 'Simpulx',
      body: _normalizePreview(str('body') ?? ''),
      conversationId: str('conversationId') ?? str('conversation_id'),
      contactId: str('contactId') ?? str('contact_id'),
      rawType: str('type'),
      callStatus: str('callStatus') ?? str('call_status'),
      missed: (str('missed') ?? '').toLowerCase() == 'true',
      contactName: str('contactName') ?? str('contact_name'),
    );
  }

  /// The in-app route a tap should open.
  String get route {
    if (category == NotificationCategory.incomingCall && conversationId != null) {
      return '/call/$conversationId';
    }
    if (conversationId != null) return '/chat/$conversationId';
    if (contactId != null) return '/contacts/$contactId';
    if (category == NotificationCategory.performance) return '/dashboard';
    return '/chat';
  }

  /// Encode the routing fields into the local-notification payload string.
  String encodeRoute() => [
        rawType ?? '',
        conversationId ?? '',
        contactId ?? '',
      ].join('|');

  /// Decode `encodeRoute()` back into a route string.
  static String routeFromEncoded(String? encoded) {
    if (encoded == null || encoded.isEmpty) return '/chat';
    final parts = encoded.split('|');
    final type = parts.isNotEmpty ? parts[0] : '';
    final conv = parts.length > 1 ? parts[1] : '';
    final contact = parts.length > 2 ? parts[2] : '';

    // Check if it's a call type
    final category = NotificationCategory.fromType(type);
    if (category == NotificationCategory.incomingCall && conv.isNotEmpty) {
      return '/call/$conv';
    }

    if (conv.isNotEmpty) return '/chat/$conv';
    if (contact.isNotEmpty) return '/contacts/$contact';
    if (category == NotificationCategory.performance) {
      return '/dashboard';
    }
    return '/chat';
  }
}

/// Normalizes a message preview for a notification so a sticker reads like the
/// in-app chat list. The server tags a sticker with a picture-frame emoji
/// ("🖼️ Sticker"), which looks like an image; the chat list instead shows a
/// smiley (Icons.emoji_emotions_outlined), so we mirror that here. Detection
/// matches the chat list's exactly (emoji prefix or the bare word) to avoid
/// rewriting a real text message that merely mentions "sticker".
String _normalizePreview(String body) {
  final p = body.trim();
  final lower = p.toLowerCase();
  if (p.startsWith('🖼') || lower == '[sticker]' || lower == 'sticker') {
    return '😊 Sticker';
  }
  return body;
}
