// ============================================================
// Quick Replies Page - Canned Response Management
// ============================================================
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/quick_replies/presentation/bloc/quick_replies_cubit.dart';
import 'package:simpulx/features/quick_replies/domain/entities/quick_reply_entity.dart';

class QuickRepliesPage extends StatefulWidget {
  const QuickRepliesPage({super.key});

  @override
  State<QuickRepliesPage> createState() => _QuickRepliesPageState();
}

class _QuickRepliesPageState extends State<QuickRepliesPage> {
  final _searchController = TextEditingController();
  int _page = 1;
  static const int _pageSize = 10;

  @override
  void initState() {
    super.initState();
    context.read<QuickRepliesCubit>().loadReplies();
    context.read<QuickRepliesCubit>().loadCategories();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showAddEditDialog({QuickReplyEntity? existing}) {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final contentCtrl = TextEditingController(text: existing?.content ?? '');
    final shortcutCtrl = TextEditingController(text: existing?.shortcut ?? '');
    final categoryCtrl = TextEditingController(text: existing?.category ?? '');
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;

    Widget formContent(BuildContext ctx) {
      final theme = Theme.of(ctx);
      return Padding(
        padding: EdgeInsets.only(
          left: 24, right: 24, top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              existing != null ? 'Edit Quick Reply' : 'New Quick Reply',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: titleCtrl,
              decoration: InputDecoration(
                labelText: 'Title *',
                hintText: 'e.g., Greeting',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: contentCtrl,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: 'Message Content *',
                hintText: 'Hello! How can I help you today?',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: shortcutCtrl,
              decoration: InputDecoration(
                labelText: 'Shortcut',
                hintText: '/hello',
                prefixIcon: const Icon(Icons.bolt_rounded, size: 18),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: categoryCtrl,
              decoration: InputDecoration(
                labelText: 'Category',
                hintText: 'General',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  icon: Icon(existing != null ? Icons.save_rounded : Icons.add_rounded, size: 18),
                  label: Text(existing != null ? 'Save' : 'Create'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(ctx).colorScheme.primary,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () async {
                    if (titleCtrl.text.isEmpty || contentCtrl.text.isEmpty) return;
                    final cubit = context.read<QuickRepliesCubit>();
                    bool success;
                    if (existing != null) {
                      success = await cubit.updateReply(existing.id, {
                        'title': titleCtrl.text,
                        'content': contentCtrl.text,
                        'shortcut': shortcutCtrl.text.isEmpty ? null : shortcutCtrl.text,
                        'category': categoryCtrl.text.isEmpty ? null : categoryCtrl.text,
                      });
                    } else {
                      success = await cubit.createReply(
                        title: titleCtrl.text,
                        content: contentCtrl.text,
                        shortcut: shortcutCtrl.text.isEmpty ? null : shortcutCtrl.text,
                        category: categoryCtrl.text.isEmpty ? null : categoryCtrl.text,
                      );
                    }
                    if (success && ctx.mounted) {
                      if (mounted) {
                        setState(() {
                          _page = 1;
                        });
                      }
                      Navigator.pop(ctx);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      );
    }

    if (isDesktop) {
      showDialog(
        context: context,
        builder: (ctx) => Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: SizedBox(width: 480, child: formContent(ctx)),
        ),
      );
    } else {
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => SingleChildScrollView(child: formContent(ctx)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;

    return Scaffold(
      body: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    isDesktop
                        ? FilledButton.icon(
                            icon: const Icon(Icons.add_rounded, size: 18),
                            label: const Text('New Reply'),
                            style: FilledButton.styleFrom(
                              backgroundColor: theme.colorScheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            onPressed: () => _showAddEditDialog(),
                          )
                        : IconButton(
                            onPressed: () => _showAddEditDialog(),
                            icon: Icon(Icons.add_circle_rounded, color: theme.colorScheme.primary, size: 28),
                          ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 40,
                  child: TextField(
                    controller: _searchController,
                    onChanged: (v) {
                      setState(() {
                        _page = 1;
                      });
                      context.read<QuickRepliesCubit>().loadReplies(search: v);
                    },
                    decoration: InputDecoration(
                      hintText: isDesktop ? 'Search by title, content, or shortcut...' : 'Search...',
                      prefixIcon: const Icon(Icons.search_rounded, size: 18),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: BlocBuilder<QuickRepliesCubit, QuickRepliesState>(
              builder: (context, state) {
                if (state.isLoading && state.replies.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (state.replies.isEmpty) {
                  return _buildEmptyState(context);
                }
                return _buildRepliesBody(context, state.replies);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRepliesBody(BuildContext context, List<QuickReplyEntity> replies) {
    final theme = Theme.of(context);
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;

    if (!isDesktop) {
      return ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: replies.length,
        itemBuilder: (context, index) => _buildReplyCard(context, theme, replies[index]),
      );
    }

    final totalPages = (replies.length / _pageSize).ceil().clamp(1, 9999);
    final currentPage = _page > totalPages ? totalPages : _page;
    final startIndex = (currentPage - 1) * _pageSize;
    final endIndex = (startIndex + _pageSize).clamp(0, replies.length);
    final pagedReplies = replies.sublist(startIndex, endIndex);

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('Title')),
                  DataColumn(label: Text('Shortcut')),
                  DataColumn(label: Text('Category')),
                  DataColumn(label: Text('Message')),
                  DataColumn(label: Text('Action')),
                ],
                rows: pagedReplies.map((reply) {
                  return DataRow(
                    cells: [
                      DataCell(Text(
                        reply.title,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      )),
                      DataCell(Text(reply.shortcut ?? '-')),
                      DataCell(Text(reply.category ?? '-')),
                      DataCell(
                        SizedBox(
                          width: 420,
                          child: Text(
                            reply.content,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      DataCell(
                        PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'edit') {
                              _showAddEditDialog(existing: reply);
                            }
                            if (value == 'delete') {
                              context
                                  .read<QuickRepliesCubit>()
                                  .deleteReply(reply.id)
                                  .then((success) {
                                if (success && mounted) {
                                  setState(() {
                                    _page = 1;
                                  });
                                }
                              });
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit')),
                            PopupMenuItem(value: 'delete', child: Text('Delete')),
                          ],
                        ),
                      ),
                    ],
                  );
                }).toList(),
              ),
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(top: BorderSide(color: theme.dividerColor)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                '${replies.isEmpty ? 0 : startIndex + 1}-${endIndex} of ${replies.length}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withOpacity(0.6),
                ),
              ),
              const SizedBox(width: 12),
              IconButton(
                onPressed: currentPage > 1
                    ? () => setState(() => _page = currentPage - 1)
                    : null,
                icon: const Icon(Icons.chevron_left_rounded),
              ),
              IconButton(
                onPressed: currentPage < totalPages
                    ? () => setState(() => _page = currentPage + 1)
                    : null,
                icon: const Icon(Icons.chevron_right_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildReplyCard(BuildContext context, ThemeData theme, QuickReplyEntity qr) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.quickreply_rounded, size: 16, color: Color(0xFF3B82F6)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(qr.title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                  ),
                  PopupMenuButton<String>(
                    icon: Icon(Icons.more_vert, size: 18, color: theme.colorScheme.onSurface.withOpacity(0.4)),
                    onSelected: (v) {
                      if (v == 'edit') _showAddEditDialog(existing: qr);
                      if (v == 'delete') context.read<QuickRepliesCubit>().deleteReply(qr.id);
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'edit', child: Text('Edit')),
                      const PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                qr.content,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.6)),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (qr.shortcut != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2D9CDB).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(qr.shortcut!, style: const TextStyle(fontSize: 11, color: Color(0xFF2D9CDB), fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 8),
                  ],
                  if (qr.category != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(qr.category!, style: TextStyle(fontSize: 11, color: theme.colorScheme.primary)),
                    ),
                ],
              ),
            ],
          ),
        );
  }

  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFF3B82F6).withOpacity(0.1)),
            child: const Icon(Icons.quickreply_rounded, size: 48, color: Color(0xFF3B82F6)),
          ),
          const SizedBox(height: 20),
          Text('No quick replies yet', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Create canned responses to speed up\nyour messaging workflow.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5)), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.icon(
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Create First Reply'),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onPressed: () => _showAddEditDialog(),
          ),
        ],
      ),
    );
  }
}
