// ============================================================
// Quick Replies Cubit - State Management
// ============================================================
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/quick_replies/domain/entities/quick_reply_entity.dart';
import 'package:simpulx/features/quick_replies/domain/repositories/quick_reply_repository.dart';

// ── State ───────────────────────────────────────────────
class QuickRepliesState extends Equatable {
  final List<QuickReplyEntity> replies;
  final List<String> categories;
  final bool isLoading;
  final bool isSaving;
  final String? error;
  final String? selectedCategory;
  final String? searchQuery;

  const QuickRepliesState({
    this.replies = const [],
    this.categories = const [],
    this.isLoading = false,
    this.isSaving = false,
    this.error,
    this.selectedCategory,
    this.searchQuery,
  });

  QuickRepliesState copyWith({
    List<QuickReplyEntity>? replies,
    List<String>? categories,
    bool? isLoading,
    bool? isSaving,
    String? error,
    String? selectedCategory,
    String? searchQuery,
  }) {
    return QuickRepliesState(
      replies: replies ?? this.replies,
      categories: categories ?? this.categories,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: error,
      selectedCategory: selectedCategory ?? this.selectedCategory,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }

  @override
  List<Object?> get props => [replies, categories, isLoading, isSaving, error, selectedCategory, searchQuery];
}

// ── Cubit ───────────────────────────────────────────────
class QuickRepliesCubit extends Cubit<QuickRepliesState> {
  final QuickReplyRepository _repository;

  QuickRepliesCubit({required QuickReplyRepository repository})
      : _repository = repository,
        super(const QuickRepliesState());

  Future<void> loadReplies({String? search, String? category}) async {
    emit(state.copyWith(isLoading: true, searchQuery: search, selectedCategory: category));

    final result = await _repository.getAll(
      search: search ?? state.searchQuery,
      category: category ?? state.selectedCategory,
    );

    result.fold(
      (failure) => emit(state.copyWith(isLoading: false, error: failure.message)),
      (replies) => emit(state.copyWith(isLoading: false, replies: replies, error: null)),
    );
  }

  Future<void> loadCategories() async {
    final result = await _repository.getCategories();
    result.fold(
      (_) {},
      (cats) => emit(state.copyWith(categories: cats)),
    );
  }

  Future<bool> createReply({
    required String title,
    required String content,
    String? shortcut,
    String? category,
  }) async {
    emit(state.copyWith(isSaving: true));

    final result = await _repository.create({
      'title': title,
      'content': content,
      if (shortcut != null && shortcut.isNotEmpty) 'shortcut': shortcut,
      if (category != null && category.isNotEmpty) 'category': category,
    });

    return result.fold(
      (failure) {
        emit(state.copyWith(isSaving: false, error: failure.message));
        return false;
      },
      (reply) {
        emit(state.copyWith(
          isSaving: false,
          replies: [reply, ...state.replies],
          error: null,
        ));
        return true;
      },
    );
  }

  Future<bool> updateReply(String id, Map<String, dynamic> data) async {
    emit(state.copyWith(isSaving: true));

    final result = await _repository.update(id, data);

    return result.fold(
      (failure) {
        emit(state.copyWith(isSaving: false, error: failure.message));
        return false;
      },
      (updated) {
        final updatedList = state.replies.map((r) => r.id == id ? updated : r).toList();
        emit(state.copyWith(isSaving: false, replies: updatedList, error: null));
        return true;
      },
    );
  }

  Future<bool> deleteReply(String id) async {
    final result = await _repository.delete(id);

    return result.fold(
      (failure) {
        emit(state.copyWith(error: failure.message));
        return false;
      },
      (_) {
        final updatedList = state.replies.where((r) => r.id != id).toList();
        emit(state.copyWith(replies: updatedList, error: null));
        return true;
      },
    );
  }
}
