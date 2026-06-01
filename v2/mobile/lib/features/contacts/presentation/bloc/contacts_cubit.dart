// ============================================================
// Contacts Cubit - State Management
// ============================================================
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/contacts/domain/entities/contact_entity.dart';
import 'package:simpulx/features/contacts/domain/repositories/contact_repository.dart';

// ── State ───────────────────────────────────────────────
class ContactsState extends Equatable {
  final List<ContactEntity> contacts;
  final int totalContacts;
  final bool isLoading;
  final bool isCreating;
  final String? error;
  final String? searchQuery;
  final int page;
  final int limit;

  const ContactsState({
    this.contacts = const [],
    this.totalContacts = 0,
    this.isLoading = false,
    this.isCreating = false,
    this.error,
    this.searchQuery,
    this.page = 1,
    this.limit = 50,
  });

  ContactsState copyWith({
    List<ContactEntity>? contacts,
    int? totalContacts,
    bool? isLoading,
    bool? isCreating,
    String? error,
    String? searchQuery,
    int? page,
    int? limit,
  }) {
    return ContactsState(
      contacts: contacts ?? this.contacts,
      totalContacts: totalContacts ?? this.totalContacts,
      isLoading: isLoading ?? this.isLoading,
      isCreating: isCreating ?? this.isCreating,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
      page: page ?? this.page,
      limit: limit ?? this.limit,
    );
  }

  @override
  List<Object?> get props => [contacts, totalContacts, isLoading, isCreating, error, searchQuery, page];
}

// ── Cubit ───────────────────────────────────────────────
class ContactsCubit extends Cubit<ContactsState> {
  final ContactRepository _contactRepository;

  ContactsCubit({required ContactRepository contactRepository})
      : _contactRepository = contactRepository,
        super(const ContactsState());

  Future<void> loadContacts({String? search, int? page}) async {
    emit(state.copyWith(isLoading: true, searchQuery: search));

    final result = await _contactRepository.getContacts(
      page: page ?? state.page,
      limit: state.limit,
      search: search ?? state.searchQuery,
    );

    result.fold(
      (failure) => emit(state.copyWith(isLoading: false, error: failure.message)),
      (listResult) => emit(state.copyWith(
        isLoading: false,
        contacts: listResult.contacts,
        totalContacts: listResult.total,
        page: listResult.page,
        error: null,
      )),
    );
  }

  void search(String query) {
    loadContacts(search: query, page: 1);
  }

  Future<bool> createContact({
    String? name,
    String? phone,
    String? email,
    String? whatsappId,
  }) async {
    emit(state.copyWith(isCreating: true));

    final result = await _contactRepository.createContact(
      name: name,
      phone: phone,
      email: email,
      whatsappId: whatsappId,
    );

    return result.fold(
      (failure) {
        emit(state.copyWith(isCreating: false, error: failure.message));
        return false;
      },
      (contact) {
        final updatedContacts = [contact, ...state.contacts];
        emit(state.copyWith(
          isCreating: false,
          contacts: updatedContacts,
          totalContacts: state.totalContacts + 1,
          error: null,
        ));
        return true;
      },
    );
  }

  Future<bool> updateContact(
    String id, {
    String? name,
    String? phone,
    String? email,
    String? notes,
    List<String>? tags,
  }) async {
    final result = await _contactRepository.updateContact(
      id,
      name: name,
      phone: phone,
      email: email,
      notes: notes,
      tags: tags,
    );

    return result.fold(
      (failure) {
        emit(state.copyWith(error: failure.message));
        return false;
      },
      (updatedContact) {
        final updatedList = state.contacts
            .map((c) => c.id == id ? updatedContact : c)
            .toList();
        emit(state.copyWith(contacts: updatedList, error: null));
        return true;
      },
    );
  }
}
