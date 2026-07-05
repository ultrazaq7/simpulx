import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_skeleton.dart';
import '../controllers/conversation_list_controller.dart';
import '../widgets/conversation_tile.dart';

/// WhatsApp-style "Archived" view: the leads marked Lost, kept out of the main
/// inbox but never deleted.
class ArchivedPage extends ConsumerStatefulWidget {
  const ArchivedPage({super.key});

  @override
  ConsumerState<ArchivedPage> createState() => _ArchivedPageState();
}

class _ArchivedPageState extends ConsumerState<ArchivedPage> {
  final _scroll = ScrollController();
  bool _showScrollToTop = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    final shouldShow = _scroll.offset > 400;
    if (_showScrollToTop != shouldShow) {
      setState(() => _showScrollToTop = shouldShow);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(conversationListProvider);
    final count = async.whenOrNull(
      data: (list) => list.where((c) => c.isLost).length,
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(count != null ? 'Archived ($count)' : 'Archived'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1),
        ),
      ),
      body: async.when(
        loading: () => const ConversationListSkeleton(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.read(conversationListProvider.notifier).refresh(),
        ),
        data: (list) {
          final lost = list.where((c) => c.isLost).toList()
            ..sort((a, b) => (b.lastMessageAt ?? DateTime(0))
                .compareTo(a.lastMessageAt ?? DateTime(0)));
          if (lost.isEmpty) {
            return ListView(
              controller: _scroll,
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.of(context).size.height * 0.2),
                const AppEmptyState(
                  icon: Icons.archive_outlined,
                  title: 'Nothing archived',
                  message: 'Leads you mark as Lost are kept here.',
                ),
              ],
            );
          }
          return RefreshIndicator(
            onRefresh: () =>
                ref.read(conversationListProvider.notifier).refresh(),
            child: ListView.builder(
              controller: _scroll,
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: lost.length,
              itemBuilder: (context, i) {
                final c = lost[i];
                return ConversationTile(
                  conversation: c,
                  onTap: () => context.push('/chat/${c.id}', extra: c),
                );
              },
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
