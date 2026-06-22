import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/conversation.dart';

/// Quick inbox filter, set by dashboard drill-through and the inbox itself.
enum InboxFilter {
  all,
  hot,
  unread,
  followUp;

  String get label => switch (this) {
        InboxFilter.all => 'All',
        InboxFilter.hot => 'Hot',
        InboxFilter.unread => 'Unread',
        InboxFilter.followUp => 'Follow-up',
      };

  bool matches(Conversation c) => switch (this) {
        InboxFilter.all => true,
        InboxFilter.hot => c.interestLevel == 'hot',
        InboxFilter.unread => c.unreadCount > 0,
        InboxFilter.followUp =>
          (c.interestLevel == 'hot' || c.interestLevel == 'warm') &&
              c.unreadCount > 0,
      };
}

class InboxFilterController extends Notifier<InboxFilter> {
  @override
  InboxFilter build() => InboxFilter.all;

  void set(InboxFilter filter) => state = filter;
  void clear() => state = InboxFilter.all;
}

final inboxFilterProvider =
    NotifierProvider<InboxFilterController, InboxFilter>(
  InboxFilterController.new,
);
