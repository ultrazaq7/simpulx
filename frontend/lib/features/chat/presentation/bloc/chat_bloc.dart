// ============================================================
// Chat Bloc - Real-time Messaging State Management
// ============================================================
import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/domain/repositories/chat_repository.dart';
import 'package:simpulx/core/network/websocket_service.dart';
import 'package:simpulx/features/chat/presentation/bloc/web_helpers.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;

// ══════════════════════════════════════════════════════════
// FAVICON BADGE HELPER (delegates to platform-specific impl)
// ══════════════════════════════════════════════════════════

// Use FaviconBadge.update(count) and BrowserNotification directly
// from the imported web_helpers conditional export.

// ══════════════════════════════════════════════════════════
// CONVERSATION LIST CUBIT
// ══════════════════════════════════════════════════════════

const _kNoFilter = '__NO_FILTER__';

class ConversationListState extends Equatable {
  final List<ConversationEntity> conversations;
  final bool isLoading;
  final String? error;
  final String? filterStatus;
  final String? searchQuery;
  final String? agentId;
  final String assignmentFilter;
  final String? lastMessageBy;
  final String? channelId;
  final String? departmentId;
  final String sortOrder;
  final String? tag;
  final String? stageId;
  final String? interestLevel;
  final String? sourceChannel;
  final ChatFilterOptionsEntity filterOptions;
  final bool isLoadingFilterOptions;
  final String? filterOptionsError;
  final int totalUnreadCount;

  const ConversationListState({
    this.conversations = const [],
    this.isLoading = false,
    this.error,
    this.filterStatus,
    this.searchQuery,
    this.agentId,
    this.assignmentFilter = 'all',
    this.lastMessageBy,
    this.channelId,
    this.departmentId,
    this.sortOrder = 'latest',
    this.tag,
    this.stageId,
    this.interestLevel,
    this.sourceChannel,
    this.filterOptions = const ChatFilterOptionsEntity(),
    this.isLoadingFilterOptions = false,
    this.filterOptionsError,
    this.totalUnreadCount = 0,
  });

  ConversationListState copyWith({
    List<ConversationEntity>? conversations,
    bool? isLoading,
    String? error,
    String? filterStatus,
    String? searchQuery,
    String? agentId,
    String? assignmentFilter,
    String? lastMessageBy,
    String? channelId,
    String? departmentId,
    String? sortOrder,
    String? tag,
    String? stageId,
    String? interestLevel,
    String? sourceChannel,
    ChatFilterOptionsEntity? filterOptions,
    bool? isLoadingFilterOptions,
    String? filterOptionsError,
    int? totalUnreadCount,
  }) {
    return ConversationListState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      filterStatus: filterStatus == _kNoFilter
          ? null
          : (filterStatus ?? this.filterStatus),
      searchQuery: searchQuery ?? this.searchQuery,
      agentId: agentId == _kNoFilter ? null : (agentId ?? this.agentId),
      assignmentFilter: assignmentFilter ?? this.assignmentFilter,
      lastMessageBy: lastMessageBy == _kNoFilter
          ? null
          : (lastMessageBy ?? this.lastMessageBy),
      channelId: channelId == _kNoFilter ? null : (channelId ?? this.channelId),
      departmentId: departmentId == _kNoFilter
          ? null
          : (departmentId ?? this.departmentId),
      sortOrder: sortOrder ?? this.sortOrder,
      tag: tag == _kNoFilter ? null : (tag ?? this.tag),
      stageId: stageId == _kNoFilter ? null : (stageId ?? this.stageId),
      interestLevel: interestLevel == _kNoFilter ? null : (interestLevel ?? this.interestLevel),
      sourceChannel: sourceChannel == _kNoFilter ? null : (sourceChannel ?? this.sourceChannel),
      filterOptions: filterOptions ?? this.filterOptions,
      isLoadingFilterOptions:
          isLoadingFilterOptions ?? this.isLoadingFilterOptions,
      filterOptionsError: filterOptionsError,
      totalUnreadCount: totalUnreadCount ?? this.totalUnreadCount,
    );
  }

  @override
  List<Object?> get props => [
        conversations,
        isLoading,
        error,
        filterStatus,
        searchQuery,
        agentId,
        assignmentFilter,
        lastMessageBy,
        channelId,
        departmentId,
        sortOrder,
        tag,
        stageId,
        interestLevel,
        sourceChannel,
        filterOptions,
        isLoadingFilterOptions,
        filterOptionsError,
        totalUnreadCount
      ];
}

class ConversationCubit extends Cubit<ConversationListState> {
  final ChatRepository _chatRepository;
  final WebSocketService _wsService;
  StreamSubscription? _conversationSub;
  StreamSubscription? _messageSub;
  Timer? _debounceTimer;

