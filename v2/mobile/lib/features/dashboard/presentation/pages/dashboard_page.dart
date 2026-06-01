// ============================================================
// Dashboard Page - Professional Role-Based Dashboard
// ============================================================
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:simpulx/core/theme/app_style.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _sourceChannelStats;
  Map<String, dynamic>? _agentPerformance;
  Map<String, dynamic>? _conversionFunnel;
  Map<String, dynamic>? _followUpStats;
  List<Map<String, dynamic>> _channels = [];
  List<Map<String, dynamic>> _departments = [];
  bool _loading = true;
  String? _error;
  String? _selectedChannelId;
  String? _selectedDepartmentId;
  final Set<String> _selectedSources = {};
  String _selectedDateRange = 'last7d';
  DateTimeRange? _customRange;
  int _selectedTab = 0;

  static const List<MapEntry<String, String>> _sourceOptions = [
    MapEntry('META_ADS', 'Meta Ads'),
    MapEntry('META_ORGANIC', 'Meta Organic'),
    MapEntry('META_MESSENGER', 'Messenger'),
    MapEntry('INSTAGRAM', 'Instagram'),
    MapEntry('TIKTOK_ADS', 'TikTok Ads'),
    MapEntry('GOOGLE_ADS', 'Google Ads'),
    MapEntry('PUBLISHER', 'Publisher'),
    MapEntry('LANDING_PAGE', 'Landing Page'),
    MapEntry('FORM', 'Form'),
    MapEntry('WHATSAPP_DIRECT', 'Direct WhatsApp'),
    MapEntry('REFERRAL', 'Referral'),
    MapEntry('EMAIL', 'Email'),
  ];

  @override
  void initState() {
    super.initState();
    _fetchStats();
    _loadFilterOptions();
  }

  Future<void> _fetchStats() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = di.sl<DioClient>().dio;
      final commonParams = <String, dynamic>{
        'dateRange': _selectedDateRange,
        if (_selectedDateRange == 'custom' && _customRange != null) ...{
          'dateFrom': _customRange!.start.toIso8601String(),
          'dateTo': _customRange!.end.toIso8601String(),
        },
        if (_selectedSources.isNotEmpty)
          'sourceChannel': _selectedSources.join(','),
      };
      final results = await Future.wait([
        dio.get(ApiConstants.dashboardStats, queryParameters: {
          if (_selectedChannelId != null) 'channelId': _selectedChannelId,
          if (_selectedDepartmentId != null)
            'departmentId': _selectedDepartmentId,
          ...commonParams,
        }),
        dio
            .get('/dashboard/source-channels', queryParameters: commonParams)
            .then<dynamic>((v) => v)
            .catchError((_) => null),
        dio
            .get('/dashboard/agent-performance', queryParameters: commonParams)
            .then<dynamic>((v) => v)
            .catchError((_) => null),
        dio
            .get('/dashboard/conversion-funnel', queryParameters: commonParams)
            .then<dynamic>((v) => v)
            .catchError((_) => null),
        dio
            .get('/follow-ups/stats')
            .then<dynamic>((v) => v)
            .catchError((_) => null),
      ]);
      setState(() {
        _stats = results[0].data;
        _sourceChannelStats = results[1].data;
        _agentPerformance = results[2].data;
        _conversionFunnel = results[3].data;
        _followUpStats = results[4].data is Map
            ? Map<String, dynamic>.from(results[4].data)
            : null;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadFilterOptions() async {
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await Future.wait([
        dio.get(ApiConstants.channels),
        dio.get(ApiConstants.departments),
      ]);
      if (!mounted) return;
      setState(() {
        _channels = _toList(res[0].data);
        _departments = _toList(res[1].data);
      });
    } catch (_) {}
  }

  List<Map<String, dynamic>> _toList(dynamic data) => data is List
      ? List<Map<String, dynamic>>.from(data)
      : List<Map<String, dynamic>>.from(data['data'] ?? []);

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    String userName = 'User', userRole = '';
    if (authState is AuthAuthenticated) {
      userName = authState.session.user.fullName;
      userRole = authState.session.user.role;
    }

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _fetchStats,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error != null)
                _buildMobileError()
              else
                ..._buildMobileDashboard(userName, userRole),
            ],
          ),
        ),
      ),
    );
  }

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // MOBILE DASHBOARD
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  List<Widget> _buildMobileDashboard(String userName, String userRole) {
    final m = _stats?['agentMetrics'] as Map<String, dynamic>? ?? {};
    return [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Hello, $userName', style: AppText.titleLg),
              const SizedBox(height: 2),
              const Text(
                'Here\'s your performance overview',
                style: AppText.subtitle,
              ),
            ],
          ),
          IconButton(
            onPressed: _loading ? null : _fetchStats,
            icon: _loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                : const Icon(Icons.refresh_rounded, color: AppColors.primary),
            style: IconButton.styleFrom(
              backgroundColor: AppColors.primary.withValues(alpha: 0.1),
              shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),
      if (_loading && _stats == null)
        const Center(
          child: Padding(
            padding: EdgeInsets.all(40),
            child: CircularProgressIndicator(color: AppColors.primary),
          ),
        )
      else ...[
        Row(children: [
          Expanded(
            child: _MobileCard(
              title: 'Total Chats',
              value: '${m['totalChats'] ?? 0}',
              icon: Icons.chat_bubble_rounded,
              color: AppColors.brandBlue,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MobileCard(
              title: 'Replied',
              value: '${m['totalReplied'] ?? 0}',
              icon: Icons.reply_rounded,
              color: AppColors.success,
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: _MobileCard(
              title: 'Avg Response',
              value: _fmtDuration(_toInt(_stats?['avgAgentResponseSeconds'])),
              icon: Icons.timer_rounded,
              color: AppColors.warning,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MobileCard(
              title: 'Active',
              value: '${m['activeChats'] ?? 0}',
              icon: Icons.bolt_rounded,
              color: AppColors.cyan,
            ),
          ),
        ]),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: appCardDecoration(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("Today's Summary", style: AppText.sectionTitle),
              const SizedBox(height: 16),
              _summaryRow('Closed Conversations', '${m['closedToday'] ?? 0}',
                  Icons.check_circle_outline_rounded, AppColors.success),
              const SizedBox(height: 12),
              _summaryRow('Active Conversations', '${m['activeChats'] ?? 0}',
                  Icons.forum_rounded, AppColors.brandBlue),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            onPressed: () => context.go('/chat'),
            icon: const Icon(Icons.chat_rounded, size: 20),
            label: const Text('Go to Inbox', style: AppText.button),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
              elevation: 0,
            ),
          ),
        ),
      ],
    ];
  }

  Widget _buildMobileError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('Could not load dashboard',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade600)),
            const SizedBox(height: 4),
            Text('Pull down to retry',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value, IconData icon, Color color) =>
      Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: AppRadius.rSm,
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(label, style: AppText.bodyMuted),
        ),
        Text(value, style: AppText.statValue.copyWith(fontSize: 18)),
      ]);

  // Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â 
  // DESKTOP DASHBOARD
  // Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â 
  // ignore: unused_element
  List<Widget> _buildDesktopDashboard(String orgName, String userRole) {
    final role = _stats?['userRole']?.toString() ?? userRole;
    final isAgent = role == 'agent';
    final isManager = role == 'manager' || role == 'admin' || role == 'owner';

    return [
      _buildHeader(orgName, userRole),
      const SizedBox(height: 24),
      if (_loading && _stats == null)
        const Center(
            child: Padding(
                padding: EdgeInsets.all(60),
                child: CircularProgressIndicator()))
      else if (_error != null)
        _buildError()
      else ...[
        _buildMetricBar(isAgent, isManager),
        const SizedBox(height: 20),
        if (isManager) ...[
          _buildTabPills(),
          const SizedBox(height: 20),
        ],
        ..._buildTabContent(isAgent, isManager),
      ],
    ];
  }

  Widget _buildTabPills() {
    const tabs = ['Overview', 'Channels', 'Agents', 'Funnel'];
    final primary = Theme.of(context).colorScheme.primary;
    return Row(
      children: List.generate(tabs.length, (i) {
        final selected = _selectedTab == i;
        return Padding(
          padding: EdgeInsets.only(right: i < tabs.length - 1 ? 8 : 0),
          child: InkWell(
            onTap: () => setState(() => _selectedTab = i),
            borderRadius: BorderRadius.circular(8),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color:
                    selected ? primary.withValues(alpha: 0.08) : Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected
                      ? primary.withValues(alpha: 0.30)
                      : const Color(0xFFE5E7EB),
                ),
              ),
              child: Text(
                tabs[i],
                style: TextStyle(
                  color: selected ? primary : const Color(0xFF6B7280),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  List<Widget> _buildTabContent(bool isAgent, bool isManager) {
    switch (_selectedTab) {
      case 1:
        return [
          if (isManager) ...[
            _buildChannelDist(),
            const SizedBox(height: 20),
            _buildSourceChannelDist(),
          ],
        ];
      case 2:
        return [
          if (!isAgent) _buildLeaderboard(),
          if (!isAgent) const SizedBox(height: 20),
          if (isManager) _buildAgentFollowUp(),
          if (isAgent) _buildMyPerformance(),
        ];
      case 3:
        return [
          if (isManager) ...[
            _buildConversionFunnel(),
          ],
        ];
      default:
        return _buildOverviewContent(isAgent, isManager);
    }
  }

  List<Widget> _buildOverviewContent(bool isAgent, bool isManager) {
    return [
      LayoutBuilder(builder: (ctx, constraints) {
        final wide = constraints.maxWidth > 900;
        if (wide) {
          return Column(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                  flex: 3,
                  child: Column(children: [
                    _buildTrendChart(),
                    const SizedBox(height: 20),
                    if (isManager) _buildResponseTimeInsights(),
                  ])),
              const SizedBox(width: 20),
              Expanded(
                  flex: 2,
                  child: Column(children: [
                    if (isAgent) _buildMyPerformance(),
                    if (!isAgent) _buildLeaderboard(),
                    const SizedBox(height: 20),
                    if (isManager) _buildBroadcasts(),
                  ])),
            ]),
          ]);
        }
        return Column(children: [
          _buildTrendChart(),
          const SizedBox(height: 20),
          if (isAgent) _buildMyPerformance(),
          if (!isAgent) _buildLeaderboard(),
          const SizedBox(height: 20),
          if (isManager) ...[
            _buildResponseTimeInsights(),
            const SizedBox(height: 20),
            _buildBroadcasts(),
          ],
        ]);
      }),
    ];
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Header with filters Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildHeader(String orgName, String userRole) {
    final dateFmt = DateFormat('EEE, MMM d, yyyy');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const Spacer(),
          _iconBtn(Icons.refresh_rounded, _loading, _fetchStats),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.calendar_today_rounded,
                  size: 14, color: Color(0xFF9CA3AF)),
              const SizedBox(width: 8),
              Text(dateFmt.format(DateTime.now()),
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF6B7280))),
            ]),
          ),
        ]),
        const SizedBox(height: 18),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _compactDropdown<String?>(
            hint: 'All Channels',
            icon: Icons.forum_outlined,
            value: _selectedChannelId,
            items: [
              const DropdownMenuItem(value: null, child: Text('All Channels')),
              ..._channels.map((c) => DropdownMenuItem(
                  value: c['id']?.toString(),
                  child: Text(c['name']?.toString() ?? ''))),
            ],
            onChanged: (v) {
              setState(() => _selectedChannelId = v);
              _fetchStats();
            },
          ),
          _compactDropdown<String?>(
            hint: 'All Departments',
            icon: Icons.account_tree_outlined,
            value: _selectedDepartmentId,
            items: [
              const DropdownMenuItem(
                  value: null, child: Text('All Departments')),
              ..._departments.map((d) => DropdownMenuItem(
                  value: d['id']?.toString(),
                  child: Text(d['name']?.toString() ?? ''))),
            ],
            onChanged: (v) {
              setState(() => _selectedDepartmentId = v);
              _fetchStats();
            },
          ),
          _MultiSourceChip(
            label: 'Source',
            icon: Icons.campaign_outlined,
            allLabel: 'All Sources',
            selected: _selectedSources,
            options: () {
              final dist =
                  (_sourceChannelStats?['distribution'] as List?) ?? const [];
              final available = <String>{
                for (final e in dist)
                  if (e is Map && e['channel'] != null) e['channel'].toString()
              };
              available.addAll(_selectedSources);
              final filtered = _sourceOptions
                  .where((e) => available.contains(e.key))
                  .toList();
              return filtered
                  .map((e) => {'id': e.key, 'label': e.value})
                  .toList();
            }(),
            onChanged: () {
              setState(() {});
              _fetchStats();
            },
          ),
          _compactDropdown<String>(
            hint: 'Date Range',
            icon: Icons.event_outlined,
            value: _selectedDateRange,
            items: [
              const DropdownMenuItem(value: 'today', child: Text('Today')),
              const DropdownMenuItem(
                  value: 'yesterday', child: Text('Yesterday')),
              const DropdownMenuItem(
                  value: 'last7d', child: Text('Last 7 Days')),
              const DropdownMenuItem(
                  value: 'last30d', child: Text('Last 30 Days')),
              DropdownMenuItem(
                value: 'custom',
                child: Text(_selectedDateRange == 'custom' &&
                        _customRange != null
                    ? '${_customRange!.start.day}/${_customRange!.start.month} – ${_customRange!.end.day}/${_customRange!.end.month}'
                    : 'Custom Range…'),
              ),
            ],
            onChanged: (v) async {
              if (v == null) return;
              if (v == 'custom') {
                final now = DateTime.now();
                final picked = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(2020),
                  lastDate: DateTime(now.year + 1),
                  initialDateRange: _customRange ??
                      DateTimeRange(
                        start: now.subtract(const Duration(days: 6)),
                        end: now,
                      ),
                );
                if (picked == null) return;
                setState(() {
                  _selectedDateRange = 'custom';
                  _customRange = picked;
                });
                _fetchStats();
              } else {
                setState(() => _selectedDateRange = v);
                _fetchStats();
              }
            },
          ),
        ]),
      ],
    );
  }

  // ── Compact Metric Bar (replaces KPI cards) ──
  Widget _buildMetricBar(bool isAgent, bool isManager) {
    if (isAgent) {
      final m = _stats?['agentMetrics'] as Map<String, dynamic>? ?? {};
      return _metricBarRow([
        _MetricItem('Active', _fmtNum(m['activeChats'] ?? _stats?['active']),
            Icons.chat_bubble_rounded, const Color(0xFF3B82F6)),
        _MetricItem('Assigned', _fmtNum(m['totalChats'] ?? _stats?['active']),
            Icons.assignment_rounded, const Color(0xFF8B5CF6)),
        _MetricItem(
            'Avg Response',
            _fmtDuration((m['avgAgentResponseSeconds'] ?? 0) is int
                ? m['avgAgentResponseSeconds']
                : 0),
            Icons.speed_rounded,
            const Color(0xFFF59E0B)),
        _MetricItem('Resolved', _fmtNum(m['resolvedToday']),
            Icons.check_circle_rounded, const Color(0xFF10B981)),
      ]);
    }
    final items = <_MetricItem>[
      _MetricItem('Active', _fmtNum(_stats?['activeConversations']),
          Icons.chat_bubble_rounded, const Color(0xFF3B82F6)),
      _MetricItem(
          'Unassigned',
          _fmtNum(_stats?['unassignedConversations']),
          Icons.assignment_late_rounded,
          (_stats?['unassignedConversations'] ?? 0) > 0
              ? const Color(0xFFEF4444)
              : const Color(0xFF10B981)),
      _MetricItem('Messages', _fmtNum(_stats?['messagesToday']),
          Icons.message_rounded, const Color(0xFF10B981)),
    ];
    if (isManager) {
      final overdueCount = _followUpStats?['overdue'] ?? 0;
      items.addAll([
        _MetricItem('Contacts', _fmtNum(_stats?['totalContacts']),
            Icons.people_rounded, const Color(0xFF06B6D4)),
        _MetricItem('Team', _fmtNum(_stats?['totalAgents']),
            Icons.groups_rounded, const Color(0xFF8B5CF6)),
        if (overdueCount > 0)
          _MetricItem('Overdue', _fmtNum(overdueCount),
              Icons.warning_amber_rounded, const Color(0xFFEF4444)),
      ]);
    }
    return _metricBarRow(items);
  }

  Widget _metricBarRow(List<_MetricItem> items) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEEF0F4)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 6,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: items.asMap().entries.expand((e) {
          final i = e.key;
          final item = e.value;
          return [
            if (i > 0)
              Container(
                  width: 1,
                  height: 40,
                  margin: const EdgeInsets.symmetric(horizontal: 12),
                  color: const Color(0xFFF3F4F6)),
            Expanded(
                child: Row(children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                    color: item.color.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8)),
                child: Icon(item.icon, color: item.color, size: 16),
              ),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item.value,
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: item.color,
                        letterSpacing: -0.5)),
                Text(item.label,
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF9CA3AF))),
              ]),
            ])),
          ];
        }).toList(),
      ),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Interactive Trend Chart Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildTrendChart() {
    final convTrend =
        (_stats?['dailyTrend'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final repliedTrend =
        (_stats?['repliedTrend'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final contactTrend =
        (_stats?['contactTrend'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final rangeLabel = _stats?['dateRangeLabel']?.toString() ?? 'Last 7 Days';

    return _sectionCard(
      title: 'Activity Overview',
      subtitle: rangeLabel,
      icon: Icons.trending_up_rounded,
      child: Column(children: [
        const SizedBox(height: 16),
        SizedBox(
          height: 220,
          child: convTrend.isEmpty
              ? const Center(
                  child: Text('No data available',
                      style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13)))
              : _InteractiveChart(
                  convData: convTrend,
                  msgData: repliedTrend,
                  contactData: contactTrend,
                  msgLabel: 'Replied'),
        ),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _legend(const Color(0xFF3B82F6), 'Conversations'),
          const SizedBox(width: 24),
          _legend(const Color(0xFF10B981), 'Replied'),
          const SizedBox(width: 24),
          _legend(const Color(0xFF8B5CF6), 'New Contacts'),
        ]),
      ]),
    );
  }

  Widget _legend(Color c, String label) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
                color: c, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 6),
        Text(label,
            style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
      ]);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Response Time Insights Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildResponseTimeInsights() {
    final avgResp = _stats?['avgFirstResponseSeconds'] ?? 0;
    final avgAgentResp = _stats?['avgAgentResponseSeconds'] ?? 0;
    final resRate = _stats?['resolutionRate'] ?? 0;
    final resolvedWeek = _stats?['resolvedThisWeek'] ?? 0;
    final totalConv = _stats?['totalConversations'] ?? 0;

    final avgRespInt =
        avgResp is int ? avgResp : (avgResp is num ? avgResp.toInt() : 0);
    final avgAgentRespInt = avgAgentResp is int
        ? avgAgentResp
        : (avgAgentResp is num ? avgAgentResp.toInt() : 0);
    String respLabel;
    Color respColor;
    if (avgRespInt < 300) {
      respLabel = 'Excellent';
      respColor = const Color(0xFF10B981);
    } else if (avgRespInt < 900) {
      respLabel = 'Good';
      respColor = const Color(0xFFF59E0B);
    } else {
      respLabel = 'Needs Improvement';
      respColor = const Color(0xFFEF4444);
    }

    String agentRespLabel;
    Color agentRespColor;
    if (avgAgentRespInt <= 0) {
      agentRespLabel = 'No data';
      agentRespColor = const Color(0xFF9CA3AF);
    } else if (avgAgentRespInt < 300) {
      agentRespLabel = 'Excellent';
      agentRespColor = const Color(0xFF10B981);
    } else if (avgAgentRespInt < 900) {
      agentRespLabel = 'Good';
      agentRespColor = const Color(0xFFF59E0B);
    } else {
      agentRespLabel = 'Needs Improvement';
      agentRespColor = const Color(0xFFEF4444);
    }

    return _sectionCard(
      title: 'Response Insights',
      subtitle: 'Agent performance Ã‚Â· excludes customer responses',
      icon: Icons.insights_rounded,
      child: Column(children: [
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
              child: _insightTile('Avg First Response',
                  _fmtDuration(avgRespInt), respLabel, respColor)),
          const SizedBox(width: 12),
          Expanded(
              child: _insightTile(
                  'Avg Response Time',
                  _fmtDuration(avgAgentRespInt),
                  agentRespLabel,
                  agentRespColor)),
          const SizedBox(width: 12),
          Expanded(
              child: _insightTile(
                  'Resolution Rate',
                  '$resRate%',
                  resRate >= 70 ? 'On Track' : 'Below Target',
                  resRate >= 70
                      ? const Color(0xFF10B981)
                      : const Color(0xFFF59E0B))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
              child: _insightTile('Closed', _fmtNum(resolvedWeek),
                  _rangeSuffix(), const Color(0xFF10B981))),
          const SizedBox(width: 12),
          Expanded(
              child: _insightTile('Total Conversations', _fmtNum(totalConv),
                  'All time', const Color(0xFF8B5CF6))),
        ]),
      ]),
    );
  }

  Widget _insightTile(String label, String value, String badge, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: color,
                  letterSpacing: -0.5)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6)),
            child: Text(badge,
                style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w600, color: color)),
          ),
        ]),
        const SizedBox(height: 4),
        Text(label,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Color(0xFF6B7280))),
      ]),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ My Performance (Agent) Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildMyPerformance() {
    final m = _stats?['agentMetrics'] as Map<String, dynamic>? ?? {};
    final total = (m['totalChats'] ?? 0) as int;
    final replied = (m['totalReplied'] ?? 0) as int;
    final rate = total > 0 ? ((replied / total) * 100).round() : 0;

    return _sectionCard(
      title: 'My Performance',
      subtitle: 'Personal stats',
      icon: Icons.person_rounded,
      child: Column(children: [
        const SizedBox(height: 12),
        _perfRow('Response Rate', '$rate%',
            rate >= 80 ? const Color(0xFF10B981) : const Color(0xFFF59E0B)),
        const Divider(height: 20, color: Color(0xFFF3F4F6)),
        _perfRow('Active Chats', '${m['activeChats'] ?? 0}',
            const Color(0xFF3B82F6)),
        const Divider(height: 20, color: Color(0xFFF3F4F6)),
        _perfRow(
            'Resolved', '${m['resolvedToday'] ?? 0}', const Color(0xFF10B981)),
        const Divider(height: 20, color: Color(0xFFF3F4F6)),
        _perfRow(
            'Avg Response',
            _fmtDuration((m['avgAgentResponseSeconds'] ?? 0) is int
                ? m['avgAgentResponseSeconds']
                : 0),
            const Color(0xFFF59E0B)),
      ]),
    );
  }

  Widget _perfRow(String label, String value, Color color) => Row(children: [
        Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 13, color: Color(0xFF6B7280)))),
        Text(value,
            style: TextStyle(
                fontSize: 15, fontWeight: FontWeight.w700, color: color)),
      ]);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Agent Leaderboard (Productivity) Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildLeaderboard() {
    final lb =
        (_stats?['agentLeaderboard'] as List?)?.cast<Map<String, dynamic>>() ??
            [];

    return _sectionCard(
      title: 'Agent Leaderboard',
      subtitle: 'Won / Lost / Active \u00b7 conversion rate',
      icon: Icons.leaderboard_rounded,
      child: lb.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(24),
              child: Center(
                  child: Text('No agent data',
                      style:
                          TextStyle(color: Color(0xFF9CA3AF), fontSize: 13))))
          : Column(children: [
              const SizedBox(height: 12),
              ...lb.asMap().entries.map((e) {
                final i = e.key;
                final a = e.value;
                final name = a['name'] ?? 'Unknown';
                final avgReply = a['avgFirstReplySeconds'];
                final won = (a['won'] ?? 0) as int;
                final lost = (a['lost'] ?? 0) as int;
                final active = (a['active'] ?? a['open'] ?? 0) as int;
                final conversionRate = (a['conversionRate'] ?? 0) as int;
                final calls = (a['calls'] ?? 0) as int;
                final waCtas = (a['whatsappCtas'] ?? 0) as int;
                final avgCallDur = a['avgCallDurationSeconds'] as num?;
                final medals = [
                  const Color(0xFFFFD700),
                  const Color(0xFFC0C0C0),
                  const Color(0xFFCD7F32)
                ];

                final replyColor = avgReply == null || avgReply == 0
                    ? const Color(0xFF9CA3AF)
                    : (avgReply < 300
                        ? const Color(0xFF10B981)
                        : (avgReply < 900
                            ? const Color(0xFFF59E0B)
                            : const Color(0xFFEF4444)));

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          SizedBox(
                              width: 24,
                              child: i < 3
                                  ? Icon(Icons.emoji_events_rounded,
                                      color: medals[i], size: 18)
                                  : Text('${i + 1}',
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFF9CA3AF)))),
                          const SizedBox(width: 8),
                          CircleAvatar(
                              radius: 14,
                              backgroundColor:
                                  AvatarColors.getBackgroundColor(name),
                              child: Text(
                                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: AvatarColors.getColor(name)))),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(name,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF1F2937)),
                                    overflow: TextOverflow.ellipsis),
                                Row(children: [
                                  Icon(Icons.speed_rounded,
                                      size: 10, color: replyColor),
                                  const SizedBox(width: 3),
                                  Text(
                                      avgReply != null && avgReply > 0
                                          ? _fmtDuration(avgReply is int
                                              ? avgReply
                                              : (avgReply as num).toInt())
                                          : '--',
                                      style: TextStyle(
                                          fontSize: 10,
                                          color: replyColor,
                                          fontWeight: FontWeight.w600)),
                                ]),
                              ])),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: conversionRate >= 50
                                  ? const Color(0xFF10B981).withValues(alpha: 0.1)
                                  : const Color(0xFFF59E0B).withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text('$conversionRate%',
                                style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: conversionRate >= 50
                                        ? const Color(0xFF10B981)
                                        : const Color(0xFFF59E0B))),
                          ),
                        ]),
                        const SizedBox(height: 6),
                        Padding(
                          padding: const EdgeInsets.only(left: 60),
                          child: Wrap(spacing: 6, runSpacing: 4, children: [
                            _chipBadge('Won $won', const Color(0xFF10B981)),
                            _chipBadge('Lost $lost', const Color(0xFFEF4444)),
                            _chipBadge(
                                'Active $active', const Color(0xFF3B82F6)),
                            if (calls > 0)
                              _chipBadge(
                                  'Calls $calls', const Color(0xFF8B5CF6)),
                            if (waCtas > 0)
                              _chipBadge('WA $waCtas', const Color(0xFF25D366)),
                            if (avgCallDur != null && avgCallDur > 0)
                              _chipBadge(
                                  'Avg ${_fmtDuration(avgCallDur.toInt())}',
                                  const Color(0xFF06B6D4)),
                          ]),
                        ),
                      ]),
                );
              }),
            ]),
    );
  }

  Widget _chipBadge(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: color)),
      );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Broadcasts (Manager+) Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildBroadcasts() {
    final bs = _stats?['broadcastStats'] as Map<String, dynamic>?;
    if (bs == null) return const SizedBox.shrink();
    final total = bs['total'] ?? 0;
    final sent = bs['sent'] ?? 0;
    final totalSpent = bs['totalSpent'] ?? 0;
    final totalSent = bs['totalSent'] ?? 0;
    final totalDelivered = bs['totalDelivered'] ?? 0;
    final totalRead = bs['totalRead'] ?? 0;
    final recent =
        (bs['recentBroadcasts'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return _sectionCard(
      title: 'Broadcasts',
      subtitle: '$total total \u00b7 $sent sent',
      icon: Icons.cell_tower_rounded,
      trailing: const SizedBox.shrink(),
      child: Column(children: [
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
              child: _miniStat('Total Spent', _fmtCurrency(totalSpent),
                  const Color(0xFFEF4444))),
          const SizedBox(width: 12),
          Expanded(
              child: _miniStat('Messages Sent', _fmtNum(totalSent),
                  const Color(0xFF10B981))),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
              child: _miniStat('Delivered', _fmtNum(totalDelivered),
                  const Color(0xFF3B82F6))),
          const SizedBox(width: 12),
          Expanded(
              child: _miniStat(
                  'Read', _fmtNum(totalRead), const Color(0xFF8B5CF6))),
        ]),
        if (recent.isNotEmpty) ...[
          const SizedBox(height: 14),
          const Divider(height: 1, color: Color(0xFFF3F4F6)),
          const SizedBox(height: 10),
          ...recent.take(3).map((b) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  Expanded(
                      child: Text(b['name'] ?? '',
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF374151)),
                          overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: b['status'] == 'sent'
                          ? const Color(0xFF10B981).withValues(alpha: 0.1)
                          : const Color(0xFFF59E0B).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      b['status'] == 'sent'
                          ? '${b['sentCount'] ?? 0} sent'
                          : (b['status'] ?? 'draft').toString().toUpperCase(),
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: b['status'] == 'sent'
                              ? const Color(0xFF10B981)
                              : const Color(0xFFF59E0B)),
                    ),
                  ),
                ]),
              )),
        ],
      ]),
    );
  }

  Widget _miniStat(String label, String value, Color color) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value,
              style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF111827),
                  letterSpacing: -0.3)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF6B7280))),
        ]),
      );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Channel Distribution Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildChannelDist() {
    final channels = (_stats?['channelDistribution'] as List?)
            ?.cast<Map<String, dynamic>>() ??
        [];
    if (channels.isEmpty) return const SizedBox.shrink();
    final colors = [
      const Color(0xFF3B82F6),
      const Color(0xFF10B981),
      const Color(0xFFF59E0B),
      const Color(0xFF8B5CF6),
      const Color(0xFFEF4444)
    ];

    return _sectionCard(
      title: 'Channel Distribution',
      subtitle: 'By conversations',
      icon: Icons.pie_chart_rounded,
      child: Column(children: [
        const SizedBox(height: 16),
        ...channels.asMap().entries.map((e) {
          final i = e.key;
          final ch = e.value;
          final color = colors[i % colors.length];
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                        color: color, borderRadius: BorderRadius.circular(3))),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(ch['channel'] ?? '',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFF374151)))),
                Text('${ch['percent'] ?? 0}%',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color)),
              ]),
              const SizedBox(height: 5),
              ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (ch['percent'] ?? 0) / 100.0,
                    backgroundColor: const Color(0xFFF3F4F6),
                    valueColor: AlwaysStoppedAnimation(color),
                    minHeight: 6,
                  )),
            ]),
          );
        }),
      ]),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Source Channel Distribution Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildSourceChannelDist() {
    final data = _sourceChannelStats;
    if (data == null) return const SizedBox.shrink();
    final dist =
        (data['distribution'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final totals = data['totals'] as Map<String, dynamic>? ?? {};
    final best = data['bestPerformer'] as Map<String, dynamic>?;
    if (dist.isEmpty) return const SizedBox.shrink();

    final sourceColors = <String, Color>{
      'META_ADS': const Color(0xFF3B82F6),
      'META_ORGANIC': const Color(0xFF42A5F5),
      'META_MESSENGER': const Color(0xFF0084FF),
      'TIKTOK_ADS': const Color(0xFF010101),
      'GOOGLE_ADS': const Color(0xFF4285F4),
      'INSTAGRAM': const Color(0xFFE1306C),
      'PUBLISHER': const Color(0xFF00897B),
      'LANDING_PAGE': const Color(0xFFFF6F00),
      'FORM': const Color(0xFFFF6F00),
      'WHATSAPP_DIRECT': const Color(0xFF25D366),
      'REFERRAL': const Color(0xFF7C4DFF),
    };

    final bestChannel = best?['channel']?.toString();
    final bestScore = best?['effectivenessScore'];

    return _sectionCard(
      title: 'Source Channel Analytics',
      subtitle:
          '${data['dateRange'] ?? ''} \u00b7 ${totals['conversations'] ?? 0} conversations',
      icon: Icons.campaign_rounded,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
              child: _miniStat('Leads', _fmtNum(totals['contacts']),
                  const Color(0xFF3B82F6))),
          const SizedBox(width: 10),
          Expanded(
              child: _miniStat('Conversions', _fmtNum(totals['conversions']),
                  const Color(0xFF10B981))),
          const SizedBox(width: 10),
          Expanded(
              child: _miniStat(
                  'Won', _fmtNum(totals['won']), const Color(0xFF059669))),
          const SizedBox(width: 10),
          Expanded(
              child: _miniStat('Revenue', _fmtCurrency(totals['revenue']),
                  const Color(0xFF8B5CF6))),
        ]),
        if (bestChannel != null) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF9FAFB),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(children: [
              const Icon(Icons.star_rounded,
                  color: Color(0xFFF59E0B), size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    const TextSpan(
                        text: 'Top performer: ',
                        style: TextStyle(
                            fontSize: 12.5, color: Color(0xFF6B7280))),
                    TextSpan(
                        text: _sourceLabel(bestChannel),
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111827))),
                  ]),
                ),
              ),
              Text('Score ${bestScore ?? 0}',
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF6B7280))),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        const Divider(height: 1, color: Color(0xFFF3F4F6)),
        const SizedBox(height: 12),
        // Column headers
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 2, vertical: 4),
          child: Row(children: [
            SizedBox(
                width: 140,
                child: Text('Source',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
            Expanded(
                child: Text('Leads',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
            Expanded(
                child: Text('Conv',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
            Expanded(
                child: Text('Rate',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
            Expanded(
                child: Text('Avg Resp',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
            SizedBox(width: 16),
            SizedBox(
                width: 56,
                child: Text('Score',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF9CA3AF)))),
          ]),
        ),
        const Divider(height: 1, color: Color(0xFFF3F4F6)),
        ...dist.map((ch) {
          final channel = ch['channel']?.toString() ?? 'UNKNOWN';
          final label = _sourceLabel(channel);
          final color = sourceColors[channel] ?? const Color(0xFF607D8B);
          final conversations = ch['conversations'] ?? 0;
          final contacts = ch['contacts'] ?? 0;
          final conversions = ch['conversions'] ?? 0;
          final revenue = ch['revenue'] ?? 0;
          final convRate = (ch['conversionRate'] ?? 0);
          final convRateNum = convRate is num
              ? convRate.toDouble()
              : double.tryParse(convRate.toString()) ?? 0.0;
          final avgRespSec = ch['avgResponseSeconds'];
          final effScore = (ch['effectivenessScore'] ?? 0) as int;
          final won = ch['won'] ?? 0;
          final lost = ch['lost'] ?? 0;

          final scoreColor = effScore >= 70
              ? const Color(0xFF059669)
              : (effScore >= 40
                  ? const Color(0xFFB45309)
                  : const Color(0xFF6B7280));

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                SizedBox(
                    width: 140,
                    child: Row(children: [
                      Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                              color: color,
                              borderRadius: BorderRadius.circular(2))),
                      const SizedBox(width: 6),
                      Expanded(
                          child: Text(label,
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF374151)),
                              overflow: TextOverflow.ellipsis)),
                    ])),
                Expanded(
                    child: Text('$contacts',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111827)))),
                Expanded(
                    child: Text('$conversions',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111827)))),
                Expanded(
                    child: Text('${convRateNum.toStringAsFixed(1)}%',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF111827)))),
                Expanded(
                    child: Text(
                        avgRespSec != null
                            ? _fmtDuration((avgRespSec as num).toInt())
                            : '--',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 12.5, color: Color(0xFF6B7280)))),
                const SizedBox(width: 16),
                SizedBox(
                    width: 56,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                          color: const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(6)),
                      child: Text('$effScore',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: scoreColor)),
                    )),
              ]),
              const SizedBox(height: 6),
              Row(children: [
                const SizedBox(width: 14),
                Expanded(
                    child: ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: (effScore / 100.0).clamp(0.0, 1.0),
                          backgroundColor: const Color(0xFFF3F4F6),
                          valueColor: AlwaysStoppedAnimation(color),
                          minHeight: 4,
                        ))),
              ]),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.only(left: 14),
                child: Wrap(spacing: 10, runSpacing: 4, children: [
                  Text('$conversations chats',
                      style: const TextStyle(
                          fontSize: 10.5, color: Color(0xFF9CA3AF))),
                  Text('Won $won',
                      style: const TextStyle(
                          fontSize: 10.5,
                          color: Color(0xFF6B7280),
                          fontWeight: FontWeight.w500)),
                  Text('Lost $lost',
                      style: const TextStyle(
                          fontSize: 10.5,
                          color: Color(0xFF6B7280),
                          fontWeight: FontWeight.w500)),
                  Text(_fmtCurrency(revenue),
                      style: const TextStyle(
                          fontSize: 10.5,
                          color: Color(0xFF6B7280),
                          fontWeight: FontWeight.w500)),
                ]),
              ),
            ]),
          );
        }),
      ]),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Conversion Funnel Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildConversionFunnel() {
    final data = _conversionFunnel;
    if (data == null) return const SizedBox.shrink();
    final stages =
        (data['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final revenue = data['totalRevenue'] ?? 0;
    final grouped = data['groupedTotals'] as Map<String, dynamic>? ?? {};
    final totalLeads = data['totalLeads'] ?? 0;
    final conversionRate = data['conversionRate'] ?? 0;
    final progressing = (grouped['progressing'] ?? 0) as int;
    final won = (grouped['won'] ?? 0) as int;
    final lost = (grouped['lost'] ?? 0) as int;

    if (stages.isEmpty) {
      return _sectionCard(
        title: 'Conversion Funnel',
        subtitle: 'No stages configured',
        icon: Icons.filter_alt_rounded,
        child: const Padding(
          padding: EdgeInsets.all(32),
          child: Center(
              child: Text('Create stages in Settings to see the funnel',
                  style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13))),
        ),
      );
    }

    const progressingColor = Color(0xFF3B82F6);
    const wonColor = Color(0xFF10B981);
    const lostColor = Color(0xFFEF4444);

    Color stageColor(Map<String, dynamic> s) {
      final raw = s['color']?.toString();
      if (raw != null && raw.startsWith('#') && raw.length == 7) {
        return Color(int.parse('FF${raw.substring(1)}', radix: 16));
      }
      switch (s['category']) {
        case 'won':
          return wonColor;
        case 'lost':
          return lostColor;
        default:
          return progressingColor;
      }
    }

    Widget stageRow(Map<String, dynamic> s) {
      final name = s['name'] ?? '';
      final count = s['count'] ?? 0;
      final rate = s['rate'] ?? 0;
      final color = stageColor(s);
      final widthFraction =
          (rate is num ? rate.toDouble() / 100.0 : 0.05).clamp(0.05, 1.0);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          SizedBox(
            width: 180,
            child: Tooltip(
              message: name.toString(),
              child: Text(name,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF374151)),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: widthFraction.toDouble(),
                child: Container(
                  height: 24,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                    border:
                        Border.all(color: color.withValues(alpha: 0.3), width: 0.5),
                  ),
                  alignment: Alignment.center,
                  child: Text('$count',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: color)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
              width: 48,
              child: Text('$rate%',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: color))),
        ]),
      );
    }

    Widget groupBlock(
        String title, Color color, int total, List<Map<String, dynamic>> rows) {
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                    color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 8),
            Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color))),
            Text('$total',
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700, color: color)),
          ]),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Divider(height: 1, color: Color(0xFFF3F4F6)),
            const SizedBox(height: 6),
            ...rows.map(stageRow),
          ],
        ]),
      );
    }

    final progressingStages =
        stages.where((s) => s['category'] == 'progressing').toList();
    final wonStages = stages.where((s) => s['category'] == 'won').toList();
    final lostStages = stages.where((s) => s['category'] == 'lost').toList();

    return _sectionCard(
      title: 'Conversion Funnel',
      subtitle:
          '${data['dateRange'] ?? ''} \u00b7 $totalLeads leads \u00b7 $conversionRate% win rate \u00b7 ${_fmtCurrency(revenue)}',
      icon: Icons.filter_alt_rounded,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
              child: _miniStat(
                  'In Progress', _fmtNum(progressing), progressingColor)),
          const SizedBox(width: 10),
          Expanded(child: _miniStat('Won', _fmtNum(won), wonColor)),
          const SizedBox(width: 10),
          Expanded(child: _miniStat('Lost', _fmtNum(lost), lostColor)),
        ]),
        const SizedBox(height: 16),
        groupBlock(
            'In Progress', progressingColor, progressing, progressingStages),
        groupBlock('Won', wonColor, won, wonStages),
        groupBlock('Lost', lostColor, lost, lostStages),
      ]),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Agent Follow-up Performance Ã¢â€â‚¬Ã¢â€â‚¬
  Widget _buildAgentFollowUp() {
    final data = _agentPerformance;
    if (data == null) return const SizedBox.shrink();
    final agents =
        (data['agents'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    if (agents.isEmpty) return const SizedBox.shrink();

    return _sectionCard(
      title: 'Agent Follow-up Performance',
      subtitle:
          '${data['dateRange'] ?? ''} \u00b7 First reply time & source breakdown',
      icon: Icons.speed_rounded,
      child: Column(children: [
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFF9FAFB),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(children: [
            SizedBox(
                width: 160,
                child: Text('Agent',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
            Expanded(
                child: Text('Conversations',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
            Expanded(
                child: Text('Replied',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
            Expanded(
                child: Text('Avg 1st Reply',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
            Expanded(
                child: Text('Closed',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
            SizedBox(
                width: 180,
                child: Text('Sources',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF6B7280)))),
          ]),
        ),
        const Divider(height: 1, color: Color(0xFFF3F4F6)),
        ...agents.map((agent) {
          final name = agent['name'] ?? 'Unknown';
          final totalConv = agent['totalConversations'] ?? 0;
          final replied = agent['repliedCount'] ?? 0;
          final avgReply = agent['avgFirstReplySeconds'];
          final resolved = agent['resolved'] ?? 0;
          final sources = (agent['sourceBreakdown'] as List?)
                  ?.cast<Map<String, dynamic>>() ??
              [];

          final replyColor = avgReply == null
              ? const Color(0xFF9CA3AF)
              : (avgReply < 300
                  ? const Color(0xFF10B981)
                  : (avgReply < 900
                      ? const Color(0xFFF59E0B)
                      : const Color(0xFFEF4444)));

          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Color(0xFFF3F4F6))),
            ),
            child: Row(children: [
              SizedBox(
                  width: 160,
                  child: Row(children: [
                    CircleAvatar(
                        radius: 14,
                        backgroundColor: AvatarColors.getBackgroundColor(name),
                        child: Text(
                            name.isNotEmpty ? name[0].toUpperCase() : '?',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AvatarColors.getColor(name)))),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(name,
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF1F2937)),
                            overflow: TextOverflow.ellipsis)),
                  ])),
              Expanded(
                  child: Text('$totalConv',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF374151)))),
              Expanded(
                  child: Text('$replied',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF374151)))),
              Expanded(
                  child: Text(
                avgReply != null
                    ? _fmtDuration(
                        avgReply is int ? avgReply : (avgReply as num).toInt())
                    : '\u2014',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: replyColor),
              )),
              Expanded(
                  child: Text('$resolved',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF10B981)))),
              SizedBox(
                  width: 180,
                  child: Wrap(
                      spacing: 4,
                      runSpacing: 4,
                      children: sources.take(3).map((s) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF3B82F6).withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(_sourceLabel(s['channel'] ?? ''),
                              style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF3B82F6))),
                        );
                      }).toList())),
            ]),
          );
        }),
      ]),
    );
  }

  String _sourceLabel(String ch) => src.prettySourceChannel(ch, fallback: ch);

  String _fmtCurrency(dynamic v) {
    if (v == null) return 'Rp 0';
    final n = v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0;
    if (n >= 1000000) return 'Rp ${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return 'Rp ${(n / 1000).toStringAsFixed(1)}K';
    return 'Rp ${n.toStringAsFixed(0)}';
  }

  Widget _buildError() => Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE5E7EB))),
        child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded,
              size: 48, color: Color(0xFFEF4444)),
          const SizedBox(height: 16),
          const Text('Failed to load data',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1F2937))),
          const SizedBox(height: 8),
          TextButton.icon(
              onPressed: _fetchStats,
              icon: const Icon(Icons.refresh_rounded, size: 16),
              label: const Text('Retry')),
        ])),
      );

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // SHARED HELPERS
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â


  Widget _sectionCard(
      {required String title,
      required String subtitle,
      required IconData icon,
      required Widget child,
      Widget? trailing}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEEF0F4)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 6,
              offset: const Offset(0, 2))
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 18, color: const Color(0xFF3B82F6)),
          const SizedBox(width: 8),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1F2937))),
                Text(subtitle,
                    style: const TextStyle(
                        fontSize: 11, color: Color(0xFF9CA3AF))),
              ])),
          if (trailing != null) trailing,
        ]),
        child,
      ]),
    );
  }

  Widget _iconBtn(IconData icon, bool loading, VoidCallback onTap) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: loading ? null : onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE5E7EB))),
            child: loading
                ? const Center(
                    child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2)))
                : Icon(icon, size: 18, color: const Color(0xFF6B7280)),
          ),
        ),
      );


  Widget _compactDropdown<T>(
      {required String hint,
      required IconData icon,
      required T value,
      required List<DropdownMenuItem<T>> items,
      required ValueChanged<T?> onChanged}) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          items: items,
          onChanged: _loading ? null : onChanged,
          isDense: true,
          borderRadius: BorderRadius.zero,
          icon: const Icon(Icons.keyboard_arrow_down_rounded,
              size: 18, color: Color(0xFF6B7280)),
          hint: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14, color: const Color(0xFF6B7280)),
            const SizedBox(width: 6),
            Text(hint,
                style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          ]),
          selectedItemBuilder: (ctx) => items.map((item) {
            return Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 14, color: const Color(0xFF6B7280)),
              const SizedBox(width: 6),
              DefaultTextStyle.merge(
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1F2937)),
                child: item.child,
              ),
            ]);
          }).toList(),
          style: const TextStyle(fontSize: 12, color: Color(0xFF1F2937)),
        ),
      ),
    );
  }

  String _fmtNum(dynamic n) {
    if (n == null) return '0';
    final v = n is int ? n : int.tryParse(n.toString()) ?? 0;
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toString();
  }

  int _toInt(dynamic v) {
    if (v == null) return 0;
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  String _fmtDuration(int sec) {
    if (sec <= 0) return '\u2014';
    if (sec < 60) return '${sec}s';
    if (sec < 3600) return '${(sec / 60).round()}m';
    return '${(sec / 3600).toStringAsFixed(1)}h';
  }


  String _rangeSuffix() {
    switch (_selectedDateRange) {
      case 'today':
        return 'today';
      case 'yesterday':
        return 'yesterday';
      default:
        return 'in range';
    }
  }


}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SUPPORT CLASSES
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

