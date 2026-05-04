// ============================================================
// Templates Settings Page - WhatsApp Message Templates
// ============================================================
import 'package:flutter/material.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class TemplatesSettingsPage extends StatefulWidget {
  const TemplatesSettingsPage({super.key});

  @override
  State<TemplatesSettingsPage> createState() => _TemplatesSettingsPageState();
}

class _TemplatesSettingsPageState extends State<TemplatesSettingsPage> {
  List<Map<String, dynamic>> _channels = [];
  List<Map<String, dynamic>> _templates = [];
  List<Map<String, dynamic>> _departments = [];
  String? _selectedChannelId;
  bool _loading = true;
  bool _syncing = false;
  String? _error;
  String _search = '';
  String _statusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _loadChannels();
    _loadDepartments();
  }

  Future<void> _loadDepartments() async {
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get(ApiConstants.departments);
      final data = response.data;
      if (!mounted) return;
      setState(() {
        _departments = data is List
            ? List<Map<String, dynamic>>.from(data)
            : List<Map<String, dynamic>>.from(data['data'] ?? []);
      });
    } catch (_) {}
  }

  Future<void> _loadChannels() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get(ApiConstants.channels);
      final data = response.data;
      if (!mounted) return;
      final channels = data is List
          ? List<Map<String, dynamic>>.from(data)
          : List<Map<String, dynamic>>.from(data['data'] ?? []);
      setState(() {
        _channels = channels;
        _loading = false;
        if (channels.isNotEmpty && _selectedChannelId == null) {
          _selectedChannelId = channels.first['id']?.toString();
          _loadTemplates();
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _loadTemplates() async {
    if (_selectedChannelId == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = di.sl<DioClient>().dio;
      final response =
          await dio.get(ApiConstants.channelTemplates(_selectedChannelId!));
      final data = response.data;
      if (!mounted) return;
      setState(() {
        _templates = data is List
            ? List<Map<String, dynamic>>.from(data)
            : List<Map<String, dynamic>>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _syncTemplates() async {
    if (_selectedChannelId == null) return;
    setState(() => _syncing = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio
          .post(ApiConstants.channelTemplatesSync(_selectedChannelId!));
      if (!mounted) return;
      final synced = response.data['synced'] ?? 0;
      AppSnackbar.success(context, 'Synced $synced templates from Meta');
      _loadTemplates();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context,
          'Sync failed: ${e.toString().replaceFirst('Exception: ', '')}');
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _deleteTemplate(String templateId, String name) async {
    if (_selectedChannelId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Template'),
        content: Text(
            'Delete "$name"? This will also remove it from Meta and cannot be undone.'),
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
      await dio.delete(
          ApiConstants.channelTemplate(_selectedChannelId!, templateId));
      if (!mounted) return;
      AppSnackbar.success(context, 'Template deleted');
      _loadTemplates();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(
          context, 'Failed: ${e.toString().replaceFirst('Exception: ', '')}');
    }
  }

  List<Map<String, dynamic>> get _filtered {
    var list = _templates;
    if (_statusFilter != 'ALL') {
      list = list
          .where((t) =>
              (t['status'] ?? '').toString().toUpperCase() == _statusFilter)
          .toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((t) {
        final name = (t['name'] ?? '').toString().toLowerCase();
        final cat = (t['category'] ?? '').toString().toLowerCase();
        return name.contains(q) || cat.contains(q);
      }).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final templates = _filtered;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(theme),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _buildError(theme)
                  : _channels.isEmpty
                      ? _buildNoChannels(theme)
                      : templates.isEmpty
                          ? _buildEmpty(theme)
                          : _buildTable(theme, templates),
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
              OutlinedButton.icon(
                onPressed: _syncing ? null : _syncTemplates,
                icon: _syncing
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.sync_rounded, size: 18),
                label: Text(_syncing ? 'Syncing...' : 'Sync from Meta'),
                style: OutlinedButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _selectedChannelId != null
                    ? () => _showCreateTemplateDialog()
                    : null,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Create Template'),
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
          Row(
            children: [
              SizedBox(
                width: 260,
                child: DropdownButtonFormField<String>(
                  value: _selectedChannelId,
                  decoration: _dropdownDecoration(theme, 'Channel'),
                  items: _channels.map((ch) {
                    return DropdownMenuItem(
                      value: ch['id']?.toString(),
                      child: Text(ch['name']?.toString() ?? 'Unnamed',
                          overflow: TextOverflow.ellipsis),
                    );
                  }).toList(),
                  onChanged: (v) {
                    setState(() => _selectedChannelId = v);
                    _loadTemplates();
                  },
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 160,
                child: DropdownButtonFormField<String>(
                  value: _statusFilter,
                  decoration: _dropdownDecoration(theme, 'Status'),
                  items: const [
                    DropdownMenuItem(value: 'ALL', child: Text('All')),
                    DropdownMenuItem(
                        value: 'APPROVED', child: Text('Approved')),
                    DropdownMenuItem(value: 'PENDING', child: Text('Pending')),
                    DropdownMenuItem(
                        value: 'REJECTED', child: Text('Rejected')),
                  ],
                  onChanged: (v) => setState(() => _statusFilter = v ?? 'ALL'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _search = v),
                  decoration: InputDecoration(
                    hintText: 'Search templates...',
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    isDense: true,
                    filled: true,
                    fillColor:
                        theme.colorScheme.surface.withValues(alpha: 0.45),
                    contentPadding: const EdgeInsets.symmetric(
                        vertical: 12, horizontal: 16),
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
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _dropdownDecoration(ThemeData theme, String label) {
    return InputDecoration(
      labelText: label,
      isDense: true,
      filled: true,
      fillColor: theme.colorScheme.surface.withValues(alpha: 0.45),
      contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: theme.dividerColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: theme.dividerColor),
      ),
    );
  }

  Widget _buildTable(ThemeData theme, List<Map<String, dynamic>> templates) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: SizedBox(
        width: double.infinity,
        child: DataTable(
          columns: const [
            DataColumn(label: Text('Name')),
            DataColumn(label: Text('Category')),
            DataColumn(label: Text('Language')),
            DataColumn(label: Text('Status')),
            DataColumn(label: Text('Departments')),
            DataColumn(label: Text('Last Synced')),
            DataColumn(label: Text('')),
          ],
          rows: templates.map((t) {
            final status = (t['status'] ?? 'PENDING').toString().toUpperCase();
            final id = t['id']?.toString() ?? '';
            final name = t['name']?.toString() ?? '';
            final deptIds = t['departmentIds'] is List
                ? List<String>.from(t['departmentIds'] as List)
                : <String>[];
            return DataRow(
              cells: [
                DataCell(Text(name,
                    style: const TextStyle(fontWeight: FontWeight.w600))),
                DataCell(
                    _CategoryChip(category: t['category']?.toString() ?? '')),
                DataCell(Text(t['language']?.toString() ?? 'en')),
                DataCell(_StatusBadge(status: status)),
                DataCell(
                  InkWell(
                    onTap: () => _showDepartmentDialog(t),
                    borderRadius: BorderRadius.circular(6),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: deptIds.isEmpty
                          ? Text('All',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5),
                                fontStyle: FontStyle.italic,
                              ))
                          : Wrap(
                              spacing: 4,
                              runSpacing: 2,
                              children: deptIds.map((dId) {
                                final dept = _departments.firstWhere(
                                  (d) => d['id'] == dId,
                                  orElse: () => {'name': dId},
                                );
                                return Chip(
                                  label: Text(dept['name']?.toString() ?? dId,
                                      style: const TextStyle(fontSize: 11)),
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  labelPadding:
                                      const EdgeInsets.symmetric(horizontal: 6),
                                );
                              }).toList(),
                            ),
                    ),
                  ),
                ),
                DataCell(Text(
                  _formatDate(t['lastSyncedAt']?.toString()),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                )),
                DataCell(Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.visibility_rounded, size: 18),
                      tooltip: 'Preview',
                      onPressed: () => _showPreviewDialog(t),
                      style: IconButton.styleFrom(
                        foregroundColor: AppColors.brandGreenDark,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_rounded, size: 18),
                      tooltip: 'Delete',
                      onPressed: () => _deleteTemplate(id, name),
                      style: IconButton.styleFrom(
                        foregroundColor: const Color(0xFFEF4444),
                      ),
                    ),
                  ],
                )),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }

  // ── Preview existing template dialog ──────────────────
  void _showPreviewDialog(Map<String, dynamic> template) {
    final components = template['components'];
    final compList = components is List
        ? List<Map<String, dynamic>>.from(components.map((c) =>
            c is Map ? Map<String, dynamic>.from(c) : <String, dynamic>{}))
        : <Map<String, dynamic>>[];

    String headerText = '';
    String bodyText = '';
    String footerText = '';
    List<Map<String, dynamic>> buttons = [];

    for (final c in compList) {
      switch (c['type']?.toString().toUpperCase()) {
        case 'HEADER':
          headerText = c['text']?.toString() ?? '';
          break;
        case 'BODY':
          bodyText = c['text']?.toString() ?? '';
          break;
        case 'FOOTER':
          footerText = c['text']?.toString() ?? '';
          break;
        case 'BUTTONS':
          if (c['buttons'] is List) {
            buttons = List<Map<String, dynamic>>.from((c['buttons'] as List)
                .map((b) => Map<String, dynamic>.from(b as Map)));
          }
          break;
      }
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.description_rounded, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(template['name']?.toString() ?? '',
                  overflow: TextOverflow.ellipsis),
            ),
            _StatusBadge(
                status:
                    (template['status'] ?? 'PENDING').toString().toUpperCase()),
          ],
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: SizedBox(
          width: 400,
          child: _WhatsAppPreview(
            headerText: headerText,
            bodyText: bodyText,
            footerText: footerText,
            buttons: buttons,
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  // ── Create Template Dialog ────────────────────────────
  Future<void> _showCreateTemplateDialog() async {
    if (_selectedChannelId == null) return;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => _CreateTemplateDialog(
        channelId: _selectedChannelId!,
      ),
    );

    if (saved == true) _loadTemplates();
  }

  Future<void> _showDepartmentDialog(Map<String, dynamic> template) async {
    final templateId = template['id']?.toString() ?? '';
    final currentIds = template['departmentIds'] is List
        ? List<String>.from(template['departmentIds'] as List)
        : <String>[];
    final selected = Set<String>.from(currentIds);

    final result = await showDialog<Set<String>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: Text('Assign Departments - ${template['name']}'),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              content: SizedBox(
                width: 380,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Select which departments can use this template. Leave empty for all departments.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurface
                                .withValues(alpha: 0.6),
                          ),
                    ),
                    const SizedBox(height: 16),
                    if (_departments.isEmpty)
                      const Text('No departments found')
                    else
                      ..._departments.map((dept) {
                        final deptId = dept['id']?.toString() ?? '';
                        return CheckboxListTile(
                          title: Text(dept['name']?.toString() ?? ''),
                          value: selected.contains(deptId),
                          dense: true,
                          controlAffinity: ListTileControlAffinity.leading,
                          onChanged: (v) {
                            setDialogState(() {
                              if (v == true) {
                                selected.add(deptId);
                              } else {
                                selected.remove(deptId);
                              }
                            });
                          },
                        );
                      }),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, selected),
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == null || _selectedChannelId == null) return;

    try {
      final dio = di.sl<DioClient>().dio;
      await dio.patch(
        ApiConstants.channelTemplateDepartments(
            _selectedChannelId!, templateId),
        data: {'departmentIds': result.toList()},
      );
      if (!mounted) return;
      AppSnackbar.success(context, 'Departments updated');
      _loadTemplates();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(
          context, 'Failed: ${e.toString().replaceFirst('Exception: ', '')}');
    }
  }

  Widget _buildError(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline_rounded,
              size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 12),
          Text(_error!, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          TextButton(onPressed: _loadChannels, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildNoChannels(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cell_tower_rounded,
              size: 56,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
          const SizedBox(height: 16),
          Text('No channels configured',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
          const SizedBox(height: 8),
          Text('Add a WhatsApp channel first, then sync templates.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              )),
        ],
      ),
    );
  }

  Widget _buildEmpty(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.description_rounded,
              size: 56,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
          const SizedBox(height: 16),
          Text('No templates found',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
          const SizedBox(height: 8),
          Text('Click "Create Template" or "Sync from Meta" to get started.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              )),
        ],
      ),
    );
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return '-';
    final date = AppDateTime.parseLocal(dateStr);
    return date == null ? '-' : AppDateTime.shortDateTime(date);
  }
}

// ╔══════════════════════════════════════════════════════════╗
// ║  CREATE TEMPLATE DIALOG - Full form + live preview      ║
// ╚══════════════════════════════════════════════════════════╝
class _CreateTemplateDialog extends StatefulWidget {
  final String channelId;
  const _CreateTemplateDialog({required this.channelId});

  @override
  State<_CreateTemplateDialog> createState() => _CreateTemplateDialogState();
}

class _CreateTemplateDialogState extends State<_CreateTemplateDialog> {
  final _nameCtrl = TextEditingController();
  final _headerCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _footerCtrl = TextEditingController();
  String _category = 'MARKETING';
  String _language = 'en_US';
  String _headerType = 'NONE';
  final List<_ButtonEntry> _buttons = [];
  bool _submitting = false;

  static const _languages = {
    'en_US': 'English (US)',
    'en_GB': 'English (UK)',
    'id': 'Indonesian',
    'ms': 'Malay',
    'zh_CN': 'Chinese (Simplified)',
    'zh_TW': 'Chinese (Traditional)',
    'hi': 'Hindi',
    'ar': 'Arabic',
    'es': 'Spanish',
    'fr': 'French',
    'pt_BR': 'Portuguese (BR)',
    'de': 'German',
    'ja': 'Japanese',
    'ko': 'Korean',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'tr': 'Turkish',
    'ru': 'Russian',
    'it': 'Italian',
    'nl': 'Dutch',
  };

  @override
  void initState() {
    super.initState();
    _nameCtrl.addListener(_refresh);
    _headerCtrl.addListener(_refresh);
    _bodyCtrl.addListener(_refresh);
    _footerCtrl.addListener(_refresh);
  }

  void _refresh() => setState(() {});

  @override
  void dispose() {
    _nameCtrl.dispose();
    _headerCtrl.dispose();
    _bodyCtrl.dispose();
    _footerCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    final body = _bodyCtrl.text.trim();
    if (name.isEmpty) {
      AppSnackbar.error(context, 'Template name is required');
      return;
    }
    if (body.isEmpty) {
      AppSnackbar.error(context, 'Body text is required');
      return;
    }
    // Meta requires name to be lowercase alphanumeric + underscores
    final cleanName = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9_]'), '_');

    setState(() => _submitting = true);
    try {
      final components = <Map<String, dynamic>>[];

      // Header
      if (_headerType == 'TEXT' && _headerCtrl.text.trim().isNotEmpty) {
        components.add({
          'type': 'HEADER',
          'format': 'TEXT',
          'text': _headerCtrl.text.trim(),
        });
      }

      // Body (required)
      components.add({
        'type': 'BODY',
        'text': body,
      });

      // Footer
      if (_footerCtrl.text.trim().isNotEmpty) {
        components.add({
          'type': 'FOOTER',
          'text': _footerCtrl.text.trim(),
        });
      }

      // Buttons
      if (_buttons.isNotEmpty) {
        final btns = <Map<String, dynamic>>[];
        for (final b in _buttons) {
          if (b.text.trim().isEmpty) continue;
          final btn = <String, dynamic>{'type': b.type, 'text': b.text.trim()};
          if (b.type == 'URL' && b.url.trim().isNotEmpty) {
            btn['url'] = b.url.trim();
          }
          if (b.type == 'PHONE_NUMBER' && b.phone.trim().isNotEmpty) {
            btn['phone_number'] = b.phone.trim();
          }
          btns.add(btn);
        }
        if (btns.isNotEmpty) {
          components.add({'type': 'BUTTONS', 'buttons': btns});
        }
      }

      final dio = di.sl<DioClient>().dio;
      await dio.post(
        ApiConstants.channelTemplates(widget.channelId),
        data: {
          'name': cleanName,
          'category': _category,
          'language': _language,
          'components': components,
        },
      );
      if (!mounted) return;
      AppSnackbar.success(
          context, 'Template "$cleanName" submitted to Meta for approval');
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _removeButton(int index) {
    setState(() => _buttons.removeAt(index));
  }

  int _getNextVariableNumber() {
    final text = _bodyCtrl.text;
    final matches = RegExp(r'\{\{(\d+)\}\}').allMatches(text);
    int max = 0;
    for (final m in matches) {
      final n = int.tryParse(m.group(1)!) ?? 0;
      if (n > max) max = n;
    }
    return max + 1;
  }

  void _addVariableAtCursor() {
    final n = _getNextVariableNumber();
    final variable = '{{$n}}';
    final sel = _bodyCtrl.selection;
    final text = _bodyCtrl.text;
    final start = sel.isValid ? sel.start : text.length;
    final end = sel.isValid ? sel.end : text.length;
    final newText = text.replaceRange(start, end, variable);
    _bodyCtrl.text = newText;
    _bodyCtrl.selection = TextSelection.collapsed(
      offset: start + variable.length,
    );
  }

  void _insertFormatting(String marker) {
    final sel = _bodyCtrl.selection;
    final text = _bodyCtrl.text;
    if (sel.isValid && sel.start != sel.end) {
      final selected = text.substring(sel.start, sel.end);
      final newText =
          text.replaceRange(sel.start, sel.end, '$marker$selected$marker');
      _bodyCtrl.text = newText;
      _bodyCtrl.selection = TextSelection(
        baseOffset: sel.start + marker.length,
        extentOffset: sel.end + marker.length,
      );
    } else {
      final pos = sel.isValid ? sel.start : text.length;
      final newText = text.replaceRange(pos, pos, '$marker$marker');
      _bodyCtrl.text = newText;
      _bodyCtrl.selection =
          TextSelection.collapsed(offset: pos + marker.length);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Title bar
            Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 16, 16),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.add_rounded, size: 22),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('Create Message Template',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w700)),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context, false),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            // Content: form + preview side by side
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Left: form
                  Expanded(
                    flex: 3,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: _buildForm(theme),
                    ),
                  ),
                  VerticalDivider(width: 1, color: theme.dividerColor),
                  // Right: phone mockup preview
                  Expanded(
                    flex: 2,
                    child: Container(
                      color: theme.colorScheme.surfaceContainerHighest
                          .withValues(alpha: 0.15),
                      padding: const EdgeInsets.symmetric(
                          vertical: 16, horizontal: 20),
                      child: Column(
                        children: [
                          Text('Preview',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.7),
                              )),
                          const SizedBox(height: 12),
                          Expanded(
                            child: Center(
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 280),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(28),
                                    border: Border.all(
                                        color: Colors.grey.shade300,
                                        width: 2.5),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black
                                            .withValues(alpha: 0.08),
                                        blurRadius: 20,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  clipBehavior: Clip.antiAlias,
                                  child: Column(
                                    children: [
                                      // WhatsApp header bar
                                      Container(
                                        padding: const EdgeInsets.fromLTRB(
                                            12, 28, 12, 10),
                                        decoration: const BoxDecoration(
                                          color: Color(0xFF075E54),
                                        ),
                                        child: Row(
                                          children: [
                                            Icon(Icons.arrow_back,
                                                color: Colors.white
                                                    .withValues(alpha: 0.9),
                                                size: 18),
                                            const SizedBox(width: 8),
                                            CircleAvatar(
                                              radius: 14,
                                              backgroundColor: Colors.white
                                                  .withValues(alpha: 0.25),
                                              child: Icon(Icons.person,
                                                  size: 16,
                                                  color: Colors.white
                                                      .withValues(alpha: 0.8)),
                                            ),
                                            const SizedBox(width: 8),
                                            const Expanded(
                                              child: Text('Business',
                                                  style: TextStyle(
                                                      color: Colors.white,
                                                      fontSize: 13,
                                                      fontWeight:
                                                          FontWeight.w600)),
                                            ),
                                            Icon(Icons.videocam_rounded,
                                                color: Colors.white
                                                    .withValues(alpha: 0.9),
                                                size: 18),
                                            const SizedBox(width: 12),
                                            Icon(Icons.call_rounded,
                                                color: Colors.white
                                                    .withValues(alpha: 0.9),
                                                size: 16),
                                          ],
                                        ),
                                      ),
                                      // System encryption message
                                      Container(
                                        margin: const EdgeInsets.fromLTRB(
                                            10, 8, 10, 4),
                                        padding: const EdgeInsets.all(8),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFE2F7CB)
                                              .withValues(alpha: 0.65),
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          'This business uses a secure service from Meta to manage this chat. Tap to learn more',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                              fontSize: 9.5,
                                              color: Colors.grey.shade600,
                                              height: 1.3),
                                        ),
                                      ),
                                      // Chat area
                                      Expanded(
                                        child: Container(
                                          color: const Color(0xFFECE5DD),
                                          child: SingleChildScrollView(
                                            padding: const EdgeInsets.all(10),
                                            child: _WhatsAppPreview(
                                              headerText: _headerType == 'TEXT'
                                                  ? _headerCtrl.text
                                                  : '',
                                              bodyText: _bodyCtrl.text,
                                              footerText: _footerCtrl.text,
                                              buttons: _buttons
                                                  .where((b) =>
                                                      b.text.trim().isNotEmpty)
                                                  .map((b) => {
                                                        'type': b.type,
                                                        'text': b.text,
                                                      })
                                                  .toList(),
                                            ),
                                          ),
                                        ),
                                      ),
                                      // Bottom input bar
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 6),
                                        color: const Color(0xFFF0F0F0),
                                        child: Row(
                                          children: [
                                            Icon(Icons.add,
                                                size: 20,
                                                color: Colors.grey.shade600),
                                            const SizedBox(width: 4),
                                            Expanded(
                                              child: Container(
                                                height: 28,
                                                decoration: BoxDecoration(
                                                  color: Colors.white,
                                                  borderRadius:
                                                      BorderRadius.circular(14),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            Icon(Icons.camera_alt_outlined,
                                                size: 17,
                                                color: Colors.grey.shade600),
                                            const SizedBox(width: 6),
                                            Icon(Icons.attach_file_rounded,
                                                size: 17,
                                                color: Colors.grey.shade600),
                                            const SizedBox(width: 6),
                                            Icon(Icons.mic_none_rounded,
                                                size: 17,
                                                color: Colors.grey.shade600),
                                          ],
                                        ),
                                      ),
                                      // Phone bottom bar
                                      Container(
                                        height: 16,
                                        color: Colors.white,
                                        alignment: Alignment.center,
                                        child: Container(
                                          width: 80,
                                          height: 3.5,
                                          decoration: BoxDecoration(
                                            color: Colors.grey.shade800,
                                            borderRadius:
                                                BorderRadius.circular(2),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Actions
            Container(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: _submitting ? null : _submit,
                    icon: _submitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send_rounded, size: 18),
                    label: Text(
                        _submitting ? 'Submitting...' : 'Submit For Approval'),
                    style: FilledButton.styleFrom(
                      backgroundColor: theme.colorScheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Name
        TextField(
          controller: _nameCtrl,
          decoration: const InputDecoration(
            labelText: 'Template Name',
            hintText: 'e.g. order_confirmation',
            helperText: 'Lowercase, underscores only. Auto-cleaned on submit.',
          ),
        ),
        const SizedBox(height: 20),

        // Category + Language row
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: const [
                  DropdownMenuItem(
                      value: 'MARKETING', child: Text('Marketing')),
                  DropdownMenuItem(value: 'UTILITY', child: Text('Utility')),
                  DropdownMenuItem(
                      value: 'AUTHENTICATION', child: Text('Authentication')),
                ],
                onChanged: (v) => setState(() => _category = v!),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _language,
                decoration: const InputDecoration(labelText: 'Language'),
                items: _languages.entries
                    .map((e) =>
                        DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged: (v) => setState(() => _language = v!),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Header as dropdown
        DropdownButtonFormField<String>(
          value: _headerType,
          decoration: const InputDecoration(labelText: 'Header'),
          items: const [
            DropdownMenuItem(value: 'NONE', child: Text('None')),
            DropdownMenuItem(value: 'TEXT', child: Text('Text')),
          ],
          onChanged: (v) => setState(() => _headerType = v ?? 'NONE'),
        ),
        if (_headerType == 'TEXT') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _headerCtrl,
            decoration: const InputDecoration(labelText: 'Header Text'),
            maxLength: 60,
          ),
        ],
        const SizedBox(height: 24),

        // Body
        TextField(
          controller: _bodyCtrl,
          decoration: const InputDecoration(
            labelText: 'Body *',
            alignLabelWithHint: true,
          ),
          maxLines: 6,
          minLines: 4,
          maxLength: 1024,
        ),
        // Formatting toolbar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          decoration: BoxDecoration(
            border: Border.all(color: theme.dividerColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              _fmtBtn(context, 'B', FontWeight.w700, false, false,
                  () => _insertFormatting('*')),
              _fmtBtn(context, 'I', FontWeight.w500, true, false,
                  () => _insertFormatting('_')),
              _fmtBtn(context, 'S', FontWeight.w500, false, true,
                  () => _insertFormatting('~')),
              const SizedBox(width: 2),
              IconButton(
                onPressed: null,
                icon: const Icon(Icons.emoji_emotions_outlined, size: 20),
                tooltip: 'Emoji (coming soon)',
                visualDensity: VisualDensity.compact,
              ),
              IconButton(
                onPressed: null,
                icon: const Icon(Icons.info_outline_rounded, size: 20),
                tooltip: 'WhatsApp supports *bold*, _italic_, ~strikethrough~',
                visualDensity: VisualDensity.compact,
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: _addVariableAtCursor,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add Variable'),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Footer
        TextField(
          controller: _footerCtrl,
          decoration: const InputDecoration(
            labelText: 'Footer (Optional)',
          ),
          maxLength: 60,
        ),
        const SizedBox(height: 24),

        // Buttons
        if (_buttons.length < 3)
          PopupMenuButton<String>(
            onSelected: (type) {
              if (_buttons.length < 3) {
                setState(() => _buttons.add(_ButtonEntry(type: type)));
              }
            },
            itemBuilder: (ctx) => const [
              PopupMenuItem(value: 'QUICK_REPLY', child: Text('Quick Reply')),
              PopupMenuItem(value: 'URL', child: Text('URL Button')),
              PopupMenuItem(value: 'PHONE_NUMBER', child: Text('Phone Number')),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                border: Border.all(color: theme.dividerColor),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.add,
                      size: 16,
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.7)),
                  const SizedBox(width: 6),
                  Text('Add a button',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.7),
                      )),
                  const SizedBox(width: 4),
                  Icon(Icons.arrow_drop_down,
                      size: 18,
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                ],
              ),
            ),
          ),
        ...List.generate(_buttons.length, (i) {
          final b = _buttons[i];
          final typeLabel = b.type == 'QUICK_REPLY'
              ? 'Quick Reply'
              : b.type == 'URL'
                  ? 'URL'
                  : 'Phone Number';
          return Container(
            margin: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              border: Border.all(color: theme.dividerColor),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Type header
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 8, 8),
                  decoration: BoxDecoration(
                    border:
                        Border(bottom: BorderSide(color: theme.dividerColor)),
                  ),
                  child: Row(
                    children: [
                      Text(typeLabel,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const Spacer(),
                      PopupMenuButton<String>(
                        onSelected: (type) => setState(() => b.type = type),
                        itemBuilder: (ctx) => const [
                          PopupMenuItem(
                              value: 'QUICK_REPLY', child: Text('Quick Reply')),
                          PopupMenuItem(
                              value: 'URL', child: Text('URL Button')),
                          PopupMenuItem(
                              value: 'PHONE_NUMBER',
                              child: Text('Phone Number')),
                        ],
                        child: Icon(Icons.more_vert,
                            size: 18,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5)),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Icon(Icons.drag_indicator,
                              size: 18,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.3)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: TextField(
                              onChanged: (v) => setState(() => b.text = v),
                              decoration: InputDecoration(
                                labelText: 'Button Text',
                                counterText: '${b.text.length}/25',
                                isDense: true,
                              ),
                              maxLength: 25,
                              buildCounter: (_,
                                      {required currentLength,
                                      maxLength,
                                      required isFocused}) =>
                                  null,
                              controller: TextEditingController.fromValue(
                                TextEditingValue(
                                    text: b.text,
                                    selection: TextSelection.collapsed(
                                        offset: b.text.length)),
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () => _removeButton(i),
                            icon: const Icon(Icons.delete_outline_rounded,
                                color: Color(0xFFEF4444), size: 20),
                            tooltip: 'Remove',
                            visualDensity: VisualDensity.compact,
                          ),
                        ],
                      ),
                      if (b.type == 'URL') ...[
                        const SizedBox(height: 8),
                        TextField(
                          onChanged: (v) => setState(() => b.url = v),
                          decoration: const InputDecoration(
                            labelText: 'URL',
                            hintText: 'https://example.com/{{1}}',
                            isDense: true,
                          ),
                          controller: TextEditingController.fromValue(
                            TextEditingValue(
                                text: b.url,
                                selection: TextSelection.collapsed(
                                    offset: b.url.length)),
                          ),
                        ),
                      ],
                      if (b.type == 'PHONE_NUMBER') ...[
                        const SizedBox(height: 8),
                        TextField(
                          onChanged: (v) => setState(() => b.phone = v),
                          decoration: const InputDecoration(
                            labelText: 'Phone Number',
                            hintText: '+6281234567890',
                            isDense: true,
                          ),
                          controller: TextEditingController.fromValue(
                            TextEditingValue(
                                text: b.phone,
                                selection: TextSelection.collapsed(
                                    offset: b.phone.length)),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _fmtBtn(BuildContext context, String label, FontWeight weight,
      bool italic, bool strike, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontWeight: weight,
            fontSize: 15,
            fontStyle: italic ? FontStyle.italic : FontStyle.normal,
            decoration: strike ? TextDecoration.lineThrough : null,
            color:
                Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
      ),
    );
  }
}

class _ButtonEntry {
  String type;
  String text;
  String url;
  String phone;
  _ButtonEntry({
    this.type = 'QUICK_REPLY',
    this.text = '',
    this.url = '',
    this.phone = '',
  });
}

// ╔══════════════════════════════════════════════════════════╗
// ║  WhatsApp Phone-bubble Preview Widget                   ║
// ╚══════════════════════════════════════════════════════════╝
class _WhatsAppPreview extends StatelessWidget {
  final String headerText;
  final String bodyText;
  final String footerText;
  final List<Map<String, dynamic>> buttons;

  const _WhatsAppPreview({
    required this.headerText,
    required this.bodyText,
    required this.footerText,
    required this.buttons,
  });

  @override
  Widget build(BuildContext context) {
    final hasContent =
        headerText.isNotEmpty || bodyText.isNotEmpty || footerText.isNotEmpty;
    if (!hasContent) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'Start typing to see preview...',
          style: TextStyle(
              color: Colors.grey.shade400,
              fontStyle: FontStyle.italic,
              fontSize: 13),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Message bubble
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (headerText.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    headerText,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: Color(0xFF111B21),
                    ),
                  ),
                ),
              if (bodyText.isNotEmpty) _buildBodyWithVariables(bodyText),
              if (footerText.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    footerText,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ),
              // Timestamp
              Align(
                alignment: Alignment.bottomRight,
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '12:00',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Buttons below the bubble
        if (buttons.isNotEmpty) ...[
          const SizedBox(height: 4),
          ...buttons.map((btn) {
            final type = btn['type']?.toString() ?? '';
            IconData icon;
            switch (type) {
              case 'URL':
                icon = Icons.open_in_new_rounded;
                break;
              case 'PHONE_NUMBER':
                icon = Icons.phone_rounded;
                break;
              default:
                icon = Icons.reply_rounded;
            }
            return Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 4,
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 16, color: const Color(0xFF00A5F4)),
                  const SizedBox(width: 6),
                  Text(
                    btn['text']?.toString() ?? '',
                    style: const TextStyle(
                      color: Color(0xFF00A5F4),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _buildBodyWithVariables(String text) {
    // Highlight {{1}}, {{2}} etc. in the preview
    final regex = RegExp(r'\{\{\d+\}\}');
    final spans = <InlineSpan>[];
    int lastEnd = 0;

    for (final match in regex.allMatches(text)) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(
          text: text.substring(lastEnd, match.start),
          style: const TextStyle(fontSize: 14, color: Color(0xFF111B21)),
        ));
      }
      spans.add(WidgetSpan(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
          margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color: const Color(0xFF25D366).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            match.group(0)!,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: Color(0xFF128C7E),
            ),
          ),
        ),
      ));
      lastEnd = match.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(
        text: text.substring(lastEnd),
        style: const TextStyle(fontSize: 14, color: Color(0xFF111B21)),
      ));
    }

    return Text.rich(TextSpan(children: spans));
  }
}

// ── Status Badge ────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'APPROVED':
        color = const Color(0xFF25D366);
        break;
      case 'REJECTED':
        color = const Color(0xFFEF4444);
        break;
      case 'PENDING':
        color = const Color(0xFFF39C12);
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        status,
        style:
            TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

// ── Category Chip ───────────────────────────────────────
class _CategoryChip extends StatelessWidget {
  final String category;
  const _CategoryChip({required this.category});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    IconData icon;
    switch (category.toUpperCase()) {
      case 'MARKETING':
        icon = Icons.campaign_rounded;
        break;
      case 'UTILITY':
        icon = Icons.build_rounded;
        break;
      case 'AUTHENTICATION':
        icon = Icons.lock_rounded;
        break;
      default:
        icon = Icons.label_rounded;
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon,
            size: 14,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.45)),
        const SizedBox(width: 5),
        Text(
          category.isNotEmpty
              ? category[0].toUpperCase() + category.substring(1).toLowerCase()
              : '-',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
