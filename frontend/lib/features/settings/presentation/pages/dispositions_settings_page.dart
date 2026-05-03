// ============================================================
// Dispositions Settings Page -- CRUD
// ============================================================
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class DispositionsSettingsPage extends StatefulWidget {
  const DispositionsSettingsPage({super.key});
  @override
  State<DispositionsSettingsPage> createState() =>
      _DispositionsSettingsPageState();
}

class _DispositionsSettingsPageState extends State<DispositionsSettingsPage> {
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
      final resp = await _client.dio.get(ApiConstants.dispositions);
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
      await _client.dio.post(ApiConstants.dispositions, data: result);
      AppSnackbar.success(context, 'Disposition created');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _edit(Map<String, dynamic> item) async {
    final result = await _showEditDialog(context,
        name: item['name'] ?? '',
        description: item['description'] ?? '',
        groupName: item['groupName'] ?? '');
    if (result == null) return;
    try {
      await _client.dio
          .patch('${ApiConstants.dispositions}/${item['id']}', data: result);
      AppSnackbar.success(context, 'Disposition updated');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Disposition'),
        content:
            Text('Delete "${item['name']}"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style:
                  FilledButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _client.dio
          .delete('${ApiConstants.dispositions}/${item['id']}');
      AppSnackbar.success(context, 'Disposition deleted');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _toggle(Map<String, dynamic> item) async {
    try {
      await _client.dio.patch(
        '${ApiConstants.dispositions}/${item['id']}',
        data: {'isActive': !(item['isActive'] as bool? ?? true)},
      );
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                FilledButton.icon(
                  onPressed: _add,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add Disposition'),
                ),
              ],
            ),
          ),
          // Content
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.error_outline,
                                size: 48,
                                color: theme.colorScheme.error),
                            const SizedBox(height: 8),
                            Text(_error!,
                                style: TextStyle(
                                    color: theme.colorScheme.error)),
                            const SizedBox(height: 12),
                            OutlinedButton(
                                onPressed: _load,
                                child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _items.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.category_outlined,
                                    size: 64,
                                    color: theme.colorScheme.primary
                                        .withValues(alpha: 0.3)),
                                const SizedBox(height: 16),
                                const Text('No dispositions yet'),
                                const SizedBox(height: 8),
                                OutlinedButton.icon(
                                  onPressed: _add,
                                  icon: const Icon(Icons.add, size: 18),
                                  label: const Text('Add First Disposition'),
                                ),
                              ],
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _items.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final item = _items[i];
                              final isActive =
                                  item['isActive'] as bool? ?? true;
                              return Card(
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius:
                                      BorderRadius.circular(12),
                                  side: BorderSide(
                                      color: theme.dividerColor),
                                ),
                                child: ListTile(
                                  contentPadding:
                                      const EdgeInsets.symmetric(
                                          horizontal: 16, vertical: 4),
                                  leading: CircleAvatar(
                                    radius: 18,
                                    backgroundColor: isActive
                                        ? theme.colorScheme.primary
                                            .withValues(alpha: 0.1)
                                        : Colors.grey.withValues(alpha: 0.1),
                                    child: Icon(
                                      Icons.label_rounded,
                                      size: 18,
                                      color: isActive
                                          ? theme.colorScheme.primary
                                          : Colors.grey,
                                    ),
                                  ),
                                  title: Text(
                                    item['name'] ?? '',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: isActive
                                          ? null
                                          : theme.colorScheme.onSurface
                                              .withValues(alpha: 0.4),
                                    ),
                                  ),
                                  subtitle: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      if ((item['groupName'] as String?)?.isNotEmpty == true)
                                        Container(
                                          margin: const EdgeInsets.only(top: 2),
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: theme.colorScheme.primary.withValues(alpha: 0.08),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            item['groupName'],
                                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: theme.colorScheme.primary),
                                          ),
                                        ),
                                      if (item['description'] != null &&
                                          (item['description'] as String).isNotEmpty)
                                        Text(item['description'],
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: theme.colorScheme.onSurface
                                                    .withValues(alpha: 0.5))),
                                    ],
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Switch(
                                        value: isActive,
                                        onChanged: (_) =>
                                            _toggle(item),
                                      ),
                                      IconButton(
                                        icon: const Icon(
                                            Icons.edit_rounded,
                                            size: 18),
                                        onPressed: () => _edit(item),
                                      ),
                                      IconButton(
                                        icon: Icon(
                                            Icons.delete_rounded,
                                            size: 18,
                                            color: theme
                                                .colorScheme.error),
                                        onPressed: () =>
                                            _delete(item),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  Future<Map<String, String>?> _showEditDialog(
    BuildContext context, {
    String name = '',
    String description = '',
    String groupName = '',
  }) async {
    final nameCtrl = TextEditingController(text: name);
    final descCtrl = TextEditingController(text: description);
    final groupCtrl = TextEditingController(text: groupName);
    final isEdit = name.isNotEmpty;

    // Collect existing group names for autocomplete
    final existingGroups = _items
        .map((e) => e['groupName'] as String?)
        .where((g) => g != null && g.isNotEmpty)
        .toSet()
        .toList();

    return showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isEdit ? 'Edit Disposition' : 'New Disposition'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  hintText: 'e.g. Issue Resolved, Spam, Follow Up',
                ),
                autofocus: true,
              ),
              const SizedBox(height: 12),
              Autocomplete<String>(
                optionsBuilder: (v) => existingGroups
                    .where((g) => g!.toLowerCase().contains(v.text.toLowerCase()))
                    .cast<String>(),
                initialValue: TextEditingValue(text: groupName),
                onSelected: (v) => groupCtrl.text = v,
                fieldViewBuilder: (ctx, ctrl, fn, onSubmit) {
                  groupCtrl.addListener(() => ctrl.text = groupCtrl.text);
                  ctrl.addListener(() => groupCtrl.text = ctrl.text);
                  return TextField(
                    controller: ctrl,
                    focusNode: fn,
                    decoration: const InputDecoration(
                      labelText: 'Group (optional)',
                      hintText: 'e.g. Sales, Support, Conversion',
                    ),
                  );
                },
              ),
              const SizedBox(height: 12),
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
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (nameCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, {
                'name': nameCtrl.text.trim(),
                'description': descCtrl.text.trim(),
                'groupName': groupCtrl.text.trim(),
              });
            },
            child: Text(isEdit ? 'Save' : 'Create'),
          ),
        ],
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