class _MetricItem {
  final String label, value;
  final IconData icon;
  final Color color;
  const _MetricItem(this.label, this.value, this.icon, this.color);
}

class _MobileCard extends StatelessWidget {
  final String title, value;
  final IconData icon;
  final Color color;
  const _MobileCard(
      {required this.title,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: appCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: AppRadius.rSm,
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 14),
          Text(value, style: AppText.statValue),
          const SizedBox(height: 4),
          Text(title, style: AppText.label.copyWith(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

// â”€â”€ Interactive Chart with Hover Tooltips â”€â”€
class _InteractiveChart extends StatefulWidget {
  final List<Map<String, dynamic>> convData;
  final List<Map<String, dynamic>> msgData;
  final List<Map<String, dynamic>> contactData;
  final String msgLabel;
  const _InteractiveChart(
      {required this.convData,
      required this.msgData,
      this.contactData = const [],
      this.msgLabel = 'Msgs'});
  @override
  State<_InteractiveChart> createState() => _InteractiveChartState();
}

class _InteractiveChartState extends State<_InteractiveChart> {
  int? _hoveredIndex;
  Offset? _hoverPosition;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, constraints) {
      final w = constraints.maxWidth;
      final h = constraints.maxHeight;
      return MouseRegion(
        onHover: (event) {
          const padL = 44.0;
          final cW = w - padL - 12;
          final len = widget.convData.length;
          if (len <= 1) return;
          final x = event.localPosition.dx - padL;
          final idx = (x / cW * (len - 1)).round().clamp(0, len - 1);
          setState(() {
            _hoveredIndex = idx;
            _hoverPosition = event.localPosition;
          });
        },
        onExit: (_) => setState(() {
          _hoveredIndex = null;
          _hoverPosition = null;
        }),
        child: Stack(children: [
          CustomPaint(
            size: Size(w, h),
            painter: _ChartPainter(
              convData: widget.convData,
              msgData: widget.msgData,
              contactData: widget.contactData,
              hoveredIndex: _hoveredIndex,
            ),
          ),
          if (_hoveredIndex != null && _hoverPosition != null)
            Positioned(
              left: (_hoverPosition!.dx + 120 > w)
                  ? _hoverPosition!.dx - 120
                  : _hoverPosition!.dx + 12,
              top: (_hoverPosition!.dy - 10).clamp(0.0, h - 70),
              child: _buildTooltip(),
            ),
        ]),
      );
    });
  }

  Widget _buildTooltip() {
    final idx = _hoveredIndex!;
    final conv = idx < widget.convData.length
        ? widget.convData[idx]
        : <String, dynamic>{};
    final msg =
        idx < widget.msgData.length ? widget.msgData[idx] : <String, dynamic>{};
    final contact = idx < widget.contactData.length
        ? widget.contactData[idx]
        : <String, dynamic>{};
    final dateStr = conv['date']?.toString() ?? '';
    final dateLabel = dateStr.length >= 10
        ? '${dateStr.substring(8, 10)}/${dateStr.substring(5, 7)}'
        : dateStr;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1F2937),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 8,
              offset: const Offset(0, 3))
        ],
      ),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(dateLabel,
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white70)),
            const SizedBox(height: 4),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6),
                      borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 6),
              Text('Conv: ${conv['count'] ?? 0}',
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white)),
            ]),
            const SizedBox(height: 2),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                      color: const Color(0xFF10B981),
                      borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 6),
              Text('${widget.msgLabel}: ${msg['count'] ?? 0}',
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white)),
            ]),
            if (widget.contactData.isNotEmpty) ...[
              const SizedBox(height: 2),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                        color: const Color(0xFF8B5CF6),
                        borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 6),
                Text('New Contacts: ${contact['count'] ?? 0}',
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white)),
              ]),
            ],
          ]),
    );
  }
}

