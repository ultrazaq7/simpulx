// ============================================================
// System Log Page -- 4 Tabs
// ============================================================
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:data_table_2/data_table_2.dart';
import 'package:simpulx/features/audit_log/presentation/pages/csv_download_stub.dart'
    if (dart.library.html) 'package:simpulx/features/audit_log/presentation/pages/csv_download_web.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/audit_log/data/datasources/audit_log_remote_datasource.dart';
import 'package:simpulx/features/audit_log/data/models/audit_log_models.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;
import 'package:simpulx/core/constants/api_constants.dart';

class AuditLogPage extends StatefulWidget {
  const AuditLogPage({super.key});
  @override
  State<AuditLogPage> createState() => _AuditLogPageState();
}

class _AuditLogPageState extends State<AuditLogPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          color: theme.colorScheme.surface,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TabBar(
                controller: _tabCtrl,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                padding: EdgeInsets.zero,
                labelPadding: const EdgeInsets.symmetric(horizontal: 14),
                tabs: const [
                  Tab(text: 'Message History'),
                  Tab(text: 'Conversations'),
                  Tab(text: 'User Activity'),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: const [
              _MessageHistoryTab(),
              _ConversationsTab(),
              _UserActivityTab(),
            ],
          ),
        ),
      ],
    );
  }
}

// ================================================================
// Message History Tab
// ================================================================
class _MessageHistoryTab extends StatefulWidget {
  const _MessageHistoryTab();
  @override
  State<_MessageHistoryTab> createState() => _MessageHistoryTabState();
}

