// ============================================================
// Drip Campaigns Page - Full Step Editor
// ============================================================
import 'package:flutter/material.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class DripCampaignsPage extends StatefulWidget {
  const DripCampaignsPage({super.key});

  @override
  State<DripCampaignsPage> createState() => _DripCampaignsPageState();
}

class _DripCampaignsPageState extends State<DripCampaignsPage> {
  List<dynamic> _campaigns = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadCampaigns();
  }

  Future<void> _loadCampaigns() async {
    setState(() => _loading = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get('/drip-campaigns');
      final data = response.data;
      setState(() {
        _campaigns = data is List
            ? List<dynamic>.from(data)
            : List<dynamic>.from(data['data'] ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _campaigns = [];
        _loading = false;
      });
    }
  }

  Future<void> _deleteCampaign(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Delete Campaign',
            style: TextStyle(fontWeight: FontWeight.w700)),
        content: Text('Delete "$name"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.delete('/drip-campaigns/$id');
      _loadCampaigns();
      if (mounted) AppSnackbar.success(context, 'Campaign deleted');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Delete failed: $e');
    }
  }

  Future<void> _toggleCampaignStatus(Map<String, dynamic> c) async {
    final current = c['status'] ?? 'draft';
    final newStatus = current == 'active' ? 'paused' : 'active';
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.put('/drip-campaigns/${c['id']}', data: {'status': newStatus});
      _loadCampaigns();
      if (mounted)
        AppSnackbar.success(context,
            'Campaign ${newStatus == 'active' ? 'activated' : 'paused'}');
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed: $e');
    }
  }

  Color _getStatusColor(String status) {
    return switch (status) {
      'active' => AppColors.success,
      'paused' => const Color(0xFFF59E0B),
      'completed' => AppColors.brandGreenDark,
      _ => const Color(0xFF9CA3AF),
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              border: Border(bottom: BorderSide(color: theme.dividerColor)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  onPressed: _loadCampaigns,
                  icon: Icon(Icons.refresh_rounded,
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  tooltip: 'Refresh',
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: () => _showCreateDialog(),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('New Campaign'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _campaigns.isEmpty
                    ? _buildEmptyState(theme)
                    : _buildCampaignList(theme),
          ),
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
              color: AppColors.primary.withValues(alpha: 0.1),
            ),
            child: const Icon(
              Icons.water_drop_rounded,
              size: 52,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 24),
          Text('No drip campaigns yet',
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(
            'Automate time-sequenced messages to nurture your contacts',
            style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _showCreateDialog(),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Create First Campaign'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCampaignList(ThemeData theme) {
    return ListView.separated(
      padding: const EdgeInsets.all(24),
      itemCount: _campaigns.length,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (ctx, i) {
        final c = Map<String, dynamic>.from(_campaigns[i]);
        final name = c['name'] ?? 'Untitled';
        final status = c['status'] ?? 'draft';
        final steps = (c['steps'] as List?)?.length ?? 0;
        final enrolled = c['enrolledCount'] ?? 0;
        final completed = c['completedCount'] ?? 0;
        final statusColor = _getStatusColor(status);
        final isActive = status == 'active';

        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.dividerColor),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2))
            ],
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.water_drop_rounded,
                        color: AppColors.primary,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 15)),
                          const SizedBox(height: 4),
                          if (c['description'] != null &&
                              (c['description'] as String).isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text(c['description'],
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.5))),
                            ),
                          Row(
                            children: [
                              Icon(Icons.linear_scale_rounded,
                                  size: 13,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.4)),
                              const SizedBox(width: 4),
                              Text('$steps step${steps == 1 ? '' : 's'}',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.5))),
                              const SizedBox(width: 14),
                              Icon(Icons.people_rounded,
                                  size: 13,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.4)),
                              const SizedBox(width: 4),
                              Text('$enrolled enrolled',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.5))),
                              const SizedBox(width: 14),
                              Icon(Icons.check_circle_outline_rounded,
                                  size: 13,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.4)),
                              const SizedBox(width: 4),
                              Text('$completed completed',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.5))),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8)),
                      child: Text(status.toString().toUpperCase(),
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: statusColor)),
                    ),
                    const SizedBox(width: 8),
                    // Activate/pause toggle
                    if (status != 'completed')
                      Tooltip(
                        message:
                            isActive ? 'Pause campaign' : 'Activate campaign',
                        child: IconButton(
                          icon: Icon(
                            isActive
                                ? Icons.pause_circle_rounded
                                : Icons.play_circle_rounded,
                            color: isActive
                                ? const Color(0xFFF59E0B)
                                : const Color(0xFF42B72A),
                            size: 22,
                          ),
                          onPressed: () => _toggleCampaignStatus(c),
                        ),
                      ),
                    IconButton(
                      icon: const Icon(Icons.edit_rounded, size: 18),
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                      tooltip: 'Edit steps',
                      onPressed: () => _showStepEditor(c),
                    ),
                    IconButton(
                      icon: Icon(Icons.delete_outline_rounded,
                          size: 18, color: theme.colorScheme.error),
                      tooltip: 'Delete',
                      onPressed: () => _deleteCampaign(c['id'], name),
                    ),
                  ],
                ),
              ),

              // Steps preview
              if (steps > 0)
                Container(
                  decoration: BoxDecoration(
                    border: Border(top: BorderSide(color: theme.dividerColor)),
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
                  child: _buildStepsPreview(theme, c['steps'] as List? ?? []),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStepsPreview(ThemeData theme, List steps) {
    final showing = steps.length > 4 ? steps.sublist(0, 4) : steps;
    return Row(
      children: [
        ...showing.map((s) {
          final type = s['stepType']?.toString() ?? 'message';
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _stepBadge(theme, type, s['config']),
          );
        }),
        if (steps.length > 4)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
                color: theme.dividerColor,
                borderRadius: BorderRadius.circular(6)),
            child: Text('+${steps.length - 4} more',
                style: TextStyle(
                    fontSize: 11,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          ),
      ],
    );
  }

  Widget _stepBadge(ThemeData theme, String type, dynamic config) {
    final (icon, color, label) = switch (type) {
      'delay' => (
          Icons.timer_rounded,
          const Color(0xFFF59E0B),
          'Wait ${(config as Map?)?['delayMinutes'] ?? '?'}m'
        ),
      'message' => (Icons.chat_bubble_rounded, AppColors.primary, 'Message'),
      'template' => (
          Icons.view_module_rounded,
          const Color(0xFF8B5CF6),
          'Template'
        ),
      'tag' => (
          Icons.label_rounded,
          const Color(0xFF42B72A),
          '${(config as Map?)?['action'] == 'add' ? '+' : '-'}Tag'
        ),
      'condition' => (
          Icons.call_split_rounded,
          const Color(0xFF9CA3AF),
          'Condition'
        ),
      _ => (Icons.circle, const Color(0xFF9CA3AF), type),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }

  void _showCreateDialog() {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final theme = Theme.of(context);

    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          width: 460,
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.water_drop_rounded,
                      color: AppColors.primary,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                      child: Text('New Drip Campaign',
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 17))),
                  IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.close_rounded)),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Campaign Name',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 8),
              TextField(
                controller: nameCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'e.g., New User Onboarding',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 16),
              const Text('Description (optional)',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 8),
              TextField(
                controller: descCtrl,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: 'What is this campaign for?',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.info_outline_rounded,
                      color: AppColors.primary,
                      size: 16,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                        child: Text(
                            'You can add steps after creating the campaign.',
                            style: TextStyle(fontSize: 12))),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: () async {
                      if (nameCtrl.text.trim().isEmpty) return;
                      try {
                        final dio = di.sl<DioClient>().dio;
                        final res = await dio.post('/drip-campaigns', data: {
                          'name': nameCtrl.text.trim(),
                          'description': descCtrl.text.trim(),
                        });
                        Navigator.pop(ctx);
                        _loadCampaigns();
                        if (mounted) {
                          AppSnackbar.success(context, 'Campaign created');
                          // Open step editor
                          _showStepEditor(res.data);
                        }
                      } catch (e) {
                        if (mounted) AppSnackbar.error(context, 'Failed: $e');
                      }
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Create & Add Steps'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showStepEditor(Map<String, dynamic> campaign) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _StepEditorDialog(
        campaign: campaign,
        onChanged: _loadCampaigns,
      ),
    );
  }
}