class _ChartPainter extends CustomPainter {
  final List<Map<String, dynamic>> convData, msgData, contactData;
  final int? hoveredIndex;
  const _ChartPainter(
      {required this.convData,
      required this.msgData,
      this.contactData = const [],
      this.hoveredIndex});

  @override
  void paint(Canvas canvas, Size size) {
    const padL = 44.0, padB = 28.0;
    final cW = size.width - padL - 12;
    final cH = size.height - 12 - padB;
    final gridPaint = Paint()
      ..color = const Color(0xFFF3F4F6)
      ..strokeWidth = 1;
    const textStyle = TextStyle(fontSize: 10, color: Color(0xFF9CA3AF));

    final allVals = [
      ...convData.map((e) => (e['count'] as int?) ?? 0),
      ...msgData.map((e) => (e['count'] as int?) ?? 0),
      ...contactData.map((e) => (e['count'] as int?) ?? 0),
    ];
    final maxV = allVals.isEmpty ? 10 : allVals.reduce(max).clamp(1, 999999);

    for (int i = 0; i <= 4; i++) {
      final y = 12 + cH - (cH * i / 4);
      canvas.drawLine(Offset(padL, y), Offset(size.width - 12, y), gridPaint);
      final tp = TextPainter(
          text: TextSpan(text: '${(maxV * i / 4).round()}', style: textStyle),
          textDirection: TextDirection.ltr)
        ..layout();
      tp.paint(canvas, Offset(padL - tp.width - 6, y - tp.height / 2));
    }

    for (int i = 0; i < convData.length; i++) {
      final x = padL + (cW * i / (convData.length - 1).clamp(1, 100));
      final dateStr = convData[i]['date']?.toString() ?? '';
      final label = dateStr.length >= 10
          ? '${dateStr.substring(8, 10)}/${dateStr.substring(5, 7)}'
          : '';
      final tp = TextPainter(
          text: TextSpan(text: label, style: textStyle),
          textDirection: TextDirection.ltr)
        ..layout();
      tp.paint(canvas, Offset(x - tp.width / 2, size.height - padB + 8));
    }

    if (hoveredIndex != null && convData.isNotEmpty) {
      final x =
          padL + (cW * hoveredIndex! / (convData.length - 1).clamp(1, 100));
      canvas.drawLine(
          Offset(x, 12),
          Offset(x, 12 + cH),
          Paint()
            ..color = const Color(0xFFD1D5DB)
            ..strokeWidth = 1);
    }

    _drawLine(
        canvas, size, convData, const Color(0xFF3B82F6), maxV, padL, cW, cH);
    _drawLine(
        canvas, size, msgData, const Color(0xFF10B981), maxV, padL, cW, cH);
    if (contactData.isNotEmpty) {
      _drawLine(canvas, size, contactData, const Color(0xFF8B5CF6), maxV, padL,
          cW, cH);
    }
  }