class _MessageHistoryTabState extends State<_MessageHistoryTab>
    with AutomaticKeepAliveClientMixin {
  final _ds = di.sl<AuditLogRemoteDataSource>();
  PaginatedResult? _result;
  bool _loading = true;
  String? _error;
  int _page = 1;
  final _searchCtrl = TextEditingController();
  String? _direction;
  final Set<String> _statuses = {};
  final Set<String> _departmentIds = {};
  final Set<String> _sourceChannels = {};
  final Set<String> _tags = {};
  DateTimeRange? _dateRange;
  List<Map<String, String>> _departmentOptions = [];
  List<String> _sourceChannelOptions = [];
  List<String> _tagOptions = [];
  bool _exporting = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadFilterOptions();
    _load();
  }

  Future<void> _loadFilterOptions() async {
    try {
      final opts = await _ds.getFilterOptions();
      if (!mounted) return;
      setState(() {
        _departmentOptions = ((opts['departments'] as List?) ?? const [])
            .map((e) => {
                  'id': (e as Map)['id']?.toString() ?? '',
                  'label': e['label']?.toString() ?? ''
                })
            .where((e) => e['id']!.isNotEmpty)
            .toList();
        _sourceChannelOptions = ((opts['sourceChannels'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList();
        _tagOptions = ((opts['tags'] as List?) ?? const [])
            .map((e) => e.toString())
            .where((e) => e.isNotEmpty)
            .toList();
      });
    } catch (_) {/* ignore */}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await _ds.getMessageHistory(
        page: _page,
        search: _searchCtrl.text.isNotEmpty ? _searchCtrl.text : null,
        direction: _direction,
        statuses: _statuses.isEmpty ? null : _statuses.toList(),
        departmentIds: _departmentIds.isEmpty ? null : _departmentIds.toList(),
        sourceChannels: _sourceChannels.isEmpty ? null : _sourceChannels.toList(),
        tags: _tags.isEmpty ? null : _tags.toList(),
        dateFrom: _dateRange?.start.toIso8601String(),
        dateTo: _dateRange?.end.toIso8601String(),
      );
      setState(() {
        _result = r;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final client = di.sl<DioClient>();
      final resp = await client.dio.get(
        '${ApiConstants.auditLogMessages}/export',
        queryParameters: {
          if (_searchCtrl.text.isNotEmpty) 'search': _searchCtrl.text,
          if (_direction != null) 'direction': _direction,
          if (_statuses.isNotEmpty) 'statuses': _statuses.join(','),
        },
        options: Options(responseType: ResponseType.plain),
      );
      _downloadCsv(resp.data.toString(), 'messages.csv');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Export failed');
      }
    }
    if (mounted) setState(() => _exporting = false);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);

    return Column(
      children: [
        // Filters row
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.start,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 260,
                      height: 40,
                      child: TextField(
                        controller: _searchCtrl,
                        decoration: InputDecoration(
                          hintText: 'Search messages...',
                          prefixIcon: const Icon(Icons.search_rounded, size: 20),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                          isDense: true,
                        ),
                        onSubmitted: (_) {
                          _page = 1;
                          _load();
                        },
                      ),
                    ),
                    _FilterChip(
                      label: _direction ?? 'Direction',
                      options: const ['inbound', 'outbound'],
                      onSelected: (v) {
                        _direction = v;
                        _page = 1;
                        _load();
                      },
                      onClear: () {
                        _direction = null;
                        _page = 1;
                        _load();
                      },
                      isActive: _direction != null,
                    ),
                    _MultiFilterChip(
                      label: 'Status',
                      options: const [
                        {'id': 'sent', 'label': 'Sent'},
                        {'id': 'delivered', 'label': 'Delivered'},
                        {'id': 'read', 'label': 'Read'},
                        {'id': 'failed', 'label': 'Failed'},
                      ],
                      selected: _statuses,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Department',
                      options: _departmentOptions,
                      selected: _departmentIds,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Source',
                      options: _sourceChannelOptions
                          .map((s) => {'id': s, 'label': _prettySource(s)})
                          .toList(),
                      selected: _sourceChannels,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Tag',
                      options: _tagOptions.map((t) => {'id': t, 'label': t}).toList(),
                      selected: _tags,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _DateRangeFilterChip(
                      value: _dateRange,
                      onChanged: (r) {
                        setState(() => _dateRange = r);
                        _page = 1;
                        _load();
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _exporting ? null : _export,
                icon: _exporting
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.download_rounded, size: 18),
                label: const Text('Export CSV'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
              ),
            ],
          ),
        ),
        // Table
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
                    ))
                  : _result == null || _result!.data.isEmpty
                      ? const Center(
                          child: Text('No messages found'))
                      : _buildTable(theme),
        ),
        // Pagination
        if (_result != null && _result!.totalPages > 1)
          _PaginationBar(
            page: _page,
            totalPages: _result!.totalPages,
            onPageChanged: (p) {
              _page = p;
              _load();
            },
          ),
      ],
    );
  }

  Widget _buildTable(ThemeData theme) {
    final rows = _result!.data;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DataTable2(
        columnSpacing: 12,
        horizontalMargin: 12,
        minWidth: 1100,
        fixedTopRows: 1,
        isHorizontalScrollBarVisible: true,
        isVerticalScrollBarVisible: true,
        headingRowColor: WidgetStateProperty.all(
          theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        ),
        headingTextStyle: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
          color: theme.colorScheme.onSurface,
        ),
        columns: const [
          DataColumn2(label: Text('Date'), size: ColumnSize.S),
          DataColumn2(label: Text('Direction'), size: ColumnSize.S),
          DataColumn2(label: Text('Type'), size: ColumnSize.S),
          DataColumn2(label: Text('Contact'), size: ColumnSize.M),
          DataColumn2(label: Text('Channel'), size: ColumnSize.M),
          DataColumn2(label: Text('Status'), size: ColumnSize.S),
          DataColumn2(label: Text('Content'), size: ColumnSize.L),
        ],
        rows: rows.map((m) {
          final date = m['createdAt'] != null
              ? DateFormat('dd MMM yy HH:mm')
                  .format(DateTime.parse(m['createdAt']))
              : '-';
          return DataRow(cells: [
            DataCell(Text(date, style: const TextStyle(fontSize: 12))),
            DataCell(_DirectionBadge(m['direction'] ?? '')),
            DataCell(Text(m['type'] ?? '-',
                style: const TextStyle(fontSize: 12))),
            DataCell(Text(
                m['contactName'] ?? m['contactPhone'] ?? '-',
                style: const TextStyle(fontSize: 12))),
            DataCell(Text(m['channelName'] ?? '-',
                style: const TextStyle(fontSize: 12))),
            DataCell(_StatusBadge(m['status'] ?? '')),
            DataCell(Text(
              m['content'] ?? '-',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12),
            )),
          ]);
        }).toList(),
      ),
    );
  }
}

