import 'package:flutter/material.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:intl/intl.dart';

class BroadcastsPage extends StatefulWidget {
  const BroadcastsPage({super.key});

  @override
  State<BroadcastsPage> createState() => _BroadcastsPageState();
}

class _BroadcastsPageState extends State<BroadcastsPage> {
  List<dynamic> _broadcasts = [];
  bool _loading = true;
  String? _error;
  int _page = 1;
  int _total = 0;
  int _totalPages = 1;

  @override
  void initState() {
    super.initState();
    _loadBroadcasts();
  }

  Future<void> _loadBroadcasts() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get(ApiConstants.broadcasts, queryParameters: {'page': _page, 'limit': 20});
      final data = response.data;
      setState(() {
        _broadcasts = data['data'] ?? [];
        _total = data['meta']?['total'] ?? 0;
        _totalPages = data['meta']?['totalPages'] ?? 1;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _sendBroadcast(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Send Broadcast', style: TextStyle(fontWeight: FontWeight.w700)),
        content: const Text('This will send messages to all your contacts. This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF3B82F6)),
            child: const Text('Send Now'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final dio = di.sl<DioClient>().dio;
      await dio.post(ApiConstants.broadcastSend(id));
      _loadBroadcasts();
      if (mounted) AppSnackbar.success(context, 'Broadcast is being sent!');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Send failed: $e');
    }
  }

  Future<void> _deleteBroadcast(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Broadcast', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Text('Delete "$name"? This cannot be undone.'),
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
    if (confirmed != true) return;
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.delete(ApiConstants.broadcast(id));
      _loadBroadcasts();
      if (mounted) AppSnackbar.success(context, 'Broadcast deleted');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Delete failed: $e');
    }
  }

  Color _getStatusColor(String status) {
    return switch (status) {
      'sent' => const Color(0xFF42B72A),
      'sending' => const Color(0xFF3B82F6),
      'scheduled' => const Color(0xFFF59E0B),
      'failed' => Colors.red,
      _ => const Color(0xFF9CA3AF),
    };
  }

  IconData _getStatusIcon(String status) {
    return switch (status) {
      'sent' => Icons.check_circle_rounded,
      'sending' => Icons.send_rounded,
      'scheduled' => Icons.schedule_rounded,
      'failed' => Icons.error_rounded,
      _ => Icons.edit_note_rounded,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 20),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              border: Border(bottom: BorderSide(color: theme.dividerColor)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                    IconButton(
                      onPressed: _loadBroadcasts,
                      icon: Icon(Icons.refresh_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                      tooltip: 'Refresh',
                    ),
                    const SizedBox(width: 8),
                    FilledButton.icon(
                      onPressed: () => _showCreateWizard(),
                      icon: const Icon(Icons.campaign_rounded, size: 18),
                      label: const Text('New Broadcast'),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ],
                ),
          ),

          // Content
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? _buildError(theme)
                    : _broadcasts.isEmpty
                        ? _buildEmptyState(theme)
                        : _buildList(theme),
          ),

          // Pagination
          if (_totalPages > 1) _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildError(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline_rounded, size: 40, color: Colors.red),
          const SizedBox(height: 12),
          Text('Failed to load broadcasts', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          TextButton(onPressed: _loadBroadcasts, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
            ),
            child: const Icon(Icons.campaign_rounded, size: 52, color: Color(0xFF3B82F6)),
          ),
          const SizedBox(height: 24),
          Text('No broadcasts yet', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(
            'Send bulk messages to all your contacts at once',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _showCreateWizard(),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Create First Broadcast'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(ThemeData theme) {
    return ListView.separated(
      padding: const EdgeInsets.all(24),
      itemCount: _broadcasts.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (ctx, i) {
        final b = _broadcasts[i];
        final status = b['status'] ?? 'draft';
        final statusColor = _getStatusColor(status);
        final statusIcon = _getStatusIcon(status);
        final isTemplate = b['broadcastType'] == 'template';
        final createdAt = b['createdAt'] != null ? DateTime.tryParse(b['createdAt']) : null;

        return Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.dividerColor),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(statusIcon, color: statusColor, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(b['name'] ?? 'Untitled', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                            const SizedBox(width: 8),
                            if (isTemplate)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF8B5CF6).withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text('Template', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF8B5CF6))),
                              ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          isTemplate
                              ? (b['templateName'] ?? 'No template selected')
                              : (() { final msg = b['message']?.toString() ?? ''; return msg.length > 100 ? '${msg.substring(0, 100)}...' : msg.isEmpty ? 'No message' : msg; })(),
                          style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          status.toString().toUpperCase(),
                          style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (createdAt != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          DateFormat('MMM d, yyyy').format(createdAt),
                          style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _statChip(theme, Icons.people_rounded, '${b['totalRecipients'] ?? 0}', 'Recipients'),
                  const SizedBox(width: 16),
                  _statChip(theme, Icons.send_rounded, '${b['sentCount'] ?? 0}', 'Sent'),
                  const SizedBox(width: 16),
                  _statChip(theme, Icons.done_all_rounded, '${b['deliveredCount'] ?? 0}', 'Delivered'),
                  const SizedBox(width: 16),
                  _statChip(theme, Icons.visibility_rounded, '${b['readCount'] ?? 0}', 'Read'),
                  if ((b['failedCount'] ?? 0) > 0) ...[
                    const SizedBox(width: 16),
                    _statChip(theme, Icons.error_outline_rounded, '${b['failedCount']}', 'Failed', color: Colors.red),
                  ],
                  const Spacer(),
                  if (status == 'draft' || status == 'scheduled') ...[
                    OutlinedButton.icon(
                      onPressed: () => _sendBroadcast(b['id']),
                      icon: const Icon(Icons.send_rounded, size: 15),
                      label: const Text('Send Now'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF3B82F6),
                        side: const BorderSide(color: Color(0xFF3B82F6)),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  IconButton(
                    onPressed: () => _deleteBroadcast(b['id'], b['name'] ?? 'Untitled'),
                    icon: Icon(Icons.delete_outline_rounded, size: 18, color: theme.colorScheme.error),
                    tooltip: 'Delete',
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _statChip(ThemeData theme, IconData icon, String value, String label, {Color? color}) {
    final c = color ?? theme.colorScheme.onSurface.withValues(alpha: 0.5);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: c),
        const SizedBox(width: 4),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color ?? theme.colorScheme.onSurface.withValues(alpha: 0.7))),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
      ],
    );
  }

  Widget _buildPagination(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: _page > 1 ? () { setState(() => _page--); _loadBroadcasts(); } : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Text('Page $_page of $_totalPages', style: theme.textTheme.bodySmall),
          IconButton(
            onPressed: _page < _totalPages ? () { setState(() => _page++); _loadBroadcasts(); } : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }

  void _showCreateWizard() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _BroadcastWizardDialog(
        onCreated: (id, sendNow) async {
          _loadBroadcasts();
          if (sendNow && mounted) await _sendBroadcast(id);
        },
      ),
    );
  }
}

// ============================================================
// Broadcast Create Wizard
// ============================================================
class _BroadcastWizardDialog extends StatefulWidget {
  final Future<void> Function(String id, bool sendNow) onCreated;
  const _BroadcastWizardDialog({required this.onCreated});

  @override
  State<_BroadcastWizardDialog> createState() => _BroadcastWizardDialogState();
}

class _BroadcastWizardDialogState extends State<_BroadcastWizardDialog> {
  int _step = 0; // 0: name, 1: type & channel, 2: audience, 3: message/template, 4: review

  final _nameCtrl = TextEditingController();
  final _contactSearchCtrl = TextEditingController();

  String _broadcastType = 'template'; // 'text' | 'template'
  String? _selectedChannelId;
  String? _selectedChannelName;
  String? _selectedTemplateName;
  String? _selectedLanguageCode;

  String _audienceMode = 'all'; // 'all' | 'selected'
  final Set<String> _selectedContactIds = <String>{};
  final Set<String> _filterTags = <String>{};
  List<String> _availableTags = [];
  bool _loadingTags = false;

  String _textMessage = '';
  String? _testContactId;

  final _importPhonesCtrl = TextEditingController();

  bool _sendNow = true;
  bool _saving = false;
  bool _sendingTest = false;

  List<dynamic> _channels = [];
  List<dynamic> _templates = [];
  List<dynamic> _contacts = [];

  bool _loadingChannels = false;
  bool _loadingTemplates = false;
  bool _loadingContacts = false;

  @override
  void initState() {
    super.initState();
    _loadChannels();
    _loadContacts();
    _loadTags();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _contactSearchCtrl.dispose();
    _importPhonesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadTags() async {
    setState(() => _loadingTags = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(ApiConstants.contacts, queryParameters: {'page': 1, 'limit': 200});
      final data = res.data;
      final contacts = data is List ? data : (data['contacts'] is List ? data['contacts'] : (data['data'] ?? []));
      final tagSet = <String>{};
      for (final c in contacts) {
        final tags = c['tags'];
        if (tags is List) {
          for (final t in tags) {
            final s = t?.toString().trim();
            if (s != null && s.isNotEmpty) tagSet.add(s);
          }
        }
      }
      setState(() {
        _availableTags = tagSet.toList()..sort();
        _loadingTags = false;
      });
    } catch (_) {
      setState(() => _loadingTags = false);
    }
  }

  int get _estimatedRecipients {
    if (_audienceMode == 'selected') return _selectedContactIds.length;
    if (_filterTags.isEmpty) {
      return _contacts.where((c) => (c['phone']?.toString().trim().isNotEmpty ?? false)).length;
    }
    return _contacts.where((c) {
      final phone = c['phone']?.toString().trim() ?? '';
      if (phone.isEmpty) return false;
      final tags = c['tags'];
      if (tags is! List) return false;
      return _filterTags.any((ft) => tags.any((t) => t?.toString() == ft));
    }).length;
  }

  String get _costEstimate {
    final count = _estimatedRecipients;
    if (_broadcastType == 'template') {
      final cost = count * 0.0466;
      return '~\$${cost.toStringAsFixed(2)} USD (${count} × \$0.0466/template)';
    } else {
      final cost = count * 0.0118;
      return '~\$${cost.toStringAsFixed(2)} USD (${count} × \$0.0118/session)';
    }
  }

  Future<void> _loadChannels() async {
    setState(() => _loadingChannels = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(ApiConstants.channels);
      setState(() {
        _channels = res.data is List ? res.data : (res.data['data'] ?? []);
        _loadingChannels = false;
      });
    } catch (_) {
      setState(() => _loadingChannels = false);
    }
  }

  Future<void> _loadTemplates(String channelId) async {
    setState(() { _loadingTemplates = true; _templates = []; });
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(ApiConstants.channelTemplates(channelId));
      setState(() {
        _templates = res.data is List ? res.data : (res.data['data'] ?? []);
        _loadingTemplates = false;
      });
    } catch (_) {
      setState(() => _loadingTemplates = false);
    }
  }

  Future<void> _loadContacts({String search = ''}) async {
    setState(() => _loadingContacts = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(
        ApiConstants.contacts,
        queryParameters: {
          'page': 1,
          'limit': 40,
          if (search.trim().isNotEmpty) 'search': search.trim(),
        },
      );
      final data = res.data;
      final contacts = data is List
          ? data
          : (data['contacts'] is List ? data['contacts'] : (data['data'] ?? []));

      setState(() {
        _contacts = contacts;
        _loadingContacts = false;

        final candidates = _testCandidates;
        if (_testContactId == null && candidates.isNotEmpty) {
          _testContactId = candidates.first['id']?.toString();
        }
      });
    } catch (_) {
      setState(() => _loadingContacts = false);
    }
  }

  List<dynamic> get _testCandidates {
    final source = _audienceMode == 'selected'
        ? _contacts.where((c) => _selectedContactIds.contains(c['id']?.toString())).toList()
        : _contacts;

    return source
        .where((c) => (c['phone']?.toString().trim().isNotEmpty ?? false))
        .toList();
  }

  bool get _canSendTest {
    if (_selectedChannelId == null || _testContactId == null) return false;
    if (_broadcastType == 'template') return _selectedTemplateName != null;
    return _textMessage.trim().isNotEmpty;
  }

  String _selectedTemplateBody() {
    if (_selectedTemplateName == null) return '';
    final match = _templates.cast<dynamic>().firstWhere(
      (t) => t != null && t['name']?.toString() == _selectedTemplateName,
      orElse: () => null,
    );
    if (match == null) return '';
    final components = match['components'] as List? ?? [];
    final bodyComp = components.cast<dynamic>().firstWhere(
      (c) => c != null && c['type']?.toString().toUpperCase() == 'BODY',
      orElse: () => null,
    );
    return bodyComp?['text']?.toString() ?? '';
  }

  Future<void> _sendTestMessage() async {
    if (!_canSendTest || _sendingTest) return;
    setState(() => _sendingTest = true);

    try {
      final dio = di.sl<DioClient>().dio;
      await dio.post(
        ApiConstants.broadcastTestSend,
        data: {
          'broadcastType': _broadcastType,
          'channelId': _selectedChannelId,
          'contactId': _testContactId,
          if (_broadcastType == 'text') 'message': _textMessage.trim(),
          if (_broadcastType == 'template') 'templateName': _selectedTemplateName,
          if (_broadcastType == 'template') 'languageCode': _selectedLanguageCode ?? 'en_US',
        },
      );

      if (mounted) {
        AppSnackbar.success(context, 'Test message sent successfully');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to send test message: $e');
      }
    } finally {
      if (mounted) setState(() => _sendingTest = false);
    }
  }

  void _toggleContact(dynamic c) {
    final id = c['id']?.toString();
    if (id == null) return;

    setState(() {
      if (_selectedContactIds.contains(id)) {
        _selectedContactIds.remove(id);
      } else {
        _selectedContactIds.add(id);
      }

      final candidates = _testCandidates;
      if (candidates.isEmpty) {
        _testContactId = null;
      } else if (_testContactId == null || !candidates.any((x) => x['id']?.toString() == _testContactId)) {
        _testContactId = candidates.first['id']?.toString();
      }
    });
  }

  String _displayContactName(dynamic c) {
    final name = c['name']?.toString().trim();
    final phone = c['phone']?.toString().trim();
    if (name != null && name.isNotEmpty) return name;
    if (phone != null && phone.isNotEmpty) return phone;
    return 'Unknown Contact';
  }

  bool get _canProceed {
    return switch (_step) {
      0 => _nameCtrl.text.trim().isNotEmpty,
      1 => _selectedChannelId != null,
      2 => _audienceMode == 'selected' ? _selectedContactIds.isNotEmpty : true,
      3 => _broadcastType == 'template' ? _selectedTemplateName != null : _textMessage.trim().isNotEmpty,
      _ => true,
    };
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final body = {
        'name': _nameCtrl.text.trim(),
        'broadcastType': _broadcastType,
        'channelId': _selectedChannelId,
        'recipientFilter': _audienceMode == 'selected'
            ? {'mode': 'selected', 'contactIds': _selectedContactIds.toList()}
            : {'mode': 'all', if (_filterTags.isNotEmpty) 'tags': _filterTags.toList()},
        if (_broadcastType == 'template') 'templateName': _selectedTemplateName,
        if (_broadcastType == 'template') 'languageCode': _selectedLanguageCode ?? 'en_US',
        if (_broadcastType == 'text') 'message': _textMessage.trim(),
      };
      final res = await dio.post(ApiConstants.broadcasts, data: body);
      final id = res.data['id'];
      final sendNow = _sendNow;
      if (mounted) Navigator.pop(context);
      await widget.onCreated(id, sendNow);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to create: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final steps = ['Name', 'Channel', 'Audience', 'Message', 'Review'];

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        width: 820,
        constraints: const BoxConstraints(maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(28, 24, 20, 20),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                border: Border(bottom: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.campaign_rounded, color: Color(0xFF3B82F6), size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('New Broadcast', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                        Text('Step ${_step + 1} of ${steps.length}: ${steps[_step]}', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
                ],
              ),
            ),

            // Step indicator
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 16, 28, 0),
              child: Row(
                children: List.generate(steps.length, (i) {
                  final active = i == _step;
                  final done = i < _step;
                  return Expanded(
                    child: Row(
                      children: [
                        Container(
                          width: 28, height: 28,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: done
                                ? const Color(0xFF42B72A)
                                : active
                                    ? const Color(0xFF3B82F6)
                                    : theme.dividerColor,
                          ),
                          child: Center(
                            child: done
                                ? const Icon(Icons.check, size: 14, color: Colors.white)
                                : Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? Colors.white : theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                          ),
                        ),
                        if (i < steps.length - 1)
                          Expanded(
                            child: Container(
                              height: 2,
                              color: done ? const Color(0xFF42B72A) : theme.dividerColor,
                            ),
                          ),
                      ],
                    ),
                  );
                }),
              ),
            ),

            // Step content
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(28),
                child: _buildStepContent(theme),
              ),
            ),

            // Footer
            Container(
              padding: const EdgeInsets.fromLTRB(28, 16, 28, 20),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
                border: Border(top: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                children: [
                  if (_step > 0)
                    OutlinedButton(
                      onPressed: () => setState(() => _step--),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Back'),
                    ),
                  const Spacer(),
                  if (_step < steps.length - 1)
                    FilledButton(
                      onPressed: _canProceed ? () => setState(() => _step++) : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Continue'),
                    )
                  else
                    FilledButton(
                      onPressed: _saving ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: _sendNow ? const Color(0xFF3B82F6) : const Color(0xFF9CA3AF),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _saving
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(_sendNow ? 'Create & Send' : 'Save as Draft'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepContent(ThemeData theme) {
    return switch (_step) {
      0 => _buildNameStep(theme),
      1 => _buildChannelStep(theme),
      2 => _buildAudienceStep(theme),
      3 => _buildMessageStep(theme),
      _ => _buildReviewStep(theme),
    };
  }

  Widget _buildNameStep(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Broadcast Name', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Give your broadcast a recognizable name for internal reference.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
        const SizedBox(height: 16),
        TextField(
          controller: _nameCtrl,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'e.g., Promo Ramadan 2025',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            prefixIcon: const Icon(Icons.label_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildChannelStep(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Message Type', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _typeOption(theme, 'template', Icons.view_module_rounded, 'WhatsApp Template', 'Use pre-approved templates')),
            const SizedBox(width: 12),
            Expanded(child: _typeOption(theme, 'text', Icons.chat_bubble_rounded, 'Text Message', 'Send a plain text message')),
          ],
        ),
        const SizedBox(height: 24),
        Text('WhatsApp Channel', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Select the WhatsApp number to send from.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
        const SizedBox(height: 12),
        if (_loadingChannels)
          const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
        else if (_channels.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Row(
              children: [
                Icon(Icons.warning_rounded, color: Colors.orange, size: 18),
                SizedBox(width: 8),
                Expanded(child: Text('No WhatsApp channels configured.', style: TextStyle(fontSize: 13))),
              ],
            ),
          )
        else
          ...(_channels.map((ch) {
            final id = ch['id']?.toString() ?? '';
            final name = ch['name'] ?? ch['phoneNumber'] ?? 'Channel';
            final phone = ch['phoneNumber']?.toString();
            final selected = _selectedChannelId == id;
            return GestureDetector(
              onTap: () {
                setState(() {
                  _selectedChannelId = id;
                  _selectedChannelName = name;
                  _selectedTemplateName = null;
                });
                if (_broadcastType == 'template') _loadTemplates(id);
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: selected ? const Color(0xFF3B82F6) : theme.dividerColor, width: selected ? 2 : 1),
                  color: selected ? const Color(0xFF3B82F6).withValues(alpha: 0.06) : theme.colorScheme.surface,
                ),
                child: Row(
                  children: [
                    Icon(Icons.phone_android_rounded, color: selected ? const Color(0xFF3B82F6) : theme.colorScheme.onSurface.withValues(alpha: 0.4), size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: selected ? const Color(0xFF3B82F6) : null)),
                          if (phone != null && phone != name)
                            Text(phone, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                        ],
                      ),
                    ),
                    if (selected) const Icon(Icons.check_circle_rounded, color: Color(0xFF3B82F6), size: 20),
                  ],
                ),
              ),
            );
          })),
      ],
    );
  }

  Widget _typeOption(ThemeData theme, String value, IconData icon, String title, String subtitle) {
    final selected = _broadcastType == value;
    return GestureDetector(
      onTap: () {
        setState(() { _broadcastType = value; _selectedTemplateName = null; });
        if (value == 'template' && _selectedChannelId != null) _loadTemplates(_selectedChannelId!);
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? const Color(0xFF3B82F6) : theme.dividerColor, width: selected ? 2 : 1),
          color: selected ? const Color(0xFF3B82F6).withValues(alpha: 0.06) : theme.colorScheme.surface,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: selected ? const Color(0xFF3B82F6) : theme.colorScheme.onSurface.withValues(alpha: 0.4), size: 24),
            const SizedBox(height: 8),
            Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: selected ? const Color(0xFF3B82F6) : null)),
            const SizedBox(height: 2),
            Text(subtitle, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageStep(ThemeData theme) {
    if (_broadcastType == 'text') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Message Content', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Write your broadcast message and send a test first.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: 16),
          TextField(
            autofocus: true,
            maxLines: 5,
            onChanged: (v) => setState(() => _textMessage = v),
            decoration: InputDecoration(
              hintText: 'Type your message here...',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 16),
          _buildDevicePreview(
            theme,
            title: 'Live Preview',
            content: _textMessage.trim().isEmpty ? 'Your message preview will appear here.' : _textMessage.trim(),
          ),
          const SizedBox(height: 16),
          _buildTestSection(theme),
        ],
      );
    }

    // Template picker
    final approvedTemplates = _templates.where((t) => (t['status'] ?? '').toString().toLowerCase() == 'approved').toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Select Template', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Choose a pre-approved WhatsApp template to send.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
        const SizedBox(height: 16),
        if (_loadingTemplates)
          const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
        else if (approvedTemplates.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Text('No approved templates found for this channel.', style: TextStyle(fontSize: 13)),
          )
        else
          ...(approvedTemplates.map((t) {
            final tName = t['name']?.toString() ?? '';
            final lang = t['language']?.toString() ?? 'en_US';
            final selected = _selectedTemplateName == tName;
            final components = t['components'] as List? ?? [];
            final bodyComp = components.firstWhere(
              (c) => c['type']?.toString().toUpperCase() == 'BODY',
              orElse: () => null,
            );
            final body = bodyComp?['text']?.toString() ?? '';

            return GestureDetector(
              onTap: () => setState(() {
                _selectedTemplateName = tName;
                _selectedLanguageCode = lang;
              }),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: selected ? const Color(0xFF3B82F6) : theme.dividerColor, width: selected ? 2 : 1),
                  color: selected ? const Color(0xFF3B82F6).withValues(alpha: 0.06) : theme.colorScheme.surface,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(tName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: const Color(0xFF42B72A).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(4)),
                                child: Text(lang, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF42B72A))),
                              ),
                            ],
                          ),
                          if (body.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              body.length > 120 ? '${body.substring(0, 120)}...' : body,
                              style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (selected) const Icon(Icons.check_circle_rounded, color: Color(0xFF3B82F6), size: 20),
                  ],
                ),
              ),
            );
          })),
        const SizedBox(height: 16),
        _buildDevicePreview(
          theme,
          title: 'Template Preview',
          content: _selectedTemplateName == null
              ? 'Select a template to preview it here.'
              : (_selectedTemplateBody().trim().isEmpty
                    ? 'Template: ${_selectedTemplateName!}'
                    : _selectedTemplateBody().trim()),
          footer: _selectedTemplateName == null
              ? null
              : 'Template • ${_selectedTemplateName!} (${_selectedLanguageCode ?? 'en_US'})',
        ),
        const SizedBox(height: 16),
        _buildTestSection(theme),
      ],
    );
  }

  Widget _buildAudienceStep(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Audience', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Choose whether this broadcast targets all contacts or specific contacts only.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _audienceOption(
                theme,
                value: 'all',
                title: 'All Contacts',
                subtitle: 'Send to every unblocked contact with a phone',
                icon: Icons.groups_rounded,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _audienceOption(
                theme,
                value: 'selected',
                title: 'Selected Contacts',
                subtitle: 'Pick specific contacts for this broadcast',
                icon: Icons.person_add_alt_1_rounded,
              ),
            ),
          ],
        ),

        // -- All Contacts: Filter by Tags --
        if (_audienceMode == 'all') ...[
          const SizedBox(height: 20),
          Text('Filter by Tags (optional)', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 4),
          Text('Only send to contacts that have any of the selected tags. Leave empty to send to all.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: 10),
          if (_loadingTags)
            const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
          else if (_availableTags.isEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: theme.dividerColor.withValues(alpha: 0.3)),
              child: Text('No tags found across contacts.', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _availableTags.map((tag) {
                final active = _filterTags.contains(tag);
                return FilterChip(
                  label: Text(tag),
                  selected: active,
                  selectedColor: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                  checkmarkColor: const Color(0xFF3B82F6),
                  onSelected: (v) {
                    setState(() {
                      if (v) { _filterTags.add(tag); } else { _filterTags.remove(tag); }
                    });
                  },
                );
              }).toList(),
            ),
          if (_filterTags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '${_filterTags.length} tag${_filterTags.length == 1 ? '' : 's'} selected - ~$_estimatedRecipients recipients',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: const Color(0xFF3B82F6)),
            ),
          ],
        ],

        // -- Selected Contacts: Search + Import --
        if (_audienceMode == 'selected') ...[
          const SizedBox(height: 20),
          TextField(
            controller: _contactSearchCtrl,
            onChanged: (v) => _loadContacts(search: v),
            decoration: InputDecoration(
              hintText: 'Search by name, phone, or email',
              prefixIcon: const Icon(Icons.search_rounded),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingContacts)
            const Center(child: Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator()))
          else if (_contacts.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: Colors.orange.withValues(alpha: 0.1),
              ),
              child: const Text('No contacts found.', style: TextStyle(fontSize: 13)),
            )
          else
            Container(
              constraints: const BoxConstraints(maxHeight: 220),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.dividerColor),
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _contacts.length,
                separatorBuilder: (_, __) => Divider(height: 1, color: theme.dividerColor),
                itemBuilder: (_, i) {
                  final c = _contacts[i];
                  final id = c['id']?.toString();
                  final phone = c['phone']?.toString().trim() ?? '';
                  final selected = id != null && _selectedContactIds.contains(id);
                  final canSelect = phone.isNotEmpty;

                  return ListTile(
                    dense: true,
                    onTap: canSelect ? () => _toggleContact(c) : null,
                    leading: Checkbox(
                      value: selected,
                      onChanged: canSelect ? (_) => _toggleContact(c) : null,
                    ),
                    title: Text(_displayContactName(c), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    subtitle: Text(
                      phone.isEmpty ? 'No phone number' : phone,
                      style: TextStyle(
                        fontSize: 12,
                        color: phone.isEmpty
                            ? theme.colorScheme.error
                            : theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                    trailing: canSelect ? null : const Icon(Icons.block_rounded, size: 16, color: Colors.red),
                  );
                },
              ),
            ),
          const SizedBox(height: 12),

          // Import contacts section
          OutlinedButton.icon(
            onPressed: () => _showImportContactsDialog(theme),
            icon: const Icon(Icons.upload_file_rounded, size: 16),
            label: const Text('Import Phone Numbers'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
          const SizedBox(height: 12),
          if (_selectedContactIds.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _contacts
                  .where((c) => _selectedContactIds.contains(c['id']?.toString()))
                  .map((c) {
                    final id = c['id']?.toString() ?? '';
                    return Chip(
                      label: Text(_displayContactName(c)),
                      onDeleted: () {
                        setState(() {
                          _selectedContactIds.remove(id);
                          final candidates = _testCandidates;
                          if (candidates.isEmpty) {
                            _testContactId = null;
                          } else if (_testContactId == null || !candidates.any((x) => x['id']?.toString() == _testContactId)) {
                            _testContactId = candidates.first['id']?.toString();
                          }
                        });
                      },
                    );
                  })
                  .toList(),
            ),
          const SizedBox(height: 8),
          Text(
            '${_selectedContactIds.length} contact${_selectedContactIds.length == 1 ? '' : 's'} selected',
            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
        ],
      ],
    );
  }

  void _showImportContactsDialog(ThemeData theme) {
    _importPhonesCtrl.clear();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.upload_file_rounded, color: Color(0xFF3B82F6), size: 20),
            SizedBox(width: 8),
            Text('Import Phone Numbers', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          ],
        ),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Paste phone numbers separated by commas, newlines, or spaces. Contacts matching these numbers will be automatically selected.',
                style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _importPhonesCtrl,
                maxLines: 6,
                decoration: InputDecoration(
                  hintText: '+628123456789, +628987654321\nor one per line...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final input = _importPhonesCtrl.text;
              final phones = input
                  .replaceAll(',', '\n')
                  .replaceAll(';', '\n')
                  .split(RegExp(r'\s+'))
                  .map((p) => p.trim().replaceAll(RegExp(r'[^0-9+]'), ''))
                  .where((p) => p.length >= 8)
                  .toSet();

              if (phones.isEmpty) {
                AppSnackbar.error(context, 'No valid phone numbers found');
                return;
              }

              int matched = 0;
              for (final c in _contacts) {
                final cPhone = c['phone']?.toString().trim() ?? '';
                if (cPhone.isEmpty) continue;
                final normalized = cPhone.replaceAll(RegExp(r'[^0-9+]'), '');
                if (phones.any((p) => normalized.endsWith(p.length > 5 ? p.substring(p.length - 8) : p) || p.endsWith(normalized.length > 5 ? normalized.substring(normalized.length - 8) : normalized))) {
                  final id = c['id']?.toString();
                  if (id != null) {
                    _selectedContactIds.add(id);
                    matched++;
                  }
                }
              }

              Navigator.pop(ctx);
              setState(() {});
              AppSnackbar.success(context, '$matched contact${matched == 1 ? '' : 's'} matched from ${phones.length} phone numbers');
            },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
            ),
            child: const Text('Import & Match'),
          ),
        ],
      ),
    );
  }

  Widget _audienceOption(
    ThemeData theme, {
    required String value,
    required String title,
    required String subtitle,
    required IconData icon,
  }) {
    final selected = _audienceMode == value;
    return GestureDetector(
      onTap: () {
        setState(() {
          _audienceMode = value;
          if (_audienceMode == 'all') {
            final candidates = _testCandidates;
            if (candidates.isNotEmpty) {
              _testContactId = candidates.first['id']?.toString();
            }
          }
        });
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? const Color(0xFF3B82F6) : theme.dividerColor,
            width: selected ? 2 : 1,
          ),
          color: selected
              ? const Color(0xFF3B82F6).withValues(alpha: 0.06)
              : theme.colorScheme.surface,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 20,
              color: selected ? const Color(0xFF3B82F6) : theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: selected ? const Color(0xFF3B82F6) : null)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTestSection(ThemeData theme) {
    final candidates = _testCandidates;
    final selectedExists = _testContactId != null && candidates.any((c) => c['id']?.toString() == _testContactId);
    final currentValue = selectedExists ? _testContactId : null;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
        color: theme.colorScheme.surface,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Test Message', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text(
            'Send a test to one contact before launching the full broadcast.',
            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: currentValue,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: 'Test contact',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
            items: candidates.map((c) {
              final id = c['id']?.toString() ?? '';
              final name = _displayContactName(c);
              final phone = c['phone']?.toString() ?? '';
              return DropdownMenuItem(
                value: id,
                child: Text('$name • $phone', overflow: TextOverflow.ellipsis),
              );
            }).toList(),
            onChanged: candidates.isEmpty ? null : (v) => setState(() => _testContactId = v),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _canSendTest ? _sendTestMessage : null,
              icon: _sendingTest
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_rounded, size: 16),
              label: Text(_sendingTest ? 'Sending Test...' : 'Send Test Message'),
            ),
          ),
          if (candidates.isEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _audienceMode == 'selected'
                  ? 'Select at least one contact with a phone number to send test message.'
                  : 'No contacts with phone number available for test send.',
              style: TextStyle(fontSize: 11, color: theme.colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDevicePreview(
    ThemeData theme, {
    required String title,
    required String content,
    String? footer,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 12),
        Center(
          child: Container(
            width: 260,
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0xFF2D2D44), width: 3),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.18),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Notch
                const SizedBox(height: 6),
                Center(
                  child: Container(
                    width: 80,
                    height: 5,
                    decoration: BoxDecoration(
                      color: const Color(0xFF333355),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                // Screen
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: const Color(0xFFECE5DD),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // WhatsApp header bar
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: const BoxDecoration(
                          color: Color(0xFF075E54),
                          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 16),
                            const SizedBox(width: 6),
                            Container(
                              width: 26, height: 26,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Color(0xFF128C7E),
                              ),
                              child: const Icon(Icons.person_rounded, color: Colors.white, size: 16),
                            ),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Contact', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                                  Text('online', style: TextStyle(color: Color(0xAAFFFFFF), fontSize: 9)),
                                ],
                              ),
                            ),
                            const Icon(Icons.videocam_rounded, color: Colors.white, size: 16),
                            const SizedBox(width: 10),
                            const Icon(Icons.call_rounded, color: Colors.white, size: 15),
                          ],
                        ),
                      ),
                      // Chat area with wallpaper pattern
                      Container(
                        constraints: const BoxConstraints(minHeight: 200),
                        padding: const EdgeInsets.all(10),
                        decoration: const BoxDecoration(
                          image: DecorationImage(
                            image: AssetImage('assets/images/wa_bg.png'),
                            fit: BoxFit.cover,
                            opacity: 0.06,
                          ),
                          color: Color(0xFFECE5DD),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Outgoing message bubble
                            Container(
                              constraints: const BoxConstraints(maxWidth: 200),
                              padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
                              decoration: const BoxDecoration(
                                color: Color(0xFFDCF8C6),
                                borderRadius: BorderRadius.only(
                                  topLeft: Radius.circular(10),
                                  topRight: Radius.circular(2),
                                  bottomLeft: Radius.circular(10),
                                  bottomRight: Radius.circular(10),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    content.length > 300 ? '${content.substring(0, 300)}...' : content,
                                    style: const TextStyle(fontSize: 12, height: 1.4, color: Color(0xFF303030)),
                                  ),
                                  if (footer != null && footer.trim().isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF075E54).withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        footer,
                                        style: const TextStyle(fontSize: 9.5, color: Color(0xFF075E54), fontWeight: FontWeight.w500),
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 4),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      Text(
                                        '${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
                                        style: const TextStyle(fontSize: 9, color: Color(0xFF8D9A9E)),
                                      ),
                                      const SizedBox(width: 3),
                                      const Icon(Icons.done_all_rounded, size: 12, color: Color(0xFF53BDEB)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Input bar
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                        decoration: const BoxDecoration(
                          color: Color(0xFFF0F0F0),
                          borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.emoji_emotions_outlined, color: Color(0xFF8D9A9E), size: 18),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Container(
                                height: 28,
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text('Type a message', style: TextStyle(fontSize: 11, color: Color(0xFFB0B6BA))),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              width: 28, height: 28,
                              decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF075E54)),
                              child: const Icon(Icons.mic_rounded, color: Colors.white, size: 15),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // Home indicator
                const SizedBox(height: 8),
                Center(
                  child: Container(
                    width: 100,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFF444466),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReviewStep(ThemeData theme) {
    final previewContent = _broadcastType == 'template'
        ? (_selectedTemplateBody().trim().isEmpty
            ? 'Template: ${_selectedTemplateName ?? '-'}'
            : _selectedTemplateBody().trim())
        : (_textMessage.trim().isEmpty ? 'No message' : _textMessage.trim());

    final audienceLabel = _audienceMode == 'selected'
        ? 'Selected (${_selectedContactIds.length} contacts)'
        : _filterTags.isNotEmpty
            ? 'All contacts with tags: ${_filterTags.join(', ')}'
            : 'All unblocked contacts';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Review & Confirm', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.dividerColor),
          ),
          child: Column(
            children: [
              _reviewRow(theme, 'Name', _nameCtrl.text.trim()),
              _reviewDivider(theme),
              _reviewRow(theme, 'Type', _broadcastType == 'template' ? 'WhatsApp Template' : 'Text Message'),
              _reviewDivider(theme),
              _reviewRow(theme, 'Channel', _selectedChannelName ?? 'Not selected'),
              _reviewDivider(theme),
              _reviewRow(theme, 'Audience', audienceLabel),
              if (_broadcastType == 'template') ...[
                _reviewDivider(theme),
                _reviewRow(theme, 'Template', _selectedTemplateName ?? 'None'),
              ],
              if (_broadcastType == 'text') ...[
                _reviewDivider(theme),
                _reviewRow(theme, 'Message', _textMessage.length > 80 ? '${_textMessage.substring(0, 80)}...' : _textMessage),
              ],
            ],
          ),
        ),

        // Cost Estimation
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: const Color(0xFFFFF8E1),
            border: Border.all(color: const Color(0xFFFFD54F).withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              const Icon(Icons.monetization_on_rounded, color: Color(0xFFF9A825), size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Estimated Cost', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text(
                      _costEstimate,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFFF57F17)),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Based on Meta WhatsApp Business API pricing. Actual cost may vary.',
                      style: TextStyle(fontSize: 10, color: Colors.brown.shade300),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF3B82F6).withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline_rounded, color: Color(0xFF3B82F6), size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _audienceMode == 'selected'
                      ? 'This broadcast will send only to your ${_selectedContactIds.length} selected contacts.'
                      : _filterTags.isNotEmpty
                          ? 'This broadcast will send to contacts with matching tags.'
                          : 'This broadcast will send to all unblocked contacts with a phone number.',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _buildDevicePreview(
          theme,
          title: 'Final Preview',
          content: previewContent,
          footer: _broadcastType == 'template'
              ? 'Template • ${_selectedTemplateName ?? '-'} (${_selectedLanguageCode ?? 'en_US'})'
              : null,
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Switch(value: _sendNow, onChanged: (v) => setState(() => _sendNow = v), activeThumbColor: const Color(0xFF3B82F6)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Send immediately', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  Text('Toggle off to save as draft first', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _reviewRow(ThemeData theme, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)))),
          const SizedBox(width: 12),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  Widget _reviewDivider(ThemeData theme) {
    return Divider(color: theme.dividerColor, height: 1);
  }
}