  void _drawLine(Canvas canvas, Size size, List<Map<String, dynamic>> data,
      Color color, int maxV, double padL, double cW, double cH) {
    if (data.isEmpty) return;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final fillPaint = Paint()
      ..shader = LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [color.withValues(alpha: 0.12), color.withValues(alpha: 0.0)])
          .createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final path = Path(), fillPath = Path();
    final pts = <Offset>[];
    for (int i = 0; i < data.length; i++) {
      final x = padL + (cW * i / (data.length - 1).clamp(1, 100));
      final y = 12 + cH - (cH * (data[i]['count'] as int) / maxV);
      pts.add(Offset(x, y));
    }

    path.moveTo(pts[0].dx, pts[0].dy);
    fillPath.moveTo(pts[0].dx, 12 + cH);
    fillPath.lineTo(pts[0].dx, pts[0].dy);

    for (int i = 1; i < pts.length; i++) {
      final cp1x = pts[i - 1].dx + (pts[i].dx - pts[i - 1].dx) / 3;
      final cp2x = pts[i].dx - (pts[i].dx - pts[i - 1].dx) / 3;
      path.cubicTo(cp1x, pts[i - 1].dy, cp2x, pts[i].dy, pts[i].dx, pts[i].dy);
      fillPath.cubicTo(
          cp1x, pts[i - 1].dy, cp2x, pts[i].dy, pts[i].dx, pts[i].dy);
    }

