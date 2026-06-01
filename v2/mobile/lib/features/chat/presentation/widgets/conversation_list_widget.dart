import 'dart:async';

import 'package:simpulx/core/theme/app_theme.dart';
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

Color _stageHexToColor(String? hex) {
  final raw = (hex ?? '#3B82F6').replaceFirst('#', '');
  final value = int.tryParse(raw, radix: 16) ?? 0x3B82F6;
  return Color(0xFF000000 | value);
}

String _sourceChannelLabel(String code) =>
    src.prettySourceChannel(code, fallback: code);

Widget _statusTick(String? status, ThemeData theme) {
  switch (status) {
    case 'sent':
      return Icon(
        Icons.check_rounded,
        size: 14,
        color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
      );
    case 'delivered':
      return Icon(
        Icons.done_all_rounded,
        size: 14,
        color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
      );
    case 'read':
      return const Icon(
        Icons.done_all_rounded,
        size: 14,
        color: Color(0xFF0EA5E9),
      );
    case 'failed':
      return const Icon(
        Icons.error_outline_rounded,
        size: 14,
        color: Color(0xFFEF4444),
      );
    case 'pending':
    default:
      return Icon(
        Icons.access_time_rounded,
        size: 14,
        color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
      );
  }
}

class ConversationListWidget extends StatefulWidget {
  final Function(String)? onConversationSelected;
  final String? selectedId;
  final bool showFilterPanel;
  final VoidCallback onToggleFilterPanel;

  const ConversationListWidget({
    super.key,
    this.onConversationSelected,
    this.selectedId,
    this.showFilterPanel = false,
    required this.onToggleFilterPanel,
  });

  @override
  State<ConversationListWidget> createState() => _ConversationListWidgetState();
}

