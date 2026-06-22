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

/// The inbox: realtime conversation list with search + pull-to-refresh.
class ChatListPage extends ConsumerStatefulWidget {
  const ChatListPage({super.key});

  @override
  ConsumerState<ChatListPage> createState() => _ChatListPageState();
}

class _ChatListPageState extends ConsumerState<ChatListPage> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Conversation> _filter(List<Conversation> list, InboxFilter filter) {
    final q = _query.toLowerCase();
    return list.where((c) {
      final matchesSearch = q.isEmpty ||
          c.contactName.toLowerCase().contains(q) ||
          c.contactPhone.toLowerCase().contains(q);
      return matchesSearch && filter.matches(c);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(conversationListProvider);
    final filter = ref.watch(inboxFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chats'),
        actions: const [_RealtimeDot(), SizedBox(width: 12)],
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
        loading: () => const AppLoader(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(conversationListProvider.notifier).refresh(),
        ),
        data: (list) {
          final filtered = _filter(list, filter);
          return Column(
            children: [
              if (filter != InboxFilter.all)
                _FilterBanner(
                  filter: filter,
                  onClear: () => ref
                      .read(inboxFilterProvider.notifier)
                      .clear(),
                ),
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
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: 76,
                      color: AppColors.border,
                    ),
                    itemBuilder: (context, i) {
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

class _FilterBanner extends StatelessWidget {
  const _FilterBanner({required this.filter, required this.onClear});
  final InboxFilter filter;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.primary.withValues(alpha: 0.08),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.filter_alt_rounded,
              size: 16, color: AppColors.primary),
          const SizedBox(width: 6),
          Text('Filtered: ${filter.label}',
              style: const TextStyle(
                  color: AppColors.primaryDark,
                  fontWeight: FontWeight.w600,
                  fontSize: 13)),
          const Spacer(),
          GestureDetector(
            onTap: onClear,
            child: const Text('Clear',
                style: TextStyle(
                    color: AppColors.primary, fontWeight: FontWeight.w700)),
          ),
        ],
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
