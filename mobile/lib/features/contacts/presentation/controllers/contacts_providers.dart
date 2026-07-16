import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/result.dart';
import '../../../../core/providers/app_providers.dart';
import '../../../../core/realtime/realtime_client.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../../../core/storage/app_cache.dart';
import '../../data/datasources/contacts_remote_datasource.dart';
import '../../data/models/contact_model.dart';
import '../../data/repositories/contacts_repository_impl.dart';
import '../../domain/entities/contact.dart';
import '../../domain/entities/contact_activity.dart';
import '../../domain/repositories/contacts_repository.dart';
import '../../../chat/presentation/controllers/inbox_filter.dart';

final contactsRemoteDataSourceProvider = Provider<ContactsRemoteDataSource>(
  (ref) => ContactsRemoteDataSource(ref.watch(dioProvider)),
);

final contactsRepositoryProvider = Provider<ContactsRepository>(
  (ref) => ContactsRepositoryImpl(ref.watch(contactsRemoteDataSourceProvider)),
);

final contactsFilterProvider = NotifierProvider<InboxFilterController, InboxFilter>(
  InboxFilterController.new,
);

/// The CRM leads list. Each contact carries its latest conversation's lead
/// context (stage/interest/agent/conversation_id).
class ContactsController extends AsyncNotifier<List<Contact>> {
  Timer? _debounce;
  bool _hasConnected = false;

  @override
  Future<List<Contact>> build() async {
    // The socket doesn't replay missed events, so refetch on every RE-connect
    // (not the first connect) to catch up any lead changes that happened while
    // the socket was briefly down — keeps the list live without a manual pull.
    ref.listen(realtimeStatusProvider, (_, next) {
      if (next.value != RealtimeStatus.connected) return;
      if (_hasConnected) {
        _scheduleRefresh(const Duration(milliseconds: 300), priority: true);
      } else {
        _hasConnected = true;
      }
    });
    // Stay live with the backend: any message / stage / status / assignment
    // change (from this device, another agent, or the web) refreshes the leads
    // list so the contact's latest-thread context never goes stale. Debounced so
    // a burst of message events triggers a single refetch.
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e == null) return;
      // Routing/assignment + stage/status changes are low-frequency and change
      // which thread a contact resolves to (multi-thread routing), so reflect
      // them fast. Message bursts get a longer debounce so we don't refetch the
      // whole leads list constantly.
      // A deleted contact (from this device, another agent, or the web) drops
      // out of the list immediately — no refetch needed.
      if (e.isContactDeleted) {
        final cid = ContactDeletedPayload(e.data).contactId;
        final list = state.value;
        if (list != null && cid.isNotEmpty) {
          state = AsyncData(list.where((c) => c.id != cid).toList());
        }
        return;
      }
      // A contact edit/create (name/tags/phone, from any client) reflects in the
      // leads list — low-frequency, so a quick reconcile is fine.
      if (e.isContactUpdated || e.isContactCreated) {
        _scheduleRefresh(const Duration(milliseconds: 500), priority: true);
        return;
      }
      if (e.isConversationAssigned || e.isConversationUpdated) {
        _scheduleRefresh(const Duration(milliseconds: 300), priority: true);
      } else if (e.isMessagePersisted || e.isConversationClosed) {
        _scheduleRefresh(const Duration(seconds: 2));
      }
    });
    ref.onDispose(() => _debounce?.cancel());
    // Cache-first: paint the last leads snapshot instantly, then refresh in the
    // background, so opening Contacts never blocks on the network round-trip.
    final cache = ref.read(appCacheProvider);
    final cached = cache.getJsonList(AppCache.kContacts);
    if (cached != null && cached.isNotEmpty) {
      Future.microtask(refresh);
      return cached
          .whereType<Map>()
          .map((e) => ContactModel.fromJson(e.cast<String, dynamic>()))
          .toList();
    }
    return _fetch();
  }

  void _scheduleRefresh(Duration delay, {bool priority = false}) {
    // A pending refresh already covers low-priority (message) events, so don't
    // push it back. Priority (routing) events always win and refresh sooner.
    if (!priority && (_debounce?.isActive ?? false)) return;
    _debounce?.cancel();
    _debounce = Timer(delay, refresh);
  }

  Future<List<Contact>> _fetch() async {
    final cache = ref.read(appCacheProvider);
    final result = await ref.read(contactsRepositoryProvider).list();
    return result.fold(
      (failure) {
        // Network failed: serve the last cached leads if we have one.
        final cached = cache.getJsonList(AppCache.kContacts);
        if (cached != null && cached.isNotEmpty) {
          return cached
              .whereType<Map>()
              .map((e) => ContactModel.fromJson(e.cast<String, dynamic>()))
              .toList();
        }
        throw failure;
      },
      (list) {
        // Persist a snapshot so the next open renders instantly.
        cache.setJson(AppCache.kContacts, list.map((c) => c.toJson()).toList());
        return list;
      },
    );
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

/// A contact's history timeline (stage/status/interest/assignment changes).
final contactActivityProvider =
    FutureProvider.family<List<ContactActivity>, String>((ref, id) async {
  return ref.watch(contactsRemoteDataSourceProvider).activity(id);
});

/// Lookup a single contact from the loaded list (detail screen).
final contactByIdProvider = Provider.family<Contact?, String>((ref, id) {
  final list = ref.watch(contactsProvider).value;
  if (list == null) return null;
  for (final c in list) {
    if (c.id == id) return c;
  }
  return null;
});

/// By-id fetch fallback: returns the list copy instantly when present, else
/// fetches the contact so the detail screen never hangs for a contact that isn't
/// in the loaded (leads-only) list (e.g. opened from a chat / deep link).
final contactFetchProvider = FutureProvider.family<Contact?, String>((ref, id) async {
  final inList = ref.watch(contactByIdProvider(id));
  if (inList != null) return inList;
  return ref.read(contactsRemoteDataSourceProvider).get(id);
});