class _ConversationListWidgetState extends State<ConversationListWidget> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final cubit = context.read<ConversationCubit>();
      if (!cubit.state.isLoading && cubit.state.conversations.isEmpty) {
        cubit.loadConversations();
      }
      if (cubit.state.filterOptions.channels.isEmpty &&
          cubit.state.filterOptions.departments.isEmpty &&
          !cubit.state.isLoadingFilterOptions) {
        cubit.loadFilterOptions();
      }
    });
  }

  void _selectFilter(String? status) {
    context.read<ConversationCubit>().filterByStatus(status);
  }

  void _showFilterBottomSheet(
      BuildContext context, ConversationListState state) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => BlocProvider.value(
        value: context.read<ConversationCubit>(),
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.85,
          maxChildSize: 0.95,
          minChildSize: 0.4,
          builder: (ctx, scrollController) => _ConversationFilterPanel(
            state: state,
            onClose: () => Navigator.of(ctx).pop(),
            scrollController: scrollController,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final crmColors = theme.extension<CrmStatusColors>()!;

    return BlocBuilder<ConversationCubit, ConversationListState>(
      builder: (context, state) {
        final isMobile = MediaQuery.of(context).size.width < 768;

        // On mobile, never show inline panel - use bottom sheet instead
        return Row(
          children: [
            if (widget.showFilterPanel && !isMobile)
              SizedBox(
                width: 304,
                child: _ConversationFilterPanel(
                  state: state,
                  onClose: widget.onToggleFilterPanel,
                ),
              ),
            Expanded(
              child: Column(
                children: [
                  _ConversationHeader(
                    activeFilter: state.filterStatus,
                    visibleCount: state.conversations.length,
                    isLoading: state.isLoading,
                    showFilterPanel: widget.showFilterPanel && !isMobile,
                    crmColors: crmColors,
                    onFilterSelected: _selectFilter,
                    onToggleFilters: isMobile
                        ? () => _showFilterBottomSheet(context, state)
                        : widget.onToggleFilterPanel,
                  ),
                  Expanded(
                    child: DecoratedBox(
                      decoration:
                          BoxDecoration(color: theme.colorScheme.surface),
                      child: _ConversationListBody(
                        state: state,
                        selectedId: widget.selectedId,
                        onConversationSelected: widget.onConversationSelected,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ConversationHeader extends StatelessWidget {
  final String? activeFilter;
  final int visibleCount;
  final bool isLoading;
  final bool showFilterPanel;
  final CrmStatusColors crmColors;
  final ValueChanged<String?> onFilterSelected;
  final VoidCallback onToggleFilters;

  const _ConversationHeader({
    required this.activeFilter,
    required this.visibleCount,
    required this.isLoading,
    required this.showFilterPanel,
    required this.crmColors,
    required this.onFilterSelected,
    required this.onToggleFilters,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: theme.dividerColor.withValues(alpha: 0.8),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: Search + Filter button inline
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: TextField(
                    onChanged: (q) =>
                        context.read<ConversationCubit>().search(q),
                    style: theme.textTheme.bodyMedium,
                    decoration: InputDecoration(
                      hintText: 'Search conversations',
                      prefixIcon: Icon(
                        Icons.search_rounded,
                        size: 20,
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.48),
                      ),
                      filled: true,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Tooltip(
                message: showFilterPanel ? 'Close filters' : 'Open filters',
                child: InkWell(
                  onTap: onToggleFilters,
                  borderRadius: BorderRadius.circular(10),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: showFilterPanel
                          ? theme.colorScheme.primary.withValues(alpha: 0.14)
                          : theme.colorScheme.onSurface.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: showFilterPanel
                            ? theme.colorScheme.primary.withValues(alpha: 0.30)
                            : theme.dividerColor.withValues(alpha: 0.7),
                      ),
                    ),
                    child: Icon(
                      showFilterPanel
                          ? Icons.close_rounded
                          : Icons.tune_rounded,
                      color: showFilterPanel
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      size: 18,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Row 2: Status filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _StatusChip(
                  label: 'All',
                  isSelected: activeFilter == null,
                  color: theme.colorScheme.primary,
                  onTap: () => onFilterSelected(null),
                ),
                _StatusChip(
                  label: 'Open',
                  isSelected: activeFilter == 'open',
                  color: crmColors.open,
                  onTap: () => onFilterSelected('open'),
                ),
                _StatusChip(
                  label: 'Snoozed',
                  isSelected: activeFilter == 'pending',
                  color: crmColors.pending,
                  onTap: () => onFilterSelected('pending'),
                ),
                _StatusChip(
                  label: 'Closed',
                  isSelected: activeFilter == 'closed',
                  color: crmColors.closed,
                  onTap: () => onFilterSelected('closed'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationListBody extends StatelessWidget {
  final ConversationListState state;
  final String? selectedId;
  final Function(String)? onConversationSelected;

  const _ConversationListBody({
    required this.state,
    this.selectedId,
    this.onConversationSelected,
  });

  @override
  Widget build(BuildContext context) {
    if (state.isLoading && state.conversations.isEmpty) {
      return const _ConversationLoadingList();
    }

    if (state.error != null && state.conversations.isEmpty) {
      return _ListStateMessage(
        icon: Icons.wifi_off_rounded,
        title: 'Could not load conversations',
        message: state.error!,
        actionLabel: 'Retry',
        onAction: () => context.read<ConversationCubit>().loadConversations(),
      );
    }

    if (state.conversations.isEmpty) {
      return const _ListStateMessage(
        icon: Icons.mark_chat_unread_outlined,
        title: 'No conversations found',
        message:
            'Try clearing a filter or wait for incoming customer messages.',
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<ConversationCubit>().loadConversations(),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 16),
        itemCount: state.conversations.length,
        separatorBuilder: (_, __) => const SizedBox(height: 2),
        itemBuilder: (context, index) {
          final conv = state.conversations[index];
          return _ConversationTile(
            conversation: conv,
            isSelected: selectedId == conv.id,
            onTap: () => onConversationSelected?.call(conv.id),
          );
        },
      ),
    );
  }
}

class _ConversationFilterPanel extends StatefulWidget {
  final ConversationListState state;
  final VoidCallback onClose;
  final ScrollController? scrollController;

  const _ConversationFilterPanel({
    required this.state,
    required this.onClose,
    this.scrollController,
  });

  @override
  State<_ConversationFilterPanel> createState() =>
      _ConversationFilterPanelState();
}

class _ConversationFilterPanelState extends State<_ConversationFilterPanel> {
  late String _sortOrder;
  late bool _unassignedOnly;
  String? _agentId;
  String? _departmentId;
  String? _channelId;
  bool _lastByCustomer = false;
  bool _lastByBot = false;
  String? _tag;
  String? _stageId;
  String? _interestLevel;
  String? _sourceChannel;
  late TextEditingController _tagController;

  List<AgentEntity> _agents = const [];
  bool _loadingAgents = false;

  @override
  void initState() {
    super.initState();
    _syncFromState(widget.state);
    _tagController = TextEditingController(text: _tag ?? '');
    _loadAgents();
  }

  @override
  void didUpdateWidget(covariant _ConversationFilterPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reseed draft when an external reset clears filters (e.g. from header).
    final externalChange =
        widget.state.sortOrder != oldWidget.state.sortOrder ||
            widget.state.assignmentFilter != oldWidget.state.assignmentFilter ||
            widget.state.agentId != oldWidget.state.agentId ||
            widget.state.departmentId != oldWidget.state.departmentId ||
            widget.state.channelId != oldWidget.state.channelId ||
            widget.state.lastMessageBy != oldWidget.state.lastMessageBy ||
            widget.state.tag != oldWidget.state.tag ||
            widget.state.stageId != oldWidget.state.stageId ||
            widget.state.interestLevel != oldWidget.state.interestLevel ||
            widget.state.sourceChannel != oldWidget.state.sourceChannel;
    if (externalChange) {
      _syncFromState(widget.state);
      final tagText = _tag ?? '';
      if (_tagController.text != tagText) {
        _tagController.text = tagText;
        _tagController.selection =
            TextSelection.collapsed(offset: tagText.length);
      }
    }
  }

  @override
  void dispose() {
    _tagController.dispose();
    super.dispose();
  }

  void _syncFromState(ConversationListState state) {
    _sortOrder = state.sortOrder;
    _unassignedOnly = state.assignmentFilter == 'unassigned';
    _agentId = state.agentId;
    _departmentId = state.departmentId;
    _channelId = state.channelId;
    final mode = state.lastMessageBy;
    _lastByCustomer = mode == 'customer' || mode == 'customer_or_bot';
    _lastByBot = mode == 'bot' || mode == 'customer_or_bot';
    _tag = state.tag;
    _stageId = state.stageId;
    _interestLevel = state.interestLevel;
    _sourceChannel = state.sourceChannel;
  }

  Future<void> _loadAgents() async {
    if (_loadingAgents) return;
    setState(() => _loadingAgents = true);
    try {
      final agents =
          await context.read<ConversationCubit>().loadAssignableAgents();
      if (!mounted) return;
      setState(() => _agents = agents);
    } catch (_) {
      // Silent - dropdown will stay empty and hint the user.
    } finally {
      if (mounted) setState(() => _loadingAgents = false);
    }
  }

  String? get _lastMessageByValue {
    if (_lastByCustomer && _lastByBot) return 'customer_or_bot';
    if (_lastByCustomer) return 'customer';
    if (_lastByBot) return 'bot';
    return null;
  }

  void _applyFilters() {
    final cubit = context.read<ConversationCubit>();
    cubit.setConversationFilters(
      sort: _sortOrder,
      assignment: _unassignedOnly ? 'unassigned' : 'all',
      agentId: _unassignedOnly ? '' : (_agentId ?? ''),
      departmentId: _unassignedOnly ? '' : (_departmentId ?? ''),
      channelId: _channelId ?? '',
      lastMessageBy: _lastMessageByValue ?? '',
      tag: (_tag ?? '').trim().isEmpty ? '' : _tag,
      stageId: _stageId ?? '',
      interestLevel: _interestLevel ?? '',
      sourceChannel: _sourceChannel ?? '',
    );
    widget.onClose();
  }

  void _resetFilters() {
    context.read<ConversationCubit>().resetConversationFilters();
    setState(() {
      _sortOrder = 'latest';
      _unassignedOnly = false;
      _agentId = null;
      _departmentId = null;
      _channelId = null;
      _lastByCustomer = false;
      _lastByBot = false;
      _tag = null;
      _stageId = null;
      _interestLevel = null;
      _sourceChannel = null;
      _tagController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = widget.state;
    final channels = state.filterOptions.channels.isNotEmpty
        ? state.filterOptions.channels
        : _channelsFrom(state.conversations);
    final departments = state.filterOptions.departments.isNotEmpty
        ? state.filterOptions.departments
        : _departmentsFrom(state.conversations);
    final tagSuggestions = state.filterOptions.tags;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          right: BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 12, 14),
            child: Row(
              children: [
                Icon(
                  Icons.filter_alt_outlined,
                  size: 20,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'Filters',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              controller: widget.scrollController,
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 12),
              children: [
                _FilterSection(
                  title: 'Sort By',
                  child: Row(
                    children: [
                      Expanded(
                        child: _FilterPillButton(
                          label: 'Latest',
                          selected: _sortOrder == 'latest',
                          onTap: () => setState(() => _sortOrder = 'latest'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _FilterPillButton(
                          label: 'Oldest',
                          selected: _sortOrder == 'oldest',
                          onTap: () => setState(() => _sortOrder = 'oldest'),
                        ),
                      ),
                    ],
                  ),
                ),
                _FilterSection(
                  title: 'Tags',
                  child: _TagAutocompleteField(
                    controller: _tagController,
                    suggestions: tagSuggestions,
                    onChanged: (value) {
                      final trimmed = value.trim();
                      setState(() => _tag = trimmed.isEmpty ? null : trimmed);
                    },
                  ),
                ),
                _FilterSection(
                  title: 'Stage',
                  child: _FilterDropdown<String>(
                    hint: 'Any stage',
                    value: _stageId,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('Any stage'),
                      ),
                      ...state.filterOptions.stages.map(
                        (stage) => DropdownMenuItem<String>(
                          value: stage.id,
                          child: Row(
                            children: [
                              Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: _stageHexToColor(stage.color),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  stage.label,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) => setState(() => _stageId = value),
                  ),
                ),
                _FilterSection(
                  title: 'Interest Level',
                  child: _FilterDropdown<String>(
                    hint: 'Any level',
                    value: _interestLevel,
                    items: const [
                      DropdownMenuItem<String>(
                        value: null,
                        child: Text('Any level'),
                      ),
                      DropdownMenuItem<String>(
                        value: 'hot',
                        child: Text('🔥 Hot'),
                      ),
                      DropdownMenuItem<String>(
                        value: 'warm',
                        child: Text('🌤️ Warm'),
                      ),
                      DropdownMenuItem<String>(
                        value: 'cold',
                        child: Text('❄️ Cold'),
                      ),
                    ],
                    onChanged: (value) =>
                        setState(() => _interestLevel = value),
                  ),
                ),
                if (state.filterOptions.sourceChannels.isNotEmpty ||
                    _sourceChannel != null)
                  _FilterSection(
                    title: 'Source',
                    child: _FilterDropdown<String>(
                      hint: 'Any source',
                      value: _sourceChannel,
                      items: [
                        const DropdownMenuItem<String>(
                          value: null,
                          child: Text('Any source'),
                        ),
                        ...{
                          ...state.filterOptions.sourceChannels,
                          if (_sourceChannel != null) _sourceChannel!,
                        }.map(
                          (code) => DropdownMenuItem<String>(
                            value: code,
                            child: Text(_sourceChannelLabel(code)),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _sourceChannel = value),
                    ),
                  ),
                _FilterSection(
                  title: 'Assigned To',
                  child: _FilterDropdown<String>(
                    hint: _loadingAgents ? 'Loading agents…' : 'Any agent',
                    value: _agentId,
                    enabled: !_unassignedOnly,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('Any agent'),
                      ),
                      ..._agents.map(
                        (agent) => DropdownMenuItem<String>(
                          value: agent.id,
                          child: Text(
                            agent.fullName,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) => setState(() => _agentId = value),
                  ),
                ),
                _FilterSection(
                  title: 'Assign To Department',
                  child: _FilterDropdown<String>(
                    hint: 'Any department',
                    value: _departmentId,
                    enabled: !_unassignedOnly,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('Any department'),
                      ),
                      ...departments.map(
                        (department) => DropdownMenuItem<String>(
                          value: department.id,
                          child: Text(
                            department.label,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) => setState(() => _departmentId = value),
                  ),
                ),
                _FilterCheckbox(
                  label: 'Show only unassigned conversations',
                  value: _unassignedOnly,
                  onChanged: (v) => setState(() {
                    _unassignedOnly = v;
                    if (v) {
                      _agentId = null;
                      _departmentId = null;
                    }
                  }),
                ),
                const SizedBox(height: 10),
                _FilterSection(
                  title: 'Last Message By',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _FilterCheckbox(
                        label: 'Customer',
                        value: _lastByCustomer,
                        onChanged: (v) => setState(() => _lastByCustomer = v),
                      ),
                      _FilterCheckbox(
                        label: 'Bot',
                        value: _lastByBot,
                        onChanged: (v) => setState(() => _lastByBot = v),
                      ),
                    ],
                  ),
                ),
                _FilterSection(
                  title: 'Channels',
                  child: Column(
                    children: [
                      _ChannelTile(
                        label: 'All channels',
                        icon: Icons.public_rounded,
                        selected: _channelId == null,
                        onTap: () => setState(() => _channelId = null),
                      ),
                      ...channels.map(
                        (channel) => _ChannelTile(
                          label: channel.label,
                          icon: _iconForChannel(channel.label),
                          count: channel.count,
                          selected: _channelId == channel.id,
                          onTap: () => setState(() => _channelId = channel.id),
                        ),
                      ),
                    ],
                  ),
                ),
                if (state.isLoadingFilterOptions) ...[
                  const SizedBox(height: 4),
                  const _FilterHelperText(
                    icon: Icons.sync_rounded,
                    message: 'Loading filter lists',
                  ),
                ] else if (state.filterOptionsError != null) ...[
                  const SizedBox(height: 4),
                  _FilterHelperText(
                    icon: Icons.error_outline_rounded,
                    message: 'Could not load filter lists',
                    actionLabel: 'Retry',
                    onAction: () =>
                        context.read<ConversationCubit>().loadFilterOptions(),
                  ),
                ],
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              border: Border(
                top: BorderSide(
                  color: theme.dividerColor.withValues(alpha: 0.8),
                ),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _resetFilters,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 42),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text('Reset'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: _applyFilters,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 42),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text('Apply'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static List<ChatFilterOptionEntity> _channelsFrom(
    List<ConversationEntity> conversations,
  ) {
    final map = <String, ChatFilterOptionEntity>{};
    for (final conversation in conversations) {
      final id = conversation.whatsappChannelId;
      if (id == null || id.isEmpty) continue;
      final previous = map[id];
      map[id] = ChatFilterOptionEntity(
        id: id,
        label: conversation.displayChannel,
        count: (previous?.count ?? 0) + 1,
      );
    }
    return map.values.toList()..sort((a, b) => a.label.compareTo(b.label));
  }

  static List<ChatFilterOptionEntity> _departmentsFrom(
    List<ConversationEntity> conversations,
  ) {
    final map = <String, ChatFilterOptionEntity>{};
    for (final conversation in conversations) {
      final id = conversation.departmentId;
      final label = conversation.departmentName;
      if (id == null || id.isEmpty || label == null || label.isEmpty) {
        continue;
      }
      final previous = map[id];
      map[id] = ChatFilterOptionEntity(
        id: id,
        label: label,
        count: (previous?.count ?? 0) + 1,
      );
    }
    return map.values.toList()..sort((a, b) => a.label.compareTo(b.label));
  }

  static IconData _iconForChannel(String label) {
    final lower = label.toLowerCase();
    if (lower.contains('whatsapp') || lower.contains('wa')) {
      return Icons.chat_rounded;
    }
    if (lower.contains('instagram')) return Icons.camera_alt_rounded;
    if (lower.contains('facebook') || lower.contains('messenger')) {
      return Icons.facebook_rounded;
    }
    if (lower.contains('telegram')) return Icons.send_rounded;
    if (lower.contains('email')) return Icons.email_rounded;
    if (lower.contains('sms')) return Icons.sms_rounded;
    return Icons.forum_rounded;
  }
}

class _FilterPillButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterPillButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? primary.withValues(alpha: 0.12)
                : theme.colorScheme.onSurface.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? primary.withValues(alpha: 0.38)
                  : theme.dividerColor.withValues(alpha: 0.8),
            ),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: selected
                  ? primary
                  : theme.colorScheme.onSurface.withValues(alpha: 0.72),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterDropdown<T> extends StatelessWidget {
  final String hint;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final bool enabled;

  const _FilterDropdown({
    required this.hint,
    required this.value,
    required this.items,
    required this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DropdownButtonFormField<T>(
      initialValue: value,
      onChanged: enabled ? onChanged : null,
      isExpanded: true,
      icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 20),
      hint: Text(
        hint,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
        ),
      ),
      style: theme.textTheme.bodyMedium,
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: enabled
            ? theme.colorScheme.onSurface.withValues(alpha: 0.04)
            : theme.colorScheme.onSurface.withValues(alpha: 0.02),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide:
              BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide:
              BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide:
              BorderSide(color: theme.dividerColor.withValues(alpha: 0.5)),
        ),
      ),
      items: items,
    );
  }
}

class _FilterCheckbox extends StatelessWidget {
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _FilterCheckbox({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;

    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: value ? primary : Colors.transparent,
                borderRadius: BorderRadius.circular(5),
                border: Border.all(
                  color: value
                      ? primary
                      : theme.colorScheme.onSurface.withValues(alpha: 0.40),
                  width: value ? 1 : 1.4,
                ),
              ),
              child: value
                  ? const Icon(Icons.check_rounded,
                      size: 14, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                  fontWeight: value ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagAutocompleteField extends StatefulWidget {
  final TextEditingController controller;
  final List<String> suggestions;
  final ValueChanged<String> onChanged;

  const _TagAutocompleteField({
    required this.controller,
    required this.suggestions,
    required this.onChanged,
  });

  @override
  State<_TagAutocompleteField> createState() => _TagAutocompleteFieldState();
}

class _TagAutocompleteFieldState extends State<_TagAutocompleteField> {
  final FocusNode _focusNode = FocusNode();

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return RawAutocomplete<String>(
      textEditingController: widget.controller,
      focusNode: _focusNode,
      optionsBuilder: (value) {
        final query = value.text.trim().toLowerCase();
        if (widget.suggestions.isEmpty) {
          return const Iterable<String>.empty();
        }
        if (query.isEmpty) return widget.suggestions.take(12);
        return widget.suggestions
            .where((tag) => tag.toLowerCase().contains(query))
            .take(12);
      },
      onSelected: (value) {
        widget.controller.text = value;
        widget.controller.selection =
            TextSelection.collapsed(offset: widget.controller.text.length);
        widget.onChanged(value);
      },
      fieldViewBuilder: (context, textController, focusNode, onFieldSubmitted) {
        return TextField(
          controller: textController,
          focusNode: focusNode,
          onChanged: widget.onChanged,
          onSubmitted: (_) => onFieldSubmitted(),
          decoration: InputDecoration(
            hintText: 'Search tags',
            isDense: true,
            prefixIcon: Icon(
              Icons.local_offer_outlined,
              size: 18,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
            ),
            filled: true,
            fillColor: theme.colorScheme.onSurface.withValues(alpha: 0.04),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide:
                  BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide:
                  BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
            ),
          ),
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 6,
            borderRadius: BorderRadius.circular(8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220, maxWidth: 260),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: options.length,
                itemBuilder: (context, index) {
                  final option = options.elementAt(index);
                  return InkWell(
                    onTap: () => onSelected(option),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      child: Row(
                        children: [
                          Icon(
                            Icons.local_offer_rounded,
                            size: 14,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              option,
                              style: theme.textTheme.bodySmall,
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
          ),
        );
      },
    );
  }
}

class _ChannelTile extends StatelessWidget {
  final String label;
  final IconData icon;
  final int? count;
  final bool selected;
  final VoidCallback onTap;

  const _ChannelTile({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.count,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: selected
                  ? primary.withValues(alpha: 0.10)
                  : theme.colorScheme.onSurface.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: selected
                    ? primary.withValues(alpha: 0.32)
                    : theme.dividerColor.withValues(alpha: 0.7),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: (selected ? primary : const Color(0xFF18B76A))
                        .withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    icon,
                    size: 16,
                    color: selected ? primary : const Color(0xFF128C56),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.84),
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                ),
                if (count != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    '$count',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.48),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterSection extends StatelessWidget {
  final String title;
  final Widget child;

  const _FilterSection({
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.70),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _FilterHelperText extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _FilterHelperText({
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Icon(
          icon,
          size: 15,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            message,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.50),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (actionLabel != null && onAction != null)
          TextButton(
            onPressed: onAction,
            child: Text(actionLabel!),
          ),
      ],
    );
  }
}

class _ConversationTile extends StatefulWidget {
  final ConversationEntity conversation;
  final bool isSelected;
  final VoidCallback onTap;

  const _ConversationTile({
    required this.conversation,
    required this.isSelected,
    required this.onTap,
  });

  @override
  State<_ConversationTile> createState() => _ConversationTileState();
}

class _ConversationTileState extends State<_ConversationTile>
    with SingleTickerProviderStateMixin {
  Timer? _countdownTimer;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void didUpdateWidget(covariant _ConversationTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.conversation.lastMessageAt !=
        oldWidget.conversation.lastMessageAt) {
      _startCountdown();
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    final lastAt = widget.conversation.lastMessageAt;
    if (lastAt == null) return;
    _elapsed = DateTime.now().difference(lastAt);
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _elapsed = DateTime.now().difference(lastAt);
      });
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  String _formatElapsed(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    return '${h}h ${m}m ${s}s';
  }

  String _formatTimestamp(DateTime dt) {
    return AppDateTime.timeWithSeconds(dt);
  }

  /// Strip lightweight markdown/system-message formatting for list previews.
  String _stripMarkdown(String input) {
    var s = input;
    // Bold **text** or __text__ → text
    s = s.replaceAllMapped(RegExp(r'\*\*(.+?)\*\*'), (m) => m.group(1) ?? '');
    s = s.replaceAllMapped(RegExp(r'__(.+?)__'), (m) => m.group(1) ?? '');
    // Italic *text* or _text_ → text (simple)
    s = s.replaceAllMapped(
        RegExp(r'(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)'), (m) => m.group(1) ?? '');
    s = s.replaceAllMapped(
        RegExp(r'(?<!_)_(?!\s)([^_\n]+?)_(?!_)'), (m) => m.group(1) ?? '');
    // Inline code `text` → text
    s = s.replaceAllMapped(RegExp(r'`([^`]+)`'), (m) => m.group(1) ?? '');
    // Markdown link [label](url) → label
    s = s.replaceAllMapped(
        RegExp(r'\[([^\]]+)\]\([^)]+\)'), (m) => m.group(1) ?? '');
    // Strip leading @bot mention (system bot messages)
    s = s.replaceFirst(RegExp(r'^@bot\s+'), '');
    return s.trim();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final conversation = widget.conversation;
    final isSelected = widget.isSelected;
    final hasUnread = conversation.unreadCount > 0;
    final contactName = conversation.contact?.displayName ?? 'Unknown contact';
    final lastMsg = conversation.lastMessagePreview?.trim().isNotEmpty == true
        ? _stripMarkdown(conversation.lastMessagePreview!.trim())
        : 'No messages yet';

    // Determine if we show live countdown or static time
    final lastAt = conversation.lastMessageAt;
    final isToday =
        lastAt != null && DateTime.now().difference(lastAt).inHours < 24;

    final agentName = conversation.assignedAgent?.fullName;
    final deptName = conversation.departmentName;

    return Material(
      color: isSelected
          ? theme.colorScheme.primary.withValues(alpha: 0.08)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(10),
        hoverColor: theme.colorScheme.primary.withValues(alpha: 0.04),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Avatar with unread badge ──
              _ConversationAvatar(
                name: contactName,
                unreadCount: conversation.unreadCount,
                isSelected: isSelected,
              ),
              const SizedBox(width: 10),
              // ── Content ──
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Row 1: Name + time/countdown
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            contactName,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight:
                                  hasUnread ? FontWeight.w700 : FontWeight.w700,
                              fontSize: 14,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        // Time badge
                        if (lastAt != null)
                          isToday && conversation.status == 'open'
                              ? _LiveCountdownBadge(
                                  elapsed: _elapsed,
                                  text: _formatElapsed(_elapsed),
                                  isFromContact:
                                      conversation.lastMessageSenderType ==
                                          'contact',
                                )
                              : Text(
                                  _formatTimestamp(lastAt),
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.45),
                                    fontSize: 11,
                                  ),
                                ),
                        // Blinking red dot for unread
                        if (hasUnread && !isSelected) ...[
                          const SizedBox(width: 6),
                          const _BlinkingDot(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    // Row 2: Last message preview
                    Row(
                      children: [
                        if (conversation.lastMessageDirection ==
                            'outbound') ...[
                          _statusTick(
                            conversation.lastMessageStatus,
                            theme,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            lastMsg,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: hasUnread
                                  ? theme.colorScheme.onSurface
                                      .withValues(alpha: 0.7)
                                  : theme.colorScheme.onSurface
                                      .withValues(alpha: 0.45),
                              fontWeight:
                                  hasUnread ? FontWeight.w600 : FontWeight.w400,
                              fontSize: 12.5,
                            ),
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    // Row 3: Agent + Department + Source badges
                    Row(
                      children: [
                        if (conversation.sourceLabel != null)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: _SourceBadge(
                              label: conversation.sourceLabel!,
                              sourceChannel: conversation.sourceChannel!,
                            ),
                          ),
                        if (agentName != null && agentName.isNotEmpty)
                          Flexible(
                            child: _InfoBadge(
                              icon: Icons.person_rounded,
                              label: agentName,
                              color: theme.colorScheme.primary,
                            ),
                          ),
                        if (agentName != null &&
                            agentName.isNotEmpty &&
                            deptName != null &&
                            deptName.isNotEmpty)
                          const SizedBox(width: 6),
                        if (deptName != null && deptName.isNotEmpty)
                          Flexible(
                            child: _InfoBadge(
                              icon: Icons.business_rounded,
                              label: deptName,
                              color: const Color(0xFF7C4DFF),
                            ),
                          ),
                        if ((agentName == null || agentName.isEmpty) &&
                            (deptName == null || deptName.isEmpty))
                          _InfoBadge(
                            icon: Icons.person_off_rounded,
                            label: 'Unassigned',
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Live countdown badge ──
class _LiveCountdownBadge extends StatelessWidget {
  final Duration elapsed;
  final String text;
  final bool isFromContact;

  const _LiveCountdownBadge({
    required this.elapsed,
    required this.text,
    this.isFromContact = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isFromContact) ...[
            Icon(Icons.headset_mic_rounded, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              color: color,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Blinking red dot ──
class _BlinkingDot extends StatefulWidget {
  const _BlinkingDot();

  @override
  State<_BlinkingDot> createState() => _BlinkingDotState();
}

class _BlinkingDotState extends State<_BlinkingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _animation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, _) {
        return Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: const Color(0xFFE53935).withValues(alpha: _animation.value),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFE53935)
                    .withValues(alpha: 0.4 * _animation.value),
                blurRadius: 4,
                spreadRadius: 1,
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Source channel badge ──
class _SourceBadge extends StatelessWidget {
  final String label;
  final String sourceChannel;

  const _SourceBadge({
    required this.label,
    required this.sourceChannel,
  });

  Color get _color {
    switch (sourceChannel) {
      case 'META_ADS':
      case 'META_ORGANIC':
      case 'META_MESSENGER':
        return const Color(0xFF3B82F6); // Meta blue
      case 'TIKTOK_ADS':
        return const Color(0xFF010101); // TikTok black
      case 'GOOGLE_ADS':
        return const Color(0xFF4285F4); // Google blue
      case 'INSTAGRAM':
        return const Color(0xFFE1306C); // Instagram pink
      case 'PUBLISHER':
        return const Color(0xFF00897B); // Teal
      case 'LANDING_PAGE':
      case 'FORM':
        return const Color(0xFFFF6F00); // Amber
      default:
        return const Color(0xFF607D8B); // Grey
    }
  }

  IconData get _icon {
    switch (sourceChannel) {
      case 'META_ADS':
      case 'META_ORGANIC':
      case 'META_MESSENGER':
        return Icons.facebook_rounded;
      case 'TIKTOK_ADS':
        return Icons.music_note_rounded;
      case 'GOOGLE_ADS':
        return Icons.ads_click_rounded;
      case 'INSTAGRAM':
        return Icons.camera_alt_rounded;
      case 'PUBLISHER':
        return Icons.storefront_rounded;
      case 'LANDING_PAGE':
      case 'FORM':
        return Icons.language_rounded;
      default:
        return Icons.campaign_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.25), width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_icon, size: 10, color: color),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Info badge (agent/department pill) ──
class _InfoBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _InfoBadge({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationAvatar extends StatelessWidget {
  final String name;
  final int unreadCount;
  final bool isSelected;

  const _ConversationAvatar({
    required this.name,
    this.unreadCount = 0,
    this.isSelected = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final avatarColor = AvatarColors.getColor(name);
    final hasUnread = unreadCount > 0 && !isSelected;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: avatarColor.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            initial,
            style: TextStyle(
              color: avatarColor,
              fontWeight: FontWeight.w700,
              fontSize: 17,
            ),
          ),
        ),
        if (hasUnread)
          Positioned(
            left: -4,
            top: -4,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                shape: BoxShape.circle,
                border: Border.all(color: theme.colorScheme.surface, width: 2),
              ),
              alignment: Alignment.center,
              child: Text(
                unreadCount > 9 ? '9+' : '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        if (!hasUnread)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: const Color(0xFF18B76A),
                shape: BoxShape.circle,
                border: Border.all(color: theme.colorScheme.surface, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;

  const _StatusChip({
    required this.label,
    this.isSelected = false,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isSelected ? color : Colors.transparent,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isSelected ? color : color.withValues(alpha: 0.35),
                width: isSelected ? 1.2 : 1,
              ),
            ),
            child: Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(
                color: isSelected ? Colors.white : color,
                fontWeight: FontWeight.w600,
                fontSize: 12.5,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ConversationLoadingList extends StatelessWidget {
  const _ConversationLoadingList();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 16),
      itemBuilder: (context, index) => const _ConversationSkeletonTile(),
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemCount: 6,
    );
  }
}

class _ConversationSkeletonTile extends StatelessWidget {
  const _ConversationSkeletonTile();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.onSurface.withValues(alpha: 0.06);

    return Container(
      height: 88,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.7)),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FractionallySizedBox(
                  widthFactor: 0.68,
                  child: Container(
                    height: 12,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                FractionallySizedBox(
                  widthFactor: 0.92,
                  child: Container(
                    height: 10,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ListStateMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _ListStateMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 70,
              height: 70,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                icon,
                color: theme.colorScheme.primary.withValues(alpha: 0.55),
                size: 32,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                height: 1.45,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.44),
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 14),
              FilledButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
