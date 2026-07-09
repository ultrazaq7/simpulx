import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/i18n/stage_label.dart';
import '../../../../core/realtime/realtime_client.dart';
import '../../../../core/realtime/realtime_providers.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_skeleton.dart';
import '../../domain/entities/conversation.dart';
import '../controllers/conversation_list_controller.dart';
import '../controllers/inbox_filter.dart';
import '../controllers/chat_actions_providers.dart';
import '../controllers/chat_providers.dart';
import '../widgets/conversation_tile.dart';

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
  String _sortType = 'Latest';
  int _visible = 25; // windowed render count; grows as the user scrolls
  int _filteredLen = 0;
  bool _showScrollToTop = false;

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
    final shouldShow = _scroll.offset > 400;
    if (_showScrollToTop != shouldShow) {
      setState(() => _showScrollToTop = shouldShow);
    }
  }

  /// Which quick chip (if any) the current filter corresponds to.
  String _activeChip(InboxFilter f) {
    if (f.activeCount == 0) return 'All';
    if (f.activeCount == 1) {
      if (f.interestLevel == 'hot') return 'Hot';
      if (f.unreadOnly) return 'Unread';
      if (f.unrepliedOnly) return 'Awaiting reply';
    }
    return ''; // an advanced/custom filter is active -> no quick chip highlighted
  }

  List<Conversation> _filter(List<Conversation> list, InboxFilter filter) {
    final q = _query.toLowerCase();
    final res = list.where((c) {
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
            matchesSearch =
                c.lastMessagePreview?.toLowerCase().contains(q) ?? false;
          }
        } else {
          matchesSearch =
              c.contactName.toLowerCase().contains(q) ||
              c.contactPhone.toLowerCase().contains(q);
        }
      }
      return matchesSearch && filter.matches(c);
    }).toList();

    if (_sortType == 'Latest') {
      res.sort(
        (a, b) => (b.lastMessageAt ?? DateTime(0)).compareTo(
          a.lastMessageAt ?? DateTime(0),
        ),
      );
    } else if (_sortType == 'Oldest') {
      res.sort(
        (a, b) => (a.lastMessageAt ?? DateTime(0)).compareTo(
          b.lastMessageAt ?? DateTime(0),
        ),
      );
    } else if (_sortType == 'Unread First') {
      res.sort((a, b) {
        if (a.hasUnread && !b.hasUnread) return -1;
        if (!a.hasUnread && b.hasUnread) return 1;
        return (b.lastMessageAt ?? DateTime(0)).compareTo(
          a.lastMessageAt ?? DateTime(0),
        );
      });
    }
    return res;
  }

  void _showFilters() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        minChildSize: 0.3,
        maxChildSize: 0.7,
        builder: (context, scrollController) => Consumer(
        builder: (context, ref, _) {
          final filter = ref.watch(inboxFilterProvider);
          // Agent filter is a manager/admin tool; agents don't pick other agents.
          final isManager =
              ref.watch(sessionControllerProvider).user?.role.isManagerTier ??
              false;
          return SafeArea(
            child: SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('Advanced Filters'.tr(context),
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: () =>
                            ref.read(inboxFilterProvider.notifier).clear(),
                        child: Text('Reset'.tr(context)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text('Interest Level'.tr(context),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: Text('All'.tr(context)),
                        selected: filter.interestLevel == null,
                        onSelected: (_) => ref
                            .read(inboxFilterProvider.notifier)
                            .set(filter.copyWith(clearInterest: true)),
                      ),
                      for (final level in const ['hot', 'warm', 'cold'])
                        ChoiceChip(
                          label: Text(
                            level[0].toUpperCase() + level.substring(1),
                          ),
                          selected: filter.interestLevel == level,
                          // Solid, saturated fill + white label when selected so it
                          // reads clearly in both themes (a faint alpha wash was
                          // nearly invisible in light mode).
                          selectedColor: AppColors.forInterest(level),
                          labelStyle: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: filter.interestLevel == level
                                ? Colors.white
                                : Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                          onSelected: (_) => ref
                              .read(inboxFilterProvider.notifier)
                              .set(filter.copyWith(interestLevel: level)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text('Status'.tr(context),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: Text('All'.tr(context)),
                        selected: filter.status == null,
                        onSelected: (_) => ref
                            .read(inboxFilterProvider.notifier)
                            .set(filter.copyWith(clearStatus: true)),
                      ),
                      for (final status in const ['open', 'closed', 'snoozed'])
                        ChoiceChip(
                          label: Text(
                            status[0].toUpperCase() + status.substring(1),
                          ),
                          selected: filter.status == status,
                          onSelected: (_) => ref
                              .read(inboxFilterProvider.notifier)
                              .set(filter.copyWith(status: status)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text('Stage'.tr(context),
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Consumer(
                    builder: (context, ref, _) {
                      final stagesAsync = ref.watch(stagesProvider);
                      return stagesAsync.when(
                        data: (stages) => Wrap(
                          spacing: 8,
                          children: [
                            ChoiceChip(
                              label: Text('All'.tr(context)),
                              selected: filter.stageName == null,
                              onSelected: (_) => ref
                                  .read(inboxFilterProvider.notifier)
                                  .set(filter.copyWith(clearStage: true)),
                            ),
                            for (final stage in stages)
                              ChoiceChip(
                                label: Text(stageLabel(context, stage.name)),
                                selected: filter.stageName == stage.name,
                                onSelected: (_) => ref
                                    .read(inboxFilterProvider.notifier)
                                    .set(
                                      filter.copyWith(stageName: stage.name),
                                    ),
                              ),
                          ],
                        ),
                        loading: () => const CircularProgressIndicator(),
                        error: (_, _) => Text('Failed to load stages'.tr(context)),
                      );
                    },
                  ),
                  const SizedBox(height: 16),
                  // Campaign + Agent sit under Stage (lead-routing filters).
                  Consumer(
                    builder: (context, ref, _) {
                      final convAsync = ref.watch(conversationListProvider);
                      final campaigns =
                          convAsync.whenOrNull(
                            data: (list) =>
                                list
                                    .where(
                                      (c) =>
                                          c.campaignName?.isNotEmpty ?? false,
                                    )
                                    .map((c) => c.campaignName!)
                                    .toSet()
                                    .toList()
                                  ..sort(),
                          ) ??
                          [];
                      if (campaigns.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Campaign'.tr(context),
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _SearchableChipList(
                            items: campaigns,
                            selected: filter.campaignName,
                            onSelected: (v) => ref
                                .read(inboxFilterProvider.notifier)
                                .set(
                                  v == null
                                      ? filter.copyWith(clearCampaign: true)
                                      : filter.copyWith(campaignName: v),
                                ),
                          ),
                          const SizedBox(height: 16),
                        ],
                      );
                    },
                  ),
                  if (isManager)
                    Consumer(
                      builder: (context, ref, _) {
                        final convAsync = ref.watch(conversationListProvider);
                        final agents =
                            convAsync.whenOrNull(
                              data: (list) =>
                                  list
                                      .where(
                                        (c) => c.agentName?.isNotEmpty ?? false,
                                      )
                                      .map((c) => c.agentName!)
                                      .toSet()
                                      .toList()
                                    ..sort(),
                            ) ??
                            [];
                        if (agents.isEmpty) return const SizedBox.shrink();
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Agent'.tr(context),
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 8),
                            _SearchableChipList(
                              items: agents,
                              selected: filter.agentName,
                              onSelected: (v) => ref
                                  .read(inboxFilterProvider.notifier)
                                  .set(
                                    v == null
                                        ? filter.copyWith(clearAgent: true)
                                        : filter.copyWith(agentName: v),
                                  ),
                            ),
                            const SizedBox(height: 16),
                          ],
                        );
                      },
                    ),

                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: Text('Apply'.tr(context)),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isGlobalSearch =
        _searchType == 'Messages' && _query.trim().length >= 2;
    final async = isGlobalSearch
        ? ref.watch(messageSearchProvider(_query))
        : ref.watch(conversationListProvider);
    final filter = ref.watch(inboxFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Chats'.tr(context)),
        actions: [
          const _RealtimeDot(),
          IconButton(
            icon: const Icon(Icons.tune_rounded),
            tooltip: 'Advanced Filters',
            onPressed: _showFilters,
          ),
          // Sort dropdown
          PopupMenuButton<String>(
            icon: const Icon(Icons.swap_vert_rounded),
            tooltip: 'Sort',
            onSelected: (v) => setState(() {
              _sortType = v;
              _visible = 25;
            }),
            itemBuilder: (_) => [
              for (final sort in const ['Latest', 'Oldest', 'Unread First'])
                PopupMenuItem(
                  value: sort,
                  child: Row(
                    children: [
                      if (_sortType == sort)
                        const Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: AppColors.primary,
                        )
                      else
                        const SizedBox(width: 18),
                      const SizedBox(width: 8),
                      Text(sort),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(width: 8),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
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
                      PopupMenuItem(
                          value: 'Phone',
                          child: Row(children: [
                            Icon(Icons.phone_outlined, size: 20),
                            SizedBox(width: 12),
                            Text('Phone'.tr(context))
                          ])),
                      PopupMenuItem(
                          value: 'Name',
                          child: Row(children: [
                            Icon(Icons.person_outline_rounded, size: 20),
                            SizedBox(width: 12),
                            Text('Name'.tr(context))
                          ])),
                      PopupMenuItem(
                          value: 'Messages',
                          child: Row(children: [
                            Icon(Icons.chat_bubble_outline_rounded, size: 20),
                            SizedBox(width: 12),
                            Text('Messages'.tr(context))
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
        loading: () => const ConversationListSkeleton(),
        // Wrap the error state so a swipe-down also re-syncs (not just the
        // Retry button) when the initial load failed.
        error: (e, _) => RefreshIndicator(
          onRefresh: () =>
              ref.read(conversationListProvider.notifier).refresh(),
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: AppErrorView(
                  failure: e is Failure ? e : null,
                  onRetry: () =>
                      ref.read(conversationListProvider.notifier).refresh(),
                ),
              ),
            ),
          ),
        ),
        data: (list) {
          final filtered = _filter(list, filter);
          _filteredLen = filtered.length;
          final shown = _visible < filtered.length ? _visible : filtered.length;
          final hasMore = filtered.length > shown;

          // WhatsApp-style: the filter pills + Archived row live INSIDE the
          // scroll view so they scroll away with the list instead of staying
          // pinned under the app bar.
          return RefreshIndicator(
            onRefresh: () =>
                ref.read(conversationListProvider.notifier).refresh(),
            child: CustomScrollView(
              controller: _scroll,
              // Always allow overscroll so pull-to-refresh works even when the
              // filtered list is short or empty.
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10, bottom: 4),
                    child: _InboxFilterChips(
                      active: _activeChip(filter),
                      filterLabel: _activeChip(filter).isEmpty && filter.activeCount > 0
                          ? filter.label
                          : null,
                      onClear: _activeChip(filter).isEmpty && filter.activeCount > 0
                          ? () {
                              ref.read(inboxFilterProvider.notifier).clear();
                              setState(() => _visible = 25);
                            }
                          : null,
                      onSelect: (preset) {
                        ref.read(inboxFilterProvider.notifier).set(preset);
                        setState(() => _visible = 25);
                      },
                    ),
                  ),
                ),

                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: AppEmptyState(
                        icon: _query.isEmpty
                            ? Icons.forum_outlined
                            : Icons.search_off_rounded,
                        title:
                            (_query.isEmpty ? 'No conversations' : 'No matches')
                                .tr(context),
                        message:
                            (_query.isEmpty
                                    ? 'New leads and chats will appear here.'
                                    : 'Try a different name or number.')
                                .tr(context),
                      ),
                    ),
                  )
                else
                  SliverList.builder(
                    itemCount: shown + (hasMore ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= shown) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(
                            child: SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
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
              ],
            ),
          );
        },
      ),
      floatingActionButton: _showScrollToTop
          ? FloatingActionButton(
              mini: true,
              onPressed: () {
                _scroll.animateTo(
                  0,
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOut,
                );
              },
              child: const Icon(Icons.keyboard_arrow_up_rounded),
            )
          : null,
    );
  }
}



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

/// WhatsApp-style quick filter chips below the search box.
class _InboxFilterChips extends StatelessWidget {
  const _InboxFilterChips({
    required this.active,
    required this.onSelect,
    this.filterLabel,
    this.onClear,
  });
  final String active;
  final void Function(InboxFilter preset) onSelect;
  /// When non-null, shows a dismissible chip with the current filter summary.
  final String? filterLabel;
  final VoidCallback? onClear;

  static const _chips = <String, InboxFilter>{
    'All': InboxFilter.all,
    'Hot': InboxFilter.hot,
    'Unread': InboxFilter.unread,
    'Awaiting reply': InboxFilter.unreplied,
  };

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          // Visible "clear" chip when an advanced/dashboard filter is active.
          if (filterLabel != null && onClear != null) ...[
            Center(
              child: Material(
                color: AppColors.primary.withValues(alpha: 0.12),
                shape: const StadiumBorder(),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: onClear,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.filter_alt_rounded,
                            size: 14, color: AppColors.primary),
                        const SizedBox(width: 4),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 140),
                          child: Text('Clear all'.tr(context),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.close_rounded,
                            size: 14, color: AppColors.primary),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
          for (final entry in _chips.entries) ...[
            _FilterChip(
              label: entry.key,
              selected: active == entry.key,
              onTap: () => onSelect(entry.value),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Material(
        // Selected = solid brand fill + white text so the active pill is clearly
        // visible; unselected = outlined with a per-brightness legible label.
        color: selected ? AppColors.primary : Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected
                ? Colors.transparent
                : Theme.of(context).colorScheme.outline,
          ),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Text(
              label.tr(context),
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected
                    ? AppColors.onPrimary
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A searchable chip list for campaign/agent filter. Shows a search field +
/// filtered list of ChoiceChips.
class _SearchableChipList extends StatefulWidget {
  const _SearchableChipList({
    required this.items,
    required this.selected,
    required this.onSelected,
  });
  final List<String> items;
  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  State<_SearchableChipList> createState() => _SearchableChipListState();
}

class _SearchableChipListState extends State<_SearchableChipList> {
  final _ctrl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _q.isEmpty
        ? widget.items
        : widget.items.where((i) => i.toLowerCase().contains(_q)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 40,
          child: TextField(
            controller: _ctrl,
            decoration: InputDecoration(
              hintText: 'Search...',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 8,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            style: const TextStyle(fontSize: 13),
            onChanged: (v) => setState(() => _q = v.toLowerCase()),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            ChoiceChip(
              label: Text('All'.tr(context)),
              selected: widget.selected == null,
              onSelected: (_) => widget.onSelected(null),
            ),
            for (final item in filtered)
              ChoiceChip(
                label: Text(item, overflow: TextOverflow.ellipsis),
                selected: widget.selected == item,
                onSelected: (_) =>
                    widget.onSelected(widget.selected == item ? null : item),
              ),
          ],
        ),
      ],
    );
  }
}
