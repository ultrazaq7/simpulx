import 'message.dart';

/// A page of messages (chronological ASC) plus the cursor to load older
/// history (`next_cursor`; null when no more).
class MessagesPage {
  const MessagesPage({required this.messages, this.nextCursor});
  final List<Message> messages;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;
}
