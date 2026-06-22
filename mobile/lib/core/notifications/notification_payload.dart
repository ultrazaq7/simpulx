/// Notification categories. Each maps to a dedicated Android channel so users
/// can tune importance per type and we can route taps correctly.
enum NotificationCategory {
  incomingMessage,
  newLead,
  followUp,
  assignment,
  performance;

  /// Android channel id (must be stable; channels persist once created).
  String get channelId => switch (this) {
        NotificationCategory.incomingMessage => 'incoming_message',
        NotificationCategory.newLead => 'new_lead',
        NotificationCategory.followUp => 'follow_up',
        NotificationCategory.assignment => 'assignment',
        NotificationCategory.performance => 'performance',
      };

  String get channelName => switch (this) {
        NotificationCategory.incomingMessage => 'Incoming messages',
        NotificationCategory.newLead => 'New leads',
        NotificationCategory.followUp => 'Follow-up reminders',
        NotificationCategory.assignment => 'Assignments',
        NotificationCategory.performance => 'Performance alerts',
      };

  static NotificationCategory fromType(String? type) {
    switch (type) {
      case 'new_lead':
        return NotificationCategory.newLead;
      case 'follow_up':
      case 'follow_up_reminder':
      case 'snooze_due':
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
  });

  final NotificationCategory category;
  final String title;
  final String body;
  final String? conversationId;
  final String? contactId;
  final String? rawType;

  factory NotificationPayload.fromData(Map<String, dynamic> data) {
    String? str(String k) {
      final v = data[k];
      if (v == null) return null;
      final s = v.toString();
      return s.isEmpty ? null : s;
    }

    return NotificationPayload(
      category: NotificationCategory.fromType(str('type')),
      title: str('title') ?? 'Simpulx',
      body: str('body') ?? '',
      conversationId: str('conversationId') ?? str('conversation_id'),
      contactId: str('contactId') ?? str('contact_id'),
      rawType: str('type'),
    );
  }

  /// The in-app route a tap should open.
  String get route {
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
    if (conv.isNotEmpty) return '/chat/$conv';
    if (contact.isNotEmpty) return '/contacts/$contact';
    if (NotificationCategory.fromType(type) ==
        NotificationCategory.performance) {
      return '/dashboard';
    }
    return '/chat';
  }
}
