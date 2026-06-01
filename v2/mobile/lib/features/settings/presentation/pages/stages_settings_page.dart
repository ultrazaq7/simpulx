// ============================================================
// Stages Settings Page - CRUD with category + color
// ============================================================
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

const List<String> _kStagePalette = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#64748B', // slate
];

const Map<String, String> _kCategoryLabels = {
  'progressing': 'Progressing Stage',
  'won': 'Won Stage',
  'lost': 'Lost Stage',
};

Color _hexToColor(String hex) {
  var h = hex.replaceAll('#', '');
  if (h.length == 6) h = 'FF$h';
  return Color(int.parse(h, radix: 16));
}

class StagesSettingsPage extends StatefulWidget {
  const StagesSettingsPage({super.key});
  @override
  State<StagesSettingsPage> createState() => _StagesSettingsPageState();
}

class _StagesSettingsPageState extends State<StagesSettingsPage> {
  final _client = di.sl<DioClient>();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await _client.dio.get(ApiConstants.stages);
      final list = (resp.data as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _items = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = _extractError(e);
        _loading = false;
      });
    }
  }

  Future<void> _add() async {
    final result = await _showEditDialog(context);
    if (result == null) return;
    try {
      await _client.dio.post(ApiConstants.stages, data: result);
      if (!mounted) return;
      AppSnackbar.success(context, 'Stage created');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _edit(Map<String, dynamic> item) async {
    final result = await _showEditDialog(
      context,
      name: item['name'] ?? '',
      description: item['description'] ?? '',
      color: item['color'] ?? _kStagePalette.first,
      category: item['category'] ?? 'progressing',
    );
    if (result == null) return;
    try {
      await _client.dio
          .patch('${ApiConstants.stages}/${item['id']}', data: result);
      if (!mounted) return;
      AppSnackbar.success(context, 'Stage updated');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Stage'),
        content: Text('Delete "${item['name']}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _client.dio.delete('${ApiConstants.stages}/${item['id']}');
      if (!mounted) return;
      AppSnackbar.success(context, 'Stage deleted');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _toggle(Map<String, dynamic> item) async {
    try {
      await _client.dio.patch(
        '${ApiConstants.stages}/${item['id']}',
        data: {'isActive': !(item['isActive'] as bool? ?? true)},
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _reorderWithinCategory(
    String category,
    int oldIndex,
    int newIndex,
  ) async {
    final categoryItems = _items.where((e) => e['category'] == category).toList()
      ..sort((a, b) => (a['sortOrder'] ?? 0).compareTo(b['sortOrder'] ?? 0));
    if (newIndex > oldIndex) newIndex -= 1;
    final moved = categoryItems.removeAt(oldIndex);
    categoryItems.insert(newIndex, moved);

    // Reassign sortOrder locally for instant feedback
    setState(() {
      for (var i = 0; i < categoryItems.length; i++) {
        categoryItems[i]['sortOrder'] = i;
      }
    });

    // Persist new sortOrder for each affected stage
    try {
      await Future.wait(categoryItems.asMap().entries.map((e) {
        return _client.dio.patch(
          '${ApiConstants.stages}/${e.value['id']}',
          data: {'sortOrder': e.key},
        );
      }));
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, _extractError(e));
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final progressing = _items.where((e) => e['category'] == 'progressing').toList()
      ..sort((a, b) => (a['sortOrder'] ?? 0).compareTo(b['sortOrder'] ?? 0));
    final won = _items.where((e) => e['category'] == 'won').toList()
      ..sort((a, b) => (a['sortOrder'] ?? 0).compareTo(b['sortOrder'] ?? 0));
    final lost = _items.where((e) => e['category'] == 'lost').toList()
      ..sort((a, b) => (a['sortOrder'] ?? 0).compareTo(b['sortOrder'] ?? 0));

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                FilledButton.icon(
                  onPressed: _add,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add Stage'),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? _ErrorState(message: _error!, onRetry: _load)
                    : _items.isEmpty
                        ? _EmptyState(onAdd: _add)
                        : SingleChildScrollView(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _CategorySection(
                                  label: _kCategoryLabels['progressing']!,
                                  items: progressing,
                                  onReorder: (o, n) =>
                                      _reorderWithinCategory('progressing', o, n),
                                  onEdit: _edit,
                                  onDelete: _delete,
                                  onToggle: _toggle,
                                ),
                                const SizedBox(height: 24),
                                _CategorySection(
                                  label: _kCategoryLabels['won']!,
                                  items: won,
                                  onReorder: (o, n) =>
                                      _reorderWithinCategory('won', o, n),
                                  onEdit: _edit,
                                  onDelete: _delete,
                                  onToggle: _toggle,
                                ),
                                const SizedBox(height: 24),
                                _CategorySection(
                                  label: _kCategoryLabels['lost']!,
                                  items: lost,
                                  onReorder: (o, n) =>
                                      _reorderWithinCategory('lost', o, n),
                                  onEdit: _edit,
                                  onDelete: _delete,
                                  onToggle: _toggle,
                                ),
                              ],
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Future<Map<String, dynamic>?> _showEditDialog(
    BuildContext context, {
    String name = '',
    String description = '',
    String color = '',
    String category = 'progressing',
  }) async {
    final nameCtrl = TextEditingController(text: name);
    final descCtrl = TextEditingController(text: description);
    var selectedColor = color.isNotEmpty ? color : _kStagePalette.first;
    var selectedCategory = category;
    final isEdit = name.isNotEmpty;

    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(isEdit ? 'Edit Stage' : 'New Stage'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Name *',
                    hintText: 'e.g. Hot Lead, Demo Booked, Spam',
                  ),
                  autofocus: true,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Category *',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 6),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'progressing',
                      label: Text('Progressing'),
                      icon: Icon(Icons.trending_up_rounded, size: 16),
                    ),
                    ButtonSegment(
                      value: 'won',
                      label: Text('Won'),
                      icon: Icon(Icons.emoji_events_rounded, size: 16),
                    ),
                    ButtonSegment(
                      value: 'lost',
                      label: Text('Lost'),
                      icon: Icon(Icons.cancel_outlined, size: 16),
                    ),
                  ],
                  selected: {selectedCategory},
                  onSelectionChanged: (s) =>
                      setLocal(() => selectedCategory = s.first),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Color *',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _kStagePalette.map((hex) {
                    final isSelected = hex == selectedColor;
                    return GestureDetector(
                      onTap: () => setLocal(() => selectedColor = hex),
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: _hexToColor(hex),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: isSelected
                                ? Theme.of(ctx).colorScheme.primary
                                : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: isSelected
                            ? const Icon(Icons.check, size: 16, color: Colors.white)
                            : null,
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: descCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                  ),
                  maxLines: 2,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop<Map<String, dynamic>>(ctx, {
                  'name': nameCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                  'color': selectedColor,
                  'category': selectedCategory,
                });
              },
              child: Text(isEdit ? 'Save' : 'Create'),
            ),
          ],
        ),
      ),
    );
  }

  String _extractError(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map<String, dynamic> && data.containsKey('message')) {
        return data['message'].toString();
      }
      return e.message ?? 'Connection error';
    }
    return e.toString();
  }
}