  /// Get current user ID dynamically from AuthBloc (available after login)
  String? get _currentUserId {
    final authState = di.sl<AuthBloc>().state;
    if (authState is AuthAuthenticated) return authState.session.user.id;
    return null;
  }

  ConversationCubit({
    required ChatRepository chatRepository,
    required WebSocketService wsService,
  })  : _chatRepository = chatRepository,
        _wsService = wsService,
        super(const ConversationListState()) {
    _listenToUpdates();
    BrowserNotification.requestPermission();
  }

  void _listenToUpdates() {
    // Listen for new messages - update conversation in-place
    _messageSub = _wsService.messageStream.listen((data) {
      _handleRealtimeMessage(data);
    });

    // Listen for new/updated conversations
    _conversationSub = _wsService.conversationStream.listen((data) {
      _handleRealtimeConversation(data);
    });
  }

  void _handleRealtimeMessage(Map<String, dynamic> data) {
    final convId = data['conversationId'] as String?;
    final msgData = data['message'] as Map<String, dynamic>?;
    if (convId == null || msgData == null) {
      // Fallback: reload from server
      _debouncedReload();
      return;
    }

    final direction = msgData['direction'] ?? 'inbound';
    final content = msgData['content'] as String? ?? '';
    final now = DateTime.now();

    // Extract contact from WS payload if available
    final contactData = data['contact'] as Map<String, dynamic>?;

    final conversations = List<ConversationEntity>.from(state.conversations);
    final idx = conversations.indexWhere((c) => c.id == convId);

    if (idx >= 0) {
      final old = conversations[idx];
      final isInbound = direction == 'inbound';

      // Use contact from WS payload if available, otherwise keep old
      final updatedContact = contactData != null
          ? ContactEntity(
              id: contactData['id'] as String? ?? old.contact?.id ?? '',
              name: contactData['name'] as String?,
              phone: contactData['phone'] as String?,
              whatsappId: contactData['whatsappId'] as String?,
            )
          : old.contact;

      conversations[idx] = ConversationEntity(
        id: old.id,
        contactId: old.contactId,
        assignedAgentId: old.assignedAgentId,
        departmentId: old.departmentId,
        whatsappChannelId: old.whatsappChannelId,
        metaChannelId: old.metaChannelId,
        channel: old.channel,
        channelName: old.channelName,
        departmentName: old.departmentName,
        status: old.status,
        subject: old.subject,
        lastMessageAt: now,
        lastMessagePreview:
            content.isNotEmpty ? content : old.lastMessagePreview,
        lastMessageSenderType: old.lastMessageSenderType,
        lastMessageStatus: msgData['status'] as String? ?? old.lastMessageStatus,
        lastMessageDirection: direction,
        unreadCount: isInbound ? old.unreadCount + 1 : old.unreadCount,
        referralAdSetId: old.referralAdSetId,
        referralCampaignId: old.referralCampaignId,
        referralHeadline: old.referralHeadline,
        stageId: old.stageId,
        stageName: old.stageName,
        stageColor: old.stageColor,
        stageCategory: old.stageCategory,
        interestLevel: old.interestLevel,
        firstReplyAt: old.firstReplyAt,
        sourceChannel: old.sourceChannel,
        snoozedUntil: old.snoozedUntil,
        contact: updatedContact,
        assignedAgent: old.assignedAgent,
      );
      // Move to top
      final updated = conversations.removeAt(idx);
      conversations.insert(0, updated);

      final totalUnread =
          conversations.fold<int>(0, (sum, c) => sum + c.unreadCount);
      emit(state.copyWith(
          conversations: conversations, totalUnreadCount: totalUnread));
      FaviconBadge.update(totalUnread);

      if (isInbound) {
        // Only show popup notification to the assigned agent
        final assignedAgentId = data['assignedAgentId'] as String?;
        final shouldNotify = assignedAgentId == null ||
            assignedAgentId == _currentUserId;
        if (shouldNotify) {
          BrowserNotification.show(
            title: old.contact?.displayName ?? 'New message',
            body: content,
            tag: convId,
          );
        }
      }
    } else {
      // Conversation not in list - reload to fetch it
      _debouncedReload();
    }
  }

