import 'package:flutter_test/flutter_test.dart';

import 'package:simpulx/features/workspace/domain/broadcast_summary.dart';

void main() {
  test('parses a broadcast row and computes delivery + canSend', () {
    final b = BroadcastSummary.fromJson({
      'id': 'b1',
      'name': 'June promo',
      'status': 'draft',
      'audience': 'all',
      'total_recipients': 200,
      'sent_count': 50,
      'failed_count': 3,
      'template_name': 'promo_v1',
    });
    expect(b.name, 'June promo');
    expect(b.canSend, isTrue); // draft
    expect(b.deliveryRate, closeTo(0.25, 0.001));
  });

  test('completed broadcasts cannot be re-sent', () {
    final b = BroadcastSummary.fromJson({
      'id': 'b2',
      'name': 'Done',
      'status': 'completed',
      'total_recipients': 10,
      'sent_count': 10,
      'failed_count': 0,
    });
    expect(b.canSend, isFalse);
    expect(b.deliveryRate, 1.0);
  });
}
