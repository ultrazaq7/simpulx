// ============================================================
// Analytics Page - Dashboard with Real API Data
// ============================================================
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({super.key});

  @override
  State<AnalyticsPage> createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  Map<String, dynamic> _stats = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _loading = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get(ApiConstants.dashboardStats);
      setState(() { _stats = response.data ?? {}; _loading = false; });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      IconButton(onPressed: _loadStats, icon: Icon(Icons.refresh_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _buildKpiRow(theme),
                  const SizedBox(height: 24),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 2, child: _buildTrendCard(theme)),
                      const SizedBox(width: 20),
                      Expanded(child: _buildChannelCard(theme)),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _buildAgentLeaderboard(theme),
                  const SizedBox(height: 24),
                  _buildBottomMetrics(theme),
                ],
              ),
            ),
    );
  }

  Widget _buildKpiRow(ThemeData theme) {
    final totalConversations = _stats['totalConversations'] ?? 0;
    final totalContacts = _stats['totalContacts'] ?? 0;
    final totalMessages = _stats['totalMessages'] ?? 0;
    final totalAgents = _stats['totalAgents'] ?? 0;
    final conversationsToday = _stats['conversationsToday'] ?? 0;
    final messagesToday = _stats['messagesToday'] ?? 0;

    return Row(
      children: [
        Expanded(child: _kpiCard(theme, 'Total Conversations', '$totalConversations', Icons.chat_rounded, const Color(0xFF3B82F6), '+$conversationsToday today')),
        const SizedBox(width: 16),
        Expanded(child: _kpiCard(theme, 'Total Contacts', '$totalContacts', Icons.people_rounded, const Color(0xFF10B981), '')),
        const SizedBox(width: 16),
        Expanded(child: _kpiCard(theme, 'Messages Sent', '$totalMessages', Icons.send_rounded, const Color(0xFF2D9CDB), '+$messagesToday today')),
        const SizedBox(width: 16),
        Expanded(child: _kpiCard(theme, 'Active Agents', '$totalAgents', Icons.support_agent_rounded, const Color(0xFFF59E0B), 'Active')),
      ],
    );
  }

  Widget _kpiCard(ThemeData theme, String label, String value, IconData icon, Color color, String trend) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, size: 22, color: color),
              ),
              const Spacer(),
              if (trend.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFF42B72A).withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
                  child: Text(trend, style: const TextStyle(fontSize: 11, color: Color(0xFF42B72A), fontWeight: FontWeight.w600)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text(value, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
        ],
      ),
    );
  }

  Widget _buildTrendCard(ThemeData theme) {
    final dailyTrend = _stats['dailyTrend'] as List<dynamic>? ?? [];

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Conversation Trends', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('Last 7 days', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
          const SizedBox(height: 20),
          SizedBox(
            height: 200,
            child: dailyTrend.isEmpty
                ? Center(child: Text('No data yet', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.3))))
                : CustomPaint(
                    painter: _TrendChartPainter(
                      data: dailyTrend.map((d) => (d['count'] as num?)?.toDouble() ?? 0).toList(),
                    ),
                    size: const Size(double.infinity, 200),
                  ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: dailyTrend.map((d) {
              final dateStr = d['date']?.toString() ?? '';
              final dayName = _shortDayName(dateStr);
              return Text(dayName, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)));
            }).toList(),
          ),
        ],
      ),
    );
  }

  String _shortDayName(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return days[date.weekday - 1];
    } catch (_) {
      return '';
    }
  }

  Widget _buildChannelCard(ThemeData theme) {
    final channelDist = _stats['channelDistribution'] as List<dynamic>? ?? [];
    const channelColors = {
      'whatsapp': Color(0xFF25D366),
      'web': Color(0xFF3B82F6),
      'instagram': Color(0xFFE1306C),
      'telegram': Color(0xFF0088CC),
      'email': Color(0xFFF59E0B),
    };

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('By Channel', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 20),
          if (channelDist.isEmpty)
            Text('No channel data yet', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.3)))
          else
            ...channelDist.map((ch) {
              final channel = (ch['channel'] ?? 'unknown').toString().toLowerCase();
              final percent = (ch['percent'] as num?)?.toInt() ?? 0;
              final count = (ch['count'] as num?)?.toInt() ?? 0;
              final color = channelColors[channel] ?? const Color(0xFF9CA3AF);
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_capitalize(channel), style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.7))),
                        Text('$count ($percent%)', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: percent / 100,
                        backgroundColor: color.withValues(alpha: 0.1),
                        color: color,
                        minHeight: 6,
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildAgentLeaderboard(ThemeData theme) {
    final agents = _stats['agentLeaderboard'] as List<dynamic>? ?? [];

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Agent Leaderboard', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          if (agents.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('No agent data yet', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.3)))),
            )
          else
            Table(
              columnWidths: const {
                0: FlexColumnWidth(0.5),
                1: FlexColumnWidth(2),
                2: FlexColumnWidth(1.5),
              },
              children: [
                TableRow(
                  decoration: BoxDecoration(border: Border(bottom: BorderSide(color: theme.dividerColor))),
                  children: ['#', 'Agent', 'Conversations']
                      .map((h) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(h, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                  )).toList(),
                ),
                ...agents.asMap().entries.map((e) {
                  final i = e.key;
                  final a = e.value;
                  return TableRow(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Container(
                          width: 24, height: 24,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i == 0 ? const Color(0xFFFFD700) : i == 1 ? const Color(0xFFC0C0C0) : i == 2 ? const Color(0xFFCD7F32) : theme.colorScheme.primary.withValues(alpha: 0.15),
                          ),
                          child: Center(child: Text('${i + 1}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: i < 3 ? Colors.white : theme.colorScheme.onSurface))),
                        ),
                      ),
                      Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(a['name']?.toString() ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600))),
                      Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text('${a['conversations'] ?? 0}')),
                    ],
                  );
                }),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildBottomMetrics(ThemeData theme) {
    final activeConversations = _stats['activeConversations'] ?? 0;
    final conversationsToday = _stats['conversationsToday'] ?? 0;

    return Row(
      children: [
        Expanded(child: _buildMetricCard(theme, 'Active Conversations', '$activeConversations', Icons.forum_rounded, const Color(0xFF42B72A))),
        const SizedBox(width: 16),
        Expanded(child: _buildMetricCard(theme, 'Today\'s Conversations', '$conversationsToday', Icons.today_rounded, const Color(0xFF3B82F6))),
      ],
    );
  }

  Widget _buildMetricCard(ThemeData theme, String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(
        children: [
          Icon(icon, size: 32, color: color),
          const SizedBox(height: 12),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), textAlign: TextAlign.center),
        ],
      ),
    );
  }

  String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