  void _handleRealtimeConversation(Map<String, dynamic> data) {
    final type = data['type'] as String?;
    if (type == 'new') {
      // New conversation arrived - show browser notification + reload
      final contactName = data['contactName'] as String? ?? 'New conversation';
      BrowserNotification.show(
        title: '💬 New conversation',
        body: contactName,
        tag: 'new-conv',
      );
      _debouncedReload();
    } else if (type == 'updated') {
      // Status or assignment changed - update in-place
      final convId = data['conversationId'] as String?;
      final updates = data['updates'] as Map<String, dynamic>?;
      if (convId != null && updates != null) {
        final conversations =
            List<ConversationEntity>.from(state.conversations);
        final idx = conversations.indexWhere((c) => c.id == convId);
        if (idx >= 0) {
          final old = conversations[idx];
          final newStatus = updates['status'] as String? ?? old.status;

          conversations[idx] = ConversationEntity(
            id: old.id,
            contactId: old.contactId,
            assignedAgentId: updates.containsKey('assignedAgentId')
                ? updates['assignedAgentId'] as String?
                : old.assignedAgentId,
            departmentId: updates.containsKey('departmentId')
                ? updates['departmentId'] as String?
                : old.departmentId,
            whatsappChannelId: old.whatsappChannelId,
            metaChannelId: old.metaChannelId,
            channel: old.channel,
            channelName: old.channelName,
            departmentName: old.departmentName,
            status: newStatus,
            subject: old.subject,
            lastMessageAt: old.lastMessageAt,
            lastMessagePreview: old.lastMessagePreview,
            lastMessageSenderType: old.lastMessageSenderType,
            lastMessageStatus: old.lastMessageStatus,
            lastMessageDirection: old.lastMessageDirection,
            unreadCount: old.unreadCount,
            referralAdSetId: old.referralAdSetId,
            referralCampaignId: old.referralCampaignId,
            referralHeadline: old.referralHeadline,
            stageId: updates.containsKey('stageId')
                ? updates['stageId'] as String?
                : old.stageId,
            stageName: updates.containsKey('stageName')
                ? updates['stageName'] as String?
                : old.stageName,
            stageColor: updates.containsKey('stageColor')
                ? updates['stageColor'] as String?
                : old.stageColor,
            stageCategory: updates.containsKey('stageCategory')
                ? updates['stageCategory'] as String?
                : old.stageCategory,
            interestLevel: updates.containsKey('interestLevel')
                ? updates['interestLevel'] as String?
                : old.interestLevel,
            firstReplyAt: old.firstReplyAt,
            sourceChannel: old.sourceChannel,
            snoozedUntil: updates.containsKey('snoozedUntil')
                ? (updates['snoozedUntil'] is String
                    ? DateTime.tryParse(updates['snoozedUntil'] as String)
                    : null)
                : old.snoozedUntil,
            contact: old.contact,
            assignedAgent: old.assignedAgent,
          );

          // Only show browser notification for snooze wake-up
          if (old.status == 'pending' && newStatus == 'open') {
            final contactName = old.contact?.displayName ?? 'Conversation';
            BrowserNotification.show(
              title: '⏰ Snooze ended',
              body: '$contactName is now open',
              tag: 'snooze-$convId',
            );
          }

          // If filter is active, remove conversations that no longer match
          final filterStatus = state.filterStatus;
          if (filterStatus != null &&
              conversations[idx].status != filterStatus) {
            conversations.removeAt(idx);
          }

          emit(state.copyWith(conversations: conversations));
        }
      }
    }
  }

