import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/widgets/app_empty_state.dart';
import '../../domain/entities/lead_lookups.dart';
import '../controllers/chat_actions_providers.dart';
import '../controllers/chat_thread_controller.dart';

/// "Send template" wizard: pick an approved template, preview it WhatsApp-style,
/// then send. The rendered body is sent as a message (matches the web flow).
Future<void> showTemplatePicker(BuildContext context, String conversationId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.88,
      child: _TemplateWizard(conversationId: conversationId),
    ),
  );
}

class _TemplateWizard extends ConsumerStatefulWidget {
  const _TemplateWizard({required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<_TemplateWizard> createState() => _TemplateWizardState();
}

class _TemplateWizardState extends ConsumerState<_TemplateWizard> {
  MessageTemplate? _selected;

  void _send() {
    final t = _selected;
    if (t == null) return;
    ref
        .read(chatThreadControllerProvider(widget.conversationId))
        .send(t.rendered);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(templatesProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              if (_selected != null)
                IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => setState(() => _selected = null),
                ),
              const Icon(Icons.description_outlined,
                  color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Text(_selected == null ? 'Send template' : 'Preview',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: async.when(
            loading: () =>
                const Center(child: CircularProgressIndicator(strokeWidth: 2)),
            error: (_, _) => const AppEmptyState(
              icon: Icons.description_outlined,
              title: 'Could not load templates',
            ),
            data: (templates) {
              if (templates.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.description_outlined,
                  title: 'No templates',
                  message: 'Create message templates on the web dashboard.',
                );
              }
              return _selected == null
                  ? _list(templates)
                  : _preview(_selected!);
            },
          ),
        ),
      ],
    );
  }

  Widget _list(List<MessageTemplate> templates) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: templates.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, i) {
        final t = templates[i];
        return ListTile(
          title: Row(
            children: [
              Flexible(
                child: Text(t.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 6),
              _StatusDot(approved: t.isApproved),
              const SizedBox(width: 4),
              Text(t.language.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textMuted)),
            ],
          ),
          subtitle: Text(t.rendered,
              maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: () => setState(() => _selected = t),
        );
      },
    );
  }

  Widget _preview(MessageTemplate t) {
    return Column(
      children: [
        Expanded(
          child: Container(
            width: double.infinity,
            color: const Color(0xFF0B141A),
            padding: const EdgeInsets.all(20),
            child: Align(
              alignment: Alignment.topRight,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 320),
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF005C4B),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(12),
                    topRight: Radius.circular(12),
                    bottomLeft: Radius.circular(12),
                    bottomRight: Radius.circular(4),
                  ),
                ),
                child: Text(t.rendered,
                    style: const TextStyle(color: Colors.white, fontSize: 15)),
              ),
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _send,
                icon: const Icon(Icons.send_rounded, size: 18),
                label: Text('Use "${t.name}"'),
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50)),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.approved});
  final bool approved;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(
        color: approved ? AppColors.success : AppColors.warning,
        shape: BoxShape.circle,
      ),
    );
  }
}
