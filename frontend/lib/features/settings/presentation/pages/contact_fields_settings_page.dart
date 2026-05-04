// ============================================================
// Contact Fields Settings Page - Custom Field Definitions
// ============================================================
import 'package:flutter/material.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class ContactFieldsSettingsPage extends StatefulWidget {
  const ContactFieldsSettingsPage({super.key});

  @override
  State<ContactFieldsSettingsPage> createState() =>
      _ContactFieldsSettingsPageState();
}

class _ContactFieldsSettingsPageState extends State<ContactFieldsSettingsPage> {
  List<Map<String, dynamic>> _fields = [];
  bool _loading = true;
  String? _error;
  String _search = '';

  static const _fieldTypes = {
    'text': 'Text(Single Line)',
    'textarea': 'Text(Multi Line)',
    'number': 'Number',
    'date': 'Date',
    'checkbox': 'Checkbox',
    'select': 'Select(Dropdown)',
    'url': 'URL',
    'email': 'Email',
    'phone': 'Phone',
  };

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
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get('${ApiConstants.contacts}/fields');
      final data = response.data;
      if (!mounted) return;
      setState(() {
        _fields = data is List
            ? List<Map<String, dynamic>>.from(data)
            : List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (e) {
      // If endpoint doesn't exist yet, start with empty list
      if (!mounted) return;
      setState(() {
        _fields = [];
        _loading = false;
        // Don't show error for 404 - just empty state
        final msg = e.toString();
        if (!msg.contains('404')) {
          _error = msg.replaceFirst('Exception: ', '');
        }
      });
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.isEmpty) return _fields;
    final q = _search.toLowerCase();
    return _fields.where((f) {
      final name = (f['name'] ?? '').toString().toLowerCase();
      final key = (f['fieldKey'] ?? '').toString().toLowerCase();
      return name.contains(q) || key.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filtered = _filtered;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(theme),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
                  ? _buildEmpty(theme)
                  : _buildTable(theme, filtered),
        ),
      ],
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton.icon(
                onPressed: () => _showFieldDialog(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Create Contact Field'),
                style: FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: 'Search fields...',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              filled: true,
              fillColor: theme.colorScheme.surface.withValues(alpha: 0.45),
              contentPadding:
                  const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: theme.dividerColor),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: theme.dividerColor),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTable(ThemeData theme, List<Map<String, dynamic>> fields) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.dividerColor),
        ),
        child: Column(
          children: [
            // Header row
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.04),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 50,
                    child: Text('#',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text('Field Name',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text('Field Type',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text('Field Key',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(
                    width: 100,
                    child: Text('Action', textAlign: TextAlign.center),
                  ),
                ],
              ),
            ),
            // Data rows
            ...fields.asMap().entries.map((entry) {
              final index = entry.key;
              final field = entry.value;
              final name = field['name'] ?? '';
              final type =
                  _fieldTypes[field['fieldType']] ?? field['fieldType'] ?? '';
              final key = field['fieldKey'] ?? '';

              return Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                        color: theme.dividerColor.withValues(alpha: 0.5)),
                  ),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 50,
                      child: Text('${index + 1}',
                          style: theme.textTheme.bodySmall),
                    ),
                    Expanded(
                      flex: 3,
                      child: Text(name.toString(),
                          style: theme.textTheme.bodySmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(type.toString(),
                          style: theme.textTheme.bodySmall),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(key.toString(),
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.6),
                          )),
                    ),
                    SizedBox(
                      width: 100,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            icon: Icon(Icons.edit_rounded,
                                size: 18, color: AppColors.primary),
                            onPressed: () => _showFieldDialog(field: field),
                            tooltip: 'Edit',
                          ),
                          IconButton(
                            icon: Icon(Icons.delete_rounded,
                                size: 18, color: const Color(0xFFEF4444)),
                            onPressed: () => _deleteField(
                                field['id']?.toString() ?? '', name.toString()),
                            tooltip: 'Delete',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.contact_page_outlined,
              size: 56,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
          const SizedBox(height: 16),
          Text('No contact fields defined',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
          const SizedBox(height: 8),
          Text('Create custom fields to capture data on contacts.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              )),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => _showFieldDialog(),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Create Contact Field'),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showFieldDialog({Map<String, dynamic>? field}) async {
    final isEdit = field != null;
    final nameCtrl =
        TextEditingController(text: field?['name']?.toString() ?? '');
    String selectedType = field?['fieldType']?.toString() ?? 'text';

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDialogState) {
        return AlertDialog(
          title: Text(isEdit ? 'Edit Contact Field' : 'Create Contact Field'),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Field Name'),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedType,
                  decoration: const InputDecoration(labelText: 'Field Type'),
                  items: _fieldTypes.entries
                      .map((e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (v) =>
                      setDialogState(() => selectedType = v ?? 'text'),
                ),
                const SizedBox(height: 12),
                Text(
                  'Field key will be auto-generated from the name.',
                  style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                        color: Theme.of(ctx)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.5),
                      ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) {
                  AppSnackbar.error(ctx, 'Field name is required');
                  return;
                }
                try {
                  final dio = di.sl<DioClient>().dio;
                  final fieldKey = nameCtrl.text
                      .trim()
                      .toLowerCase()
                      .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
                      .replaceAll(RegExp(r'_+$'), '');
                  final body = {
                    'name': nameCtrl.text.trim(),
                    'fieldType': selectedType,
                    'fieldKey': fieldKey,
                  };
                  if (isEdit) {
                    await dio.patch(
                      '${ApiConstants.contacts}/fields/${field['id']}',
                      data: body,
                    );
                  } else {
                    await dio.post(
                      '${ApiConstants.contacts}/fields',
                      data: body,
                    );
                  }
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } catch (e) {
                  if (ctx.mounted) {
                    AppSnackbar.error(ctx, 'Failed: $e');
                  }
                }
              },
              child: Text(isEdit ? 'Save' : 'Create'),
            ),
          ],
        );
      }),
    );

    nameCtrl.dispose();
    if (saved == true) _load();
  }

  Future<void> _deleteField(String id, String name) async {
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Field'),
        content: Text(
            'Delete "$name"? Existing contact data for this field will be kept.'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final dio = di.sl<DioClient>().dio;
      await dio.delete('${ApiConstants.contacts}/fields/$id');
      if (!mounted) return;
      AppSnackbar.success(context, 'Field deleted');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed: $e');
    }
  }
}