  void _debouncedReload() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 150), () {
      loadConversations();
    });
  }

  /// Called when app resumes from background to refresh conversations
  void refreshOnResume() {
    loadConversations();
  }

  Future<void> loadFilterOptions() async {
    if (state.isLoadingFilterOptions) return;

    emit(state.copyWith(
      isLoadingFilterOptions: true,
      filterOptionsError: null,
    ));

    final result = await _chatRepository.getFilterOptions();
    result.fold(
      (failure) => emit(state.copyWith(
        isLoadingFilterOptions: false,
        filterOptionsError: failure.message,
      )),
      (options) => emit(state.copyWith(
        isLoadingFilterOptions: false,
        filterOptions: options,
        filterOptionsError: null,
      )),
    );
  }

  Future<void> loadConversations({
    String? status,
    String? search,
    String? agentId,
    String? assignment,
    String? lastMessageBy,
    String? channelId,
    String? departmentId,
    String? sort,
    String? tag,
    String? stageId,
    String? interestLevel,
    String? sourceChannel,
  }) async {
    final effectiveStatus = status ?? state.filterStatus;
    final effectiveSearch = search ?? state.searchQuery;
    final effectiveAgentId =
        agentId == _kNoFilter ? null : (agentId ?? state.agentId);
    final effectiveAssignment = assignment ?? state.assignmentFilter;
    final effectiveLastMessageBy = lastMessageBy == _kNoFilter
        ? null
        : (lastMessageBy ?? state.lastMessageBy);
    final effectiveChannelId =
        channelId == _kNoFilter ? null : (channelId ?? state.channelId);
    final effectiveDepartmentId = departmentId == _kNoFilter
        ? null
        : (departmentId ?? state.departmentId);
    final effectiveSort = sort ?? state.sortOrder;
    final effectiveTag = tag == _kNoFilter ? null : (tag ?? state.tag);
    final effectiveStageId =
        stageId == _kNoFilter ? null : (stageId ?? state.stageId);
    final effectiveInterestLevel =
        interestLevel == _kNoFilter ? null : (interestLevel ?? state.interestLevel);
    final effectiveSourceChannel =
        sourceChannel == _kNoFilter ? null : (sourceChannel ?? state.sourceChannel);

    emit(state.copyWith(
      isLoading: true,
      filterStatus: status ?? state.filterStatus,
      searchQuery: search ?? state.searchQuery,
      agentId: agentId == _kNoFilter ? _kNoFilter : effectiveAgentId,
      assignmentFilter: effectiveAssignment,
      lastMessageBy: lastMessageBy == _kNoFilter
          ? _kNoFilter
          : effectiveLastMessageBy,
      channelId: channelId == _kNoFilter ? _kNoFilter : effectiveChannelId,
      departmentId:
          departmentId == _kNoFilter ? _kNoFilter : effectiveDepartmentId,
      sortOrder: effectiveSort,
      tag: tag == _kNoFilter ? _kNoFilter : effectiveTag,
      stageId: stageId == _kNoFilter ? _kNoFilter : effectiveStageId,
      interestLevel: interestLevel == _kNoFilter ? _kNoFilter : effectiveInterestLevel,
      sourceChannel: sourceChannel == _kNoFilter ? _kNoFilter : effectiveSourceChannel,
    ));

    final result = await _chatRepository.getConversations(
      status: effectiveStatus,
      search: effectiveSearch,
      agentId: effectiveAgentId,
      assignment: effectiveAssignment == 'all' ? null : effectiveAssignment,
      lastMessageBy: effectiveLastMessageBy,
      channelId: effectiveChannelId,
      departmentId: effectiveDepartmentId,
      sort: effectiveSort,
      tag: effectiveTag,
      stageId: effectiveStageId,
      interestLevel: effectiveInterestLevel,
      sourceChannel: effectiveSourceChannel,
      page: 1,
      limit: 50,
    );

    result.fold(
      (failure) =>
          emit(state.copyWith(isLoading: false, error: failure.message)),
      (conversations) {
        final totalUnread =
            conversations.fold<int>(0, (sum, c) => sum + c.unreadCount);
        emit(state.copyWith(
          isLoading: false,
          conversations: conversations,
          error: null,
          totalUnreadCount: totalUnread,
        ));
        FaviconBadge.update(totalUnread);
      },
    );
  }

  void filterByStatus(String? status) {
    // Use sentinel to allow clearing filter to null
    emit(state.copyWith(filterStatus: status ?? _kNoFilter));
    loadConversations(status: status);
  }

  void setConversationFilters({
    String? agentId,
    String? assignment,
    String? lastMessageBy,
    String? channelId,
    String? departmentId,
    String? sort,
    String? tag,
    String? stageId,
    String? interestLevel,
    String? sourceChannel,
  }) {
    loadConversations(
      agentId: agentId == '' ? _kNoFilter : agentId,
      assignment: assignment,
      lastMessageBy: lastMessageBy == '' ? _kNoFilter : lastMessageBy,
      channelId: channelId == '' ? _kNoFilter : channelId,
      departmentId: departmentId == '' ? _kNoFilter : departmentId,
      sort: sort,
      tag: tag == '' ? _kNoFilter : tag,
      stageId: stageId == '' ? _kNoFilter : stageId,
      interestLevel: interestLevel == '' ? _kNoFilter : interestLevel,
      sourceChannel: sourceChannel == '' ? _kNoFilter : sourceChannel,
    );
  }

  void resetConversationFilters() {
    emit(state.copyWith(
      filterStatus: _kNoFilter,
      agentId: _kNoFilter,
      assignmentFilter: 'all',
      lastMessageBy: _kNoFilter,
      channelId: _kNoFilter,
      departmentId: _kNoFilter,
      sortOrder: 'latest',
      tag: _kNoFilter,
      stageId: _kNoFilter,
      interestLevel: _kNoFilter,
      sourceChannel: _kNoFilter,
    ));
    loadConversations(
      status: null,
      agentId: _kNoFilter,
      assignment: 'all',
      lastMessageBy: _kNoFilter,
      channelId: _kNoFilter,
      departmentId: _kNoFilter,
      sort: 'latest',
      tag: _kNoFilter,
      stageId: _kNoFilter,
      interestLevel: _kNoFilter,
      sourceChannel: _kNoFilter,
    );
  }

  void search(String query) {
    loadConversations(search: query);
  }

  Future<String?> updateConversationStatus({
    required String conversationId,
    required String status,
    String? stageId,
    String? stageName,
    String? stageColor,
    String? stageCategory,
    String? snoozedUntil,
  }) async {
    final result = await _chatRepository.updateConversationStatus(
      conversationId: conversationId,
      status: status,
      stageId: stageId,
      snoozedUntil: snoozedUntil,
    );

    return result.fold(
      (failure) => failure.message,
      (_) {
        final conversations = List<ConversationEntity>.from(state.conversations);
        final idx = conversations.indexWhere((c) => c.id == conversationId);

        if (idx >= 0) {
          final old = conversations[idx];
          final updated = ConversationEntity(
            id: old.id,
            contactId: old.contactId,
            assignedAgentId: old.assignedAgentId,
            departmentId: old.departmentId,
            whatsappChannelId: old.whatsappChannelId,
            metaChannelId: old.metaChannelId,
            channel: old.channel,
            channelName: old.channelName,
            departmentName: old.departmentName,
            status: status,
            subject: old.subject,
            lastMessageAt: old.lastMessageAt,
            lastMessagePreview: old.lastMessagePreview,
            lastMessageSenderType: old.lastMessageSenderType,
            lastMessageStatus: old.lastMessageStatus,
            lastMessageDirection: old.lastMessageDirection,
            unreadCount: old.unreadCount,
            referralAdSetId: old.referralAdSetId,
            referralCampaignId: old.referralCampaignId,
            referralHeadline: old.referralHeadline,
            stageId: stageId ?? old.stageId,
            stageName: stageId != null ? stageName : old.stageName,
            stageColor: stageId != null ? stageColor : old.stageColor,
            stageCategory: stageId != null ? stageCategory : old.stageCategory,
            interestLevel: old.interestLevel,
            firstReplyAt: old.firstReplyAt,
            sourceChannel: old.sourceChannel,
            snoozedUntil: status == 'pending' && snoozedUntil != null
                ? DateTime.tryParse(snoozedUntil)
                : null,
            contact: old.contact,
            assignedAgent: old.assignedAgent,
          );

          if (state.filterStatus != null && state.filterStatus != status) {
            conversations.removeAt(idx);
          } else {
            conversations[idx] = updated;
          }

          emit(state.copyWith(conversations: conversations));
        }

        return null;
      },
    );
  }

  Future<String?> updateConversationStage({
    required String conversationId,
    String? stageId,
    String? stageName,
    String? stageColor,
    String? stageCategory,
  }) async {
    final result = await _chatRepository.updateConversationStage(
      conversationId: conversationId,
      stageId: stageId,
    );

    return result.fold(
      (failure) => failure.message,
      (_) {
        final conversations = List<ConversationEntity>.from(state.conversations);
        final idx = conversations.indexWhere((c) => c.id == conversationId);
        if (idx >= 0) {
          final old = conversations[idx];
          conversations[idx] = ConversationEntity(
            id: old.id,
            contactId: old.contactId,
            assignedAgentId: old.assignedAgentId,
            departmentId: old.departmentId,
            whatsappChannelId: old.whatsappChannelId,
            metaChannelId: old.metaChannelId,
            channel: old.channel,
            channelName: old.channelName,
            departmentName: old.departmentName,
            status: old.status,
            subject: old.subject,
            lastMessageAt: old.lastMessageAt,
            lastMessagePreview: old.lastMessagePreview,
            lastMessageSenderType: old.lastMessageSenderType,
            lastMessageStatus: old.lastMessageStatus,
            lastMessageDirection: old.lastMessageDirection,
            unreadCount: old.unreadCount,
            referralAdSetId: old.referralAdSetId,
            referralCampaignId: old.referralCampaignId,
            referralHeadline: old.referralHeadline,
            stageId: stageId,
            stageName: stageName,
            stageColor: stageColor,
            stageCategory: stageCategory,
            interestLevel: old.interestLevel,
            firstReplyAt: old.firstReplyAt,
            sourceChannel: old.sourceChannel,
            contact: old.contact,
            assignedAgent: old.assignedAgent,
          );
          emit(state.copyWith(conversations: conversations));
        }
        return null;
      },
    );
  }

  Future<String?> updateInterestLevel({
    required String conversationId,
    String? interestLevel,
  }) async {
    final result = await _chatRepository.updateConversationInterestLevel(
      conversationId: conversationId,
      interestLevel: interestLevel,
    );
    return result.fold(
      (failure) => failure.message,
      (_) {
        final conversations = List<ConversationEntity>.from(state.conversations);
        final idx = conversations.indexWhere((c) => c.id == conversationId);
        if (idx >= 0) {
          final old = conversations[idx];
          conversations[idx] = ConversationEntity(
            id: old.id,
            contactId: old.contactId,
            assignedAgentId: old.assignedAgentId,
            departmentId: old.departmentId,
            whatsappChannelId: old.whatsappChannelId,
            metaChannelId: old.metaChannelId,
            channel: old.channel,
            channelName: old.channelName,
            departmentName: old.departmentName,
            status: old.status,
            subject: old.subject,
            lastMessageAt: old.lastMessageAt,
            lastMessagePreview: old.lastMessagePreview,
            lastMessageSenderType: old.lastMessageSenderType,
            lastMessageStatus: old.lastMessageStatus,
            lastMessageDirection: old.lastMessageDirection,
            unreadCount: old.unreadCount,
            referralAdSetId: old.referralAdSetId,
            referralCampaignId: old.referralCampaignId,
            referralHeadline: old.referralHeadline,
            stageId: old.stageId,
            stageName: old.stageName,
            stageColor: old.stageColor,
            stageCategory: old.stageCategory,
            interestLevel: interestLevel,
            firstReplyAt: old.firstReplyAt,
            sourceChannel: old.sourceChannel,
            contact: old.contact,
            assignedAgent: old.assignedAgent,
          );
          emit(state.copyWith(conversations: conversations));
        }
        return null;
      },
    );
  }

  Future<List<InternalNoteEntity>> getInternalNotes(String conversationId) async {
    final result =
        await _chatRepository.getInternalNotes(conversationId: conversationId);
    return result.fold((_) => <InternalNoteEntity>[], (notes) => notes);
  }

  Future<InternalNoteEntity?> addInternalNote({
    required String conversationId,
    required String content,
  }) async {
    final result = await _chatRepository.addInternalNote(
      conversationId: conversationId,
      content: content,
    );
    return result.fold((_) => null, (note) => note);
  }

  Future<String?> deleteInternalNote({
    required String conversationId,
    required String noteId,
  }) async {
    final result = await _chatRepository.deleteInternalNote(
      conversationId: conversationId,
      noteId: noteId,
    );
    return result.fold((failure) => failure.message, (_) => null);
  }

  Future<String?> updateContactTags({
    required String contactId,
    required List<String> tags,
  }) async {
    final normalizedTags = tags
        .map((tag) => tag.trim())
        .where((tag) => tag.isNotEmpty)
        .fold<List<String>>([], (uniqueTags, tag) {
      final exists =
          uniqueTags.any((item) => item.toLowerCase() == tag.toLowerCase());
      if (!exists) uniqueTags.add(tag);
      return uniqueTags;
    });

    final result = await _chatRepository.updateContactTags(
      contactId: contactId,
      tags: normalizedTags,
    );

    return result.fold(
      (failure) => failure.message,
      (updatedContact) {
        final conversations = state.conversations.map((conversation) {
          final contact = conversation.contact;
          if (conversation.contactId != contactId && contact?.id != contactId) {
            return conversation;
          }

          return ConversationEntity(
            id: conversation.id,
            contactId: conversation.contactId,
            assignedAgentId: conversation.assignedAgentId,
            departmentId: conversation.departmentId,
            whatsappChannelId: conversation.whatsappChannelId,
            channel: conversation.channel,
            channelName: conversation.channelName,
            departmentName: conversation.departmentName,
            status: conversation.status,
            subject: conversation.subject,
            lastMessageAt: conversation.lastMessageAt,
            lastMessagePreview: conversation.lastMessagePreview,
            lastMessageSenderType: conversation.lastMessageSenderType,
            lastMessageStatus: conversation.lastMessageStatus,
            lastMessageDirection: conversation.lastMessageDirection,
            unreadCount: conversation.unreadCount,
            referralAdSetId: conversation.referralAdSetId,
            referralCampaignId: conversation.referralCampaignId,
            referralHeadline: conversation.referralHeadline,
            contact: updatedContact,
            assignedAgent: conversation.assignedAgent,
          );
        }).toList();

        emit(state.copyWith(conversations: conversations));
        loadFilterOptions();
        return null;
      },
    );
  }

  void markConversationRead(String conversationId) {
    final conversations = List<ConversationEntity>.from(state.conversations);
    final idx = conversations.indexWhere((c) => c.id == conversationId);
    if (idx >= 0) {
      final old = conversations[idx];
      if (old.unreadCount > 0) {
        conversations[idx] = ConversationEntity(
          id: old.id,
          contactId: old.contactId,
          assignedAgentId: old.assignedAgentId,
          departmentId: old.departmentId,
          whatsappChannelId: old.whatsappChannelId,
          channel: old.channel,
          channelName: old.channelName,
          departmentName: old.departmentName,
          status: old.status,
          subject: old.subject,
          lastMessageAt: old.lastMessageAt,
          lastMessagePreview: old.lastMessagePreview,
          lastMessageSenderType: old.lastMessageSenderType,
          lastMessageStatus: old.lastMessageStatus,
          lastMessageDirection: old.lastMessageDirection,
          unreadCount: 0,
          referralAdSetId: old.referralAdSetId,
          referralCampaignId: old.referralCampaignId,
          referralHeadline: old.referralHeadline,
          contact: old.contact,
          assignedAgent: old.assignedAgent,
        );
        final totalUnread =
            conversations.fold<int>(0, (sum, c) => sum + c.unreadCount);
        emit(state.copyWith(
            conversations: conversations, totalUnreadCount: totalUnread));
        FaviconBadge.update(totalUnread);
      }
    }
  }

  Future<List<AgentEntity>> loadAssignableAgents() async {
    final result = await _chatRepository.getAssignableAgents();
    return result.fold(
      (failure) => throw Exception(failure.message),
      (agents) => agents,
    );
  }

  Future<List<ConversationEntity>> getContactThreads(String contactId) async {
    final result = await _chatRepository.getConversations(
      contactId: contactId,
      page: 1,
      limit: 50,
    );
    return result.fold(
      (failure) => [],
      (conversations) => conversations,
    );
  }

  Future<String?> assignAgent({
    required String conversationId,
    String? agentId,
  }) async {
    final result = await _chatRepository.assignAgent(
      conversationId: conversationId,
      agentId: agentId,
    );

    return result.fold(
      (failure) => failure.message,
      (_) {
        loadConversations();
        return null;
      },
    );
  }

  @override
  Future<void> close() {
    _conversationSub?.cancel();
    _messageSub?.cancel();
    _debounceTimer?.cancel();
    return super.close();
  }
}

