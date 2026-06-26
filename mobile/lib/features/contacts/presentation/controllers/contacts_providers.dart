import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/result.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../data/datasources/contacts_remote_datasource.dart';
import '../../data/repositories/contacts_repository_impl.dart';
import '../../domain/entities/contact.dart';
import '../../domain/repositories/contacts_repository.dart';

final contactsRemoteDataSourceProvider = Provider<ContactsRemoteDataSource>(
  (ref) => ContactsRemoteDataSource(ref.watch(dioProvider)),
);

final contactsRepositoryProvider = Provider<ContactsRepository>(
  (ref) => ContactsRepositoryImpl(ref.watch(contactsRemoteDataSourceProvider)),
);

/// The CRM leads list. Each contact carries its latest conversation's lead
/// context (stage/interest/agent/conversation_id).
class ContactsController extends AsyncNotifier<List<Contact>> {
  Timer? _debounce;

  @override
  Future<List<Contact>> build() {
    // Stay live with the backend: any message / stage / status / assignment
    // change (from this device, another agent, or the web) refreshes the leads
    // list so the contact's latest-thread context never goes stale. Debounced so
    // a burst of message events triggers a single refetch.
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e == null) return;
      if (e.isMessagePersisted ||
          e.isConversationUpdated ||
          e.isConversationClosed ||
          e.isConversationAssigned) {
        _scheduleRefresh();
      }
    });
    ref.onDispose(() => _debounce?.cancel());
    return _fetch();
  }

  void _scheduleRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(seconds: 2), refresh);
  }

  Future<List<Contact>> _fetch() async {
    final result = await ref.read(contactsRepositoryProvider).list();
    return result.fold((failure) => throw failure, (list) => list);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }

  Future<Result<Contact>> create({
    required String fullName,
    required String phone,
    List<String>? tags,
  }) async {
    final result = await ref.read(contactsRepositoryProvider).create(
          fullName: fullName,
          phone: phone,
          tags: tags,
        );
    if (result.isOk) await refresh();
    return result;
  }

  Future<bool> updateContact(
    String id, {
    String? fullName,
    String? phone,
    bool? blacklisted,
  }) async {
    final result = await ref.read(contactsRepositoryProvider).update(
          id,
          fullName: fullName,
          phone: phone,
          blacklisted: blacklisted,
        );
    if (result.isOk) await refresh();
    return result.isOk;
  }

  Future<bool> deleteContact(String id) async {
    final result = await ref.read(contactsRepositoryProvider).delete(id);
    if (result.isOk) await refresh();
    return result.isOk;
  }
}

final contactsProvider =
    AsyncNotifierProvider<ContactsController, List<Contact>>(
  ContactsController.new,
);

/// Lookup a single contact from the loaded list (detail screen).
final contactByIdProvider = Provider.family<Contact?, String>((ref, id) {
  final list = ref.watch(contactsProvider).value;
  if (list == null) return null;
  for (final c in list) {
    if (c.id == id) return c;
  }
  return null;
});
