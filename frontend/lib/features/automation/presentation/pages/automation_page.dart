// ============================================================
// Automation Dashboard - Screen 1 (Riverpod + Real API)
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/features/automation/presentation/providers/automation_providers.dart';
import 'package:simpulx/features/automation/presentation/widgets/edit_automation_dialog.dart';

class AutomationPage extends ConsumerStatefulWidget {
  const AutomationPage({super.key});

  @override
  ConsumerState<AutomationPage> createState() => _AutomationPageState();
}

class _AutomationPageState extends ConsumerState<AutomationPage> {
  int _currentPage = 0;
  static const _pageSize = 8;

  static const _triggers = {
    'new_conversation': 'New Conversation',
    'new_message': 'New Message Received',
    'conversation_idle': 'Conversation Idle',
    'keyword_match': 'Keyword Match',
    'contact_tag': 'Contact Tag Added',
    'office_hours': 'Office Hours',
    'after_hours': 'After Hours',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(dashboardProvider);
    final notifier = ref.read(dashboardProvider.notifier);
    final filtered = state.filtered;
    final channelsAsync = ref.watch(channelsProvider);
    final channelItems = <String, String>{'': 'All Channels'};
    channelsAsync.whenData((list) {
      for (final ch in list) {
        final id = (ch['id'] ?? '').toString();
        final name = (ch['name'] ?? '').toString();
        final phone = (ch['phoneNumber'] ?? '').toString();
        if (id.isNotEmpty) {
          channelItems[id] = phone.isNotEmpty ? '$name ($phone)' : name;
        }
      }
    });

    // Reset page if filters cause fewer items
    final totalPages = (filtered.length / _pageSize).ceil();
    if (_currentPage >= totalPages && totalPages > 0) {
      _currentPage = totalPages - 1;
    }

    return Container(
      color: theme.scaffoldBackgroundColor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context, theme, state, notifier, channelItems),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: state.loading
                  ? _buildLoading(theme)
                  : state.error != null
                      ? _buildError(theme, notifier, state.error!)
                      : filtered.isEmpty
                          ? _buildEmpty(context, theme, notifier, state)
                          : _buildGrid(context, theme, filtered, notifier, ref),
            ),
          ),
        ],
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────
  Widget _buildHeader(
    BuildContext ctx,
    ThemeData theme,
    DashboardState state,
    DashboardNotifier notifier,
    Map<String, String> channelItems,
  ) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 18, 28, 18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        children: [
          // Search field
          Expanded(
            child: SizedBox(
              height: 40,
              child: TextField(
                onChanged: notifier.setSearch,
                decoration: InputDecoration(
                  hintText: 'Search by name...',
                  hintStyle: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  prefixIcon: Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
                  ),
                  isDense: true,
                  filled: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    vertical: 10,
                    horizontal: 14,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Filter dropdowns
          _FilterChip(
            value: state.filterTrigger,
            items: const {'': 'All Triggers', ..._triggers},
            onChanged: notifier.setFilter,
          ),
          const SizedBox(width: 10),
          _FilterChip(
            value: channelItems.containsKey(state.filterChannel)
                ? state.filterChannel
                : '',
            items: channelItems,
            onChanged: notifier.setChannelFilter,
          ),
          const SizedBox(width: 10),
          IconButton(
            onPressed: notifier.load,
            icon: Icon(
              Icons.refresh_rounded,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
            ),
          ),
          const SizedBox(width: 8),
          _ActionButton(
            icon: Icons.add_rounded,
            label: 'New Automation',
            onTap: () => showEditAutomationDialog(ctx),
          ),
        ],
      ),
    );
  }

  // ── Grid ──────────────────────────────────────────────────
  Widget _buildGrid(
    BuildContext ctx,
    ThemeData theme,
    List<Map<String, dynamic>> rules,
    DashboardNotifier notifier,
    WidgetRef ref,
  ) {
    final channelsAsync = ref.watch(channelsProvider);
    final channelMap = <String, String>{};
    channelsAsync.whenData((list) {
      for (final ch in list) {
        final id = (ch['id'] ?? '').toString();
        final name = (ch['name'] ?? '').toString();
        final phone = (ch['phoneNumber'] ?? '').toString();
        if (id.isNotEmpty) {
          channelMap[id] = phone.isNotEmpty ? '${name}_$phone' : name;
        }
      }
    });

    final totalPages = (rules.length / _pageSize).ceil();
    final start = _currentPage * _pageSize;
    final end = (start + _pageSize).clamp(0, rules.length);
    final pageRules = rules.sublist(start, end);

    return Column(
      children: [
        Expanded(
          child: LayoutBuilder(
            builder: (_, constraints) {
              final cols = constraints.maxWidth >= 1000
                  ? 3
                  : (constraints.maxWidth >= 600 ? 2 : 1);
              final spacing = 16.0;
              final totalSpacing = spacing * (cols - 1) + 48;
              final cardWidth = (constraints.maxWidth - totalSpacing) / cols;

              // Group into rows for IntrinsicHeight
              final rows = <List<Map<String, dynamic>>>[];
              for (var i = 0; i < pageRules.length; i += cols) {
                rows.add(pageRules.sublist(
                    i, (i + cols).clamp(0, pageRules.length)));
              }

              return SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: rows.map((row) {
                    return Padding(
                      padding: EdgeInsets.only(
                          bottom: row == rows.last ? 0 : spacing),
                      child: IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (var j = 0; j < row.length; j++) ...[
                              if (j > 0) SizedBox(width: spacing),
                              SizedBox(
                                width: cardWidth,
                                child: _AutomationCard(
                                  rule: row[j],
                                  triggers: _triggers,
                                  channelMap: channelMap,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ),
        if (totalPages > 1)
          Container(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: theme.dividerColor)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Showing ${start + 1}–$end of ${rules.length}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
                Row(
                  children: [
                    IconButton(
                      onPressed: _currentPage > 0
                          ? () => setState(() => _currentPage--)
                          : null,
                      icon: const Icon(Icons.chevron_left_rounded),
                      iconSize: 22,
                      visualDensity: VisualDensity.compact,
                    ),
                    ...List.generate(totalPages, (i) {
                      final isActive = i == _currentPage;
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: Material(
                          color: isActive
                              ? theme.colorScheme.primary
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          child: InkWell(
                            onTap: () => setState(() => _currentPage = i),
                            borderRadius: BorderRadius.circular(6),
                            child: Container(
                              width: 32,
                              height: 32,
                              alignment: Alignment.center,
                              child: Text(
                                '${i + 1}',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: isActive
                                      ? Colors.white
                                      : theme.colorScheme.onSurface
                                          .withValues(alpha: 0.7),
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                    IconButton(
                      onPressed: _currentPage < totalPages - 1
                          ? () => setState(() => _currentPage++)
                          : null,
                      icon: const Icon(Icons.chevron_right_rounded),
                      iconSize: 22,
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }

  // ── Loading ───────────────────────────────────────────────
  Widget _buildLoading(ThemeData theme) {
    return Center(
      key: const ValueKey('automation_loading'),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(
            'Loading automations...',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.84),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  // ── Error ─────────────────────────────────────────────────
  Widget _buildError(
    ThemeData theme,
    DashboardNotifier notifier,
    String error,
  ) {
    return Center(
      key: const ValueKey('automation_error'),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 40,
            color: AppColors.danger,
          ),
          const SizedBox(height: 12),
          Text('Error loading automations', style: theme.textTheme.bodySmall),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Text(
              error,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
              ),
            ),
          ),
          TextButton(
            onPressed: notifier.load,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  // ── Empty ─────────────────────────────────────────────────
  Widget _buildEmpty(
    BuildContext ctx,
    ThemeData theme,
    DashboardNotifier notifier,
    DashboardState state,
  ) {
    final isFiltering = state.search.isNotEmpty ||
        state.filterTrigger.isNotEmpty ||
        state.filterChannel.isNotEmpty;
    return Center(
      key: const ValueKey('automation_empty'),
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
              Icons.auto_fix_high_rounded,
              size: 52,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            isFiltering ? 'No matching automations' : 'No automations yet',
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            isFiltering
                ? 'Try changing search text or filter values.'
                : 'Create your first automation to start routing messages',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.78),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 24),
          if (isFiltering)
            TextButton.icon(
              onPressed: () {
                notifier.setSearch('');
                notifier.setFilter('');
                notifier.setChannelFilter('');
              },
              icon: const Icon(Icons.filter_alt_off_rounded),
              label: const Text('Clear Filters'),
            )
          else
            _ActionButton(
              icon: Icons.add_rounded,
              label: 'New Automation',
              onTap: () => showEditAutomationDialog(ctx),
            ),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════
// Automation Card Widget
// ══════════════════════════════════════════════════════════
class _AutomationCard extends ConsumerWidget {
  final Map<String, dynamic> rule;
  final Map<String, String> triggers;
  final Map<String, String> channelMap;

  const _AutomationCard({
    required this.rule,
    required this.triggers,
    required this.channelMap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notifier = ref.read(dashboardProvider.notifier);
    final isActive = rule['isActive'] == true;
    final triggerType = rule['triggerType'] ?? 'unknown';
    final name = rule['name'] ?? 'Untitled';

    // Channel info from triggerConditions
    final conditions = rule['triggerConditions'] as Map<String, dynamic>? ?? {};
    final channelId = (conditions['channelId'] ?? '').toString();
    final channelName = channelId.isNotEmpty ? channelMap[channelId] : null;

    // Date formatting
    final dateFmt = DateFormat('MM/dd/yyyy, hh:mm:ss a');
    final createdAt = _parseDate(rule['createdAt']);
    final updatedAt = _parseDate(rule['updatedAt']);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          final encodedName = Uri.encodeComponent(name.toString());
          context.go('/automation/${rule['id']}/flow?name=$encodedName');
        },
        borderRadius: BorderRadius.circular(14),
        child: Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: theme.dividerColor.withValues(alpha: 0.6),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(22, 20, 20, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top row: brand mark + action buttons
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.account_tree_rounded,
                    size: 28,
                    color: isActive
                        ? AppColors.brandGreenDark
                        : theme.colorScheme.onSurface.withValues(alpha: 0.35),
                  ),
                  const Spacer(),
                  _cardAction(
                    context,
                    Icons.edit_rounded,
                    AppColors.brandGreenDark,
                    'Edit',
                    () => showEditAutomationDialog(context, rule: rule),
                  ),
                  _cardAction(
                    context,
                    isActive ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    isActive ? AppColors.brandGreenDark : AppColors.primary,
                    isActive ? 'Pause' : 'Resume',
                    () => notifier.toggleRule(rule['id'], isActive),
                  ),
                  _cardAction(
                    context,
                    Icons.delete_rounded,
                    AppColors.danger,
                    'Delete',
                    () => _confirmDelete(context, notifier, rule['id']),
                  ),
                  _cardAction(
                    context,
                    Icons.content_copy_rounded,
                    AppColors.brandGreenDark,
                    'Duplicate',
                    () => _confirmDuplicate(context, notifier, rule),
                  ),
                ],
              ),

              const SizedBox(height: 18),

              // Title
              Text(
                name,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: theme.colorScheme.onSurface,
                  height: 1.3,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),

              // Channel info
              if (channelName != null) ...[
                const SizedBox(height: 6),
                Text(
                  channelName,
                  style: TextStyle(
                    fontSize: 13,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w400,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              const SizedBox(height: 16),

              // Event trigger
              Text(
                'Event: ${triggers[triggerType] ?? triggerType.toString().replaceAll('_', ' ')}',
                style: TextStyle(
                  fontSize: 13,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.ellipsis,
              ),

              const Spacer(),

              // Dates
              const SizedBox(height: 16),
              if (createdAt != null)
                _dateRow(theme, 'Created At', dateFmt.format(createdAt)),
              if (updatedAt != null)
                _dateRow(theme, 'UpdatedAt', dateFmt.format(updatedAt)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cardAction(
    BuildContext context,
    IconData icon,
    Color color,
    String tooltip,
    VoidCallback onTap,
  ) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(6),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(6),
          hoverColor: color.withValues(alpha: 0.08),
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Icon(icon, size: 18, color: color),
          ),
        ),
      ),
    );
  }

  void _confirmDelete(
    BuildContext ctx,
    DashboardNotifier notifier,
    String id,
  ) {
    showDialog(
      context: ctx,
      builder: (c) => AlertDialog(
        title: const Text('Delete Automation'),
        content: const Text('Are you sure? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(c);
              notifier.deleteRule(id);
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _confirmDuplicate(
    BuildContext ctx,
    DashboardNotifier notifier,
    Map<String, dynamic> rule,
  ) {
    showDialog(
      context: ctx,
      builder: (c) => AlertDialog(
        title: const Text('Duplicate Automation'),
        content: Text('Create a copy of "${rule['name']}"?'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(c);
              notifier.duplicateRule(rule);
            },
            child: const Text('Duplicate'),
          ),
        ],
      ),
    );
  }

  static Widget _dateRow(ThemeData theme, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Text(
        '$label: $value',
        style: TextStyle(
          fontSize: 12,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
          fontWeight: FontWeight.w400,
        ),
      ),
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    return DateTime.tryParse(value.toString());
  }
}

// ── Reusable widgets ────────────────────────────────────

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FilledButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: theme.colorScheme.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String value;
  final Map<String, String> items;
  final ValueChanged<String> onChanged;

  const _FilterChip({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.5),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.9)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isDense: true,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.95),
            fontWeight: FontWeight.w600,
          ),
          items: items.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (v) => onChanged(v ?? ''),
        ),
      ),
    );
  }
}