// ══════════════════════════════════════════════════════════
// CHAT BLOC (Active conversation messages)
// ══════════════════════════════════════════════════════════

// ── Events ──────────────────────────────────────────────
abstract class ChatEvent extends Equatable {
  @override
  List<Object?> get props => [];
}

class LoadMessagesEvent extends ChatEvent {
  final String conversationId;
  LoadMessagesEvent({required this.conversationId});

  @override
  List<Object?> get props => [conversationId];
}

class SendMessageEvent extends ChatEvent {
  final String conversationId;
  final String content;
  final String type;
  SendMessageEvent({
    required this.conversationId,
    required this.content,
    this.type = 'text',
  });

  @override
  List<Object?> get props => [conversationId, content, type];
}

class NewMessageReceivedEvent extends ChatEvent {
  final MessageEntity message;
  NewMessageReceivedEvent({required this.message});

  @override
  List<Object?> get props => [message];
}

class MarkAsReadEvent extends ChatEvent {}

class LoadMoreMessagesEvent extends ChatEvent {}

class SendTemplateEvent extends ChatEvent {
  final String conversationId;
  final String templateId;
  final Map<String, String>? variables;
  SendTemplateEvent({
    required this.conversationId,
    required this.templateId,
    this.variables,
  });

  @override
  List<Object?> get props => [conversationId, templateId, variables];
}