// ================================================================
// Conversations Tab
// ================================================================
class _ConversationsTab extends StatefulWidget {
  const _ConversationsTab();
  @override
  State<_ConversationsTab> createState() => _ConversationsTabState();
}

class _ConversationsTabState extends State<_ConversationsTab>
    with AutomaticKeepAliveClientMixin {
  final _ds = di.sl<AuditLogRemoteDataSource>();
  PaginatedResult? _result;
  bool _loading = true;
  String? _error;
  int _page = 1;
  final _searchCtrl = TextEditingController();
  final Set<String> _statuses = {};
  final Set<String> _departmentIds = {};
  final Set<String> _sourceChannels = {};
  final Set<String> _tags = {};
  DateTimeRange? _dateRange;
  List<Map<String, String>> _departmentOptions = [];
  List<String> _sourceChannelOptions = [];
  List<String> _tagOptions = [];
  bool _exporting = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadFilterOptions();
    _load();
  }

  Future<void> _loadFilterOptions() async {
    try {
      final opts = await _ds.getFilterOptions();
      if (!mounted) return;
      setState(() {
        _departmentOptions = ((opts['departments'] as List?) ?? const [])
            .map((e) => {
                  'id': (e as Map)['id']?.toString() ?? '',
                  'label': e['label']?.toString() ?? ''
                })
            .where((e) => e['id']!.isNotEmpty)
            .toList();
        _sourceChannelOptions = ((opts['sourceChannels'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList();
        _tagOptions = ((opts['tags'] as List?) ?? const [])
            .map((e) => e.toString())
            .where((e) => e.isNotEmpty)
            .toList();
      });
    } catch (_) {/* ignore */}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await _ds.getConversationHistory(
        page: _page,
        search: _searchCtrl.text.isNotEmpty ? _searchCtrl.text : null,
        statuses: _statuses.isEmpty ? null : _statuses.toList(),
        departmentIds: _departmentIds.isEmpty ? null : _departmentIds.toList(),
        sourceChannels: _sourceChannels.isEmpty ? null : _sourceChannels.toList(),
        tags: _tags.isEmpty ? null : _tags.toList(),
        dateFrom: _dateRange?.start.toIso8601String(),
        dateTo: _dateRange?.end.toIso8601String(),
      );
      setState(() {
        _result = r;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final client = di.sl<DioClient>();
      final resp = await client.dio.get(
        '${ApiConstants.auditLogConversations}/export',
        queryParameters: {
          if (_searchCtrl.text.isNotEmpty) 'search': _searchCtrl.text,
          if (_statuses.isNotEmpty) 'statuses': _statuses.join(','),
        },
        options: Options(responseType: ResponseType.plain),
      );
      _downloadCsv(resp.data.toString(), 'conversations.csv');
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Export failed');
      }
    }
    if (mounted) setState(() => _exporting = false);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.start,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SizedBox(
                      width: 260,
                      height: 40,
                      child: TextField(
                        controller: _searchCtrl,
                        decoration: InputDecoration(
                          hintText: 'Search conversations...',
                          prefixIcon: const Icon(Icons.search_rounded, size: 20),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                          isDense: true,
                        ),
                        onSubmitted: (_) {
                          _page = 1;
                          _load();
                        },
                      ),
                    ),
                    _MultiFilterChip(
                      label: 'Status',
                      options: const [
                        {'id': 'open', 'label': 'Open'},
                        {'id': 'pending', 'label': 'Pending'},
                        {'id': 'closed', 'label': 'Closed'},
                      ],
                      selected: _statuses,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Department',
                      options: _departmentOptions,
                      selected: _departmentIds,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Source',
                      options: _sourceChannelOptions
                          .map((s) => {'id': s, 'label': _prettySource(s)})
                          .toList(),
                      selected: _sourceChannels,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _MultiFilterChip(
                      label: 'Tag',
                      options: _tagOptions.map((t) => {'id': t, 'label': t}).toList(),
                      selected: _tags,
                      onChanged: () {
                        _page = 1;
                        _load();
                      },
                    ),
                    _DateRangeFilterChip(
                      value: _dateRange,
                      onChanged: (r) {
                        setState(() => _dateRange = r);
                        _page = 1;
                        _load();
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _exporting ? null : _export,
                icon: _exporting
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.download_rounded, size: 18),
                label: const Text('Export CSV'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
              ),
            ],
          ),
        ),
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
                    ))
                  : _result == null || _result!.data.isEmpty
                      ? const Center(
                          child: Text('No conversations found'))
                      : _buildTable(theme),
        ),
        if (_result != null && _result!.totalPages > 1)
          _PaginationBar(
            page: _page,
            totalPages: _result!.totalPages,
            onPageChanged: (p) {
              _page = p;
              _load();
            },
          ),
      ],
    );
  }

  Widget _buildTable(ThemeData theme) {
    final rows = _result!.data;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DataTable2(
        columnSpacing: 12,
        horizontalMargin: 12,
        minWidth: 2400,
        fixedTopRows: 1,
        isHorizontalScrollBarVisible: true,
        isVerticalScrollBarVisible: true,
        headingRowColor: WidgetStateProperty.all(
          theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        ),
        headingTextStyle: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
          color: theme.colorScheme.onSurface,
        ),
        columns: const [
          DataColumn2(label: Text('Started'), size: ColumnSize.M),
          DataColumn2(label: Text('Contact'), size: ColumnSize.M),
          DataColumn2(label: Text('Agent'), size: ColumnSize.M),
          DataColumn2(label: Text('Department'), size: ColumnSize.M),
          DataColumn2(label: Text('Channel'), size: ColumnSize.M),
          DataColumn2(label: Text('Source'), size: ColumnSize.M),
          DataColumn2(label: Text('Status'), size: ColumnSize.S),
          DataColumn2(label: Text('Interest'), size: ColumnSize.S),
          DataColumn2(label: Text('Replied'), size: ColumnSize.S),
          DataColumn2(label: Text('1st Reply'), size: ColumnSize.S),
          DataColumn2(label: Text('Stage'), size: ColumnSize.M),
          DataColumn2(label: Text('Messages'), size: ColumnSize.S),
          DataColumn2(label: Text('Calls'), size: ColumnSize.S),
          DataColumn2(label: Text('Talk Time'), size: ColumnSize.S),
          DataColumn2(label: Text('Direct WhatsApp'), size: ColumnSize.M),
          DataColumn2(label: Text('Snoozed Until'), size: ColumnSize.M),
          DataColumn2(label: Text('Closed At'), size: ColumnSize.M),
        ],
        rows: rows.map((c) {
          final created = c['createdAt'] != null
              ? DateFormat('dd MMM yy HH:mm')
                  .format(DateTime.parse(c['createdAt']))
              : '-';
          final closed = c['closedAt'] != null
              ? DateFormat('dd MMM yy HH:mm')
                  .format(DateTime.parse(c['closedAt']))
              : '-';
          final snoozed = c['snoozedUntil'] != null
              ? DateFormat('dd MMM yy HH:mm')
                  .format(DateTime.parse(c['snoozedUntil']))
              : '-';
          final firstReplySec = c['firstReplySeconds'];
          final firstReplyStr = firstReplySec != null
              ? _fmtDuration(firstReplySec is int ? firstReplySec : int.tryParse('$firstReplySec') ?? 0)
              : '-';
          final source = src.prettySourceChannel(c['sourceChannel']?.toString(), fallback: '-');
          final callCount = (c['callCount'] as num?)?.toInt() ?? 0;
          final callDurSec = (c['callDurationSeconds'] as num?)?.toInt() ?? 0;
          final waClicks = (c['whatsappClickCount'] as num?)?.toInt() ?? 0;
          return DataRow(cells: [
            DataCell(Text(created, style: const TextStyle(fontSize: 12))),
            DataCell(Text(c['contactName'] ?? c['contactPhone'] ?? '-',
                style: const TextStyle(fontSize: 12))),
            DataCell(Text(c['agentName'] ?? '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(c['departmentName'] ?? '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(c['channelName'] ?? '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(source, style: const TextStyle(fontSize: 12))),
            DataCell(_StatusBadge(c['status'] ?? '')),
            DataCell(_InterestBadge(c['interestLevel'])),
            DataCell(Icon(
              c['replied'] == true ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded,
              size: 16,
              color: c['replied'] == true ? const Color(0xFF10B981) : const Color(0xFFD1D5DB),
            )),
            DataCell(Text(firstReplyStr, style: const TextStyle(fontSize: 12))),
            DataCell(Text(c['stageName'] ?? '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text('${c['messageCount'] ?? 0}', style: const TextStyle(fontSize: 12))),
            DataCell(Text(callCount > 0 ? '$callCount' : '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(callDurSec > 0 ? _fmtDuration(callDurSec) : '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(waClicks > 0 ? '$waClicks' : '-', style: const TextStyle(fontSize: 12))),
            DataCell(Text(snoozed,
                style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)))),
            DataCell(Text(closed, style: const TextStyle(fontSize: 12))),
          ]);
        }).toList(),
      ),
    );
  }

  static String _fmtDuration(int seconds) {
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) return '${(seconds / 60).floor()}m ${seconds % 60}s';
    final h = (seconds / 3600).floor();
    final m = ((seconds % 3600) / 60).floor();
    return '${h}h ${m}m';
  }
}

