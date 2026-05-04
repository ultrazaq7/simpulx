// ============================================================
// Channels Settings Page - WhatsApp + Meta Channel Management
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/network/facebook_signup.dart';
import 'package:simpulx/core/network/facebook_meta_signup.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class ChannelsSettingsPage extends StatefulWidget {
  const ChannelsSettingsPage({super.key});

  @override
  State<ChannelsSettingsPage> createState() => _ChannelsSettingsPageState();
}

class _ChannelsSettingsPageState extends State<ChannelsSettingsPage> {
  static const _fbConfigId = '970753845337676';
  static const _defaultMetaVerifyToken = 'simpulx_meta_verify_2026';

  List<Map<String, dynamic>> _channels = [];
  List<Map<String, dynamic>> _metaChannels = [];
  List<Map<String, dynamic>> _departments = [];
  List<Map<String, dynamic>> _publishers = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  _ChannelView _view = _ChannelView.whatsapp;

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
      final responses = await Future.wait([
        dio.get(ApiConstants.channels),
        dio.get(ApiConstants.metaChannels),
        dio.get(ApiConstants.departments),
        dio.get(ApiConstants.publishers),
      ]);
      if (!mounted) return;
      setState(() {
        _channels = _normalizeList(responses[0].data);
        _metaChannels = _normalizeList(responses[1].data);
        _departments = _normalizeList(responses[2].data);
        _publishers = _normalizeList(responses[3].data);
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

  List<Map<String, dynamic>> _normalizeList(dynamic data) {
    if (data is List) {
      return List<Map<String, dynamic>>.from(data);
    }
    if (data is Map && data['data'] is List) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return const [];
  }

  String? _departmentNameFor(dynamic channel) {
    if (channel is! Map<String, dynamic>) return null;
    final department = channel['department'];
    if (department is Map && department['name'] != null) {
      return department['name'].toString();
    }
    final departmentId = channel['departmentId']?.toString();
    if (departmentId == null || departmentId.isEmpty) return null;
    for (final departmentItem in _departments) {
      if (departmentItem['id']?.toString() == departmentId) {
        final name = departmentItem['name']?.toString();
        if (name != null && name.isNotEmpty) return name;
      }
    }
    return null;
  }

  List<Map<String, dynamic>> get _filtered {
    if (_view == _ChannelView.integrations) {
      if (_search.isEmpty) return _publishers;
      final q = _search.toLowerCase();
      return _publishers.where((p) {
        return (p['name'] ?? '').toString().toLowerCase().contains(q) ||
            (p['slug'] ?? '').toString().toLowerCase().contains(q);
      }).toList();
    }
    final source = _view == _ChannelView.whatsapp ? _channels : _metaChannels;
    if (_search.isEmpty) return source;
    final q = _search.toLowerCase();
    return source.where((ch) {
      final name = (ch['name'] ?? '').toString().toLowerCase();
      final phone = (ch['phoneNumber'] ?? '').toString();
      final platform = (ch['platform'] ?? '').toString().toLowerCase();
      final page = (ch['pageId'] ?? '').toString().toLowerCase();
      final ig = (ch['instagramAccountId'] ?? '').toString().toLowerCase();
      return name.contains(q) ||
          phone.contains(q) ||
          platform.contains(q) ||
          page.contains(q) ||
          ig.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final channels = _filtered;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(theme),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _buildError(theme)
                  : _view == _ChannelView.integrations
                      ? _buildIntegrationsView(theme)
                      : channels.isEmpty
                          ? _buildEmpty(theme)
                          : _buildList(theme, channels),
        ),
      ],
    );
  }

  Widget _buildHeader(ThemeData theme) {
    final isWhatsapp = _view == _ChannelView.whatsapp;
    final isMeta = _view == _ChannelView.meta;
    final isIntegrations = _view == _ChannelView.integrations;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
      child: Column(
        children: [
          Row(
            children: [
              const Spacer(),
              const SizedBox(width: 12),
              IconButton(
                onPressed: _load,
                icon: Icon(Icons.refresh_rounded,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.8)),
              ),
              const SizedBox(width: 8),
              if (!isIntegrations) ...[
                FilledButton.icon(
                  onPressed:
                      isWhatsapp ? _startEmbeddedSignup : _startMetaSignup,
                  icon: const Icon(Icons.facebook_rounded, size: 18),
                  label: const Text('Connect via Facebook'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: isWhatsapp
                      ? () => _showChannelDialog()
                      : () => _showMetaChannelDialog(),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text(isWhatsapp ? 'Manual Setup' : 'Add Meta Channel'),
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ] else
                FilledButton.icon(
                  onPressed: _addPublisher,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add Integration'),
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
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
              _ChannelTypeChip(
                label: 'WhatsApp',
                icon: Icons.chat_rounded,
                count: _channels.length,
                selected: isWhatsapp,
                activeColor: const Color(0xFF25D366),
                onTap: () => setState(() {
                  _view = _ChannelView.whatsapp;
                  _search = '';
                }),
              ),
              const SizedBox(width: 10),
              _ChannelTypeChip(
                label: 'Instagram & Messenger',
                icon: Icons.alternate_email_rounded,
                count: _metaChannels.length,
                selected: isMeta,
                activeColor: AppColors.primary,
                onTap: () => setState(() {
                  _view = _ChannelView.meta;
                  _search = '';
                }),
              ),
              const SizedBox(width: 10),
              _ChannelTypeChip(
                label: 'Integrations',
                icon: Icons.webhook_rounded,
                count: _publishers.length,
                selected: isIntegrations,
                activeColor: const Color(0xFF8B5CF6),
                onTap: () => setState(() {
                  _view = _ChannelView.integrations;
                  _search = '';
                }),
              ),
            ],
          ),
          const SizedBox(height: 18),
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: isWhatsapp
                  ? 'Search WhatsApp channels...'
                  : isMeta
                      ? 'Search Meta channels, page IDs, or platform...'
                      : 'Search integrations...',
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

  Widget _buildList(ThemeData theme, List<Map<String, dynamic>> channels) {
    return ListView.separated(
      padding: const EdgeInsets.all(24),
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemCount: channels.length,
      itemBuilder: (context, index) {
        final ch = channels[index];
        if (_view == _ChannelView.whatsapp) {
          return _ChannelCard(
            channel: ch,
            departmentName: _departmentNameFor(ch),
            onTest: () => _testChannel(ch['id']),
            onEdit: () => _showChannelDialog(channel: ch),
            onDelete: () => _deleteChannel(ch['id'], ch['name'] ?? ''),
          );
        }
        return _MetaChannelCard(
          channel: ch,
          departmentName: _departmentNameFor(ch),
          onTest: () => _testMetaChannel(ch['id']),
          onEdit: () => _showMetaChannelDialog(channel: ch),
          onDelete: () => _deleteMetaChannel(ch['id'], ch['name'] ?? ''),
        );
      },
    );
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
          TextButton(onPressed: _load, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildEmpty(ThemeData theme) {
    final isWhatsapp = _view == _ChannelView.whatsapp;
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
          Text(
              isWhatsapp
                  ? 'Connect a WhatsApp channel to start messaging.'
                  : 'Add an Instagram or Messenger channel to start receiving Meta conversations.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              )),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: isWhatsapp ? _startEmbeddedSignup : _startMetaSignup,
            icon: const Icon(Icons.facebook_rounded, size: 20),
            label: const Text('Connect via Facebook'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              textStyle:
                  const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  // ── Integrations (Publishers) ──────────────────────────────────────
  Widget _buildIntegrationsView(ThemeData theme) {
    if (_publishers.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.webhook_rounded,
                size: 64,
                color: const Color(0xFF8B5CF6).withValues(alpha: 0.3)),
            const SizedBox(height: 16),
            Text('No integrations yet',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                )),
            const SizedBox(height: 8),
            Text(
              'Connect external systems to automatically capture leads via API.',
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _addPublisher,
              icon: const Icon(Icons.add_rounded, size: 20),
              label: const Text('Add First Integration'),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF8B5CF6),
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(24),
      itemCount: _publishers.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, i) {
        final item = _publishers[i];
        final isActive = item['isActive'] as bool? ?? true;
        final apiKey = item['apiKey'] as String? ?? '';
        final deptName = _departments
            .where((d) => d['id'] == item['autoAssignDeptId'])
            .map((d) => d['name'])
            .firstOrNull;
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: isActive
                      ? const Color(0xFF8B5CF6).withValues(alpha: 0.1)
                      : Colors.grey.withValues(alpha: 0.1),
                  child: Icon(Icons.webhook_rounded,
                      size: 18,
                      color: isActive ? const Color(0xFF8B5CF6) : Colors.grey),
                ),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(item['name'] ?? '',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: isActive
                                ? null
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.4),
                          )),
                      if (item['slug'] != null)
                        Text('slug: ${item['slug']}',
                            style: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.4),
                            )),
                    ])),
                Switch(
                    value: isActive, onChanged: (_) => _togglePublisher(item)),
                IconButton(
                    icon: const Icon(Icons.edit_rounded, size: 18),
                    onPressed: () => _editPublisher(item)),
                IconButton(
                  icon: Icon(Icons.delete_rounded,
                      size: 18, color: theme.colorScheme.error),
                  onPressed: () => _deletePublisher(item),
                ),
              ]),
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest
                      .withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(children: [
                  const Icon(Icons.key_rounded,
                      size: 14, color: Color(0xFF9CA3AF)),
                  const SizedBox(width: 6),
                  Expanded(
                      child: Text(
                    '${apiKey.substring(0, apiKey.length > 8 ? 8 : apiKey.length)}${'•' * 24}',
                    style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: Color(0xFF6B7280)),
                  )),
                  IconButton(
                    icon: const Icon(Icons.copy_rounded, size: 14),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: apiKey));
                      AppSnackbar.success(context, 'API key copied');
                    },
                    tooltip: 'Copy API Key',
                    constraints:
                        const BoxConstraints(minWidth: 28, minHeight: 28),
                    padding: EdgeInsets.zero,
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, size: 14),
                    onPressed: () => _regenPublisherKey(item),
                    tooltip: 'Regenerate Key',
                    constraints:
                        const BoxConstraints(minWidth: 28, minHeight: 28),
                    padding: EdgeInsets.zero,
                  ),
                ]),
              ),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 4, children: [
                if (deptName != null)
                  _infoChip(Icons.business_rounded, 'Dept: $deptName', theme),
                if (item['autoTemplateName'] != null &&
                    (item['autoTemplateName'] as String).isNotEmpty)
                  _infoChip(Icons.article_rounded,
                      'Template: ${item['autoTemplateName']}', theme),
                if (item['webhookUrl'] != null &&
                    (item['webhookUrl'] as String).isNotEmpty)
                  _infoChip(Icons.webhook_rounded, 'Webhook', theme),
              ]),
            ]),
          ),
        );
      },
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
        Text(label,
            style: TextStyle(
                fontSize: 11,
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w500)),
      ]),
    );
  }

  Future<void> _addPublisher() async {
    final result = await _showPublisherDialog(context);
    if (result == null || !mounted) return;
    try {
      await di.sl<DioClient>().dio.post(ApiConstants.publishers, data: result);
      AppSnackbar.success(context, 'Integration created');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _editPublisher(Map<String, dynamic> item) async {
    final result = await _showPublisherDialog(context, item: item);
    if (result == null || !mounted) return;
    try {
      await di
          .sl<DioClient>()
          .dio
          .patch(ApiConstants.publisher(item['id']), data: result);
      AppSnackbar.success(context, 'Integration updated');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _deletePublisher(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Integration'),
        content:
            Text('Delete "${item['name']}"? This action cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await di.sl<DioClient>().dio.delete(ApiConstants.publisher(item['id']));
      AppSnackbar.success(context, 'Integration deleted');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _togglePublisher(Map<String, dynamic> item) async {
    try {
      await di.sl<DioClient>().dio.patch(
        ApiConstants.publisher(item['id']),
        data: {'isActive': !(item['isActive'] as bool? ?? true)},
      );
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<void> _regenPublisherKey(Map<String, dynamic> item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Regenerate API Key'),
        content: const Text('This will invalidate the current key. Continue?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Regenerate')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await di
          .sl<DioClient>()
          .dio
          .post(ApiConstants.publisherRegenKey(item['id']));
      AppSnackbar.success(context, 'API key regenerated');
      _load();
    } catch (e) {
      AppSnackbar.error(context, _extractError(e));
    }
  }

  Future<Map<String, dynamic>?> _showPublisherDialog(BuildContext context,
      {Map<String, dynamic>? item}) async {
    final nameCtrl = TextEditingController(text: item?['name'] ?? '');
    final slugCtrl = TextEditingController(text: item?['slug'] ?? '');
    final templateCtrl =
        TextEditingController(text: item?['autoTemplateName'] ?? '');
    final webhookCtrl = TextEditingController(text: item?['webhookUrl'] ?? '');
    String? selectedDeptId = item?['autoAssignDeptId'];
    final isEdit = item != null;

    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDialogState) {
        return AlertDialog(
          title: Text(isEdit ? 'Edit Integration' : 'New Integration'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              const SizedBox(height: 8),
              TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Name'),
                  autofocus: true),
              const SizedBox(height: 12),
              TextField(
                  controller: slugCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Slug (optional)',
                      hintText: 'auto-generated from name')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                value: selectedDeptId,
                decoration:
                    const InputDecoration(labelText: 'Auto-assign Department'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('None')),
                  ..._departments.map((d) => DropdownMenuItem(
                      value: d['id'] as String, child: Text(d['name'] ?? ''))),
                ],
                onChanged: (v) => setDialogState(() => selectedDeptId = v),
              ),
              const SizedBox(height: 12),
              TextField(
                  controller: templateCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Auto Template Name (optional)')),
              const SizedBox(height: 12),
              TextField(
                  controller: webhookCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Webhook URL (optional)')),
            ])),
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
                  if (slugCtrl.text.trim().isNotEmpty)
                    'slug': slugCtrl.text.trim(),
                  'autoAssignDeptId': selectedDeptId,
                  'autoTemplateName': templateCtrl.text.trim().isEmpty
                      ? null
                      : templateCtrl.text.trim(),
                  'webhookUrl': webhookCtrl.text.trim().isEmpty
                      ? null
                      : webhookCtrl.text.trim(),
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
    try {
      final data = (e as dynamic).response?.data;
      if (data is Map && data['message'] != null)
        return data['message'].toString();
    } catch (_) {}
    return e.toString();
  }

  // ── Channel CRUD ──────────────────────────────────────────────────
  Future<void> _testChannel(String id) async {
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.post(ApiConstants.channelTest(id));
      if (!mounted) return;
      final data = response.data;
      if (data is Map && data['status'] == 'error') {
        AppSnackbar.error(
            context, data['message']?.toString() ?? 'Connection failed');
      } else {
        AppSnackbar.success(context, 'Connection verified successfully');
      }
      _load();
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      AppSnackbar.error(context, 'Connection failed: $msg');
      _load();
    }
  }

  Future<void> _testMetaChannel(String id) async {
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.post(ApiConstants.metaChannelTest(id));
      if (!mounted) return;
      final data = response.data;
      if (data is Map && data['status'] == 'error') {
        AppSnackbar.error(
          context,
          data['error']?.toString() ?? 'Meta connection failed',
        );
      } else {
        AppSnackbar.success(context, 'Meta connection verified successfully');
      }
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Connection failed: $e');
      _load();
    }
  }

  Future<void> _deleteChannel(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Channel'),
        content: Text('Permanently delete "$name"? This cannot be undone.'),
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
      await dio.delete(ApiConstants.channel(id));
      if (!mounted) return;
      AppSnackbar.success(context, 'Channel deleted');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _deleteMetaChannel(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Meta Channel'),
        content: Text('Permanently delete "$name"? This cannot be undone.'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
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
      await dio.delete(ApiConstants.metaChannel(id));
      if (!mounted) return;
      AppSnackbar.success(context, 'Meta channel deleted');
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Future<void> _showChannelDialog({Map<String, dynamic>? channel}) async {
    final isEdit = channel != null;
    String? selectedDepartmentId = channel?['departmentId']?.toString();
    final nameCtrl =
        TextEditingController(text: channel?['name']?.toString() ?? '');
    final phoneCtrl =
        TextEditingController(text: channel?['phoneNumber']?.toString() ?? '');
    final phoneIdCtrl = TextEditingController(
        text: channel?['phoneNumberId']?.toString() ?? '');
    final businessCtrl = TextEditingController(
        text: channel?['businessAccountId']?.toString() ?? '');
    final tokenCtrl = TextEditingController(text: isEdit ? '' : '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDialogState) {
        return AlertDialog(
          title: Text(isEdit ? 'Edit Channel' : 'Connect Channel'),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          content: SizedBox(
            width: 500,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Channel Name'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phoneCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Phone Number'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phoneIdCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Phone Number ID (Meta)'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: businessCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Business Account ID (optional)'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    value: _departments.any((department) =>
                            department['id']?.toString() ==
                            selectedDepartmentId)
                        ? selectedDepartmentId
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Department (optional)',
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('No department'),
                      ),
                      ..._departments.map(
                        (department) => DropdownMenuItem<String?>(
                          value: department['id']?.toString(),
                          child: Text(
                            department['name']?.toString() ?? 'Unnamed',
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) {
                      setDialogState(() => selectedDepartmentId = value);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: tokenCtrl,
                    obscureText: true,
                    maxLines: 1,
                    decoration: InputDecoration(
                      labelText: isEdit
                          ? 'Access Token (leave blank to keep)'
                          : 'Permanent Access Token',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty ||
                    phoneCtrl.text.trim().isEmpty ||
                    phoneIdCtrl.text.trim().isEmpty) {
                  AppSnackbar.error(ctx, 'Fill required fields');
                  return;
                }
                if (!isEdit && tokenCtrl.text.trim().isEmpty) {
                  AppSnackbar.error(ctx, 'Access token is required');
                  return;
                }
                try {
                  final dio = di.sl<DioClient>().dio;
                  final body = <String, dynamic>{
                    'name': nameCtrl.text.trim(),
                    'phoneNumber': phoneCtrl.text.trim(),
                    'phoneNumberId': phoneIdCtrl.text.trim(),
                    'departmentId': selectedDepartmentId,
                    if (businessCtrl.text.trim().isNotEmpty)
                      'businessAccountId': businessCtrl.text.trim(),
                    if (tokenCtrl.text.trim().isNotEmpty)
                      'accessToken': tokenCtrl.text.trim(),
                  };
                  if (isEdit) {
                    await dio.patch(ApiConstants.channel(channel['id']),
                        data: body);
                  } else {
                    await dio.post(ApiConstants.channels, data: body);
                  }
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } catch (e) {
                  if (ctx.mounted) {
                    AppSnackbar.error(ctx, 'Failed: $e');
                  }
                }
              },
              child: Text(isEdit ? 'Save' : 'Connect'),
            ),
          ],
        );
      }),
    );

    nameCtrl.dispose();
    phoneCtrl.dispose();
    phoneIdCtrl.dispose();
    businessCtrl.dispose();
    tokenCtrl.dispose();

    if (saved == true) _load();
  }

  Future<void> _showMetaChannelDialog({Map<String, dynamic>? channel}) async {
    final isEdit = channel != null;
    var platform = (channel?['platform'] ?? 'instagram').toString();
    String? selectedDepartmentId = channel?['departmentId']?.toString();

    final nameCtrl =
        TextEditingController(text: channel?['name']?.toString() ?? '');
    final pageIdCtrl =
        TextEditingController(text: channel?['pageId']?.toString() ?? '');
    final pageNameCtrl =
        TextEditingController(text: channel?['pageName']?.toString() ?? '');
    final igAccountCtrl = TextEditingController(
      text: channel?['instagramAccountId']?.toString() ?? '',
    );
    final tokenCtrl = TextEditingController();
    final verifyTokenCtrl = TextEditingController(
      text:
          channel?['webhookVerifyToken']?.toString() ?? _defaultMetaVerifyToken,
    );

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            title: Text(isEdit ? 'Edit Meta Channel' : 'Add Meta Channel'),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            content: SizedBox(
              width: 560,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: platform,
                      decoration: const InputDecoration(labelText: 'Platform'),
                      items: const [
                        DropdownMenuItem(
                          value: 'instagram',
                          child: Text('Instagram DM'),
                        ),
                        DropdownMenuItem(
                          value: 'messenger',
                          child: Text('Facebook Messenger'),
                        ),
                      ],
                      onChanged: (value) {
                        if (value == null) return;
                        setDialogState(() => platform = value);
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameCtrl,
                      decoration:
                          const InputDecoration(labelText: 'Channel Name'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: pageIdCtrl,
                      decoration: const InputDecoration(labelText: 'Page ID'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: pageNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Page Name (optional)',
                      ),
                    ),
                    if (platform == 'instagram') ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: igAccountCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Instagram Account ID',
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: tokenCtrl,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: isEdit
                            ? 'Page Access Token (leave blank to keep)'
                            : 'Page Access Token',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: verifyTokenCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Webhook Verify Token',
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String?>(
                      value: _departments.any((department) =>
                              department['id']?.toString() ==
                              selectedDepartmentId)
                          ? selectedDepartmentId
                          : null,
                      decoration: const InputDecoration(
                        labelText: 'Department (optional)',
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('No department'),
                        ),
                        ..._departments.map(
                          (department) => DropdownMenuItem<String?>(
                            value: department['id']?.toString(),
                            child: Text(
                              department['name']?.toString() ?? 'Unnamed',
                            ),
                          ),
                        ),
                      ],
                      onChanged: (value) {
                        setDialogState(() => selectedDepartmentId = value);
                      },
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.14),
                        ),
                      ),
                      child: const Text(
                        'Use the same verify token you configured in Meta Dashboard. For Instagram, make sure the connected business account belongs to this Facebook Page.',
                        style: TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () async {
                  if (nameCtrl.text.trim().isEmpty ||
                      pageIdCtrl.text.trim().isEmpty) {
                    AppSnackbar.error(ctx, 'Fill required fields');
                    return;
                  }
                  if (platform == 'instagram' &&
                      igAccountCtrl.text.trim().isEmpty &&
                      !isEdit) {
                    AppSnackbar.error(ctx, 'Instagram Account ID is required');
                    return;
                  }
                  if (!isEdit && tokenCtrl.text.trim().isEmpty) {
                    AppSnackbar.error(ctx, 'Page access token is required');
                    return;
                  }
                  try {
                    final dio = di.sl<DioClient>().dio;
                    final body = <String, dynamic>{
                      'name': nameCtrl.text.trim(),
                      'platform': platform,
                      'pageId': pageIdCtrl.text.trim(),
                      if (pageNameCtrl.text.trim().isNotEmpty)
                        'pageName': pageNameCtrl.text.trim(),
                      if (platform == 'instagram' &&
                          igAccountCtrl.text.trim().isNotEmpty)
                        'instagramAccountId': igAccountCtrl.text.trim(),
                      if (tokenCtrl.text.trim().isNotEmpty)
                        'accessToken': tokenCtrl.text.trim(),
                      if (verifyTokenCtrl.text.trim().isNotEmpty)
                        'webhookVerifyToken': verifyTokenCtrl.text.trim(),
                      'departmentId': selectedDepartmentId,
                    };
                    if (isEdit) {
                      await dio.patch(
                        ApiConstants.metaChannel(channel['id'].toString()),
                        data: body,
                      );
                    } else {
                      await dio.post(ApiConstants.metaChannels, data: body);
                    }
                    if (ctx.mounted) Navigator.pop(ctx, true);
                  } catch (e) {
                    if (ctx.mounted) {
                      AppSnackbar.error(ctx, 'Failed: $e');
                    }
                  }
                },
                child: Text(isEdit ? 'Save' : 'Add Channel'),
              ),
            ],
          );
        },
      ),
    );

    nameCtrl.dispose();
    pageIdCtrl.dispose();
    pageNameCtrl.dispose();
    igAccountCtrl.dispose();
    tokenCtrl.dispose();
    verifyTokenCtrl.dispose();

    if (saved == true) _load();
  }

  Future<void> _startMetaSignup() async {
    try {
      // Step 1: Launch Meta OAuth login
      final result = await launchMetaLogin();

      if (!mounted) return;

      // Step 2: Show loading while fetching pages
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );

      final dio = di.sl<DioClient>().dio;
      final pagesResp = await dio.post(
        '${ApiConstants.metaChannels}/embedded-signup/pages',
        data: {'code': result.code},
      );

      if (!mounted) return;
      Navigator.pop(context); // close loader

      final pages = List<Map<String, dynamic>>.from(pagesResp.data as List);

      if (pages.isEmpty) {
        AppSnackbar.error(context, 'No Facebook Pages found for this account');
        return;
      }

      // Step 3: Show page picker
      await _showMetaPagePicker(pages);
    } catch (e) {
      if (!mounted) return;
      // close loader if still open
      if (Navigator.canPop(context)) Navigator.pop(context);
      if (e.toString().contains('cancelled')) return;
      AppSnackbar.error(context, 'Meta login failed: $e');
    }
  }

  Future<void> _showMetaPagePicker(List<Map<String, dynamic>> pages) async {
    String? selectedPlatform;
    String? selectedDepartmentId;
    Map<String, dynamic>? selectedPage;
    final nameCtrl = TextEditingController();

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDs) {
          final theme = Theme.of(ctx);
          final page = selectedPage;
          final hasIg = page != null &&
              (page['instagramAccountId'] ?? '').toString().isNotEmpty;

          // Auto-set platform when page selected
          if (page != null && selectedPlatform == null) {
            selectedPlatform = hasIg ? 'instagram' : 'messenger';
          }

          return AlertDialog(
            title: const Text('Connect Meta Page'),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    Text('Select a Facebook Page',
                        style: theme.textTheme.labelMedium),
                    const SizedBox(height: 8),
                    ...pages.map((p) {
                      final ig = (p['instagramAccountId'] ?? '').toString();
                      final igUser = (p['instagramUsername'] ?? '').toString();
                      final isSelected = selectedPage?['pageId'] == p['pageId'];
                      return GestureDetector(
                        onTap: () => setDs(() {
                          selectedPage = p;
                          selectedPlatform =
                              ig.isNotEmpty ? 'instagram' : 'messenger';
                          if (nameCtrl.text.isEmpty) {
                            nameCtrl.text = p['pageName'] ?? '';
                          }
                        }),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppColors.primary.withValues(alpha: 0.08)
                                : theme.colorScheme.surface,
                            border: Border.all(
                              color: isSelected
                                  ? AppColors.primary
                                  : theme.dividerColor,
                              width: isSelected ? 1.5 : 1,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.pages_rounded,
                                  size: 20, color: AppColors.primary),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p['pageName'] ?? '',
                                        style: theme.textTheme.bodyMedium
                                            ?.copyWith(
                                                fontWeight: FontWeight.w600)),
                                    Text(
                                      ig.isNotEmpty
                                          ? 'Instagram: @$igUser (ID $ig)'
                                          : 'Messenger only',
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              if (isSelected)
                                const Icon(Icons.check_circle_rounded,
                                    color: AppColors.primary, size: 20),
                            ],
                          ),
                        ),
                      );
                    }),
                    if (selectedPage != null) ...[
                      const SizedBox(height: 16),
                      // Platform selector (only for pages WITH IG)
                      if (hasIg)
                        DropdownButtonFormField<String>(
                          value: selectedPlatform,
                          decoration:
                              const InputDecoration(labelText: 'Platform'),
                          items: const [
                            DropdownMenuItem(
                                value: 'instagram',
                                child: Text('Instagram DM')),
                            DropdownMenuItem(
                                value: 'messenger',
                                child: Text('Facebook Messenger')),
                          ],
                          onChanged: (v) => setDs(() => selectedPlatform = v),
                        ),
                      if (hasIg) const SizedBox(height: 12),
                      TextField(
                        controller: nameCtrl,
                        decoration:
                            const InputDecoration(labelText: 'Channel Name'),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String?>(
                        value: _departments.any((d) =>
                                d['id']?.toString() == selectedDepartmentId)
                            ? selectedDepartmentId
                            : null,
                        decoration: const InputDecoration(
                            labelText: 'Department (optional)'),
                        items: [
                          const DropdownMenuItem<String?>(
                              value: null, child: Text('No department')),
                          ..._departments.map((d) => DropdownMenuItem<String?>(
                                value: d['id']?.toString(),
                                child: Text(d['name']?.toString() ?? 'Unnamed'),
                              )),
                        ],
                        onChanged: (v) => setDs(() => selectedDepartmentId = v),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel')),
              FilledButton(
                onPressed: selectedPage == null
                    ? null
                    : () async {
                        if (nameCtrl.text.trim().isEmpty) {
                          AppSnackbar.error(ctx, 'Enter a channel name');
                          return;
                        }
                        try {
                          final dio = di.sl<DioClient>().dio;
                          await dio.post(
                            '${ApiConstants.metaChannels}/embedded-signup/complete',
                            data: {
                              'name': nameCtrl.text.trim(),
                              'platform': selectedPlatform ??
                                  (hasIg ? 'instagram' : 'messenger'),
                              'pageId': selectedPage!['pageId'],
                              'pageName': selectedPage!['pageName'],
                              'pageAccessToken':
                                  selectedPage!['pageAccessToken'],
                              if ((selectedPage!['instagramAccountId'] ?? '')
                                      .toString()
                                      .isNotEmpty &&
                                  (selectedPlatform ?? 'instagram') ==
                                      'instagram')
                                'instagramAccountId':
                                    selectedPage!['instagramAccountId'],
                              if (selectedDepartmentId != null)
                                'departmentId': selectedDepartmentId,
                            },
                          );
                          if (ctx.mounted) Navigator.pop(ctx, true);
                        } catch (e) {
                          if (ctx.mounted) {
                            AppSnackbar.error(ctx, 'Failed: $e');
                          }
                        }
                      },
                child: const Text('Connect'),
              ),
            ],
          );
        },
      ),
    );

    nameCtrl.dispose();
    if (saved == true) _load();
  }

  Future<void> _startEmbeddedSignup() async {
    try {
      final result = await launchEmbeddedSignup(_fbConfigId);

      if (result.phoneNumberId == null || result.wabaId == null) {
        if (!mounted) return;
        AppSnackbar.error(
            context, 'Signup incomplete - missing WABA or phone number data');
        return;
      }

      if (!mounted) return;
      // Show loading indicator
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );

      final dio = di.sl<DioClient>().dio;
      await dio.post(ApiConstants.channelEmbeddedSignup, data: {
        'code': result.code,
        'wabaId': result.wabaId,
        'phoneNumberId': result.phoneNumberId,
      });

      if (!mounted) return;
      Navigator.of(context).pop(); // dismiss loading
      AppSnackbar.success(context, 'WhatsApp channel connected successfully!');
      _load();
    } catch (e) {
      if (!mounted) return;
      // Dismiss loading dialog if showing
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      final msg = e.toString();
      if (!msg.contains('cancelled')) {
        AppSnackbar.error(
            context, 'Signup failed: ${msg.replaceFirst("Exception: ", "")}');
      }
    }
  }
}

