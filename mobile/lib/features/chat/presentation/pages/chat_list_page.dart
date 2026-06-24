import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/realtime/realtime_client.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../domain/entities/conversation.dart';
import '../controllers/conversation_list_controller.dart';
import '../controllers/inbox_filter.dart';
import '../widgets/conversation_tile.dart';
import '../controllers/chat_actions_providers.dart';

/// The inbox: realtime conversation list with search + pull-to-refresh.
class ChatListPage extends ConsumerStatefulWidget {
  const ChatListPage({super.key});

  @override
  ConsumerState<ChatListPage> createState() => _ChatListPageState();
}

class _ChatListPageState extends ConsumerState<ChatListPage> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  String _query = '';
  String _searchType = 'Phone';
  int _visible = 25; // windowed render count; grows as the user scrolls
  int _filteredLen = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 320 &&
        _visible < _filteredLen) {
      setState(() => _visible += 25);
    }
  }

  List<Conversation> _filter(List<Conversation> list, InboxFilter filter) {
    final q = _query.toLowerCase();
    return list.where((c) {
      bool matchesSearch = true;
      if (q.isNotEmpty) {
        if (_searchType == 'Name') {
          matchesSearch = c.contactName.toLowerCase().contains(q);
        } else if (_searchType == 'Phone') {
          matchesSearch = c.contactPhone.toLowerCase().contains(q);
        } else if (_searchType == 'Messages') {
          if (q.trim().length >= 2) {
            matchesSearch = true;
          } else {
            matchesSearch = c.lastMessagePreview?.toLowerCase().contains(q) ?? false;
          }
        } else {
          matchesSearch = c.contactName.toLowerCase().contains(q) ||
                          c.contactPhone.toLowerCase().contains(q);
        }
      }
      return matchesSearch && filter.matches(c);
    }).toList();
  }

  void _showFilters() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => Consumer(
        builder: (context, ref, _) {
          final filter = ref.watch(inboxFilterProvider);
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text('Advanced Filters',
                          style: TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(
                        onPressed: () =>
                            ref.read(inboxFilterProvider.notifier).clear(),
                        child: const Text('Reset'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('Interest Level',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('All'),
                        selected: filter.interestLevel == null,
                        onSelected: (_) => ref
                            .read(inboxFilterProvider.notifier)
                            .set(filter.copyWith(clearInterest: true)),
                      ),
                      for (final level in const ['hot', 'warm', 'cold'])
                        ChoiceChip(
                          label: Text(level[0].toUpperCase() + level.substring(1)),
                          selected: filter.interestLevel == level,
                          selectedColor:
                              AppColors.forInterest(level).withValues(alpha: 0.16),
                          onSelected: (_) => ref
                              .read(inboxFilterProvider.notifier)
                              .set(filter.copyWith(interestLevel: level)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text('Stage',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 8),
                  Consumer(
                    builder: (context, ref, _) {
                      final stagesAsync = ref.watch(stagesProvider);
                      return stagesAsync.when(
                        data: (stages) => Wrap(
                          spacing: 8,
                          children: [
                            ChoiceChip(
                              label: const Text('All'),
                              selected: filter.stageName == null,
                              onSelected: (_) => ref
                                  .read(inboxFilterProvider.notifier)
                                  .set(filter.copyWith(clearStage: true)),
                            ),
                            for (final stage in stages)
                              ChoiceChip(
                                label: Text(stage.name),
                                selected: filter.stageName == stage.name,
                                onSelected: (_) => ref
                                    .read(inboxFilterProvider.notifier)
                                    .set(filter.copyWith(stageName: stage.name)),
                              ),
                          ],
                        ),
                        loading: () => const CircularProgressIndicator(),
                        error: (_, __) => const Text('Failed to load stages'),
                      );
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text('Quick Filters',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 8),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Unread only'),
                    value: filter.unreadOnly,
                    onChanged: (v) => ref
                        .read(inboxFilterProvider.notifier)
                        .set(filter.copyWith(unreadOnly: v)),
                  ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Follow-up needed'),
                    value: filter.followUpOnly,
                    onChanged: (v) => ref
                        .read(inboxFilterProvider.notifier)
                        .set(filter.copyWith(followUpOnly: v)),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(48)),
                      child: const Text('Apply'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isGlobalSearch = _searchType == 'Messages' && _query.trim().length >= 2;
    final async = isGlobalSearch ? ref.watch(messageSearchProvider(_query)) : ref.watch(conversationListProvider);
    final filter = ref.watch(inboxFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chats'),
        actions: [
          const _RealtimeDot(),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.tune_rounded),
                tooltip: 'Advanced Filters',
                onPressed: _showFilters,
              ),
              if (filter.activeCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 16,
                    height: 16,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: Text('${filter.activeCount}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 8),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: SizedBox(
              height: 48,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  PopupMenuButton<String>(
                    onSelected: (v) {
                      setState(() {
                        _searchType = v;
                        _visible = 25;
                      });
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                          value: 'Phone',
                          child: Row(children: [
                            Icon(Icons.phone_outlined, size: 20),
                            SizedBox(width: 12),
                            Text('Phone')
                          ])),
                      const PopupMenuItem(
                          value: 'Name',
                          child: Row(children: [
                            Icon(Icons.person_outline_rounded, size: 20),
                            SizedBox(width: 12),
                            Text('Name')
                          ])),
                      const PopupMenuItem(
                          value: 'Messages',
                          child: Row(children: [
                            Icon(Icons.chat_bubble_outline_rounded, size: 20),
                            SizedBox(width: 12),
                            Text('Messages')
                          ])),
                    ],
                    offset: const Offset(0, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).inputDecorationTheme.fillColor,
                        border: Border.all(
                            color: Theme.of(context).colorScheme.outline),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                              _searchType == 'Phone'
                                  ? Icons.phone_outlined
                                  : (_searchType == 'Name'
                                      ? Icons.person_outline_rounded
                                      : Icons.chat_bubble_outline_rounded),
                              size: 20,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant),
                          const SizedBox(width: 4),
                          Icon(Icons.keyboard_arrow_down_rounded,
                              size: 20,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _search,
                      onChanged: (v) => setState(() {
                        _query = v;
                        _visible = 25;
                      }),
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: _searchType == 'Phone'
                            ? 'Search Number'
                            : 'Search ${_searchType.toLowerCase()}',
                        isDense: true,
                        suffixIcon: _query.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close_rounded, size: 18),
                                onPressed: () {
                                  _search.clear();
                                  setState(() => _query = '');
                                },
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: async.when(
        loading: () => const AppLoader(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(conversationListProvider.notifier).refresh(),
        ),
        data: (list) {
          final filtered = _filter(list, filter);
          _filteredLen = filtered.length;
          final shown = _visible < filtered.length ? _visible : filtered.length;
          final hasMore = filtered.length > shown;
          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () =>
                      ref.read(conversationListProvider.notifier).refresh(),
                  child: filtered.isEmpty
                ? ListView(
                    children: [
                      SizedBox(height: MediaQuery.of(context).size.height * 0.2),
                      AppEmptyState(
                        icon: _query.isEmpty
                            ? Icons.forum_outlined
                            : Icons.search_off_rounded,
                        title: _query.isEmpty ? 'No conversations' : 'No matches',
                        message: _query.isEmpty
                            ? 'New leads and chats will appear here.'
                            : 'Try a different name or number.',
                      ),
                    ],
                  )
                : ListView.separated(
                    controller: _scroll,
                    itemCount: shown + (hasMore ? 1 : 0),
                    separatorBuilder: (_, i) => const SizedBox.shrink(),
                    itemBuilder: (context, i) {
                      if (i >= shown) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(
                            child: SizedBox(
                              width: 22,
                              height: 22,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        );
                      }
                      final c = filtered[i];
                      return ConversationTile(
                        conversation: c,
                        onTap: () => context.push('/chat/${c.id}', extra: c),
                      );
                    },
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// Banner removed

/// Subtle realtime connection indicator in the app bar.
class _RealtimeDot extends ConsumerWidget {
  const _RealtimeDot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(realtimeStatusProvider).value;
    final connected = status == RealtimeStatus.connected;
    return Tooltip(
      message: connected ? 'Live' : 'Connecting',
      child: Container(
        width: 9,
        height: 9,
        decoration: BoxDecoration(
          color: connected ? AppColors.success : AppColors.warning,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
