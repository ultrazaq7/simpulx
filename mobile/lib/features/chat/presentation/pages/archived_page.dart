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
class ArchivedPage extends ConsumerWidget {
  const ArchivedPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(conversationListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Archived')),
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
    );
  }
}
