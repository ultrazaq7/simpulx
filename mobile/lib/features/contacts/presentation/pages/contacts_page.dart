import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_skeleton.dart';
import '../../../chat/presentation/controllers/chat_actions_providers.dart';
import '../../domain/entities/contact.dart';
import '../controllers/contacts_providers.dart';
import '../widgets/contact_form_sheet.dart';
import '../widgets/contact_tile.dart';

/// CRM leads list: search + filters + add.
class ContactsPage extends ConsumerStatefulWidget {
  const ContactsPage({super.key});

  @override
  ConsumerState<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends ConsumerState<ContactsPage> {
  final _search = TextEditingController();
  String _query = '';
  String? _interest; // null = all
  String? _stage; // stage name, null = all
  String? _assignment; // 'mine' | 'unassigned' | null = all
  String? _campaign; // campaign name, null = all
  String? _agentFilter; // agent name, null = all
  String? _lostReason;
  String _sortType = 'Oldest';

  int get _activeFilters =>
      (_stage != null ? 1 : 0) + (_assignment != null ? 1 : 0) +
      (_campaign != null ? 1 : 0) + (_agentFilter != null ? 1 : 0) +
      (_lostReason != null ? 1 : 0);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Contact> _filter(List<Contact> list, String? myId) {
    final q = _query.toLowerCase();
    final res = list.where((c) {
      final matchesQuery = q.isEmpty ||
          c.fullName.toLowerCase().contains(q) ||
          c.phone.toLowerCase().contains(q);
      final matchesInterest = _interest == null || c.interestLevel == _interest;
      final matchesStage = _stage == null || c.stageName == _stage;
      final matchesAssignment = _assignment == null ||
          (_assignment == 'unassigned' && c.assignedAgentId == null) ||
          (_assignment == 'mine' && c.assignedAgentId == myId);
      final matchesCampaign = _campaign == null || c.campaignName == _campaign;
      final matchesAgent = _agentFilter == null || c.agentName == _agentFilter;
      final matchesLostReason = _lostReason == null || c.lostReason == _lostReason;
      return matchesQuery &&
          matchesInterest &&
          matchesStage &&
          matchesAssignment &&
          matchesCampaign &&
          matchesAgent &&
          matchesLostReason;
    }).toList();

    if (_sortType == 'Score') {
      res.sort((a, b) => (b.leadScore ?? 0).compareTo(a.leadScore ?? 0));
    } else if (_sortType == 'Latest') {
      res.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    } else if (_sortType == 'Oldest') {
      res.sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0)));
    } else if (_sortType == 'Name') {
      res.sort((a, b) => a.fullName.compareTo(b.fullName));
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
        builder: (sheetContext, ref, _) {
          final stages = ref.watch(stagesProvider).value ?? const [];
          final isManager = ref
                  .watch(sessionControllerProvider)
                  .user
                  ?.role
                  .isManagerTier ??
              false;
          return StatefulBuilder(
            builder: (context, setSheet) {
              void update(VoidCallback fn) {
                setSheet(fn);
                setState(fn);
              }

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
                          const Text('Advanced Filters',
                              style: TextStyle(
                                  fontSize: 17, fontWeight: FontWeight.w700)),
                          const Spacer(),
                          TextButton(
                            onPressed: () => update(() {
                              _stage = null;
                              _assignment = null;
                              _interest = null;
                              _campaign = null;
                              _agentFilter = null;
                            }),
                            child: const Text('Reset'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Text('Interest Level',
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('All'),
                            selected: _interest == null,
                            onSelected: (_) => update(() => _interest = null),
                          ),
                          for (final level in const ['hot', 'warm', 'cold'])
                            ChoiceChip(
                              label: Text(level[0].toUpperCase() + level.substring(1)),
                              selected: _interest == level,
                              // Solid, saturated fill (not a faint alpha wash) so the
                              // selected chip stays readable in light mode too.
                              selectedColor: AppColors.forInterest(level),
                              labelStyle: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: _interest == level
                                    ? Colors.white
                                    : Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                              onSelected: (_) => update(() => _interest = level),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Text('Stage',
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('All'),
                            selected: _stage == null,
                            onSelected: (_) => update(() => _stage = null),
                          ),
                          for (final s in stages)
                            ChoiceChip(
                              label: Text(s.name),
                              selected: _stage == s.name,
                              onSelected: (_) =>
                                  update(() => _stage = s.name),
                            ),
                        ],
                      ),
                      // Campaign filter (right under Stage)
                      Builder(
                        builder: (context) {
                          final contactsAsync = ref.watch(contactsProvider);
                          final campaigns = contactsAsync.whenOrNull(
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
                              const SizedBox(height: 16),
                              const Text('Campaign',
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                              const SizedBox(height: 8),
                              _SearchableChipList(
                                items: campaigns,
                                selected: _campaign,
                                onSelected: (v) => update(() => _campaign = v),
                              ),
                            ],
                          );
                        },
                      ),
                      // Agent filter (manager only)
                      if (isManager)
                        Builder(
                          builder: (context) {
                            final contactsAsync = ref.watch(contactsProvider);
                            final agents = contactsAsync.whenOrNull(
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
                                const SizedBox(height: 16),
                                const Text('Agent',
                                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                const SizedBox(height: 8),
                                _SearchableChipList(
                                  items: agents,
                                  selected: _agentFilter,
                                  onSelected: (v) => update(() => _agentFilter = v),
                                ),
                              ],
                            );
                          },
                        ),
                      if (isManager) ...[
                        const SizedBox(height: 16),
                        const Text('Assignment',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 13)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            for (final opt in const [
                              (null, 'All'),
                              ('mine', 'Mine'),
                              ('unassigned', 'Unassigned'),
                            ])
                              ChoiceChip(
                                label: Text(opt.$2),
                                selected: _assignment == opt.$1,
                                onSelected: (_) =>
                                    update(() => _assignment = opt.$1),
                              ),
                          ],
                        ),
                      ],
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
          );
        },
      ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(contactsFilterProvider, (prev, next) {
      if (next.activeCount > 0) {
        setState(() {
          _interest = next.interestLevel;
          if (next.stageName != null && next.stageName!.toLowerCase().startsWith('lost')) {
            _stage = 'Lost';
            final reason = next.stageName!.substring(4).trim().toLowerCase().replaceAll(' ', '_');
            _lostReason = reason.isEmpty ? null : (reason.startsWith('lost_reason_') ? reason : 'lost_reason_$reason');
          } else {
            _stage = next.stageName;
            _lostReason = next.lostReason;
          }
          if (next.status == 'closed' && _stage == null) {
            _stage = 'Lost'; // rough mapping for "closed" drill
          }
          _assignment = next.assignment;
          _campaign = next.campaignName;
          _agentFilter = next.agentName;
        });
        // clear the event so it doesn't get re-applied on subsequent builds
        Future.microtask(() => ref.read(contactsFilterProvider.notifier).clear());
      }
    });

    final myId = ref.watch(sessionControllerProvider).user?.id;
    final async = ref.watch(contactsProvider);

    // Pre-compute filtered list for count in AppBar.
    final filtered = async.whenOrNull(
      data: (list) => _filter(list, myId),
    );
    final count = filtered?.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(count != null ? 'Contacts ($count)' : 'Contacts'),
        actions: [
          // Add contact button
          IconButton(
            icon: const Icon(Icons.person_add_alt_1_rounded),
            tooltip: 'Add Contact',
            onPressed: () async {
              final id = await showContactForm(context);
              if (id != null && context.mounted) context.push('/contacts/$id');
            },
          ),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.tune_rounded),
                tooltip: 'Filters',
                onPressed: _showFilters,
              ),
              if (_activeFilters > 0)
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
                    child: Text('$_activeFilters',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ),
          // Sort dropdown
          PopupMenuButton<String>(
            icon: const Icon(Icons.swap_vert_rounded),
            tooltip: 'Sort',
            onSelected: (v) => setState(() => _sortType = v),
            itemBuilder: (_) => [
              for (final sort in const ['Oldest', 'Latest', 'Score', 'Name'])
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
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: TextField(
              controller: _search,
              onChanged: (v) => setState(() => _query = v),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search name or phone',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
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
        ),
      ),
      body: async.when(
        loading: () => const ConversationListSkeleton(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(contactsProvider.notifier).refresh(),
        ),
        data: (list) {
          final f = _filter(list, myId);
          return RefreshIndicator(
            onRefresh: () => ref.read(contactsProvider.notifier).refresh(),
            child: f.isEmpty
                ? ListView(
                    children: [
                      SizedBox(height: MediaQuery.of(context).size.height * 0.2),
                      AppEmptyState(
                        icon: Icons.contacts_outlined,
                        title: list.isEmpty ? 'No contacts' : 'No matches',
                        message: list.isEmpty
                            ? 'Add a lead with the + button.'
                            : 'Try a different search or filter.',
                      ),
                    ],
                  )
                : ListView.builder(
                    padding: const EdgeInsets.only(top: 4, bottom: 80),
                    itemCount: f.length,
                    itemBuilder: (context, i) {
                      final c = f[i];
                      return ContactTile(
                        contact: c,
                        onTap: () => context.push('/contacts/${c.id}'),
                      );
                    },
                  ),
          );
        },
      ),
    );
  }
}

/// Searchable chip list for campaign/agent filter in contacts.
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

// _FilterChip class removed
