import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../controllers/chat_providers.dart';

/// Streams a generated lead summary (SSE) into a scrollable sheet.
Future<void> showLeadSummary(BuildContext context, String conversationId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.6,
      child: _LeadSummarySheet(conversationId: conversationId),
    ),
  );
}

class _LeadSummarySheet extends ConsumerStatefulWidget {
  const _LeadSummarySheet({required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<_LeadSummarySheet> createState() => _LeadSummarySheetState();
}

class _LeadSummarySheetState extends ConsumerState<_LeadSummarySheet> {
  final _buffer = StringBuffer();
  StreamSubscription<String>? _sub;
  bool _streaming = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _sub = ref
        .read(chatRepositoryProvider)
        .streamSummary(widget.conversationId)
        .listen(
          (delta) => setState(() => _buffer.write(delta)),
          onError: (_) => setState(() {
            _failed = true;
            _streaming = false;
          }),
          onDone: () {
            if (mounted) setState(() => _streaming = false);
          },
          cancelOnError: true,
        );
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = _buffer.toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              const Icon(Icons.auto_awesome_outlined,
                  color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Text('Lead summary',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700)),
              const Spacer(),
              if (_streaming)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: _failed
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('Could not generate a summary right now.',
                        style: TextStyle(color: AppColors.textSecondary)),
                  ),
                )
              : (text.isEmpty && _streaming)
                  ? const Center(
                      child: Text('Reading the conversation...',
                          style: TextStyle(color: AppColors.textSecondary)),
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Text(text,
                          style: const TextStyle(fontSize: 14, height: 1.5)),
                    ),
        ),
      ],
    );
  }
}
