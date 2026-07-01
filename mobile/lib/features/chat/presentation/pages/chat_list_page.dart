import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/realtime/realtime_client.dart';
import '../../../../core/realtime/realtime_providers.dart';
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

  /// Which quick chip (if any) the current filter corresponds to.
  String _activeChip(InboxFilter f) {
    if (f.activeCount == 0) return 'All';
    if (f.activeCount == 1) {
      if (f.unreadOnly) return 'Unread';
      if (f.interestLevel == 'hot') return 'Hot';
      if (f.followUpOnly) return 'Follow-up';
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
            matchesSearch = c.lastMessagePreview?.toLowerCase().contains(q) ?? false;
          }
        } else {
          matchesSearch = c.contactName.toLowerCase().contains(q) ||
                          c.contactPhone.toLowerCase().contains(q);
        }
      }
      // Lost leads live in Archived, not the main inbox (WhatsApp-style).
      return matchesSearch && filter.matches(c) && !c.isLost;
    }).toList();
    
    if (_sortType == 'Latest') {
      res.sort((a, b) => (b.lastMessageAt ?? DateTime(0)).compareTo(a.lastMessageAt ?? DateTime(0)));
    } else if (_sortType == 'Oldest') {
      res.sort((a, b) => (a.lastMessageAt ?? DateTime(0)).compareTo(b.lastMessageAt ?? DateTime(0)));
    } else if (_sortType == 'Unread First') {
      res.sort((a, b) {
        if (a.hasUnread && !b.hasUnread) return -1;
        if (!a.hasUnread && b.hasUnread) return 1;
        return (b.lastMessageAt ?? DateTime(0)).compareTo(a.lastMessageAt ?? DateTime(0));
      });
    }
    return res;
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
                  const SizedBox(height: 16),
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
                  const Text('Status',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('All'),
                        selected: filter.status == null,
                        onSelected: (_) => ref
                            .read(inboxFilterProvider.notifier)
                            .set(filter.copyWith(clearStatus: true)),
                      ),
                      for (final status in const ['open', 'closed', 'snoozed'])
                        ChoiceChip(
                          label: Text(status[0].toUpperCase() + status.substring(1)),
                          selected: filter.status == status,
                          onSelected: (_) => ref
                              .read(inboxFilterProvider.notifier)
                              .set(filter.copyWith(status: status)),
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
                  const SizedBox(height: 16),
                  // Campaign filter (derived from loaded conversations)
                  Consumer(
                    builder: (context, ref, _) {
                      final convAsync = ref.watch(conversationListProvider);
                      final campaigns = convAsync.whenOrNull(
                        data: (list) => list
                            .where((c) => c.campaignName?.isNotEmpty ?? false)
                            .map((c) => c.campaignName!)
                            .toSet()
                            .toList()
                          ..sort(),
                      ) ?? [];
                      if (campaigns.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Campaign',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 8),
                          _SearchableChipList(
                            items: campaigns,
                            selected: filter.campaignName,
                            onSelected: (v) => ref
                                .read(inboxFilterProvider.notifier)
                                .set(v == null
                                    ? filter.copyWith(clearCampaign: true)
                                    : filter.copyWith(campaignName: v)),
                          ),
                          const SizedBox(height: 16),
                        ],
                      );
                    },
                  ),
                  // Agent filter (derived from loaded conversations)
                  Consumer(
                    builder: (context, ref, _) {
                      final convAsync = ref.watch(conversationListProvider);
                      final agents = convAsync.whenOrNull(
                        data: (list) => list
                            .where((c) => c.agentName?.isNotEmpty ?? false)
                            .map((c) => c.agentName!)
                            .toSet()
                            .toList()
                          ..sort(),
                      ) ?? [];
                      if (agents.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Agent',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 8),
                          _SearchableChipList(
                            items: agents,
                            selected: filter.agentName,
                            onSelected: (v) => ref
                                .read(inboxFilterProvider.notifier)
                                .set(v == null
                                    ? filter.copyWith(clearAgent: true)
                                    : filter.copyWith(agentName: v)),
                          ),
                          const SizedBox(height: 16),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 4),
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
                        const Icon(Icons.check_rounded, size: 18, color: AppColors.primary)
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
        loading: () => const ConversationListSkeleton(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(conversationListProvider.notifier).refresh(),
        ),
        data: (list) {
          final filtered = _filter(list, filter);
          _filteredLen = filtered.length;
          final shown = _visible < filtered.length ? _visible : filtered.length;
          final hasMore = filtered.length > shown;
          final lostCount = list.where((c) => c.isLost).length;
          // Only surface a number on Archived when something inside is unread.
          final lostUnread = list.where((c) => c.isLost && c.hasUnread).length;
          // WhatsApp-style: the filter pills + Archived row live INSIDE the
          // scroll view so they scroll away with the list instead of staying
          // pinned under the app bar.
          return RefreshIndicator(
            onRefresh: () =>
                ref.read(conversationListProvider.notifier).refresh(),
            child: CustomScrollView(
              controller: _scroll,
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10, bottom: 4),
                    child: _InboxFilterChips(
                      active: _activeChip(filter),
                      onSelect: (preset) {
                        ref.read(inboxFilterProvider.notifier).set(preset);
                        setState(() => _visible = 25);
                      },
                    ),
                  ),
                ),
                if (lostCount > 0 && _query.isEmpty)
                  SliverToBoxAdapter(
                    child: _ArchivedRow(
                      unread: lostUnread,
                      onTap: () => context.push('/archived'),
                    ),
                  ),
                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Padding(
                      padding: EdgeInsets.only(
                          top: MediaQuery.of(context).size.height * 0.15),
                      child: AppEmptyState(
                        icon: _query.isEmpty
                            ? Icons.forum_outlined
                            : Icons.search_off_rounded,
                        title:
                            (_query.isEmpty ? 'No conversations' : 'No matches')
                                .tr(context),
                        message: (_query.isEmpty
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
              ],
            ),
          );
        },
      ),
    );
  }
}