// ================================================================
// User Activity Tab
// ================================================================
class _UserActivityTab extends StatefulWidget {
  const _UserActivityTab();
  @override
  State<_UserActivityTab> createState() => _UserActivityTabState();
}

class _UserActivityTabState extends State<_UserActivityTab>
    with AutomaticKeepAliveClientMixin {
  final _ds = di.sl<AuditLogRemoteDataSource>();
  AuditLogPageModel? _result;
  bool _loading = true;
  String? _error;
  int _page = 1;

  @override
  bool get wantKeepAlive => true;

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
      final r = await _ds.getAuditLogs(page: _page);
      setState(() {
        _result = r;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline,
                size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_result == null || _result!.logs.isEmpty) {
      return const Center(child: Text('No activity logs yet'));
    }

    return Column(
      children: [
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: _result!.logs.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final log = _result!.logs[i];
              final time = log.createdAt != null
                  ? DateFormat('dd MMM yy HH:mm').format(log.createdAt!)
                  : '';
              return ListTile(
                dense: true,
                leading: _categoryIcon(log.category),
                title: Text(log.action,
                    style: const TextStyle(fontSize: 13)),
                subtitle: Text(
                    '${log.userName ?? 'System'} - $time',
                    style: TextStyle(
                        fontSize: 11,
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.5))),
                trailing: log.ipAddress != null
                    ? Text(log.ipAddress!,
                        style: TextStyle(
                            fontSize: 11,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)))
                    : null,
              );
            },
          ),
        ),
        if (_result!.totalPages > 1)
          _PaginationBar(
            page: _page,
            totalPages: _result!.totalPages,
            onPageChanged: (p) {
              _page = p;
              _load();
            },
          ),
      ],
    );
  }

  Widget _categoryIcon(String category) {
    switch (category) {
      case 'auth':
        return Icon(Icons.login_rounded,
            size: 20, color: const Color(0xFF3B82F6));
      case 'chat':
        return Icon(Icons.chat_rounded,
            size: 20, color: const Color(0xFF10B981));
      case 'settings':
        return Icon(Icons.settings_rounded,
            size: 20, color: const Color(0xFFF59E0B));
      default:
        return Icon(Icons.info_outline_rounded,
            size: 20, color: const Color(0xFF9CA3AF));
    }
  }
}