// ── State ───────────────────────────────────────────────
class ChatState extends Equatable {
  final String? conversationId;
  final List<MessageEntity> messages;
  final bool isLoading;
  final bool isSending;
  final bool hasMore;
  final String? error;
  final int page;

  const ChatState({
    this.conversationId,
    this.messages = const [],
    this.isLoading = false,
    this.isSending = false,
    this.hasMore = true,
    this.error,
    this.page = 1,
  });

  ChatState copyWith({
    String? conversationId,
    List<MessageEntity>? messages,
    bool? isLoading,
    bool? isSending,
    bool? hasMore,
    String? error,
    int? page,
  }) {
    return ChatState(
      conversationId: conversationId ?? this.conversationId,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      isSending: isSending ?? this.isSending,
      hasMore: hasMore ?? this.hasMore,
      error: error,
      page: page ?? this.page,
    );
  }

  @override
  List<Object?> get props =>
      [conversationId, messages, isLoading, isSending, hasMore, error, page];
}

// ── Bloc ────────────────────────────────────────────────
class ChatBloc extends Bloc<ChatEvent, ChatState> {
  final ChatRepository _chatRepository;
  final WebSocketService _wsService;
  StreamSubscription? _messageSub;

  ChatBloc({
    required ChatRepository chatRepository,
    required WebSocketService wsService,
  })  : _chatRepository = chatRepository,
        _wsService = wsService,
        super(const ChatState()) {
    on<LoadMessagesEvent>(_onLoadMessages);
    on<SendMessageEvent>(_onSendMessage);
    on<SendTemplateEvent>(_onSendTemplate);
    on<NewMessageReceivedEvent>(_onNewMessageReceived);
    on<MarkAsReadEvent>(_onMarkAsRead);
    on<LoadMoreMessagesEvent>(_onLoadMore);

    _listenToRealTimeMessages();
  }