enum _ChannelView { whatsapp, meta, integrations }

class _ChannelTypeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final int count;
  final bool selected;
  final Color activeColor;
  final VoidCallback onTap;

  const _ChannelTypeChip({
    required this.label,
    required this.icon,
    required this.count,
    required this.selected,
    required this.activeColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color:
              selected ? primary.withValues(alpha: 0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color:
                selected ? primary.withValues(alpha: 0.30) : theme.dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 18,
                color: selected
                    ? primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.55)),
            const SizedBox(width: 8),
            Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: selected
                    ? primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.75),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: selected
                    ? primary.withValues(alpha: 0.12)
                    : theme.colorScheme.onSurface.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected
                      ? primary
                      : theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Channel Card Widget ──────────────────────────────────
class _ChannelCard extends StatelessWidget {
  final Map<String, dynamic> channel;
  final String? departmentName;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _ChannelCard({
    required this.channel,
    this.departmentName,
    required this.onTest,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = channel['name'] ?? 'Unnamed';
    final phone = channel['phoneNumber'] ?? '';
    final status = (channel['status'] ?? 'disconnected').toString();
    final isConnected = status == 'connected';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFF25D366).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.chat_rounded,
                        color: Color(0xFF25D366), size: 22),
                    Text('Cloud api',
                        style: TextStyle(
                          fontSize: 7,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF25D366).withValues(alpha: 0.8),
                        )),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.toString(),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Whatsapp',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _StatusBadge(
                      label: status.toUpperCase(), connected: isConnected),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: onTest,
                    icon: const Icon(Icons.wifi_tethering_rounded, size: 18),
                    tooltip: 'Test Connection',
                    style: IconButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      backgroundColor: const Color(0xFFF3F4F6),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_rounded, size: 18),
                    tooltip: 'Edit',
                    style: IconButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      backgroundColor: const Color(0xFFF3F4F6),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    tooltip: 'Delete',
                    style: IconButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      backgroundColor: const Color(0xFFF3F4F6),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              phone.toString(),
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                color: Color(0xFF374151),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (departmentName != null && departmentName!.isNotEmpty)
                _MetaInfoPill(
                  label: 'Department',
                  value: departmentName!,
                  color: const Color(0xFF6B7280),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaChannelCard extends StatelessWidget {
  final Map<String, dynamic> channel;
  final String? departmentName;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _MetaChannelCard({
    required this.channel,
    this.departmentName,
    required this.onTest,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = channel['name'] ?? 'Unnamed';
    final platform = (channel['platform'] ?? 'instagram').toString();
    final pageId = (channel['pageId'] ?? 'Unknown').toString();
    final pageName = (channel['pageName'] ?? '').toString();
    final status = (channel['status'] ?? 'pending').toString();
    final isConnected = status == 'connected';
    final instagramAccountId = (channel['instagramAccountId'] ?? '').toString();
    final accent =
        platform == 'instagram' ? const Color(0xFFE4405F) : AppColors.primary;
    final platformLabel =
        platform == 'instagram' ? 'Instagram DM' : 'Facebook Messenger';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: accent.withValues(alpha: isConnected ? 0.24 : 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  platform == 'instagram'
                      ? Icons.camera_alt_rounded
                      : Icons.forum_rounded,
                  color: accent,
                  size: 22,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.toString(),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      platformLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _StatusBadge(
                      label: status.toUpperCase(), connected: isConnected),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: onTest,
                    icon: const Icon(Icons.wifi_tethering_rounded, size: 18),
                    tooltip: 'Test Connection',
                    style: IconButton.styleFrom(
                      foregroundColor: accent,
                      backgroundColor: accent.withValues(alpha: 0.08),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_rounded, size: 18),
                    tooltip: 'Edit',
                    style: IconButton.styleFrom(
                      foregroundColor: AppColors.brandGreenDark,
                      backgroundColor:
                          AppColors.primary.withValues(alpha: 0.08),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_rounded, size: 18),
                    tooltip: 'Delete',
                    style: IconButton.styleFrom(
                      foregroundColor: const Color(0xFFEF4444),
                      backgroundColor:
                          const Color(0xFFEF4444).withValues(alpha: 0.08),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetaInfoPill(label: 'Page ID', value: pageId, color: accent),
              if (pageName.isNotEmpty)
                _MetaInfoPill(label: 'Page', value: pageName, color: accent),
              if (instagramAccountId.isNotEmpty)
                _MetaInfoPill(
                  label: 'Instagram ID',
                  value: instagramAccountId,
                  color: accent,
                ),
              if (departmentName != null && departmentName!.isNotEmpty)
                _MetaInfoPill(
                  label: 'Department',
                  value: departmentName!,
                  color: accent,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaInfoPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _MetaInfoPill({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(6),
      ),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(fontSize: 12.5),
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(
                  fontWeight: FontWeight.w500, color: Color(0xFF6B7280)),
            ),
            TextSpan(
              text: value,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: Color(0xFF374151),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String label;
  final bool connected;
  const _StatusBadge({required this.label, required this.connected});

  @override
  Widget build(BuildContext context) {
    final color = connected ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.3,
                color: color),
          ),
        ],
      ),
    );
  }
}