    fillPath.lineTo(pts.last.dx, 12 + cH);
    fillPath.close();
    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(path, paint);

    for (int i = 0; i < pts.length; i++) {
      final isHovered = hoveredIndex == i;
      final radius = isHovered ? 5.0 : 3.5;
      canvas.drawCircle(
          pts[i],
          radius,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.fill);
      canvas.drawCircle(
          pts[i],
          radius,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = isHovered ? 3 : 2);
    }
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) =>
      oldDelegate.hoveredIndex != hoveredIndex;
}

// -- Multi-select source chip --
class _MultiSourceChip extends StatefulWidget {
  final String label;
  final IconData icon;
  final String allLabel;
  final List<Map<String, String>> options;
  final Set<String> selected;
  final VoidCallback onChanged;
  const _MultiSourceChip({
    required this.label,
    required this.options,
    required this.selected,
    required this.onChanged,
    this.icon = Icons.campaign_outlined,
    this.allLabel = 'All Sources',
  });
  @override
  State<_MultiSourceChip> createState() => _MultiSourceChipState();
}

class _MultiSourceChipState extends State<_MultiSourceChip> {
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
                  .where((o) =>
                      _search.isEmpty ||
                      (o['label'] ?? '')
                          .toLowerCase()
                          .contains(_search.toLowerCase()))
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
                          prefixIcon:
                              const Icon(Icons.search_rounded, size: 18),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 32, minHeight: 32),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 8),
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
                                child: Text('No results',
                                    style: TextStyle(fontSize: 13)),
                              ),
                            )
                          : ListView.builder(
                              shrinkWrap: true,
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              itemCount: filtered.length,
                              itemBuilder: (_, i) {
                                final o = filtered[i];
                                final checked =
                                    widget.selected.contains(o['id']);
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
                                              : Icons
                                                  .check_box_outline_blank_rounded,
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
                                            style:
                                                const TextStyle(fontSize: 13),
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
        ? widget.allLabel
        : widget.selected.length == 1
            ? widget.options.firstWhere((o) => o['id'] == widget.selected.first,
                orElse: () => {'label': widget.selected.first})['label']!
            : '${widget.label} (${widget.selected.length})';
    return InkWell(
      onTap: () => _openMenu(context),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active
              ? theme.colorScheme.primary.withValues(alpha: 0.08)
              : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: active
                  ? theme.colorScheme.primary.withValues(alpha: 0.4)
                  : theme.dividerColor),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(widget.icon,
              size: 16,
              color: active
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurface.withValues(alpha: 0.6)),
          const SizedBox(width: 6),
          Text(display,
              style: TextStyle(
                  fontSize: 13,
                  color: active
                      ? theme.colorScheme.primary
                      : theme.colorScheme.onSurface.withValues(alpha: 0.7))),
          const SizedBox(width: 4),
          Icon(Icons.arrow_drop_down_rounded,
              size: 18,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
        ]),
      ),
    );
  }
}