// ============================================================
// Step Editor Dialog
// ============================================================
class _StepEditorDialog extends StatefulWidget {
  final Map<String, dynamic> campaign;
  final VoidCallback onChanged;

  const _StepEditorDialog({required this.campaign, required this.onChanged});

  @override
  State<_StepEditorDialog> createState() => _StepEditorDialogState();
}

class _StepEditorDialogState extends State<_StepEditorDialog> {
  late List<dynamic> _steps;
  bool _loadingSteps = false;

  @override
  void initState() {
    super.initState();
    _steps = List<dynamic>.from(widget.campaign['steps'] ?? []);
    if (_steps.isEmpty) _refreshSteps();
  }

  Future<void> _refreshSteps() async {
    setState(() => _loadingSteps = true);
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get('/drip-campaigns/${widget.campaign['id']}');
      setState(() {
        _steps = List<dynamic>.from(res.data['steps'] ?? []);
        _loadingSteps = false;
      });
    } catch (_) {
      setState(() => _loadingSteps = false);
    }
  }

  Future<void> _deleteStep(String stepId) async {
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.delete('/drip-campaigns/steps/$stepId');
      _refreshSteps();
      widget.onChanged();
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to delete step: $e');
    }
  }

  void _showAddStepDialog() {
    showDialog(
      context: context,
      builder: (ctx) => _AddStepDialog(
        campaignId: widget.campaign['id'],
        sortOrder: _steps.length,
        onAdded: () {
          _refreshSteps();
          widget.onChanged();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = widget.campaign['name'] ?? 'Campaign';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        width: 620,
        constraints: const BoxConstraints(maxHeight: 680),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 16, 18),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
                border: Border(bottom: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.water_drop_rounded,
                    color: AppColors.primary,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 16)),
                        const Text('Step Editor',
                            style: TextStyle(
                                fontSize: 12, color: Color(0xFF9CA3AF))),
                      ],
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: _showAddStepDialog,
                    icon: const Icon(Icons.add_rounded, size: 16),
                    label: const Text('Add Step'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: () {
                      Navigator.pop(context);
                      widget.onChanged();
                    },
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),

            // Steps list
            Flexible(
              child: _loadingSteps
                  ? const Center(child: CircularProgressIndicator())
                  : _steps.isEmpty
                      ? _buildEmptySteps(theme)
                      : ListView.builder(
                          padding: const EdgeInsets.all(20),
                          itemCount: _steps.length,
                          itemBuilder: (ctx, i) =>
                              _buildStepCard(theme, _steps[i], i),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptySteps(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.linear_scale_rounded,
              size: 40,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
          const SizedBox(height: 16),
          Text('No steps yet',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Add steps to define the message sequence.',
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _showAddStepDialog,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Add First Step'),
          ),
        ],
      ),
    );
  }

  Widget _buildStepCard(ThemeData theme, dynamic step, int index) {
    final type = step['stepType']?.toString() ?? 'message';
    final config = step['config'] as Map? ?? {};

    final (icon, color, title, subtitle) = switch (type) {
      'delay' => (
          Icons.timer_rounded,
          const Color(0xFFF59E0B),
          'Wait',
          '${config['delayMinutes'] ?? 60} minutes before next step'
        ),
      'message' => (
          Icons.chat_bubble_rounded,
          AppColors.primary,
          'Send Message',
          (config['content']?.toString() ?? 'No content').length > 60
              ? '${(config['content'] ?? '').toString().substring(0, 60)}...'
              : config['content']?.toString() ?? 'No content'
        ),
      'template' => (
          Icons.view_module_rounded,
          const Color(0xFF8B5CF6),
          'Send Template',
          config['templateName']?.toString() ?? 'No template selected'
        ),
      'tag' => (
          Icons.label_rounded,
          const Color(0xFF42B72A),
          '${config['action'] == 'add' ? 'Add' : 'Remove'} Tag',
          (config['tags'] as List?)?.join(', ') ?? 'No tags'
        ),
      'condition' => (
          Icons.call_split_rounded,
          const Color(0xFF9CA3AF),
          'Condition',
          config['field']?.toString() ?? 'No condition set'
        ),
      _ => (Icons.circle, const Color(0xFF9CA3AF), type, ''),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Step number + connector
          Column(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    shape: BoxShape.circle),
                child: Center(
                    child: Text('${index + 1}',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: color))),
              ),
              if (index < _steps.length - 1)
                Container(width: 2, height: 20, color: theme.dividerColor),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.dividerColor),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8)),
                    child: Icon(icon, size: 18, color: color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 13)),
                        const SizedBox(height: 2),
                        Text(subtitle,
                            style: TextStyle(
                                fontSize: 12,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5))),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.delete_outline_rounded,
                        size: 18, color: theme.colorScheme.error),
                    onPressed: () => _deleteStep(step['id']),
                    tooltip: 'Remove step',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// Add Step Dialog
