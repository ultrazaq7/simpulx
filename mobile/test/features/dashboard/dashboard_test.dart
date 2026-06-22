import 'package:flutter_test/flutter_test.dart';

import 'package:simpulx/features/chat/domain/entities/conversation.dart';
import 'package:simpulx/features/chat/presentation/controllers/inbox_filter.dart';
import 'package:simpulx/features/dashboard/domain/dashboard_cards.dart';
import 'package:simpulx/features/dashboard/domain/manager_analytics.dart';

Conversation _conv({String? interest, int unread = 0}) => Conversation(
      id: 'x',
      status: 'open',
      channel: 'whatsapp',
      contactId: 'ct',
      contactName: 'Test',
      contactPhone: '628',
      unreadCount: unread,
      interestLevel: interest,
    );

void main() {
  test('DashboardCards parses snake_case counts', () {
    final cards = DashboardCards.fromJson({
      'open': 12,
      'hot': 3,
      'follow_up': 5,
      'need_call': 2,
      'unread': 7,
    });
    expect(cards.open, 12);
    expect(cards.hot, 3);
    expect(cards.followUp, 5);
    expect(cards.needCall, 2);
    expect(cards.unread, 7);
  });

  test('ManagerAnalytics parses funnel + agents + rt + lost reasons', () {
    final a = ManagerAnalytics.fromJson({
      'funnel': {
        'total': 100,
        'replied': 80,
        'engaged': 60,
        'won': 12,
        'lost': 20,
        'hot': 15,
        'warm': 30,
        'cold': 40,
      },
      'rt': {'median_min': 4.5, 'within_5_min_pct': 72.0},
      'agents': [
        {'agent': 'Sari', 'leads': 40, 'replied': 38, 'within_5_pct': 80.0},
        {'agent': 'Empty', 'leads': 0}, // dropped (no activity)
      ],
      'lost_reasons': [
        {'reason': 'Price', 'count': 9},
        {'reason': 'Timing', 'count': 4},
      ],
    });

    expect(a.total, 100);
    expect(a.won, 12);
    expect(a.medianRtMin, 4.5);
    expect(a.agents.length, 1); // zero-activity agent dropped
    expect(a.agents.first.agent, 'Sari');
    expect(a.lostReasons.first.reason, 'Price');
  });

  group('InboxFilter.matches', () {
    test('hot matches only hot leads', () {
      expect(InboxFilter.hot.matches(_conv(interest: 'hot')), isTrue);
      expect(InboxFilter.hot.matches(_conv(interest: 'warm')), isFalse);
    });

    test('unread matches conversations with unread > 0', () {
      expect(InboxFilter.unread.matches(_conv(unread: 2)), isTrue);
      expect(InboxFilter.unread.matches(_conv(unread: 0)), isFalse);
    });

    test('followUp requires hot/warm interest AND unread', () {
      expect(
          InboxFilter.followUp.matches(_conv(interest: 'hot', unread: 1)),
          isTrue);
      expect(
          InboxFilter.followUp.matches(_conv(interest: 'hot', unread: 0)),
          isFalse);
      expect(
          InboxFilter.followUp.matches(_conv(interest: 'cold', unread: 3)),
          isFalse);
    });

    test('all matches everything', () {
      expect(InboxFilter.all.matches(_conv()), isTrue);
    });
  });
}