// ================================================================
// Downloads Tab
// ================================================================
class _DownloadsTab extends StatelessWidget {
  const _DownloadsTab();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.download_rounded,
              size: 64,
              color: theme.colorScheme.primary.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          Text('Export Data',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(
            'Use the Export CSV buttons in Message History\nor Conversations tabs to download data.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
                color:
                    theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 24),
          Text(
            'Downloaded files will appear in your browser\ndownloads folder automatically.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
                color:
                    theme.colorScheme.onSurface.withValues(alpha: 0.4)),
          ),
        ],
      ),
    );
  }
}

// ================================================================
// Shared Widgets
// ================================================================

void _downloadCsv(String csvContent, String filename) {
  downloadCsvFile(csvContent, filename);
}

String _prettySource(String code) => src.prettySourceChannel(code);

// ── Multi-select filter chip with checkbox popup ─────
class _MultiFilterChip extends StatefulWidget {
  final String label;
  final List<Map<String, String>> options; // {id, label}
  final Set<String> selected;
  final VoidCallback onChanged;
  const _MultiFilterChip({
    required this.label,
    required this.options,
    required this.selected,
    required this.onChanged,
  });

  @override
  State<_MultiFilterChip> createState() => _MultiFilterChipState();
}

class _MultiFilterChipState extends State<_MultiFilterChip> {
  String _search = '';