/// WhatsApp-style "Archived" entry at the top of the inbox. Holds Lost leads.
class _ArchivedRow extends StatelessWidget {
  const _ArchivedRow({required this.unread, required this.onTap});
  final int unread; // unread archived threads; drives the notification badge
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          children: [
            const SizedBox(
              width: 48,
              child: Icon(Icons.archive_outlined,
                  color: AppColors.textSecondary, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text('Archived'.tr(context),
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600)),
            ),
            // Show a number ONLY when there's an unread inside (a real notification).
            if (unread > 0)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(unread > 99 ? '99+' : '$unread',
                    style: const TextStyle(
                        fontSize: 12,
                        color: Colors.white,
                        fontWeight: FontWeight.w700)),
              ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right_rounded,
                color: AppColors.textMuted, size: 20),
          ],
        ),
      ),
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
  const _InboxFilterChips({required this.active, required this.onSelect});
  final String active;
  final void Function(InboxFilter preset) onSelect;

  static const _chips = <String, InboxFilter>{
    'All': InboxFilter.all,
    'Unread': InboxFilter.unread,
    'Hot': InboxFilter.hot,
    'Follow-up': InboxFilter.followUp,
  };

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
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
        color: selected
            ? AppColors.primary.withValues(alpha: 0.14)
            : Colors.transparent,
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
                fontWeight: FontWeight.w600,
                color:
                    selected ? AppColors.primaryDark : AppColors.textSecondary,
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
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
              label: const Text('All'),
              selected: widget.selected == null,
              onSelected: (_) => widget.onSelected(null),
            ),
            for (final item in filtered)
              ChoiceChip(
                label: Text(item, overflow: TextOverflow.ellipsis),
                selected: widget.selected == item,
                onSelected: (_) => widget.onSelected(
                    widget.selected == item ? null : item),
              ),
          ],
        ),
      ],
    );
  }
}
