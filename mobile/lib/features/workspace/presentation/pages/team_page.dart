import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../../chat/presentation/controllers/chat_actions_providers.dart';

/// Team roster with presence + open-conversation load (reuses `/api/agents`).
class TeamPage extends ConsumerWidget {
  const TeamPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(agentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Team')),
      body: async.when(
        loading: () => const AppLoader(),
        error: (e, _) => AppErrorView(
          failure: e is Failure ? e : null,
          onRetry: () => ref.invalidate(agentsProvider),
        ),
        data: (agents) {
          if (agents.isEmpty) {
            return const AppEmptyState(
              icon: Icons.groups_outlined,
              title: 'No team members',
            );
          }
          final online = agents.where((a) => a.isOnline).length;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('$online of ${agents.length} online',
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 13)),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: agents.length,
                  separatorBuilder: (_, _) =>
                      const Divider(height: 1, indent: 68, color: AppColors.border),
                  itemBuilder: (context, i) {
                    final a = agents[i];
                    return ListTile(
                      leading: Stack(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundColor:
                                AppColors.primary.withValues(alpha: 0.12),
                            child: Text(
                              a.name.isNotEmpty
                                  ? a.name.substring(0, 1).toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                  color: AppColors.primaryDark,
                                  fontWeight: FontWeight.w700),
                            ),
                          ),
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(
                                color: a.isOnline
                                    ? AppColors.success
                                    : AppColors.textMuted,
                                shape: BoxShape.circle,
                                border:
                                    Border.all(color: Colors.white, width: 2),
                              ),
                            ),
                          ),
                        ],
                      ),
                      title: Text(a.name,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(a.isOnline ? 'Online' : 'Offline'),
                      trailing: Text('${a.openCount} open',
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 13)),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
