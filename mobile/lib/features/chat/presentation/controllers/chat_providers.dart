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

final messageSearchProvider = FutureProvider.family<List<Conversation>, String>((ref, q) async {
  if (q.trim().isEmpty) return [];
  final repo = ref.watch(chatRepositoryProvider);
  final res = await repo.listConversations(q: q);
  if (res.isErr) throw res.failureOrNull!;
  return res.valueOrNull!;
});
