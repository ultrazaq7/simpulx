import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class AssignConversationButton extends StatelessWidget {
  final ConversationEntity conversation;
  final bool compact;
  final bool filled;

  const AssignConversationButton({
    super.key,
    required this.conversation,
    this.compact = false,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    final role = _currentRole(context);
    if (!_canAssignConversations(role)) {
      return const SizedBox.shrink();
    }

    final isReassign = !conversation.isUnassigned;
    final label = compact
        ? (isReassign ? 'Reassign' : 'Assign')
        : (isReassign ? 'Reassign chat' : 'Assign chat');
    final icon = Icon(
      isReassign
          ? Icons.swap_horiz_rounded
          : Icons.person_add_alt_1_rounded,
      size: 16,
    );

    if (filled) {
      return FilledButton.icon(
        onPressed: () => showAssignDialog(context, conversation),
        icon: icon,
        label: Text(label),
        style: FilledButton.styleFrom(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 10 : 14,
            vertical: compact ? 8 : 11,
          ),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    }

    return OutlinedButton.icon(
      onPressed: () => showAssignDialog(context, conversation),
      icon: icon,
      label: Text(label),
      style: OutlinedButton.styleFrom(
        minimumSize: Size(0, compact ? 30 : 38),
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 14,
          vertical: compact ? 4 : 10,
        ),
        textStyle: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}

class ConversationAssignmentNotice extends StatelessWidget {
  final ConversationEntity conversation;

  const ConversationAssignmentNotice({
    super.key,
    required this.conversation,
  });

  @override
  Widget build(BuildContext context) {
    if (!conversation.isUnassigned) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final role = _currentRole(context);
    final canAssign = _canAssignConversations(role);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.07),
        border: Border(
          bottom: BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.route_rounded,
            size: 19,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              canAssign
                  ? 'Unassigned. Automation should route this chat when possible; assign manually for exceptions.'
                  : 'Unassigned. Automation routing is preferred for this chat.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.66),
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 2,
            ),
          ),
          if (canAssign) ...[
            const SizedBox(width: 12),
            AssignConversationButton(
              conversation: conversation,
              compact: true,
              filled: true,
            ),
          ],
        ],
      ),
    );
  }
}

String _currentRole(BuildContext context) {
  final state = context.watch<AuthBloc>().state;
  if (state is AuthAuthenticated) return state.session.user.role;
  return 'agent';
}

bool _canAssignConversations(String role) {
  // Mirrors the backend guard until permissions become server-provided claims.
  return role == 'owner' ||
      role == 'admin' ||
      role == 'manager' ||
      role == 'supervisor';
}

Future<void> showAssignDialog(
  BuildContext context,
  ConversationEntity conversation,
) async {
  final cubit = context.read<ConversationCubit>();
  final agentsFuture = cubit.loadAssignableAgents();
  String? selectedAgentId = conversation.assignedAgentId;
  String? errorMessage;
  var saving = false;

  await showDialog<void>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          final theme = Theme.of(dialogContext);

          Future<void> assign() async {
            if (selectedAgentId == null || saving) return;

            setDialogState(() {
              saving = true;
              errorMessage = null;
            });

            final error = await cubit.assignAgent(
              conversationId: conversation.id,
              agentId: selectedAgentId!,
            );

            if (!dialogContext.mounted) return;

            if (error == null) {
              Navigator.pop(dialogContext);
              if (context.mounted) {
                AppSnackbar.success(context,
                    conversation.isUnassigned
                        ? 'Conversation assigned'
                        : 'Conversation reassigned');
              }
              return;
            }

            setDialogState(() {
              saving = false;
              errorMessage = error;
            });
          }

          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            title: Text(conversation.isUnassigned
                ? 'Assign conversation'
                : 'Reassign conversation'),
            content: SizedBox(
              width: 420,
              child: FutureBuilder<List<AgentEntity>>(
                future: agentsFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }

                  if (snapshot.hasError) {
                    return Text(
                      'Could not load team members. ${snapshot.error}',
                      style: theme.textTheme.bodyMedium,
                    );
                  }

                  final agents = snapshot.data ?? const <AgentEntity>[];
                  if (agents.isEmpty) {
                    return const Text(
                      'No active agents are available. Automation can still route this conversation later.',
                    );
                  }

                  final agentIds = agents.map((a) => a.id).toSet();
                  // Reset selection if current agent not in list
                  if (selectedAgentId != null &&
                      !agentIds.contains(selectedAgentId)) {
                    selectedAgentId = null;
                  }

                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Automation is preferred for routing. Use manual assignment for urgent handoffs or exceptions.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.58),
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        value: selectedAgentId,
                        decoration: const InputDecoration(
                          labelText: 'Team member',
                          prefixIcon:
                              Icon(Icons.support_agent_rounded, size: 20),
                        ),
                        items: agents
                            .map(
                              (agent) => DropdownMenuItem<String>(
                                value: agent.id,
                                child: Text(agent.fullName),
                              ),
                            )
                            .toList(),
                        onChanged: saving
                            ? null
                            : (value) => setDialogState(
                                  () => selectedAgentId = value,
                                ),
                      ),
                      if (errorMessage != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          errorMessage!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.error,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
            actions: [
              TextButton(
                onPressed: saving ? null : () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: selectedAgentId == null || saving ? null : assign,
                child: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Assign'),
              ),
            ],
          );
        },
      );
    },
  );
}