  void _listenToRealTimeMessages() {
    _messageSub = _wsService.messageStream.listen((data) {
      if (data['conversationId'] == state.conversationId &&
          data['message'] != null) {
        final msg = data['message'] as Map<String, dynamic>;
        add(NewMessageReceivedEvent(
          message: MessageEntity(
            id: msg['id'] ?? '',
            conversationId: msg['conversationId'] ?? state.conversationId ?? '',
            senderType: msg['senderType'] ?? 'contact',
            senderId: msg['senderId'],
            direction: msg['direction'] ?? 'inbound',
            type: msg['type'] ?? 'text',
            content: msg['content'],
            mediaUrl: msg['mediaUrl'],
            status: msg['status'] ?? 'delivered',
            createdAt: msg['createdAt'] != null
                ? DateTime.parse(msg['createdAt'])
                : DateTime.now(),
          ),
        ));
      }
    });
  }

  Future<void> _onLoadMessages(
      LoadMessagesEvent event, Emitter<ChatState> emit) async {
    // Leave previous conversation room
    if (state.conversationId != null) {
      _wsService.leaveConversation(state.conversationId!);
    }

    emit(ChatState(conversationId: event.conversationId, isLoading: true));

    // Join new conversation room
    _wsService.joinConversation(event.conversationId);

    final result = await _chatRepository.getMessages(
      conversationId: event.conversationId,
      page: 1,
      limit: 100,
    );

    result.fold(
      (failure) =>
          emit(state.copyWith(isLoading: false, error: failure.message)),
      (messages) => emit(state.copyWith(
        isLoading: false,
        messages: messages,
        hasMore: messages.length >= 100,
        page: 1,
      )),
    );

    // Mark as read
    add(MarkAsReadEvent());
  }

