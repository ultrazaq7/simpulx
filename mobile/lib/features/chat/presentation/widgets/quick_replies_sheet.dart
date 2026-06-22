import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../controllers/chat_actions_providers.dart';

/// Bottom sheet listing the agent's quick replies. Resolves with the selected
/// body so the composer can insert it.
Future<String?> showQuickRepliesSheet(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const FractionallySizedBox(
      heightFactor: 0.7,
      child: _QuickRepliesSheet(),
    ),
  );
}

class _QuickRepliesSheet extends ConsumerWidget {
  const _QuickRepliesSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(quickRepliesProvider);
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Quick replies',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: async.when(
            loading: () =>
                const Center(child: CircularProgressIndicator(strokeWidth: 2)),
            error: (_, _) => const AppEmptyState(
              icon: Icons.bolt_outlined,
              title: 'Could not load',
              message: 'Pull to retry from the inbox.',
            ),
            data: (replies) {
              if (replies.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.bolt_outlined,
                  title: 'No quick replies',
                  message: 'Create them on the web to reuse here.',
                );
              }
              return ListView.separated(
                itemCount: replies.length,
                separatorBuilder: (_, _) =>
                    const Divider(height: 1, color: AppColors.border),
                itemBuilder: (context, i) {
                  final q = replies[i];
                  return ListTile(
                    title: Text(q.title.isNotEmpty ? q.title : q.shortcut),
                    subtitle: Text(
                      q.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                      child: Text(
                        q.shortcut.isNotEmpty
                            ? q.shortcut.substring(0, 1).toUpperCase()
                            : '/',
                        style: const TextStyle(
                            color: AppColors.primaryDark,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                    onTap: () => Navigator.of(context).pop(q.body),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
