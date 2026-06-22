import 'package:flutter_test/flutter_test.dart';

import 'package:simpulx/core/notifications/notification_payload.dart';

void main() {
  test('parses a new-message push and routes to the thread', () {
    final p = NotificationPayload.fromData({
      'type': 'new_message',
      'title': 'Budi',
      'body': 'Halo, masih ada?',
      'conversationId': 'conv-1',
      'contactId': 'c-1',
    });
    expect(p.category, NotificationCategory.incomingMessage);
    expect(p.title, 'Budi');
    expect(p.route, '/chat/conv-1');
  });

  test('maps category types to channels', () {
    expect(NotificationCategory.fromType('new_lead'),
        NotificationCategory.newLead);
    expect(NotificationCategory.fromType('follow_up_reminder'),
        NotificationCategory.followUp);
    expect(NotificationCategory.fromType('assignment_change'),
        NotificationCategory.assignment);
    expect(NotificationCategory.fromType('performance_alert'),
        NotificationCategory.performance);
    expect(NotificationCategory.newLead.channelId, 'new_lead');
  });

  test('encodes and decodes the tap route', () {
    final p = NotificationPayload.fromData({
      'type': 'new_message',
      'conversationId': 'conv-9',
    });
    final encoded = p.encodeRoute();
    expect(NotificationPayload.routeFromEncoded(encoded), '/chat/conv-9');
  });

  test('routes a contact-only push to the lead', () {
    final p = NotificationPayload.fromData({
      'type': 'new_lead',
      'contactId': 'lead-7',
    });
    expect(p.route, '/contacts/lead-7');
  });

  test('routes performance alerts to the dashboard', () {
    final p = NotificationPayload.fromData({'type': 'performance_alert'});
    expect(p.route, '/dashboard');
  });
}