  Future<void> _onSendMessage(
      SendMessageEvent event, Emitter<ChatState> emit) async {
    final conversationId = event.conversationId;
    emit(state.copyWith(isSending: true, error: null));

    final result = await _chatRepository.sendMessage(
      conversationId: conversationId,
      content: event.content,
      type: event.type,
    );

    result.fold(
      (failure) =>
          emit(state.copyWith(isSending: false, error: failure.message)),
      (message) {
        final exists = state.messages.any((m) => m.id == message.id);
        final updatedMessages =
            exists ? state.messages : [...state.messages, message];
        emit(state.copyWith(isSending: false, messages: updatedMessages));
      },
    );
  }

  Future<void> _onSendTemplate(
      SendTemplateEvent event, Emitter<ChatState> emit) async {
    final conversationId = event.conversationId;
    emit(state.copyWith(isSending: true, error: null));

    final result = await _chatRepository.sendTemplate(
      conversationId: conversationId,
      templateId: event.templateId,
      variables: event.variables,
    );

    result.fold(
      (failure) {
        emit(state.copyWith(isSending: false, error: failure.message));
        // Clear error so messages remain visible (snackbar already shows it)
        emit(state.copyWith(error: null));
      },
      (message) {
        final exists = state.messages.any((m) => m.id == message.id);
        final updatedMessages =
            exists ? state.messages : [...state.messages, message];
        emit(state.copyWith(isSending: false, messages: updatedMessages));
      },
    );
  }

  void _onNewMessageReceived(
      NewMessageReceivedEvent event, Emitter<ChatState> emit) {
    // Avoid duplicates
    final exists = state.messages.any((m) => m.id == event.message.id);
    if (!exists) {
      final updatedMessages = [...state.messages, event.message];
      emit(state.copyWith(messages: updatedMessages));
    }
  }

  Future<void> _onMarkAsRead(
      MarkAsReadEvent event, Emitter<ChatState> emit) async {
    if (state.conversationId != null) {
      await _chatRepository.markAsRead(conversationId: state.conversationId!);
    }
  }

  Future<void> _onLoadMore(
      LoadMoreMessagesEvent event, Emitter<ChatState> emit) async {
    if (!state.hasMore || state.isLoading || state.conversationId == null) {
      return;
    }

    final nextPage = state.page + 1;
    final result = await _chatRepository.getMessages(
      conversationId: state.conversationId!,
      page: nextPage,
      limit: 100,
    );

    result.fold(
      (failure) => emit(state.copyWith(error: failure.message)),
      (newMessages) {
        final allMessages = [...newMessages, ...state.messages];
        emit(state.copyWith(
          messages: allMessages,
          page: nextPage,
          hasMore: newMessages.length >= 100,
        ));
      },
    );
  }

  @override
  Future<void> close() {
    if (state.conversationId != null) {
      _wsService.leaveConversation(state.conversationId!);
    }
    _messageSub?.cancel();
    return super.close();
  }
}