  Future<void> _openMenu(BuildContext context) async {
    final theme = Theme.of(context);
    final box = context.findRenderObject() as RenderBox?;
    if (box == null) return;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final position = RelativeRect.fromRect(
      Rect.fromPoints(
        box.localToGlobal(Offset(0, box.size.height + 4), ancestor: overlay),
        box.localToGlobal(box.size.bottomRight(Offset.zero), ancestor: overlay),
      ),
      Offset.zero & overlay.size,
    );
    _search = '';
    await showMenu<void>(
      context: context,
      position: position,
      constraints: const BoxConstraints(minWidth: 240, maxWidth: 320),
      items: [
        PopupMenuItem<void>(
          enabled: false,
          padding: EdgeInsets.zero,
          child: StatefulBuilder(
            builder: (c, sb) {
              final filtered = widget.options
                  .where((o) => _search.isEmpty ||
                      (o['label'] ?? '').toLowerCase().contains(_search.toLowerCase()))
                  .toList();
              final active = widget.selected.isNotEmpty;
              return SizedBox(
                width: 280,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
                      child: TextField(
                        autofocus: true,
                        style: const TextStyle(fontSize: 13),
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: 'Search ${widget.label.toLowerCase()}...',
                          hintStyle: const TextStyle(fontSize: 13),
                          prefixIcon: const Icon(Icons.search_rounded, size: 18),
                          prefixIconConstraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                            borderSide: BorderSide(color: theme.dividerColor),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                            borderSide: BorderSide(color: theme.dividerColor),
                          ),
                        ),
                        onChanged: (v) => sb(() => _search = v),
                      ),
                    ),
                    const Divider(height: 1),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 280),
                      child: filtered.isEmpty
                          ? const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Center(
                                child: Text('No results', style: TextStyle(fontSize: 13)),
                              ),
                            )
                          : ListView.builder(
                              shrinkWrap: true,
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              itemCount: filtered.length,
                              itemBuilder: (_, i) {
                                final o = filtered[i];
                                final checked = widget.selected.contains(o['id']);
                                return InkWell(
                                  onTap: () {
                                    if (checked) {
                                      widget.selected.remove(o['id']);
                                    } else {
                                      widget.selected.add(o['id']!);
                                    }
                                    sb(() {});
                                    setState(() {});
                                    widget.onChanged();
                                  },
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                    child: Row(
                                      children: [
                                        Icon(
                                          checked
                                              ? Icons.check_box_rounded
                                              : Icons.check_box_outline_blank_rounded,
                                          size: 18,
                                          color: checked
                                              ? theme.colorScheme.primary
                                              : theme.colorScheme.onSurface
                                                  .withValues(alpha: 0.5),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            o['label'] ?? '',
                                            style: const TextStyle(fontSize: 13),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                    if (active) ...[
                      const Divider(height: 1),
                      InkWell(
                        onTap: () {
                          widget.selected.clear();
                          sb(() {});
                          setState(() {});
                          widget.onChanged();
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          child: Text(
                            'Clear selection',
                            style: TextStyle(
                              fontSize: 13,
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = widget.selected.isNotEmpty;
    final display = !active
        ? widget.label
        : widget.selected.length == 1
            ? widget.options.firstWhere(
                (o) => o['id'] == widget.selected.first,
                orElse: () => {'label': widget.selected.first},
              )['label']!
            : '${widget.label} (${widget.selected.length})';
    return InkWell(
      onTap: () => _openMenu(context),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active ? theme.colorScheme.primary.withValues(alpha: 0.08) : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? theme.colorScheme.primary.withValues(alpha: 0.4)
                : theme.dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              display,
              style: TextStyle(
                fontSize: 13,
                color: active
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.arrow_drop_down_rounded,
                size: 18,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ],
        ),
      ),
    );
  }
}

// ── Date range chip: Today / Yesterday / Last 7 / Last 30 / Custom ──
class _DateRangeFilterChip extends StatelessWidget {
  final DateTimeRange? value;
  final ValueChanged<DateTimeRange?> onChanged;
  const _DateRangeFilterChip({required this.value, required this.onChanged});

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year.toString().substring(2)}';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = value != null;
    final label = !active
        ? 'Date'
        : '${_fmt(value!.start)} – ${_fmt(value!.end)}';

    Future<void> pickPreset(String preset) async {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      switch (preset) {
        case 'today':
          onChanged(DateTimeRange(start: today, end: today));
          break;
        case 'yesterday':
          final y = today.subtract(const Duration(days: 1));
          onChanged(DateTimeRange(start: y, end: y));
          break;
        case 'last7':
          onChanged(DateTimeRange(start: today.subtract(const Duration(days: 6)), end: today));
          break;
        case 'last30':
          onChanged(DateTimeRange(start: today.subtract(const Duration(days: 29)), end: today));
          break;
        case 'custom':
          final picked = await showDateRangePicker(
            context: context,
            firstDate: DateTime(2020),
            lastDate: DateTime(now.year + 1),
            initialDateRange: value,
          );
          if (picked != null) onChanged(picked);
          break;
        case 'clear':
          onChanged(null);
          break;
      }
    }

    return PopupMenuButton<String>(
      tooltip: 'Date range',
      onSelected: pickPreset,
      itemBuilder: (ctx) => [
        const PopupMenuItem(value: 'today', child: Text('Today')),
        const PopupMenuItem(value: 'yesterday', child: Text('Yesterday')),
        const PopupMenuItem(value: 'last7', child: Text('Last 7 days')),
        const PopupMenuItem(value: 'last30', child: Text('Last 30 days')),
        const PopupMenuItem(value: 'custom', child: Text('Custom range…')),
        if (active) const PopupMenuItem(value: 'clear', child: Text('Clear')),
      ],
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active ? theme.colorScheme.primary.withValues(alpha: 0.08) : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? theme.colorScheme.primary.withValues(alpha: 0.4)
                : theme.dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_outlined,
                size: 16,
                color: active ? theme.colorScheme.primary : theme.colorScheme.onSurface.withValues(alpha: 0.6)),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: active
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.arrow_drop_down_rounded,
                size: 18,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final List<String> options;
  final ValueChanged<String> onSelected;
  final VoidCallback onClear;
  final bool isActive;

  const _FilterChip({
    required this.label,
    required this.options,
    required this.onSelected,
    required this.onClear,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopupMenuButton<String>(
      tooltip: label,
      onSelected: (v) {
        if (v == '__clear__') {
          onClear();
        } else {
          onSelected(v);
        }
      },
      itemBuilder: (ctx) => [
        ...options.map((o) => PopupMenuItem(
              value: o,
              child: Text(o[0].toUpperCase() + o.substring(1)),
            )),
        if (isActive)
          const PopupMenuItem(value: '__clear__', child: Text('Clear filter')),
      ],
      onCanceled: null,
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: isActive
              ? theme.colorScheme.primary.withValues(alpha: 0.08)
              : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isActive
                ? theme.colorScheme.primary.withValues(alpha: 0.4)
                : theme.dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label[0].toUpperCase() + label.substring(1),
              style: TextStyle(
                fontSize: 13,
                color: isActive
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.arrow_drop_down_rounded,
                size: 18,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge(this.status);

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status.toLowerCase()) {
      case 'sent':
      case 'open':
        color = const Color(0xFF3B82F6);
        break;
      case 'delivered':
      case 'pending':
        color = const Color(0xFFF59E0B);
        break;
      case 'read':
        color = const Color(0xFF10B981);
        break;
      case 'failed':
      case 'closed':
        color = const Color(0xFFEF4444);
        break;
      default:
        color = const Color(0xFF9CA3AF);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.isNotEmpty
            ? status[0].toUpperCase() + status.substring(1)
            : '-',
        style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

class _InterestBadge extends StatelessWidget {
  final String? level;
  const _InterestBadge(this.level);

  @override
  Widget build(BuildContext context) {
    if (level == null || level!.isEmpty) return const Text('-', style: TextStyle(fontSize: 12));
    Color color;
    switch (level!.toLowerCase()) {
      case 'hot':
        color = const Color(0xFFEF4444);
        break;
      case 'warm':
        color = const Color(0xFFE8912D);
        break;
      case 'cold':
        color = const Color(0xFF2D9CDB);
        break;
      default:
        color = const Color(0xFF9CA3AF);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        level![0].toUpperCase() + level!.substring(1),
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

class _DirectionBadge extends StatelessWidget {
  final String direction;
  const _DirectionBadge(this.direction);

  @override
  Widget build(BuildContext context) {
    final isInbound = direction == 'inbound';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          isInbound
              ? Icons.call_received_rounded
              : Icons.call_made_rounded,
          size: 14,
          color: isInbound ? const Color(0xFF3B82F6) : const Color(0xFF10B981),
        ),
        const SizedBox(width: 4),
        Text(
          isInbound ? 'In' : 'Out',
          style: TextStyle(
            fontSize: 12,
            color: isInbound ? const Color(0xFF3B82F6) : const Color(0xFF10B981),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _PaginationBar extends StatelessWidget {
  final int page;
  final int totalPages;
  final ValueChanged<int> onPageChanged;

  const _PaginationBar({
    required this.page,
    required this.totalPages,
    required this.onPageChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left_rounded),
            onPressed: page > 1 ? () => onPageChanged(page - 1) : null,
            iconSize: 20,
          ),
          const SizedBox(width: 8),
          Text('Page $page of $totalPages',
              style: theme.textTheme.bodySmall),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.chevron_right_rounded),
            onPressed:
                page < totalPages ? () => onPageChanged(page + 1) : null,
            iconSize: 20,
          ),
        ],
      ),
    );
  }
}
