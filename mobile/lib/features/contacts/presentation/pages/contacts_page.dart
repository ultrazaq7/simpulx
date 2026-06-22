import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
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

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Contact> _filter(List<Contact> list) {
    final q = _query.toLowerCase();
    return list.where((c) {
      final matchesQuery = q.isEmpty ||
          c.fullName.toLowerCase().contains(q) ||
          c.phone.toLowerCase().contains(q);
      final matchesInterest = _interest == null || c.interestLevel == _interest;
      return matchesQuery && matchesInterest;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(contactsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Contacts'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(98),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: TextField(
                  controller: _search,
                  onChanged: (v) => setState(() => _query = v),
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
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    _FilterChip(
                      label: 'All',
                      selected: _interest == null,
                      onTap: () => setState(() => _interest = null),
                    ),
                    for (final level in const ['hot', 'warm', 'cold'])
                      _FilterChip(
                        label: level[0].toUpperCase() + level.substring(1),
                        color: AppColors.forInterest(level),
                        selected: _interest == level,
                        onTap: () => setState(() => _interest = level),
                      ),
                  ],
                ),
              ),
            ],
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
          final filtered = _filter(list);
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
                    separatorBuilder: (_, _) => const Divider(
                        height: 1, indent: 70, color: AppColors.border),
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

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: c.withValues(alpha: 0.16),
        onSelected: (_) => onTap(),
      ),
    );
  }
}