// ============================================================
class _AddStepDialog extends StatefulWidget {
  final String campaignId;
  final int sortOrder;
  final VoidCallback onAdded;

  const _AddStepDialog(
      {required this.campaignId,
      required this.sortOrder,
      required this.onAdded});

  @override
  State<_AddStepDialog> createState() => _AddStepDialogState();
}

class _AddStepDialogState extends State<_AddStepDialog> {
  String _selectedType = 'message';
  bool _saving = false;

  // Message step
  final _messageCtrl = TextEditingController();
  // Delay step
  int _delayMinutes = 60;
  // Template step
  final _templateNameCtrl = TextEditingController();
  // Tag step
  final _tagCtrl = TextEditingController();
  String _tagAction = 'add';

  @override
  void dispose() {
    _messageCtrl.dispose();
    _templateNameCtrl.dispose();
    _tagCtrl.dispose();
    super.dispose();
  }

  Future<void> _addStep() async {
    setState(() => _saving = true);
    try {
      final dio = di.sl<DioClient>().dio;
      Map<String, dynamic> config = {};

      switch (_selectedType) {
        case 'message':
          if (_messageCtrl.text.trim().isEmpty) {
            AppSnackbar.error(context, 'Message content is required');
            setState(() => _saving = false);
            return;
          }
          config = {'content': _messageCtrl.text.trim()};
        case 'delay':
          config = {'delayMinutes': _delayMinutes};
        case 'template':
          if (_templateNameCtrl.text.trim().isEmpty) {
            AppSnackbar.error(context, 'Template name is required');
            setState(() => _saving = false);
            return;
          }
          config = {
            'templateName': _templateNameCtrl.text.trim(),
            'languageCode': 'en_US'
          };
        case 'tag':
          if (_tagCtrl.text.trim().isEmpty) {
            AppSnackbar.error(context, 'Tag is required');
            setState(() => _saving = false);
            return;
          }
          config = {
            'action': _tagAction,
            'tags': _tagCtrl.text
                .split(',')
                .map((t) => t.trim())
                .where((t) => t.isNotEmpty)
                .toList()
          };
      }

      await dio.post('/drip-campaigns/${widget.campaignId}/steps', data: {
        'stepType': _selectedType,
        'sortOrder': widget.sortOrder,
        'config': config,
      });

      if (mounted) Navigator.pop(context);
      widget.onAdded();
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to add step: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final types = [
      ('message', Icons.chat_bubble_rounded, 'Send Message', AppColors.primary),
      ('delay', Icons.timer_rounded, 'Wait / Delay', const Color(0xFFF59E0B)),
      (
        'template',
        Icons.view_module_rounded,
        'Send Template',
        const Color(0xFF8B5CF6)
      ),
      ('tag', Icons.label_rounded, 'Add/Remove Tag', const Color(0xFF42B72A)),
    ];

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: 480,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Add Step',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                const Spacer(),
                IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded)),
              ],
            ),
            const SizedBox(height: 16),

            // Type selector
            const Text('Step Type',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: types.map((t) {
                final (value, icon, label, color) = t;
                final selected = _selectedType == value;
                return GestureDetector(
                  onTap: () => setState(() => _selectedType = value),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected
                          ? color.withValues(alpha: 0.1)
                          : theme.colorScheme.surface,
                      border: Border.all(
                          color: selected ? color : theme.dividerColor,
                          width: selected ? 2 : 1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon,
                            size: 15,
                            color: selected
                                ? color
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5)),
                        const SizedBox(width: 6),
                        Text(label,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: selected ? color : null)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 20),
            // Config editor
            _buildConfigEditor(theme),

            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel')),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: _saving ? null : _addStep,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Add Step'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfigEditor(ThemeData theme) {
    return switch (_selectedType) {
      'message' => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Message Content',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _messageCtrl,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Enter the message to send...',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
      'delay' => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Wait Duration',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Slider(
                    value: _delayMinutes.toDouble(),
                    min: 1,
                    max: 10080, // 1 week
                    divisions: 100,
                    activeColor: const Color(0xFFF59E0B),
                    onChanged: (v) => setState(() => _delayMinutes = v.round()),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_formatDelay(_delayMinutes),
                      style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: Color(0xFFF59E0B),
                          fontSize: 13)),
                ),
              ],
            ),
            Row(
              children: [
                const SizedBox(width: 16),
                ...[30, 60, 1440, 10080].map((m) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ActionChip(
                        label: Text(_formatDelay(m),
                            style: const TextStyle(fontSize: 11)),
                        onPressed: () => setState(() => _delayMinutes = m),
                        padding: EdgeInsets.zero,
                      ),
                    )),
              ],
            ),
          ],
        ),
      'template' => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Template Name',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _templateNameCtrl,
              decoration: InputDecoration(
                hintText: 'e.g., welcome_message',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                prefixIcon: const Icon(Icons.view_module_rounded),
              ),
            ),
          ],
        ),
      'tag' => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tag Action',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _tagAction = 'add'),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _tagAction == 'add'
                            ? const Color(0xFF42B72A).withValues(alpha: 0.1)
                            : null,
                        border: Border.all(
                            color: _tagAction == 'add'
                                ? const Color(0xFF42B72A)
                                : theme.dividerColor,
                            width: _tagAction == 'add' ? 2 : 1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Column(
                        children: [
                          Icon(Icons.add_circle_rounded,
                              color: Color(0xFF42B72A)),
                          SizedBox(height: 4),
                          Text('Add Tag',
                              style: TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _tagAction = 'remove'),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _tagAction == 'remove'
                            ? AppColors.danger.withValues(alpha: 0.1)
                            : null,
                        border: Border.all(
                          color: _tagAction == 'remove'
                              ? AppColors.danger
                              : theme.dividerColor,
                          width: _tagAction == 'remove' ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Column(
                        children: [
                          Icon(
                            Icons.remove_circle_rounded,
                            color: AppColors.danger,
                          ),
                          SizedBox(height: 4),
                          Text('Remove Tag',
                              style: TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text('Tags (comma-separated)',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _tagCtrl,
              decoration: InputDecoration(
                hintText: 'e.g., interested, premium',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                prefixIcon: const Icon(Icons.label_rounded),
              ),
            ),
          ],
        ),
      _ => const SizedBox(),
    };
  }

  String _formatDelay(int minutes) {
    if (minutes < 60) return '${minutes}m';
    if (minutes < 1440) return '${(minutes / 60).round()}h';
    if (minutes < 10080) return '${(minutes / 1440).round()}d';
    return '${(minutes / 10080).round()}w';
  }
}
