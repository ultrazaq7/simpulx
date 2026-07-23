import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/app_providers.dart';
import '../../data/datasources/chat_remote_datasource.dart';
import '../../data/repositories/chat_repository_impl.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/repositories/chat_repository.dart';

final chatRemoteDataSourceProvider = Provider<ChatRemoteDataSource>(
  (ref) => ChatRemoteDataSource(ref.watch(dioProvider)),
);

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepositoryImpl(ref.watch(chatRemoteDataSourceProvider)),
);

/// Fetches a single conversation by id. Used by the chat thread when it is
/// opened without a cached copy (push notification / deep link) so the header
/// resolves the real contact instead of staying blank.
final conversationByIdProvider =
    FutureProvider.family<Conversation, String>((ref, id) async {
  final repo = ref.watch(chatRepositoryProvider);
  final res = await repo.getConversation(id);
  if (res.isErr) throw res.failureOrNull!;
  return res.valueOrNull!;
});

/// Every thread this contact has, across all campaigns (server-scoped by
/// `?contact=`), newest first. A lead enrolled in more than one campaign has a
/// separate conversation per campaign, so the contact-details screen lists them
/// all instead of only the most-recent one (mirrors the web contact page).
final contactThreadsProvider =
    FutureProvider.autoDispose.family<List<Conversation>, String>((ref, contactId) async {
  final repo = ref.watch(chatRepositoryProvider);
  final res = await repo.listConversations(contact: contactId);
  if (res.isErr) throw res.failureOrNull!;
  final list = res.valueOrNull!;
  list.sort((a, b) {
    final at = a.lastMessageAt, bt = b.lastMessageAt;
    if (at == null && bt == null) return 0;
    if (at == null) return 1;
    if (bt == null) return -1;
    return bt.compareTo(at);
  });
  return list;
});

final messageSearchProvider = FutureProvider.family<List<Conversation>, String>((ref, q) async {
  if (q.trim().isEmpty) return [];
  final repo = ref.watch(chatRepositoryProvider);
  final res = await repo.listConversations(q: q);
  if (res.isErr) throw res.failureOrNull!;
  return res.valueOrNull!;
});
