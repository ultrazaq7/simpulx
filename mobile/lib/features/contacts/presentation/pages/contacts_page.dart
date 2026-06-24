import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/session/session_controller.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
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
  String _sortType = 'Latest';

  int get _activeFilters =>
      (_stage != null ? 1 : 0) + (_assignment != null ? 1 : 0);

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
      return matchesQuery &&
          matchesInterest &&
          matchesStage &&
          matchesAssignment;
    }).toList();

    if (_sortType == 'Score') {
      res.sort((a, b) => (b.leadScore ?? 0).compareTo(a.leadScore ?? 0));
    } else if (_sortType == 'Latest') {
      res.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
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
      builder: (_) => Consumer(
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
                            }),
                            child: const Text('Reset'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text('Sort by',
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final sort in const ['Latest', 'Score', 'Name'])
                            ChoiceChip(
                              label: Text(sort),
                              selected: _sortType == sort,
                              onSelected: (_) => update(() => _sortType = sort),
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
                              selectedColor:
                                  AppColors.forInterest(level).withValues(alpha: 0.16),
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
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(contactsProvider);
    final myId = ref.watch(sessionControllerProvider).user?.id;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Contacts'),
        actions: [
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
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final id = await showContactForm(context);
          if (id != null && context.mounted) context.push('/contacts/$id');
        },
        child: const Icon(Icons.person_add_alt_1_rounded),
      ),
      body: async.when(
        loading: () => const AppLoader(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(contactsProvider.notifier).refresh(),
        ),
        data: (list) {
          final filtered = _filter(list, myId);
          return RefreshIndicator(
            onRefresh: () => ref.read(contactsProvider.notifier).refresh(),
            child: filtered.isEmpty
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
                : ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox.shrink(),
                    itemBuilder: (context, i) {
                      final c = filtered[i];
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

// _FilterChip class removed