class _TrendChartPainter extends CustomPainter {
  final List<double> data;

  _TrendChartPainter({required this.data});

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final maxVal = data.reduce(max).clamp(1.0, double.infinity);

    final paint = Paint()
      ..color = const Color(0xFF3B82F6)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0x336C5CE7), Color(0x006C5CE7)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final points = data.map((v) => v / maxVal).toList();
    final path = Path();
    final fillPath = Path();

    for (int i = 0; i < points.length; i++) {
      final x = points.length > 1 ? (i / (points.length - 1)) * size.width : size.width / 2;
      final y = size.height - (points[i] * size.height * 0.85) - 10;
      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    fillPath.lineTo(size.width, size.height);
    fillPath.close();
    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(path, paint);

    // Draw dots and value labels
    final dotPaint = Paint()..color = const Color(0xFF3B82F6);
    for (int i = 0; i < points.length; i++) {
      final x = points.length > 1 ? (i / (points.length - 1)) * size.width : size.width / 2;
      final y = size.height - (points[i] * size.height * 0.85) - 10;
      canvas.drawCircle(Offset(x, y), 4, dotPaint);
      canvas.drawCircle(Offset(x, y), 2, Paint()..color = Colors.white);

      // Value label above dot
      final textPainter = TextPainter(
        text: TextSpan(text: '${data[i].toInt()}', style: const TextStyle(fontSize: 10, color: Color(0xFF3B82F6), fontWeight: FontWeight.w600)),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(canvas, Offset(x - textPainter.width / 2, y - 18));
    }
  }

  @override
  bool shouldRepaint(covariant _TrendChartPainter oldDelegate) => oldDelegate.data != data;
}
