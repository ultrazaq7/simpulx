// ============================================================
// Publishers Settings Page -- CRUD
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class PublishersSettingsPage extends StatefulWidget {
  const PublishersSettingsPage({super.key});
  @override
  State<PublishersSettingsPage> createState() => _PublishersSettingsPageState();
}

class _PublishersSettingsPageState extends State<PublishersSettingsPage> {
  final _client = di.sl<DioClient>();
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _departments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _client.dio.get(ApiConstants.publishers),
        _client.dio.get(ApiConstants.departments),
      ]);
      setState(() {
        _items = (results[0].data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _departments = (results[1].data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = _extractError(e); _loading = false; });
    }
  }

  Future<void> _add() async {
    final result = await _showEditDialog(context);
    if (result == null) return;
    try {
      await _client.dio.post(ApiConstants.publishers, data: result);
      AppSnackbar.success(context, 'Publisher created');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _edit(Map<String, dynamic> item) async {
    final result = await _showEditDialog(context, item: item);
    if (result == null) return;
    try {
      await _client.dio.patch(ApiConstants.publisher(item['id']), data: result);
      AppSnackbar.success(context, 'Publisher updated');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Publisher'),
        content: Text('Delete "${item['name']}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
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
      await _client.dio.delete(ApiConstants.publisher(item['id']));
      AppSnackbar.success(context, 'Publisher deleted');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _toggle(Map<String, dynamic> item) async {
    try {
      await _client.dio.patch(
        ApiConstants.publisher(item['id']),
        data: {'isActive': !(item['isActive'] as bool? ?? true)},
      );
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _regenerateKey(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Regenerate API Key'),
        content: const Text('This will invalidate the current key. Continue?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Regenerate')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _client.dio.post(ApiConstants.publisherRegenKey(item['id']));
      AppSnackbar.success(context, 'API key regenerated');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  void _copyKey(String key) {
    Clipboard.setData(ClipboardData(text: key));
    AppSnackbar.success(context, 'API key copied');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
            child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              FilledButton.icon(onPressed: _add, icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add Publisher')),
            ]),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
                        const SizedBox(height: 8),
                        Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _load, child: const Text('Retry')),
                      ]))
                    : _items.isEmpty
                        ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.rss_feed_rounded, size: 64, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                            const SizedBox(height: 16),
                            const Text('No publishers yet'),
                            const SizedBox(height: 8),
                            OutlinedButton.icon(onPressed: _add, icon: const Icon(Icons.add, size: 18), label: const Text('Add First Publisher')),
                          ]))
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _items.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final item = _items[i];
                              final isActive = item['isActive'] as bool? ?? true;
                              final apiKey = item['apiKey'] as String? ?? '';
                              final deptName = _departments.where((d) => d['id'] == item['autoAssignDeptId']).map((d) => d['name']).firstOrNull;
                              return Card(
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: theme.dividerColor)),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Row(children: [
                                      CircleAvatar(
                                        radius: 18,
                                        backgroundColor: isActive ? theme.colorScheme.primary.withValues(alpha: 0.1) : Colors.grey.withValues(alpha: 0.1),
                                        child: Icon(Icons.rss_feed_rounded, size: 18, color: isActive ? theme.colorScheme.primary : Colors.grey),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                        Text(item['name'] ?? '', style: TextStyle(fontWeight: FontWeight.w600, color: isActive ? null : theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                                        if (item['slug'] != null) Text('slug: ${item['slug']}', style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                                      ])),
                                      Switch(value: isActive, onChanged: (_) => _toggle(item)),
                                      IconButton(icon: const Icon(Icons.edit_rounded, size: 18), onPressed: () => _edit(item)),
                                      IconButton(icon: Icon(Icons.delete_rounded, size: 18, color: theme.colorScheme.error), onPressed: () => _delete(item)),
                                    ]),
                                    const SizedBox(height: 10),
                                    // API Key row
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Row(children: [
                                        const Icon(Icons.key_rounded, size: 14, color: Color(0xFF9CA3AF)),
                                        const SizedBox(width: 6),
                                        Expanded(child: Text(
                                          '${apiKey.substring(0, apiKey.length > 8 ? 8 : apiKey.length)}${'•' * 24}',
                                          style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: Color(0xFF6B7280)),
                                        )),
                                        IconButton(
                                          icon: const Icon(Icons.copy_rounded, size: 14),
                                          onPressed: () => _copyKey(apiKey),
                                          tooltip: 'Copy API Key',
                                          constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                                          padding: EdgeInsets.zero,
                                        ),
                                        IconButton(
                                          icon: const Icon(Icons.refresh_rounded, size: 14),
                                          onPressed: () => _regenerateKey(item),
                                          tooltip: 'Regenerate Key',
                                          constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                                          padding: EdgeInsets.zero,
                                        ),
                                      ]),
                                    ),
                                    const SizedBox(height: 6),
                                    // Info chips
                                    Wrap(spacing: 8, runSpacing: 4, children: [
                                      if (deptName != null) _infoChip(Icons.business_rounded, 'Dept: $deptName', theme),
                                      if (item['autoTemplateName'] != null && (item['autoTemplateName'] as String).isNotEmpty)
                                        _infoChip(Icons.article_rounded, 'Template: ${item['autoTemplateName']}', theme),
                                      if (item['webhookUrl'] != null && (item['webhookUrl'] as String).isNotEmpty)
                                        _infoChip(Icons.webhook_rounded, 'Webhook', theme),
                                    ]),
                                  ]),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  Widget _infoChip(IconData icon, String label, ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: theme.colorScheme.primary),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 11, color: theme.colorScheme.primary, fontWeight: FontWeight.w500)),
      ]),
    );
  }

  Future<Map<String, dynamic>?> _showEditDialog(BuildContext context, {Map<String, dynamic>? item}) async {
    final nameCtrl = TextEditingController(text: item?['name'] ?? '');
    final slugCtrl = TextEditingController(text: item?['slug'] ?? '');
    final templateCtrl = TextEditingController(text: item?['autoTemplateName'] ?? '');
    final webhookCtrl = TextEditingController(text: item?['webhookUrl'] ?? '');
    String? selectedDeptId = item?['autoAssignDeptId'];
    final isEdit = item != null;

    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDialogState) {
        return AlertDialog(
          title: Text(isEdit ? 'Edit Publisher' : 'New Publisher'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name'), autofocus: true),
              const SizedBox(height: 12),
              TextField(controller: slugCtrl, decoration: const InputDecoration(labelText: 'Slug (optional)', hintText: 'auto-generated from name')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                value: selectedDeptId,
                decoration: const InputDecoration(labelText: 'Auto-assign Department'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('None')),
                  ..._departments.map((d) => DropdownMenuItem(value: d['id'] as String, child: Text(d['name'] ?? ''))),
                ],
                onChanged: (v) => setDialogState(() => selectedDeptId = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: templateCtrl, decoration: const InputDecoration(labelText: 'Auto Template Name (optional)')),
              const SizedBox(height: 12),
              TextField(controller: webhookCtrl, decoration: const InputDecoration(labelText: 'Webhook URL (optional)')),
            ])),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx, {
                  'name': nameCtrl.text.trim(),
                  if (slugCtrl.text.trim().isNotEmpty) 'slug': slugCtrl.text.trim(),
                  'autoAssignDeptId': selectedDeptId,
                  'autoTemplateName': templateCtrl.text.trim().isEmpty ? null : templateCtrl.text.trim(),
                  'webhookUrl': webhookCtrl.text.trim().isEmpty ? null : webhookCtrl.text.trim(),
                });
              },
              child: Text(isEdit ? 'Save' : 'Create'),
            ),
          ],
        );
      }),
    );
  }

  String _extractError(dynamic e) {
    if (e is Exception) {
      try {
        final dioErr = e as dynamic;
        final data = dioErr.response?.data;
        if (data is Map && data['message'] != null) return data['message'].toString();
      } catch (_) {}
    }
    return e.toString();
  }
}