// ── Category section with reorderable list ──────────────────
class _CategorySection extends StatelessWidget {
  final String label;
  final List<Map<String, dynamic>> items;
  final void Function(int oldIndex, int newIndex) onReorder;
  final void Function(Map<String, dynamic>) onEdit;
  final void Function(Map<String, dynamic>) onDelete;
  final void Function(Map<String, dynamic>) onToggle;

  const _CategorySection({
    required this.label,
    required this.items,
    required this.onReorder,
    required this.onEdit,
    required this.onDelete,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            label.toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'No stages in this category yet',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                fontStyle: FontStyle.italic,
              ),
            ),
          )
        else
          ReorderableListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            buildDefaultDragHandles: false,
            itemCount: items.length,
            onReorder: onReorder,
            itemBuilder: (context, i) {
              final item = items[i];
              return _StageRow(
                key: ValueKey(item['id']),
                index: i,
                item: item,
                onEdit: onEdit,
                onDelete: onDelete,
                onToggle: onToggle,
              );
            },
          ),
      ],
    );
  }
}

class _StageRow extends StatelessWidget {
  final int index;
  final Map<String, dynamic> item;
  final void Function(Map<String, dynamic>) onEdit;
  final void Function(Map<String, dynamic>) onDelete;
  final void Function(Map<String, dynamic>) onToggle;

  const _StageRow({
    super.key,
    required this.index,
    required this.item,
    required this.onEdit,
    required this.onDelete,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isActive = item['isActive'] as bool? ?? true;
    final color = _hexToColor(item['color'] ?? '#3B82F6');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: theme.dividerColor),
        ),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          leading: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ReorderableDragStartListener(
                index: index,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4),
                  child: Icon(Icons.drag_indicator, size: 18, color: Colors.grey),
                ),
              ),
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: isActive ? color : color.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ],
          ),
          title: Text(
            item['name'] ?? '',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: isActive
                  ? null
                  : theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
          subtitle: (item['description'] != null &&
                  (item['description'] as String).isNotEmpty)
              ? Text(
                  item['description'],
                  style: TextStyle(
                    fontSize: 12,
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                )
              : null,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Switch(
                value: isActive,
                onChanged: (_) => onToggle(item),
              ),
              IconButton(
                icon: const Icon(Icons.edit_rounded, size: 18),
                onPressed: () => onEdit(item),
              ),
              IconButton(
                icon: Icon(Icons.delete_rounded,
                    size: 18, color: theme.colorScheme.error),
                onPressed: () => onDelete(item),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 8),
          Text(message, style: TextStyle(color: theme.colorScheme.error)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyState({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.layers_outlined,
            size: 64,
            color: theme.colorScheme.primary.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 16),
          const Text('No stages yet'),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add First Stage'),
          ),
        ],
      ),
    );
  }
}
