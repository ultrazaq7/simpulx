import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/features/automation/data/models/automation_models.dart';
import 'package:simpulx/features/automation/presentation/providers/automation_providers.dart';
import 'package:simpulx/features/automation/presentation/pages/flow_web.dart'
    as flow_web;
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class FlowBuilderPage extends ConsumerStatefulWidget {
  final String ruleId;
  final String ruleName;

  const FlowBuilderPage({
    super.key,
    required this.ruleId,
    this.ruleName = 'Automation',
  });

  @override
  ConsumerState<FlowBuilderPage> createState() => _FlowBuilderPageState();
}

class _FlowBuilderPageState extends ConsumerState<FlowBuilderPage> {
  final _transformCtrl = TransformationController();
  var _showPalette = false;
  var _isActive = true;
  var _catalog = _AutomationCatalog.fallback(loading: true);
  String? _wireDragSourceId;
  String? _wireDragEdgeId;
  Offset? _wireDragPoint;
  final Set<String> _multiSelected = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(flowProvider.notifier).loadFlow(widget.ruleId, widget.ruleName);
      _loadCatalog();
      _loadActiveStatus();
    });
  }

  @override
  void dispose() {
    _transformCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    setState(() => _catalog = _catalog.copyWith(loading: true, error: null));
    try {
      final source = di.sl<SettingsRemoteDataSource>();
      final departments = await source.getDepartments();
      final users = await source.getUsers(status: 'active', limit: 100);
      if (!mounted) return;

      final departmentOptions = departments
          .where((item) => item.isActive)
          .map(
            (item) => _PickerOption(
              item.id,
              item.name,
              item.description?.trim().isNotEmpty == true
                  ? item.description!
                  : 'Department routing pool',
            ),
          )
          .toList();
      final agentOptions = users.users
          .map(
            (item) => _PickerOption(
              item.id,
              item.fullName,
              [
                item.role,
                item.department?.name,
                item.isOnline ? 'Online' : 'Offline',
              ]
                  .whereType<String>()
                  .where((part) => part.isNotEmpty)
                  .join(' - '),
            ),
          )
          .toList();

      setState(() {
        _catalog = _AutomationCatalog(
          departments: departmentOptions,
          agents: agentOptions,
          loading: false,
        );
      });

      // Load templates in background (non-blocking)
      _loadTemplates();
      _loadContactFields();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _catalog = _AutomationCatalog.fallback(
          loading: false,
          error: _cleanError(error),
        );
      });
    }
  }

  Future<void> _loadTemplates() async {
    try {
      final dio = di.sl<DioClient>().dio;
      // Get all channels
      final channelsResp = await dio.get(ApiConstants.channels);
      final channels = channelsResp.data as List? ?? [];
      final templateOptions = <_PickerOption>[];

      for (final ch in channels) {
        final channelId = ch['id']?.toString() ?? '';
        if (channelId.isEmpty) continue;
        try {
          final tplResp = await dio.get(ApiConstants.channelTemplates(channelId));
          final templates = tplResp.data as List? ?? [];
          for (final t in templates) {
            if (t['status'] != 'APPROVED') continue;
            final name = t['name']?.toString() ?? '';
            final lang = t['language']?.toString() ?? 'en';
            final category = t['category']?.toString() ?? '';
            templateOptions.add(_PickerOption(
              '${t['id']}|$name|$lang',
              name,
              '$category · $lang',
            ));
          }
        } catch (_) {}
      }

      if (!mounted) return;
      setState(() {
        _catalog = _catalog.copyWith(templates: templateOptions);
      });
    } catch (_) {}
  }

  Future<void> _loadContactFields() async {
    try {
      final dio = di.sl<DioClient>().dio;
      final resp = await dio.get('${ApiConstants.contacts}/fields');
      final data = resp.data as List? ?? [];

      // Built-in fields first
      final fields = <_PickerOption>[
        const _PickerOption('name', 'Name', 'Built-in'),
        const _PickerOption('email', 'Email', 'Built-in'),
        const _PickerOption('phone', 'Phone', 'Built-in'),
        const _PickerOption('notes', 'Notes', 'Built-in'),
      ];

      // Custom fields from API
      for (final f in data) {
        final key = f['fieldKey']?.toString() ?? '';
        final name = f['name']?.toString() ?? '';
        final ftype = f['fieldType']?.toString() ?? 'text';
        if (key.isNotEmpty) {
          fields.add(_PickerOption(key, name, 'Custom · $ftype'));
        }
      }

      if (!mounted) return;
      setState(() {
        _catalog = _catalog.copyWith(contactFields: fields);
      });
    } catch (_) {}
  }

  void _loadActiveStatus() {
    final rules = ref.read(dashboardProvider).rules;
    final rule = rules.where((r) => r['id'] == widget.ruleId).firstOrNull;
    if (rule != null && mounted) {
      setState(() => _isActive = rule['isActive'] == true);
    }
  }

  Future<void> _toggleActive(bool value) async {
    setState(() => _isActive = value);
    await ref
        .read(dashboardProvider.notifier)
        .toggleRule(widget.ruleId, !value);
  }

  void _addNode(NodeType type) {
    final flow = ref.read(flowProvider);
    final notifier = ref.read(flowProvider.notifier);
    final id = '${type.name}_${DateTime.now().microsecondsSinceEpoch}';

    notifier.addNode(
      NodeModel(
        id: id,
        type: type,
        position: _nextNodePosition(flow),
        config: _defaultConfig(type, _catalog),
      ),
    );
  }

  void _startWireDrag(
    String sourceNodeId,
    Offset scenePoint,
    FlowNotifier notifier,
  ) {
    setState(() {
      _wireDragSourceId = sourceNodeId;
      _wireDragEdgeId = null;
      _wireDragPoint = scenePoint;
    });
    notifier.startConnecting(sourceNodeId);
  }

  void _startEdgeRewire(
    EdgeModel edge,
    Offset scenePoint,
    FlowNotifier notifier,
  ) {
    setState(() {
      _wireDragSourceId = edge.sourceNodeId;
      _wireDragEdgeId = edge.id;
      _wireDragPoint = scenePoint;
    });
    notifier.startConnecting(edge.sourceNodeId);
  }

  void _updateWireDrag(Offset scenePoint) {
    if (_wireDragSourceId == null) return;
    setState(() => _wireDragPoint = scenePoint);
  }

  void _finishWireDrag(FlowState flow, FlowNotifier notifier) {
    final sourceId = _wireDragSourceId;
    final edgeId = _wireDragEdgeId;
    final point = _wireDragPoint;
    final target = sourceId == null || point == null
        ? null
        : _wireDropTarget(flow, sourceId, point);

    setState(() {
      _wireDragSourceId = null;
      _wireDragEdgeId = null;
      _wireDragPoint = null;
    });

    if (target == null) {
      notifier.cancelConnecting();
      return;
    }
    if (edgeId == null) {
      notifier.finishConnecting(target.id);
    } else {
      notifier.rewireEdge(edgeId, target.id);
    }
  }

  void _cancelWireDrag(FlowNotifier notifier) {
    if (_wireDragSourceId == null) return;
    setState(() {
      _wireDragSourceId = null;
      _wireDragEdgeId = null;
      _wireDragPoint = null;
    });
    notifier.cancelConnecting();
  }

  NodeModel? _wireDropTarget(
    FlowState flow,
    String sourceNodeId,
    Offset scenePoint,
  ) {
    for (final node in flow.nodes) {
      if (node.id == sourceNodeId) continue;
      final hitBox = Rect.fromLTWH(
        node.position.dx,
        node.position.dy,
        _FlowMetrics.nodeWidth,
        _FlowMetrics.nodeHeight,
      ).inflate(34);
      if (hitBox.contains(scenePoint)) return node;
    }
    return null;
  }

  Offset _nextNodePosition(FlowState flow) {
    // Place in center of current viewport
    final matrix = _transformCtrl.value.clone();
    final scale = matrix.getMaxScaleOnAxis().clamp(0.18, 2.25);
    final tx = matrix.entry(0, 3);
    final ty = matrix.entry(1, 3);
    // Estimate visible area center (assuming ~900x600 viewport)
    final centerX = (450 - tx) / scale;
    final centerY = (350 - ty) / scale;

    // Offset slightly from existing nodes at similar positions
    var pos = Offset(centerX - _FlowMetrics.nodeWidth / 2,
        centerY - _FlowMetrics.nodeHeight / 2);
    for (final node in flow.nodes) {
      if ((node.position - pos).distance < 50) {
        pos = pos + const Offset(40, 60);
      }
    }
    return pos;
  }

  void _exportFlow(FlowState flow) {
    final data = {
      'name': flow.ruleName,
      'nodes': flow.nodes.map((n) => n.toJson()).toList(),
      'edges': flow.edges.map((e) => e.toJson()).toList(),
    };
    final json = const JsonEncoder.withIndent('  ').convert(data);
    final safeName = flow.ruleName
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'_+$'), '');
    flow_web.exportFlowJson(json, '${safeName}_flow.json');
  }

  void _importFlow(FlowNotifier notifier) {
    flow_web.importFlowJson((content) {
      try {
        final data = jsonDecode(content) as Map<String, dynamic>;
        final rawNodes = data['nodes'] as List<dynamic>? ?? [];
        final rawEdges = data['edges'] as List<dynamic>? ?? [];
        final nodes = rawNodes
            .map((n) => NodeModel.fromJson(Map<String, dynamic>.from(n)))
            .toList();
        final edges = rawEdges
            .map((e) => EdgeModel.fromJson(Map<String, dynamic>.from(e)))
            .toList();
        notifier.importFlow(nodes, edges);
        if (mounted) {
          AppSnackbar.success(context,
              'Imported ${nodes.length} nodes and ${edges.length} links');
        }
      } catch (e) {
        if (mounted) {
          AppSnackbar.error(context, 'Invalid automation template file');
        }
      }
    });
  }

  void _fitToContent(FlowState flow) {
    if (flow.nodes.isEmpty) {
      _transformCtrl.value = Matrix4.identity();
      return;
    }

    var minX = flow.nodes.first.position.dx;
    var minY = flow.nodes.first.position.dy;
    var maxX = flow.nodes.first.position.dx + _FlowMetrics.nodeWidth;
    var maxY = flow.nodes.first.position.dy + _FlowMetrics.nodeHeight;
    for (final node in flow.nodes) {
      minX = math.min(minX, node.position.dx);
      minY = math.min(minY, node.position.dy);
      maxX = math.max(maxX, node.position.dx + _FlowMetrics.nodeWidth);
      maxY = math.max(maxY, node.position.dy + _FlowMetrics.nodeHeight);
    }

    final width = math.max(1.0, maxX - minX);
    final height = math.max(1.0, maxY - minY);
    final scale = (840 / math.max(width, height)).clamp(0.45, 1.05);
    _transformCtrl.value = Matrix4.identity()
      ..setEntry(0, 0, scale)
      ..setEntry(1, 1, scale)
      ..setTranslationRaw(96 - minX * scale, 126 - minY * scale, 0);
  }

  void _zoomBy(double factor) {
    final matrix = _transformCtrl.value.clone();
    final currentScale = matrix.getMaxScaleOnAxis();
    final nextScale = (currentScale * factor).clamp(0.18, 2.25);
    final ratio = nextScale / currentScale;

    matrix
      ..setEntry(0, 0, matrix.entry(0, 0) * ratio)
      ..setEntry(1, 1, matrix.entry(1, 1) * ratio)
      ..setEntry(2, 2, matrix.entry(2, 2) * ratio);
    _transformCtrl.value = matrix;
  }

  @override
  Widget build(BuildContext context) {
    final flow = ref.watch(flowProvider);
    final notifier = ref.read(flowProvider.notifier);
    final selectedNode = _nodeById(flow.nodes, flow.selectedNodeId);
    final ruleName = flow.ruleName.isEmpty ? widget.ruleName : flow.ruleName;

    return Focus(
      autofocus: true,
      onKeyEvent: (node, event) {
        if (event is! KeyDownEvent) return KeyEventResult.ignored;

        final isCtrl = HardwareKeyboard.instance.isControlPressed;
        final isShift = HardwareKeyboard.instance.isShiftPressed;

        if (event.logicalKey == LogicalKeyboardKey.escape) {
          if (flow.selectedNodeId != null) {
            notifier.selectNode(null);
          } else if (_showPalette) {
            setState(() => _showPalette = false);
          }
          return KeyEventResult.handled;
        }

        if (isCtrl && event.logicalKey == LogicalKeyboardKey.keyZ) {
          if (isShift) {
            if (flow.canRedo) notifier.redo();
          } else {
            if (flow.canUndo) notifier.undo();
          }
          return KeyEventResult.handled;
        }

        if (isCtrl && event.logicalKey == LogicalKeyboardKey.keyY) {
          if (flow.canRedo) notifier.redo();
          return KeyEventResult.handled;
        }

        // Delete key → bulk delete multi-selected or single selected
        if (event.logicalKey == LogicalKeyboardKey.delete ||
            event.logicalKey == LogicalKeyboardKey.backspace) {
          if (_multiSelected.isNotEmpty) {
            for (final id in _multiSelected.toList()) {
              notifier.removeNode(id);
            }
            setState(() => _multiSelected.clear());
            return KeyEventResult.handled;
          } else if (flow.selectedNodeId != null) {
            notifier.removeNode(flow.selectedNodeId!);
            return KeyEventResult.handled;
          }
        }

        return KeyEventResult.ignored;
      },
      child: Scaffold(
      backgroundColor: _builderBackground(Theme.of(context)),
      body: Column(
        children: [
          _BuilderToolbar(
            ruleName: ruleName,
            triggerLabel: _flowTriggerLabel(flow),
            dirty: flow.dirty,
            saving: flow.saving,
            nodeCount: flow.nodes.length,
            edgeCount: flow.edges.length,
            canUndo: flow.canUndo,
            canRedo: flow.canRedo,
            showPalette: _showPalette,
            onBack: () => context.go('/automation'),
            onSave: notifier.saveFlow,
            onUndo: notifier.undo,
            onRedo: notifier.redo,
            onClear: notifier.clearAll,
            onTogglePalette: () => setState(() => _showPalette = !_showPalette),
            onExport: () => _exportFlow(flow),
            onImport: () => _importFlow(notifier),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: flow.loading
                  ? const _FlowStateView(
                      key: ValueKey('flow_loading'),
                      icon: Icons.hourglass_top_rounded,
                      title: 'Loading automation builder',
                      subtitle: 'Opening the canvas and saved flow settings.',
                      isLoading: true,
                    )
                  : flow.error != null
                      ? _FlowStateView(
                          key: const ValueKey('flow_error'),
                          icon: Icons.error_outline_rounded,
                          title: 'Unable to open this automation',
                          subtitle: flow.error!,
                          actionLabel: 'Retry',
                          onAction: () => notifier.loadFlow(
                            widget.ruleId,
                            widget.ruleName,
                          ),
                        )
                      : LayoutBuilder(
                          key: const ValueKey('flow_canvas'),
                          builder: (context, constraints) {
                            final compact = constraints.maxWidth < 1120;
                            final paletteVisible = _showPalette && !compact;
                            final inspectorVisible =
                                selectedNode != null && !compact;

                            return Stack(
                              children: [
                                Row(
                                  children: [
                                    AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 180),
                                      width: paletteVisible ? 286 : 0,
                                      child: ClipRect(
                                        child: _NodePalette(
                                          onAdd: _addNode,
                                          catalog: _catalog,
                                          isActive: _isActive,
                                          onToggleActive: _toggleActive,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      child: Stack(
                                        children: [
                                          _FlowCanvas(
                                            transformCtrl: _transformCtrl,
                                            flow: flow,
                                            notifier: notifier,
                                            onCutEdge: notifier.removeEdge,
                                            wireDragSourceId: _wireDragSourceId,
                                            wireDragEdgeId: _wireDragEdgeId,
                                            wireDragPoint: _wireDragPoint,
                                            onWireDragStart:
                                                (nodeId, scenePoint) =>
                                                    _startWireDrag(
                                              nodeId,
                                              scenePoint,
                                              notifier,
                                            ),
                                            onEdgeRewireStart:
                                                (edge, scenePoint) =>
                                                    _startEdgeRewire(
                                              edge,
                                              scenePoint,
                                              notifier,
                                            ),
                                            onWireDragUpdate: _updateWireDrag,
                                            onWireDragEnd: () =>
                                                _finishWireDrag(
                                              flow,
                                              notifier,
                                            ),
                                            onWireDragCancel: () =>
                                                _cancelWireDrag(notifier),
                                            multiSelected: _multiSelected,
                                            onNodeTap: (nodeId, ctrlHeld) {
                                              if (ctrlHeld) {
                                                setState(() {
                                                  if (_multiSelected.contains(nodeId)) {
                                                    _multiSelected.remove(nodeId);
                                                  } else {
                                                    _multiSelected.add(nodeId);
                                                  }
                                                });
                                              } else {
                                                setState(() => _multiSelected.clear());
                                                notifier.selectNode(nodeId);
                                              }
                                            },
                                            onNodeDrag: (nodeId, delta) {
                                              if (_multiSelected.contains(nodeId)) {
                                                for (final id in _multiSelected) {
                                                  notifier.moveNode(id, delta);
                                                }
                                              } else {
                                                notifier.moveNode(nodeId, delta);
                                              }
                                            },
                                            onCanvasTap: () {
                                              if (_wireDragSourceId != null) {
                                                _cancelWireDrag(notifier);
                                              } else if (flow
                                                      .connectingFromId !=
                                                  null) {
                                                notifier.cancelConnecting();
                                              } else {
                                                setState(() => _multiSelected.clear());
                                                notifier.selectNode(null);
                                              }
                                            },
                                          ),
                                          Positioned(
                                            right: 18,
                                            bottom: 18,
                                            child: _CanvasControls(
                                              onFit: () => _fitToContent(flow),
                                              onZoomIn: () => _zoomBy(1.12),
                                              onZoomOut: () => _zoomBy(0.88),
                                            ),
                                          ),
                                          if (flow.connectingFromId != null)
                                            Positioned(
                                              left: 0,
                                              right: 0,
                                              bottom: 22,
                                              child: Center(
                                                child: _ConnectionBanner(
                                                  onCancel:
                                                      notifier.cancelConnecting,
                                                ),
                                              ),
                                            ),

                                        ],
                                      ),
                                    ),
                                    AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 180),
                                      width: inspectorVisible ? 408 : 0,
                                      child: ClipRect(
                                        child: _NodeInspector(
                                          node: selectedNode,
                                          notifier: notifier,
                                          catalog: _catalog,
                                          onClose: () =>
                                              notifier.selectNode(null),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (flow.nodes.isEmpty)
                                  Positioned.fill(
                                    child: _FlowStateView(
                                      icon: Icons.account_tree_rounded,
                                      title: 'Start with a trigger',
                                      subtitle:
                                          'Add a trigger or action to begin shaping this automation.',
                                      actionLabel: 'Add Trigger',
                                      onAction: () =>
                                          _addNode(NodeType.trigger),
                                    ),
                                  ),
                              ],
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    ),
    );
  }
}

class _BuilderToolbar extends StatelessWidget {
  final String ruleName;
  final String triggerLabel;
  final bool dirty;
  final bool saving;
  final int nodeCount;
  final int edgeCount;
  final bool canUndo;
  final bool canRedo;
  final bool showPalette;
  final VoidCallback onBack;
  final Future<void> Function() onSave;
  final VoidCallback onUndo;
  final VoidCallback onRedo;
  final VoidCallback onClear;
  final VoidCallback onTogglePalette;
  final VoidCallback onExport;
  final VoidCallback onImport;

  const _BuilderToolbar({
    required this.ruleName,
    required this.triggerLabel,
    required this.dirty,
    required this.saving,
    required this.nodeCount,
    required this.edgeCount,
    required this.canUndo,
    required this.canRedo,
    required this.showPalette,
    required this.onBack,
    required this.onSave,
    required this.onUndo,
    required this.onRedo,
    required this.onClear,
    required this.onTogglePalette,
    required this.onExport,
    required this.onImport,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textColor = theme.colorScheme.onSurface;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
      color: _builderBackground(theme),
      child: Material(
        color: theme.colorScheme.surface,
        elevation: 14,
        shadowColor: Colors.black.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border:
                Border.all(color: theme.dividerColor.withValues(alpha: 0.8)),
          ),
          child: Row(
            children: [
              TextButton.icon(
                onPressed: onBack,
                icon: const Icon(Icons.chevron_left_rounded, size: 21),
                label: const Text('Back'),
                style: TextButton.styleFrom(
                  foregroundColor: theme.colorScheme.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                ),
              ),
              Container(
                width: 1,
                height: 34,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                color: theme.dividerColor.withValues(alpha: 0.75),
              ),
              Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: const Color(0xFF25D366).withValues(alpha: 0.13),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              const Color(0xFF25D366).withValues(alpha: 0.25),
                        ),
                      ),
                      child: const Icon(
                        Icons.chat_rounded,
                        color: Color(0xFF25D366),
                        size: 21,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ruleName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: textColor,
                              fontWeight: FontWeight.w700,
                              height: 1.1,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  triggerLabel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: textColor.withValues(alpha: 0.58),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              _ToolbarStatusChip(
                                icon: dirty
                                    ? Icons.warning_amber_rounded
                                    : Icons.check_circle_rounded,
                                label:
                                    dirty ? 'Unsaved changes' : 'Saved draft',
                                color: dirty
                                    ? const Color(0xFFEF4444)
                                    : const Color(0xFF10B981),
                              ),
                              const SizedBox(width: 8),
                              _ToolbarStatusChip(
                                icon: Icons.account_tree_rounded,
                                label: '$nodeCount nodes',
                                color: const Color(0xFF3B82F6),
                              ),
                              const SizedBox(width: 8),
                              _ToolbarStatusChip(
                                icon: Icons.link_rounded,
                                label: '$edgeCount links',
                                color: const Color(0xFFF59E0B),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              _ToolbarIconButton(
                icon: showPalette
                    ? Icons.dashboard_customize_rounded
                    : Icons.dashboard_customize_outlined,
                tooltip: 'Node Library',
                onTap: onTogglePalette,
                selected: showPalette,
              ),
              _ToolbarIconButton(
                icon: Icons.file_download_outlined,
                tooltip: 'Export JSON',
                onTap: onExport,
              ),
              _ToolbarIconButton(
                icon: Icons.file_upload_outlined,
                tooltip: 'Import Template',
                onTap: onImport,
              ),
              _ToolbarIconButton(
                icon: Icons.undo_rounded,
                tooltip: 'Undo',
                onTap: canUndo ? onUndo : null,
              ),
              _ToolbarIconButton(
                icon: Icons.redo_rounded,
                tooltip: 'Redo',
                onTap: canRedo ? onRedo : null,
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: saving ? null : onSave,
                icon: saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.save_rounded, size: 18),
                label: Text(saving ? 'Saving' : 'Save'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 15,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolbarIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final bool selected;
  final bool danger;

  const _ToolbarIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.selected = false,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final disabled = onTap == null;
    final color = danger
        ? const Color(0xFFEF4444)
        : disabled
            ? theme.colorScheme.onSurface.withValues(alpha: 0.28)
            : selected
            ? Colors.white
            : theme.colorScheme.onSurface.withValues(alpha: 0.84);

    return Tooltip(
      message: tooltip,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Material(
          color: selected ? theme.colorScheme.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 42,
              height: 42,
              child: Icon(icon, color: color, size: 20),
            ),
          ),
        ),
      ),
    );
  }
}

class _ToolbarStatusChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _ToolbarStatusChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _NodePalette extends StatelessWidget {
  final ValueChanged<NodeType> onAdd;
  final _AutomationCatalog catalog;
  final bool isActive;
  final ValueChanged<bool> onToggleActive;

  const _NodePalette({
    required this.onAdd,
    required this.catalog,
    required this.isActive,
    required this.onToggleActive,
  });

  static const _groups = {
    'Trigger': [NodeType.trigger],
    'Logic': [NodeType.criteriaRouter],
    'Customer': [
      NodeType.addTag,
      NodeType.removeTag,
      NodeType.setContactAttribute,
      NodeType.assignAgent,
      NodeType.assignTeam,
    ],
    'Conversation': [
      NodeType.sendMessage,
      NodeType.interactiveMessage,
      NodeType.createConversation,
      NodeType.closeConversation,
    ],
    'Integration': [
      NodeType.googleSheets,
    ],
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(right: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Node Library',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Add steps to the canvas. Connect them manually with the node handles.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.58),
                    height: 1.35,
                  ),
                ),
                if (catalog.loading) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(minHeight: 2),
                ] else if (catalog.error != null) ...[
                  const SizedBox(height: 12),
                  const _CatalogNotice(message: 'Using saved fallback lists.'),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isActive
                    ? const Color(0xFF10B981).withValues(alpha: 0.08)
                    : const Color(0xFFEF4444).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isActive
                      ? const Color(0xFF10B981).withValues(alpha: 0.22)
                      : const Color(0xFFEF4444).withValues(alpha: 0.22),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isActive
                        ? Icons.play_circle_rounded
                        : Icons.pause_circle_rounded,
                    size: 20,
                    color: isActive
                        ? const Color(0xFF10B981)
                        : const Color(0xFFEF4444),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      isActive ? 'Active' : 'Paused',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: isActive
                            ? const Color(0xFF10B981)
                            : const Color(0xFFEF4444),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 28,
                    child: Switch(
                      value: isActive,
                      onChanged: onToggleActive,
                      activeColor: const Color(0xFF10B981),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
              children: _groups.entries.map((entry) {
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 7),
                        child: Text(
                          entry.key.toUpperCase(),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.45),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      ...entry.value.map(
                        (type) => _PaletteItem(
                          type: type,
                          onTap: () => onAdd(type),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaletteItem extends StatelessWidget {
  final NodeType type;
  final VoidCallback onTap;

  const _PaletteItem({required this.type, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _nodeColor(type);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border:
                  Border.all(color: theme.dividerColor.withValues(alpha: 0.9)),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: _NodeMark(type: type, color: color),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        NodeMeta.label(type),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.94),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _nodeDescription(type),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.48),
                          height: 1.18,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: color.withValues(alpha: 0.34),
                    ),
                  ),
                  child: Icon(
                    Icons.add_rounded,
                    color: _readableNodeColor(theme, color),
                    size: 16,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NodeMark extends StatelessWidget {
  final NodeType type;
  final Color color;

  const _NodeMark({required this.type, required this.color});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Icon(
      _nodeIcon(type),
      color: _readableNodeColor(theme, color),
      size: 18,
    );
  }
}

class _FlowStateView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool isLoading;

  const _FlowStateView({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Container(
        width: 520,
        padding: const EdgeInsets.all(26),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: theme.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 30,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: theme.colorScheme.primary, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
                height: 1.45,
              ),
            ),
            if (isLoading) ...[
              const SizedBox(height: 18),
              const CircularProgressIndicator(),
            ],
            if (!isLoading && onAction != null && actionLabel != null) ...[
              const SizedBox(height: 18),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class _CatalogNotice extends StatelessWidget {
  final String message;

  const _CatalogNotice({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: const Color(0xFFF59E0B).withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline_rounded,
            size: 16,
            color: Color(0xFFF59E0B),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.labelSmall?.copyWith(
                color: const Color(0xFFF59E0B),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowCanvas extends StatefulWidget {
  final TransformationController transformCtrl;
  final FlowState flow;
  final FlowNotifier notifier;
  final ValueChanged<String> onCutEdge;
  final String? wireDragSourceId;
  final String? wireDragEdgeId;
  final Offset? wireDragPoint;
  final void Function(String nodeId, Offset scenePoint) onWireDragStart;
  final void Function(EdgeModel edge, Offset scenePoint) onEdgeRewireStart;
  final ValueChanged<Offset> onWireDragUpdate;
  final VoidCallback onWireDragEnd;
  final VoidCallback onWireDragCancel;
  final VoidCallback onCanvasTap;
  final Set<String> multiSelected;
  final void Function(String nodeId, bool ctrlHeld) onNodeTap;
  final void Function(String nodeId, Offset delta) onNodeDrag;

  const _FlowCanvas({
    required this.transformCtrl,
    required this.flow,
    required this.notifier,
    required this.onCutEdge,
    required this.wireDragSourceId,
    required this.wireDragEdgeId,
    required this.wireDragPoint,
    required this.onWireDragStart,
    required this.onEdgeRewireStart,
    required this.onWireDragUpdate,
    required this.onWireDragEnd,
    required this.onWireDragCancel,
    required this.onCanvasTap,
    required this.multiSelected,
    required this.onNodeTap,
    required this.onNodeDrag,
  });

  static const double _canvasSize = 4600;

  @override
  State<_FlowCanvas> createState() => _FlowCanvasState();
}

class _FlowCanvasState extends State<_FlowCanvas> {
  final _viewportKey = GlobalKey();

  Offset _sceneFromGlobal(Offset globalPosition) {
    final context = _viewportKey.currentContext;
    if (context == null) return Offset.zero;
    final box = context.findRenderObject() as RenderBox;
    return widget.transformCtrl.toScene(box.globalToLocal(globalPosition));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: widget.onCanvasTap,
      child: Container(
        key: _viewportKey,
        color: _canvasBackground(theme),
        child: InteractiveViewer(
          transformationController: widget.transformCtrl,
          constrained: false,
          boundaryMargin: const EdgeInsets.all(2200),
          minScale: 0.18,
          maxScale: 2.25,
          child: SizedBox(
            width: _FlowCanvas._canvasSize,
            height: _FlowCanvas._canvasSize,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                    child: CustomPaint(painter: _GridPainter(theme))),
                Positioned.fill(
                  child: CustomPaint(
                    painter: _EdgePainter(
                      nodes: widget.flow.nodes,
                      edges: widget.flow.edges,
                      wireDragSourceId: widget.wireDragSourceId,
                      wireDragEdgeId: widget.wireDragEdgeId,
                      wireDragPoint: widget.wireDragPoint,
                    ),
                  ),
                ),
                ...widget.flow.nodes.map(
                  (node) => _FlowNode(
                    node: node,
                    selected: widget.flow.selectedNodeId == node.id,
                    multiSelected: widget.multiSelected.contains(node.id),
                    connecting: widget.flow.connectingFromId != null,
                    onTap: () {
                      if (widget.flow.connectingFromId != null) {
                        widget.notifier.finishConnecting(node.id);
                      } else {
                        final isCtrl = HardwareKeyboard.instance.isControlPressed;
                        widget.onNodeTap(node.id, isCtrl);
                      }
                    },
                    onDrag: (delta) {
                      final scale =
                        widget.transformCtrl.value.getMaxScaleOnAxis();
                      widget.onNodeDrag(node.id, delta / scale);
                    },
                    onDragStart: widget.notifier.beginNodeMove,
                    onDragEnd: widget.notifier.endNodeMove,
                    onDragCancel: widget.notifier.cancelNodeMove,
                    onConnect: () => widget.notifier.startConnecting(node.id),
                    onWireDragStart: (globalPosition) => widget.onWireDragStart(
                      node.id,
                      _sceneFromGlobal(globalPosition),
                    ),
                    onWireDragUpdate: (globalPosition) =>
                        widget.onWireDragUpdate(
                      _sceneFromGlobal(globalPosition),
                    ),
                    onWireDragEnd: widget.onWireDragEnd,
                    onWireDragCancel: widget.onWireDragCancel,
                    onDelete: () => widget.notifier.removeNode(node.id),
                    onDuplicate: () => widget.notifier.duplicateNode(node.id),
                  ),
                ),
                ...widget.flow.edges.map(
                  (edge) => _EdgeCutButton(
                    edge: edge,
                    nodes: widget.flow.nodes,
                    onCut: () => widget.onCutEdge(edge.id),
                    onDragStart: (globalPosition) => widget.onEdgeRewireStart(
                      edge,
                      _sceneFromGlobal(globalPosition),
                    ),
                    onDragUpdate: (globalPosition) => widget.onWireDragUpdate(
                      _sceneFromGlobal(globalPosition),
                    ),
                    onDragEnd: widget.onWireDragEnd,
                    onDragCancel: widget.onWireDragCancel,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  final ThemeData theme;

  _GridPainter(this.theme);

  @override
  void paint(Canvas canvas, Size size) {
    final minorPaint = Paint()
      ..color = theme.colorScheme.onSurface.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    final majorPaint = Paint()
      ..color = theme.colorScheme.primary.withValues(alpha: 0.07)
      ..strokeWidth = 1;
    const minor = 28.0;
    const major = minor * 4;

    for (var x = 0.0; x <= size.width; x += minor) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        x % major == 0 ? majorPaint : minorPaint,
      );
    }
    for (var y = 0.0; y <= size.height; y += minor) {
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        y % major == 0 ? majorPaint : minorPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) => false;
}

class _EdgePainter extends CustomPainter {
  final List<NodeModel> nodes;
  final List<EdgeModel> edges;
  final String? wireDragSourceId;
  final String? wireDragEdgeId;
  final Offset? wireDragPoint;

  _EdgePainter({
    required this.nodes,
    required this.edges,
    this.wireDragSourceId,
    this.wireDragEdgeId,
    this.wireDragPoint,
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (final edge in edges) {
      if (edge.id == wireDragEdgeId) continue;
      final source = _nodeById(nodes, edge.sourceNodeId);
      final target = _nodeById(nodes, edge.targetNodeId);
      if (source == null || target == null) continue;

      final from = _edgeOutputPoint(source);
      final to = _edgeInputPoint(target);
      final dx = (to.dx - from.dx).abs().clamp(90.0, 260.0);
      final color = _nodeColor(source.type);

      final path = Path()
        ..moveTo(from.dx, from.dy)
        ..cubicTo(
          from.dx + dx * 0.56,
          from.dy,
          to.dx - dx * 0.56,
          to.dy,
          to.dx,
          to.dy,
        );

      final paint = Paint()
        ..color = color.withValues(alpha: 0.72)
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      _drawDashedPath(canvas, path, paint);

      final arrowPaint = Paint()
        ..color = color
        ..style = PaintingStyle.fill;
      final arrow = Path()
        ..moveTo(to.dx, to.dy)
        ..lineTo(to.dx - 9, to.dy - 6)
        ..lineTo(to.dx - 9, to.dy + 6)
        ..close();
      canvas.drawPath(arrow, arrowPaint);
    }

    final dragSourceId = wireDragSourceId;
    final dragPoint = wireDragPoint;
    if (dragSourceId == null || dragPoint == null) return;

    final source = _nodeById(nodes, dragSourceId);
    if (source == null) return;

    final from = _edgeOutputPoint(source);
    final dx = (dragPoint.dx - from.dx).abs().clamp(80.0, 240.0);
    final color = _nodeColor(source.type);
    final previewPath = Path()
      ..moveTo(from.dx, from.dy)
      ..cubicTo(
        from.dx + dx * 0.56,
        from.dy,
        dragPoint.dx - dx * 0.42,
        dragPoint.dy,
        dragPoint.dx,
        dragPoint.dy,
      );

    final previewPaint = Paint()
      ..color = color.withValues(alpha: 0.9)
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    _drawDashedPath(canvas, previewPath, previewPaint);

    canvas.drawCircle(
      dragPoint,
      7,
      Paint()..color = color.withValues(alpha: 0.18),
    );
    canvas.drawCircle(
      dragPoint,
      3.5,
      Paint()..color = color,
    );
  }

  void _drawDashedPath(Canvas canvas, Path path, Paint paint) {
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final end = (distance + 8).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, end), paint);
        distance += 14;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _EdgePainter oldDelegate) => true;
}

class _EdgeCutButton extends StatelessWidget {
  final EdgeModel edge;
  final List<NodeModel> nodes;
  final VoidCallback onCut;
  final ValueChanged<Offset> onDragStart;
  final ValueChanged<Offset> onDragUpdate;
  final VoidCallback onDragEnd;
  final VoidCallback onDragCancel;

  const _EdgeCutButton({
    required this.edge,
    required this.nodes,
    required this.onCut,
    required this.onDragStart,
    required this.onDragUpdate,
    required this.onDragEnd,
    required this.onDragCancel,
  });

  @override
  Widget build(BuildContext context) {
    final source = _nodeById(nodes, edge.sourceNodeId);
    final target = _nodeById(nodes, edge.targetNodeId);
    if (source == null || target == null) return const SizedBox.shrink();

    final from = _edgeOutputPoint(source);
    final to = _edgeInputPoint(target);
    final midpoint = Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2);
    final theme = Theme.of(context);

    return Positioned(
      left: midpoint.dx - 18,
      top: midpoint.dy - 18,
      child: Tooltip(
        message: 'Drag to rewire, click to cut',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: (details) => onDragStart(details.globalPosition),
          onPanUpdate: (details) => onDragUpdate(details.globalPosition),
          onPanEnd: (_) => onDragEnd(),
          onPanCancel: onDragCancel,
          child: MouseRegion(
            cursor: SystemMouseCursors.grab,
            child: SizedBox(
              width: 36,
              height: 36,
              child: Center(
                child: Material(
                  color: theme.colorScheme.surface,
                  elevation: 8,
                  shadowColor: Colors.black.withValues(alpha: 0.18),
                  shape: const CircleBorder(),
                  child: InkWell(
                    onTap: onCut,
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color:
                              const Color(0xFFEF4444).withValues(alpha: 0.82),
                          width: 1.5,
                        ),
                      ),
                      child: const Icon(
                        Icons.close_rounded,
                        color: Color(0xFFEF4444),
                        size: 15,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FlowNode extends StatelessWidget {
  final NodeModel node;
  final bool selected;
  final bool multiSelected;
  final bool connecting;
  final VoidCallback onTap;
  final ValueChanged<Offset> onDrag;
  final VoidCallback onDragStart;
  final VoidCallback onDragEnd;
  final VoidCallback onDragCancel;
  final VoidCallback onConnect;
  final ValueChanged<Offset> onWireDragStart;
  final ValueChanged<Offset> onWireDragUpdate;
  final VoidCallback onWireDragEnd;
  final VoidCallback onWireDragCancel;
  final VoidCallback onDelete;
  final VoidCallback onDuplicate;

  const _FlowNode({
    required this.node,
    required this.selected,
    this.multiSelected = false,
    required this.connecting,
    required this.onTap,
    required this.onDrag,
    required this.onDragStart,
    required this.onDragEnd,
    required this.onDragCancel,
    required this.onConnect,
    required this.onWireDragStart,
    required this.onWireDragUpdate,
    required this.onWireDragEnd,
    required this.onWireDragCancel,
    required this.onDelete,
    required this.onDuplicate,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _nodeColor(node.type);
    final warnings = _nodeWarnings(node);

    return Positioned(
      left: node.position.dx,
      top: node.position.dy,
      child: MouseRegion(
        cursor: SystemMouseCursors.move,
        child: GestureDetector(
          onPanStart: (_) => onDragStart(),
          onPanUpdate: (details) => onDrag(details.delta),
          onPanEnd: (_) => onDragEnd(),
          onPanCancel: onDragCancel,
          onTap: onTap,
          onDoubleTap: onTap,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                width: _FlowMetrics.nodeWidth,
                height: _FlowMetrics.nodeHeight,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: selected
                        ? color
                        : multiSelected
                            ? color.withValues(alpha: 0.7)
                            : connecting
                                ? theme.colorScheme.primary.withValues(alpha: 0.45)
                                : theme.dividerColor.withValues(alpha: 0.95),
                    width: selected || multiSelected ? 2 : 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: selected || multiSelected
                          ? color.withValues(alpha: 0.2)
                          : Colors.black.withValues(alpha: 0.1),
                      blurRadius: selected || multiSelected ? 24 : 14,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.13),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: _NodeMark(type: node.type, color: color),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                NodeMeta.label(node.type),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w900,
                                  color: theme.colorScheme.onSurface,
                                  height: 1.1,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                NodeMeta.category(node.type),
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.46),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                        PopupMenuButton<String>(
                          tooltip: 'Node actions',
                          padding: EdgeInsets.zero,
                          icon: Icon(
                            Icons.more_vert_rounded,
                            size: 18,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.52),
                          ),
                          onSelected: (value) {
                            if (value == 'configure') onTap();
                            if (value == 'duplicate') onDuplicate();
                            if (value == 'delete') onDelete();
                          },
                          itemBuilder: (context) => [
                            const PopupMenuItem(
                              value: 'configure',
                              child: Text('Open settings'),
                            ),
                            const PopupMenuItem(
                              value: 'duplicate',
                              child: Text('Duplicate node'),
                            ),
                            const PopupMenuItem(
                              value: 'delete',
                              child: Text('Delete node'),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _configSummary(node),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.68),
                        height: 1.28,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        Expanded(
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: _nodeChips(node)
                                .take(2)
                                .map(
                                  (chip) => _MiniChip(
                                    label: chip.label,
                                    color: chip.color,
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                        if (warnings.isNotEmpty)
                          Tooltip(
                            message: warnings.first,
                            child: const Icon(
                              Icons.error_outline_rounded,
                              color: Color(0xFFEF4444),
                              size: 18,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                left: -11,
                top: _FlowMetrics.nodeHeight / 2 - 11,
                child: _NodePort(
                  color: connecting ? color : theme.colorScheme.surface,
                  borderColor: connecting ? color : theme.dividerColor,
                  icon: connecting ? Icons.chevron_left_rounded : null,
                ),
              ),
              Positioned(
                right: -11,
                top: _FlowMetrics.nodeHeight / 2 - 11,
                child: GestureDetector(
                  onTap: onConnect,
                  onPanStart: (details) =>
                      onWireDragStart(details.globalPosition),
                  onPanUpdate: (details) =>
                      onWireDragUpdate(details.globalPosition),
                  onPanEnd: (_) => onWireDragEnd(),
                  onPanCancel: onWireDragCancel,
                  child: MouseRegion(
                    cursor: SystemMouseCursors.grab,
                    child: _NodePort(
                      color: _readableNodeColor(theme, color),
                      borderColor: Colors.white,
                      icon: Icons.add_rounded,
                    ),
                  ),
                ),
              ),

            ],
          ),
        ),
      ),
    );
  }
}

class _NodePort extends StatelessWidget {
  final Color color;
  final Color borderColor;
  final IconData? icon;

  const _NodePort({
    required this.color,
    required this.borderColor,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: borderColor, width: 2),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.28), blurRadius: 10),
        ],
      ),
      child: icon == null
          ? null
          : Icon(icon, color: Colors.white, size: 13),
    );
  }
}

class _NodeInspector extends StatefulWidget {
  final NodeModel? node;
  final FlowNotifier notifier;
  final _AutomationCatalog catalog;
  final VoidCallback onClose;

  const _NodeInspector({
    required this.node,
    required this.notifier,
    required this.catalog,
    required this.onClose,
  });

  @override
  State<_NodeInspector> createState() => _NodeInspectorState();
}

class _NodeInspectorState extends State<_NodeInspector> {
  Map<String, dynamic> _config = {};
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    _hydrateFromNode();
  }

  @override
  void didUpdateWidget(covariant _NodeInspector oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.node?.id != widget.node?.id) {
      _hydrateFromNode();
    }
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  void _disposeControllers() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    _controllers.clear();
  }

  void _hydrateFromNode() {
    _disposeControllers();
    final node = widget.node;
    if (node == null) {
      _config = {};
      return;
    }
    _config = {
      ..._defaultConfig(node.type, widget.catalog),
      ...node.config,
    };
    _config['tags'] = _tagsFrom(_config['tags']);
    _config['keywords'] = _tagsFrom(_config['keywords']);
    _config['rules'] = _criteriaRulesFrom(_config['rules']);
  }

  TextEditingController _controller(String key) {
    return _controllers.putIfAbsent(
      key,
      () => TextEditingController(text: _stringValue(_config[key])),
    );
  }

  void _setValue(String key, dynamic value) {
    setState(() => _config[key] = value);
    _commit();
  }

  void _commit() {
    final node = widget.node;
    if (node == null) return;
    final clean = Map<String, dynamic>.from(_config);
    clean.removeWhere((key, value) {
      if (value == null) return true;
      if (value is String) return value.trim().isEmpty;
      if (value is List) return value.isEmpty;
      return false;
    });
    widget.notifier.updateNodeConfig(node.id, clean);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final node = widget.node;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(left: BorderSide(color: theme.dividerColor)),
      ),
      child: node == null
          ? _InspectorEmpty(onClose: widget.onClose)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _InspectorHeader(node: node, onClose: widget.onClose),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                    child: _buildEditor(node, theme),
                  ),
                ),
                _InspectorFooter(
                  node: node,
                  onDelete: () => widget.notifier.removeNode(node.id),
                ),
              ],
            ),
    );
  }

  Widget _buildEditor(NodeModel node, ThemeData theme) {
    switch (node.type) {
      case NodeType.trigger:
        return _triggerEditor(theme);
      case NodeType.criteriaRouter:
        return _criteriaEditor(theme);
      case NodeType.addTag:
      case NodeType.removeTag:
        return _tagEditor(theme, remove: node.type == NodeType.removeTag);
      case NodeType.assignAgent:
        return _assignTeamMemberEditor(theme);
      case NodeType.assignTeam:
        return _assignDepartmentEditor(theme);
      case NodeType.sendMessage:
        return _sendMessageEditor(theme);
      case NodeType.closeConversation:
        return _closeConversationEditor(theme);
      case NodeType.createConversation:
        return _createConversationEditor(theme);
      case NodeType.setContactAttribute:
        return _setContactAttributeEditor(theme);
      case NodeType.interactiveMessage:
        return _interactiveMessageEditor(theme);
      case NodeType.googleSheets:
        return _googleSheetsEditor(theme);
    }
  }

  Widget _triggerEditor(ThemeData theme) {
    return _InspectorSection(
      title: 'Trigger Node',
      description: 'Choose the event that starts this automation.',
      children: [
        _SearchSelect(
          label: 'Condition',
          value: _config['event']?.toString(),
          options: _triggerOptions,
          onChanged: (option) => _setValue('event', option.id),
        ),
        const SizedBox(height: 14),
        _TagEditor(
          label: 'Keywords',
          hint: 'Press Enter to add a keyword',
          tags: _tagsFrom(_config['keywords']),
          onChanged: (tags) => _setValue('keywords', tags),
        ),
        const SizedBox(height: 14),
        _textField(
          theme,
          label: 'Callback ID or regex',
          keyName: 'pattern',
          hint: 'Optional advanced match value',
        ),
        const SizedBox(height: 14),
        _SwitchRow(
          label: 'Run once for the same contact per day',
          value: _boolValue(_config['runOncePerDay']),
          onChanged: (value) => _setValue('runOncePerDay', value),
        ),
      ],
    );
  }

  Widget _criteriaEditor(ThemeData theme) {
    return _InspectorSection(
      title: 'Criteria Router',
      description:
          'Create flexible rule groups. Each rule can branch to a different next step.',
      children: [
        _CriteriaRulesEditor(
          rules: _criteriaRulesFrom(_config['rules']),
          attributes: _contactAttributeOptions,
          operators: _operatorOptions,
          onChanged: (rules) => _setValue('rules', rules),
        ),
      ],
    );
  }

  Widget _tagEditor(ThemeData theme, {required bool remove}) {
    return _InspectorSection(
      title: remove ? 'Remove Tags' : 'Add Tags',
      description: remove
          ? 'Tags listed here will be removed from matching contacts.'
          : 'Tags listed here will be attached to matching contacts.',
      children: [
        _TagEditor(
          label: 'Tags',
          hint: 'Press Enter to add the tag',
          tags: _tagsFrom(_config['tags']),
          onChanged: (tags) => _setValue('tags', tags),
        ),
      ],
    );
  }

  Widget _assignTeamMemberEditor(ThemeData theme) {
    final assignmentType = _config['assignmentType']?.toString();
    final needsDepartment = assignmentType == 'department_round_robin' ||
        assignmentType == 'push_department_queue' ||
        assignmentType == 'one_by_one_round_robin';
    final needsAgent = assignmentType == 'specific_member';

    return _InspectorSection(
      title: 'Assign To Team Member',
      description:
          'Choose who receives the chat and how fallback routing works.',
      children: [
        _SearchSelect(
          label: 'Assignment Type',
          value: assignmentType,
          options: _assignmentOptions,
          onChanged: (option) => _setValue('assignmentType', option.id),
        ),
        if (needsDepartment) ...[
          const SizedBox(height: 14),
          _SearchSelect(
            label: 'Department',
            value: _config['departmentId']?.toString(),
            options: widget.catalog.departments,
            onChanged: (option) {
              _setValue('departmentId', option.id);
              _setValue('departmentName', option.label);
            },
          ),
        ],
        if (needsAgent) ...[
          const SizedBox(height: 14),
          _SearchSelect(
            label: 'Team Member',
            value: _config['agentId']?.toString(),
            options: widget.catalog.agents,
            onChanged: (option) {
              _setValue('agentId', option.id);
              _setValue('agentName', option.label);
            },
          ),
        ],
        const SizedBox(height: 16),
        _SwitchRow(
          label: 'Force reassign even if already assigned',
          value: _boolValue(_config['forceReassign']),
          onChanged: (value) => _setValue('forceReassign', value),
        ),
        _SwitchRow(
          label: 'Push chat into department queue if agent is unavailable',
          value: _boolValue(_config['queueIfUnavailable']),
          onChanged: (value) => _setValue('queueIfUnavailable', value),
        ),
      ],
    );
  }

  Widget _assignDepartmentEditor(ThemeData theme) {
    return _InspectorSection(
      title: 'Assign To Department Queue',
      description: 'Place the conversation into a department queue.',
      children: [
        _SearchSelect(
          label: 'Department',
          value: _config['departmentId']?.toString(),
          options: widget.catalog.departments,
          onChanged: (option) {
            _setValue('departmentId', option.id);
            _setValue('departmentName', option.label);
          },
        ),
        const SizedBox(height: 14),
        _SwitchRow(
          label: 'Keep assigned owner if one exists',
          value: _boolValue(_config['keepOwner']),
          onChanged: (value) => _setValue('keepOwner', value),
        ),
      ],
    );
  }

  Widget _sendMessageEditor(ThemeData theme) {
    final isTemplate = _config['messageType']?.toString() == 'template';
    return _InspectorSection(
      title: 'Send Message',
      description: isTemplate
          ? 'Send an approved WhatsApp template to the contact.'
          : 'Send a text reply to the contact.',
      children: [
        _SearchSelect(
          label: 'Message Type',
          value: _config['messageType']?.toString(),
          options: _messageTypeOptions,
          onChanged: (option) {
            _setValue('messageType', option.id);
            if (option.id == 'template') {
              _setValue('message', '');
            } else {
              _setValue('templateId', '');
              _setValue('templateName', '');
              _setValue('languageCode', '');
            }
          },
        ),
        const SizedBox(height: 14),
        if (isTemplate)
          _SearchSelect(
            label: 'Template',
            value: _config['templateId']?.toString().isNotEmpty == true
                ? '${_config['templateId']}|${_config['templateName']}|${_config['languageCode']}'
                : null,
            options: widget.catalog.templates,
            onChanged: (option) {
              final parts = option.id.split('|');
              _setValue('templateId', parts[0]);
              _setValue('templateName', parts.length > 1 ? parts[1] : '');
              _setValue('languageCode', parts.length > 2 ? parts[2] : 'en');
            },
          )
        else
          _textField(
            theme,
            label: 'Message Text',
            keyName: 'message',
            hint: 'Example: Hi {{first_name}}, our team will help shortly.',
            maxLines: 5,
          ),
      ],
    );
  }

  Widget _closeConversationEditor(ThemeData theme) {
    return _InspectorSection(
      title: 'Close Conversation',
      description:
          'Resolve the conversation after all previous steps complete.',
      children: [
        _textField(
          theme,
          label: 'Resolution Note',
          keyName: 'note',
          hint: 'Optional note for the conversation timeline',
          maxLines: 4,
        ),
      ],
    );
  }

  Widget _createConversationEditor(ThemeData theme) {
    return _InspectorSection(
      title: 'New Conversation Thread',
      description:
          'Create a new conversation for the same contact and move the triggering message to it. Subsequent actions (like Assign) will apply to the new conversation.',
      children: const [],
    );
  }

  // ── Set Contact Attribute Editor ──────────────────────
  Widget _setContactAttributeEditor(ThemeData theme) {
    final fields = widget.catalog.contactFields;
    return _InspectorSection(
      title: 'Set Contact Attribute',
      description: 'Update a built-in or custom contact field.',
      children: [
        _SearchSelect(
          label: 'Field',
          value: _config['fieldKey']?.toString(),
          options: fields,
          onChanged: (option) {
            _setValue('fieldKey', option.id);
            _setValue('fieldLabel', option.label);
          },
        ),
        const SizedBox(height: 14),
        _textField(
          theme,
          label: 'Value',
          keyName: 'value',
          hint: 'New value for this field',
        ),
      ],
    );
  }

  // ── Interactive Message Editor ────────────────────────
  Widget _interactiveMessageEditor(ThemeData theme) {
    final iType = _config['interactiveType']?.toString() ?? 'button';
    return _InspectorSection(
      title: 'Interactive Message',
      description: 'Send WhatsApp buttons or list menus.',
      children: [
        _SearchSelect(
          label: 'Type',
          value: iType,
          options: const [
            _PickerOption('button', 'Buttons', 'Up to 3 quick reply buttons'),
            _PickerOption('list', 'List', 'Sections with selectable rows'),
          ],
          onChanged: (option) => _setValue('interactiveType', option.id),
        ),
        const SizedBox(height: 14),
        _textField(theme, label: 'Header (optional)', keyName: 'header', hint: 'Short header text'),
        const SizedBox(height: 14),
        _textField(theme, label: 'Body', keyName: 'body', hint: 'Message body text', maxLines: 3),
        const SizedBox(height: 14),
        _textField(theme, label: 'Footer (optional)', keyName: 'footer', hint: 'Small footer text'),
        const SizedBox(height: 18),
        if (iType == 'button') _interactiveButtonsBuilder(theme) else _interactiveListBuilder(theme),
      ],
    );
  }

  Widget _interactiveButtonsBuilder(ThemeData theme) {
    final buttons = (_config['buttons'] as List?)
            ?.map((b) => Map<String, dynamic>.from(b as Map))
            .toList() ??
        [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label: 'Buttons (max 3)'),
        const SizedBox(height: 7),
        ...buttons.asMap().entries.map((entry) {
          final i = entry.key;
          final btn = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: TextEditingController(text: btn['title']?.toString() ?? ''),
                    onChanged: (v) {
                      final updated = List<Map<String, dynamic>>.from(buttons);
                      updated[i] = {...updated[i], 'title': v, 'id': 'btn_${i + 1}'};
                      _setValue('buttons', updated);
                    },
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    decoration: _fieldDecoration(theme, 'Button ${i + 1} title (max 20 chars)'),
                    maxLength: 20,
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: buttons.length <= 1
                      ? null
                      : () {
                          final updated = List<Map<String, dynamic>>.from(buttons)..removeAt(i);
                          _setValue('buttons', updated);
                        },
                ),
              ],
            ),
          );
        }),
        if (buttons.length < 3)
          TextButton.icon(
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add Button'),
            onPressed: () {
              final updated = List<Map<String, dynamic>>.from(buttons)
                ..add({'id': 'btn_${buttons.length + 1}', 'title': ''});
              _setValue('buttons', updated);
            },
          ),
      ],
    );
  }

  Widget _interactiveListBuilder(ThemeData theme) {
    final sections = (_config['sections'] as List?)
            ?.map((s) => Map<String, dynamic>.from(s as Map))
            .toList() ??
        [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _textField(theme, label: 'Menu Button Label', keyName: 'buttonText', hint: 'e.g. Menu'),
        const SizedBox(height: 14),
        _FieldLabel(label: 'Sections'),
        const SizedBox(height: 7),
        ...sections.asMap().entries.map((secEntry) {
          final si = secEntry.key;
          final section = secEntry.value;
          final rows = (section['rows'] as List?)
                  ?.map((r) => Map<String, dynamic>.from(r as Map))
                  .toList() ??
              [];
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: TextEditingController(text: section['title']?.toString() ?? ''),
                        onChanged: (v) {
                          final updated = List<Map<String, dynamic>>.from(sections);
                          updated[si] = {...updated[si], 'title': v};
                          _setValue('sections', updated);
                        },
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                        decoration: _fieldDecoration(theme, 'Section title'),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, size: 18),
                      onPressed: sections.length <= 1
                          ? null
                          : () {
                              final updated = List<Map<String, dynamic>>.from(sections)..removeAt(si);
                              _setValue('sections', updated);
                            },
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...rows.asMap().entries.map((rowEntry) {
                  final ri = rowEntry.key;
                  final row = rowEntry.value;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6, left: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            children: [
                              TextField(
                                controller: TextEditingController(text: row['title']?.toString() ?? ''),
                                onChanged: (v) {
                                  final updatedRows = List<Map<String, dynamic>>.from(rows);
                                  updatedRows[ri] = {...updatedRows[ri], 'title': v, 'id': 'row_${si}_$ri'};
                                  final updatedSections = List<Map<String, dynamic>>.from(sections);
                                  updatedSections[si] = {...updatedSections[si], 'rows': updatedRows};
                                  _setValue('sections', updatedSections);
                                },
                                style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                                decoration: _fieldDecoration(theme, 'Row title (max 24)'),
                                maxLength: 24,
                              ),
                              const SizedBox(height: 4),
                              TextField(
                                controller: TextEditingController(text: row['description']?.toString() ?? ''),
                                onChanged: (v) {
                                  final updatedRows = List<Map<String, dynamic>>.from(rows);
                                  updatedRows[ri] = {...updatedRows[ri], 'description': v};
                                  final updatedSections = List<Map<String, dynamic>>.from(sections);
                                  updatedSections[si] = {...updatedSections[si], 'rows': updatedRows};
                                  _setValue('sections', updatedSections);
                                },
                                style: theme.textTheme.bodySmall,
                                decoration: _fieldDecoration(theme, 'Description (optional)'),
                                maxLength: 72,
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 16),
                          onPressed: rows.length <= 1
                              ? null
                              : () {
                                  final updatedRows = List<Map<String, dynamic>>.from(rows)..removeAt(ri);
                                  final updatedSections = List<Map<String, dynamic>>.from(sections);
                                  updatedSections[si] = {...updatedSections[si], 'rows': updatedRows};
                                  _setValue('sections', updatedSections);
                                },
                        ),
                      ],
                    ),
                  );
                }),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 14),
                  label: const Text('Add Row', style: TextStyle(fontSize: 12)),
                  onPressed: () {
                    final updatedRows = List<Map<String, dynamic>>.from(rows)
                      ..add({'id': 'row_${si}_${rows.length}', 'title': '', 'description': ''});
                    final updatedSections = List<Map<String, dynamic>>.from(sections);
                    updatedSections[si] = {...updatedSections[si], 'rows': updatedRows};
                    _setValue('sections', updatedSections);
                  },
                ),
              ],
            ),
          );
        }),
        TextButton.icon(
          icon: const Icon(Icons.add, size: 16),
          label: const Text('Add Section'),
          onPressed: () {
            final updated = List<Map<String, dynamic>>.from(sections)
              ..add({
                'title': 'Section ${sections.length + 1}',
                'rows': [
                  {'id': 'row_${sections.length}_0', 'title': '', 'description': ''}
                ],
              });
            _setValue('sections', updated);
          },
        ),
      ],
    );
  }

  // ── Google Sheets Editor ──────────────────────────────
  Widget _googleSheetsEditor(ThemeData theme) {
    final columns = (_config['columns'] as List?)
            ?.map((c) => Map<String, dynamic>.from(c as Map))
            .toList() ??
        [];
    final sourceOptions = [
      const _PickerOption('name', 'Contact Name', 'Built-in'),
      const _PickerOption('email', 'Contact Email', 'Built-in'),
      const _PickerOption('phone', 'Contact Phone', 'Built-in'),
      const _PickerOption('whatsappId', 'WhatsApp ID', 'Built-in'),
      const _PickerOption('tags', 'Tags', 'Built-in'),
      const _PickerOption('notes', 'Notes', 'Built-in'),
      const _PickerOption('firstSeenAt', 'First Seen', 'Built-in'),
      const _PickerOption('lastSeenAt', 'Last Seen', 'Built-in'),
      ...widget.catalog.contactFields
          .where((f) => !['name', 'email', 'phone', 'notes'].contains(f.id)),
    ];

    return _InspectorSection(
      title: 'Google Sheets',
      description: 'Append a row to a Google Sheets spreadsheet. Make sure the sheet is shared with the service account.',
      children: [
        _textField(theme, label: 'Spreadsheet ID', keyName: 'spreadsheetId', hint: 'From the spreadsheet URL'),
        const SizedBox(height: 14),
        _textField(theme, label: 'Sheet Name', keyName: 'sheetName', hint: 'e.g. Sheet1'),
        const SizedBox(height: 18),
        _FieldLabel(label: 'Columns (one per cell)'),
        const SizedBox(height: 7),
        ...columns.asMap().entries.map((entry) {
          final i = entry.key;
          final col = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  child: Text(
                    String.fromCharCode(65 + i),
                    style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  child: _SearchSelect(
                    label: '',
                    value: col['source']?.toString(),
                    options: sourceOptions,
                    onChanged: (option) {
                      final updated = List<Map<String, dynamic>>.from(columns);
                      updated[i] = {'source': option.id, 'value': ''};
                      _setValue('columns', updated);
                    },
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: columns.length <= 1
                      ? null
                      : () {
                          final updated = List<Map<String, dynamic>>.from(columns)..removeAt(i);
                          _setValue('columns', updated);
                        },
                ),
              ],
            ),
          );
        }),
        TextButton.icon(
          icon: const Icon(Icons.add, size: 16),
          label: const Text('Add Column'),
          onPressed: () {
            final updated = List<Map<String, dynamic>>.from(columns)
              ..add({'source': 'name', 'value': ''});
            _setValue('columns', updated);
          },
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFF0F9D58).withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF0F9D58).withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: const Color(0xFF0F9D58)),
                  const SizedBox(width: 8),
                  Text(
                    'Share the spreadsheet with:',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () {
                  Clipboard.setData(const ClipboardData(
                    text: 'colabsheetsbot@glassy-rush-469006-p4.iam.gserviceaccount.com',
                  ));
                  AppSnackbar.info(context, 'Copied to clipboard');
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: SelectableText(
                          'colabsheetsbot@glassy-rush-469006-p4.iam.gserviceaccount.com',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(Icons.copy_rounded, size: 14,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.45)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _textField(
    ThemeData theme, {
    required String label,
    required String keyName,
    String hint = '',
    int maxLines = 1,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label: label),
        const SizedBox(height: 7),
        TextField(
          controller: _controller(keyName),
          maxLines: maxLines,
          onChanged: (value) => _setValue(keyName, value),
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
          decoration: _fieldDecoration(theme, hint),
        ),
      ],
    );
  }
}

class _InspectorHeader extends StatelessWidget {
  final NodeModel node;
  final VoidCallback onClose;

  const _InspectorHeader({required this.node, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _nodeColor(node.type);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 12, 16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(8),
            ),
            child: _NodeMark(type: node.type, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  NodeMeta.label(node.type),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Node settings',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.52),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.close_rounded, size: 20),
            tooltip: 'Hide Settings',
          ),
        ],
      ),
    );
  }
}

class _InspectorFooter extends StatelessWidget {
  final NodeModel node;
  final VoidCallback? onDelete;

  const _InspectorFooter({required this.node, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.025),
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_done_rounded,
              size: 18, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Settings update the draft instantly.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.56),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (onDelete != null)
            TextButton.icon(
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline_rounded, size: 18),
              label: const Text('Delete'),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
              ),
            ),
        ],
      ),
    );
  }
}

class _InspectorEmpty extends StatelessWidget {
  final VoidCallback onClose;

  const _InspectorEmpty({required this.onClose});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 12, 16),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Node Settings',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded, size: 20),
              ),
            ],
          ),
        ),
        Divider(height: 1, color: theme.dividerColor),
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(30),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.touch_app_rounded,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Select a node',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Click any block on the canvas to edit detailed trigger, routing, tag, and assignment settings.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.58),
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _InspectorSection extends StatelessWidget {
  final String title;
  final String description;
  final List<Widget> children;

  const _InspectorSection({
    required this.title,
    required this.description,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          description,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.56),
            height: 1.42,
          ),
        ),
        const SizedBox(height: 18),
        ...children,
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;

  const _FieldLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Text(
      label,
      style: theme.textTheme.labelMedium?.copyWith(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _SearchSelect extends StatelessWidget {
  final String label;
  final String? value;
  final List<_PickerOption> options;
  final ValueChanged<_PickerOption> onChanged;

  const _SearchSelect({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selected = _optionById(options, value);
    final hasOptions = options.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label: label),
        const SizedBox(height: 7),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: hasOptions
                ? () async {
              final picked = await showDialog<_PickerOption>(
                context: context,
                builder: (_) => _OptionPickerDialog(
                  title: label,
                  options: options,
                  selectedId: value,
                ),
              );
              if (picked != null) onChanged(picked);
            }
                : null,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
              decoration: BoxDecoration(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.035),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: theme.dividerColor),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          selected?.label ??
                              (hasOptions
                                  ? 'Choose $label'
                                  : 'No $label options loaded'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: selected == null
                                ? theme.colorScheme.onSurface
                                    .withValues(alpha: hasOptions ? 0.42 : 0.34)
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                        if (selected?.description?.isNotEmpty == true) ...[
                          const SizedBox(height: 3),
                          Text(
                            selected!.description!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.48),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: theme.colorScheme.onSurface
                        .withValues(alpha: hasOptions ? 0.52 : 0.24),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _OptionPickerDialog extends StatefulWidget {
  final String title;
  final List<_PickerOption> options;
  final String? selectedId;

  const _OptionPickerDialog({
    required this.title,
    required this.options,
    required this.selectedId,
  });

  @override
  State<_OptionPickerDialog> createState() => _OptionPickerDialogState();
}

class _OptionPickerDialogState extends State<_OptionPickerDialog> {
  var _query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _query.trim().toLowerCase();
    final filtered = widget.options.where((option) {
      if (query.isEmpty) return true;
      return option.label.toLowerCase().contains(query) ||
          (option.description ?? '').toLowerCase().contains(query) ||
          option.id.toLowerCase().contains(query);
    }).toList();

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 640),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: TextField(
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                decoration: _fieldDecoration(
                  theme,
                  'Search by name or value',
                ).copyWith(
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                ),
              ),
            ),
            Divider(height: 1, color: theme.dividerColor),
            Expanded(
              child: filtered.isEmpty
                  ? Center(
                      child: Text(
                        'No matching options',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.52),
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (context, index) {
                        final option = filtered[index];
                        final selected = option.id == widget.selectedId;
                        return Material(
                          color: selected
                              ? theme.colorScheme.primary.withValues(alpha: 0.1)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                          child: InkWell(
                            onTap: () => Navigator.pop(context, option),
                            borderRadius: BorderRadius.circular(8),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 11,
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          option.label,
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        if (option.description?.isNotEmpty ==
                                            true) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            option.description!,
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                              color: theme.colorScheme.onSurface
                                                  .withValues(alpha: 0.54),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  if (selected)
                                    Icon(
                                      Icons.check_circle_rounded,
                                      color: theme.colorScheme.primary,
                                      size: 20,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagEditor extends StatefulWidget {
  final String label;
  final String hint;
  final List<String> tags;
  final ValueChanged<List<String>> onChanged;

  const _TagEditor({
    required this.label,
    required this.hint,
    required this.tags,
    required this.onChanged,
  });

  @override
  State<_TagEditor> createState() => _TagEditorState();
}

class _TagEditorState extends State<_TagEditor> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _addTag(String raw) {
    final parts = raw
        .split(',')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty);
    if (parts.isEmpty) return;

    final next = [...widget.tags];
    for (final part in parts) {
      if (!next.any((tag) => tag.toLowerCase() == part.toLowerCase())) {
        next.add(part);
      }
    }
    _controller.clear();
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label: widget.label),
        const SizedBox(height: 7),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.035),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.dividerColor),
          ),
          child: Wrap(
            spacing: 7,
            runSpacing: 7,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ...widget.tags.map(
                (tag) => InputChip(
                  label: Text(tag),
                  onDeleted: () {
                    widget.onChanged(
                      widget.tags.where((item) => item != tag).toList(),
                    );
                  },
                  deleteIcon: const Icon(Icons.close_rounded, size: 15),
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              SizedBox(
                width: math.max(160, widget.tags.isEmpty ? 260 : 190),
                child: TextField(
                  controller: _controller,
                  onSubmitted: _addTag,
                  decoration: InputDecoration.collapsed(
                    hintText: widget.hint,
                    hintStyle: theme.textTheme.bodySmall?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.38),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          widget.hint,
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _SwitchRow extends StatelessWidget {
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SwitchRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => onChanged(!value),
        borderRadius: BorderRadius.circular(8),
        child: Row(
          children: [
            Checkbox(
              value: value,
              onChanged: (checked) => onChanged(checked ?? false),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            Expanded(
              child: Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.84),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CriteriaRulesEditor extends StatelessWidget {
  final List<Map<String, dynamic>> rules;
  final List<_PickerOption> attributes;
  final List<_PickerOption> operators;
  final ValueChanged<List<Map<String, dynamic>>> onChanged;

  const _CriteriaRulesEditor({
    required this.rules,
    required this.attributes,
    required this.operators,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ...rules.asMap().entries.map(
              (entry) => _CriteriaRuleCard(
                index: entry.key,
                rule: entry.value,
                attributes: attributes,
                operators: operators,
                onRuleChanged: (rule) {
                  final next = _cloneRules(rules);
                  next[entry.key] = rule;
                  onChanged(next);
                },
                onDelete: rules.length == 1
                    ? null
                    : () {
                        final next = _cloneRules(rules)..removeAt(entry.key);
                        onChanged(next);
                      },
              ),
            ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () {
              final next = _cloneRules(rules)
                ..add(_newCriteriaRule(rules.length + 1));
              onChanged(next);
            },
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add Rule'),
          ),
        ),
      ],
    );
  }
}

class _CriteriaRuleCard extends StatelessWidget {
  final int index;
  final Map<String, dynamic> rule;
  final List<_PickerOption> attributes;
  final List<_PickerOption> operators;
  final ValueChanged<Map<String, dynamic>> onRuleChanged;
  final VoidCallback? onDelete;

  const _CriteriaRuleCard({
    required this.index,
    required this.rule,
    required this.attributes,
    required this.operators,
    required this.onRuleChanged,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final conditions = _conditionsFrom(rule['conditions']);
    final match = rule['match']?.toString() ?? 'all';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.026),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Rule ${index + 1}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: match,
                  borderRadius: BorderRadius.circular(8),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('Match all')),
                    DropdownMenuItem(value: 'any', child: Text('Match any')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    final next = Map<String, dynamic>.from(rule);
                    next['match'] = value;
                    onRuleChanged(next);
                  },
                ),
              ),
              if (onDelete != null)
                IconButton(
                  onPressed: onDelete,
                  icon: const Icon(Icons.close_rounded, size: 18),
                ),
            ],
          ),
          const SizedBox(height: 8),
          ...conditions.asMap().entries.map(
                (entry) => _ConditionRow(
                  index: entry.key,
                  condition: entry.value,
                  attributes: attributes,
                  operators: operators,
                  onChanged: (condition) {
                    final nextConditions = _cloneConditions(conditions);
                    nextConditions[entry.key] = condition;
                    final nextRule = Map<String, dynamic>.from(rule);
                    nextRule['conditions'] = nextConditions;
                    onRuleChanged(nextRule);
                  },
                  onDelete: conditions.length == 1
                      ? null
                      : () {
                          final nextConditions = _cloneConditions(conditions)
                            ..removeAt(entry.key);
                          final nextRule = Map<String, dynamic>.from(rule);
                          nextRule['conditions'] = nextConditions;
                          onRuleChanged(nextRule);
                        },
                ),
              ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () {
                final nextConditions = _cloneConditions(conditions)
                  ..add(_newCondition());
                final nextRule = Map<String, dynamic>.from(rule);
                nextRule['conditions'] = nextConditions;
                onRuleChanged(nextRule);
              },
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add Condition'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConditionRow extends StatelessWidget {
  final int index;
  final Map<String, dynamic> condition;
  final List<_PickerOption> attributes;
  final List<_PickerOption> operators;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final VoidCallback? onDelete;

  const _ConditionRow({
    required this.index,
    required this.condition,
    required this.attributes,
    required this.operators,
    required this.onChanged,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final operator = condition['operator']?.toString() ?? 'is_not_set';
    final needsValue = !_operatorsWithoutValue.contains(operator);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.8)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _SearchSelect(
                  label: 'Contact Attribute',
                  value: condition['attribute']?.toString(),
                  options: attributes,
                  onChanged: (option) {
                    final next = Map<String, dynamic>.from(condition);
                    next['attribute'] = option.id;
                    onChanged(next);
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SearchSelect(
                  label: 'Operator',
                  value: operator,
                  options: operators,
                  onChanged: (option) {
                    final next = Map<String, dynamic>.from(condition);
                    next['operator'] = option.id;
                    onChanged(next);
                  },
                ),
              ),
              if (onDelete != null) ...[
                const SizedBox(width: 6),
                IconButton(
                  onPressed: onDelete,
                  icon: const Icon(Icons.close_rounded, size: 18),
                ),
              ],
            ],
          ),
          if (needsValue) ...[
            const SizedBox(height: 10),
            TextFormField(
              key: ValueKey(
                '${condition['attribute']}_${condition['operator']}_$index',
              ),
              initialValue: condition['value']?.toString() ?? '',
              onChanged: (value) {
                final next = Map<String, dynamic>.from(condition);
                next['value'] = value;
                onChanged(next);
              },
              decoration: _fieldDecoration(theme, 'Comparison value'),
            ),
          ],
        ],
      ),
    );
  }
}

class _CanvasControls extends StatelessWidget {
  final VoidCallback onFit;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;

  const _CanvasControls({
    required this.onFit,
    required this.onZoomIn,
    required this.onZoomOut,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      elevation: 10,
      shadowColor: Colors.black.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: theme.dividerColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SmallIconButton(icon: Icons.remove_rounded, onTap: onZoomOut),
            _SmallIconButton(
              icon: Icons.center_focus_strong_rounded,
              onTap: onFit,
            ),
            _SmallIconButton(icon: Icons.add_rounded, onTap: onZoomIn),
          ],
        ),
      ),
    );
  }
}

class _SmallIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _SmallIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        width: 34,
        height: 34,
        child: Icon(icon, size: 18),
      ),
    );
  }
}

class _ConnectionBanner extends StatelessWidget {
  final VoidCallback onCancel;

  const _ConnectionBanner({required this.onCancel});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF3B82F6),
      elevation: 10,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.link_rounded, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            const Text(
              'Choose the next step',
              style: TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 12),
            InkWell(
              onTap: onCancel,
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.all(2),
                child: Icon(Icons.close_rounded, color: Colors.white, size: 18),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  final String label;
  final Color color;

  const _MiniChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _FlowMetrics {
  static const nodeWidth = 266.0;
  static const nodeHeight = 136.0;
}

class _AutomationCatalog {
  final List<_PickerOption> departments;
  final List<_PickerOption> agents;
  final List<_PickerOption> templates;
  final List<_PickerOption> contactFields;
  final bool loading;
  final String? error;

  const _AutomationCatalog({
    required this.departments,
    required this.agents,
    this.templates = const [],
    this.contactFields = const [],
    this.loading = false,
    this.error,
  });

  factory _AutomationCatalog.fallback({
    bool loading = false,
    String? error,
  }) {
    return _AutomationCatalog(
      departments: const [],
      agents: const [],
      templates: const [],
      contactFields: const [],
      loading: loading,
      error: error,
    );
  }

  _AutomationCatalog copyWith({
    List<_PickerOption>? departments,
    List<_PickerOption>? agents,
    List<_PickerOption>? templates,
    List<_PickerOption>? contactFields,
    bool? loading,
    String? error,
  }) {
    return _AutomationCatalog(
      departments: departments ?? this.departments,
      agents: agents ?? this.agents,
      templates: templates ?? this.templates,
      contactFields: contactFields ?? this.contactFields,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

class _PickerOption {
  final String id;
  final String label;
  final String? description;

  const _PickerOption(this.id, this.label, [this.description]);
}

class _ChipData {
  final String label;
  final Color color;

  const _ChipData(this.label, this.color);
}

const _triggerOptions = [
  _PickerOption(
    'message_text_exact_keywords',
    'Message text exactly matches any of keywords',
  ),
  _PickerOption(
    'message_text_includes_keywords',
    'Message text include any of keywords',
  ),
  _PickerOption(
    'individual_chat_received',
    'Message received in Individual Chat',
  ),
  _PickerOption(
    'message_text_excludes_keywords',
    'Message text exclude any of keywords',
  ),
  _PickerOption('button_callback_matches', 'List/Button Callback ID matches'),
  _PickerOption('outside_business_hours', 'Received outside business hours'),
  _PickerOption('inside_business_hours', 'Received Inside Business Hours'),
  _PickerOption('catalog_order_received', 'New Catalog Order Received'),
  _PickerOption(
    'first_message_or_after_24h',
    'Very first message or message after 24hrs of last message',
  ),
  _PickerOption('all_messages', 'All Messages / No Condition'),
  _PickerOption('custom_condition', 'Custom Condition'),
  _PickerOption('file_type_matches', 'File Type Matches'),
  _PickerOption('message_text_regex', 'Message Text regex Matches'),
  _PickerOption('message_type', 'Message Type'),
  _PickerOption('template_message', 'Template Message'),
];

const _contactAttributeOptions = [
  _PickerOption('assigned_to.name', 'assigned_to.name', 'Current owner'),
  _PickerOption('phone_number', 'phone_number', 'Contact phone number'),
  _PickerOption('full_name', 'full_name', 'Full name'),
  _PickerOption('first_name', 'first_name', 'First name'),
  _PickerOption('last_name', 'last_name', 'Last name'),
  _PickerOption('company', 'company', 'Company name'),
  _PickerOption('email', 'email', 'Email address'),
  _PickerOption('address', 'address', 'Street address'),
  _PickerOption('city', 'city', 'City'),
  _PickerOption('tags', 'tags', 'Contact tags'),
  _PickerOption('channel', 'channel', 'Conversation channel'),
  _PickerOption('last_message.text', 'last_message.text', 'Last message text'),
];

const _operatorOptions = [
  _PickerOption('is_not_set', 'Is Not Set'),
  _PickerOption('is_set', 'Is Set'),
  _PickerOption('is', 'Is'),
  _PickerOption('is_not', 'Is Not'),
  _PickerOption('contains', 'Contains'),
  _PickerOption('does_not_contain', 'Does Not Contain'),
  _PickerOption('starts_with', 'Starts With'),
  _PickerOption('ends_with', 'Ends With'),
  _PickerOption('matches_regex', 'Matches Regex'),
  _PickerOption('greater_than', 'Greater Than'),
  _PickerOption('less_than', 'Less Than'),
];

const _operatorsWithoutValue = {'is_not_set', 'is_set'};

const _assignmentOptions = [
  _PickerOption('specific_member', 'Assign to Specific Team Member'),
  _PickerOption(
    'department_round_robin',
    'Round Robin (Auto-assign by Department)',
  ),
  _PickerOption('push_department_queue', 'Push Chat Into Department Queue'),
];

const _messageTypeOptions = [
  _PickerOption('text', 'Text Message'),
  _PickerOption('template', 'Template Message'),
];

Map<String, dynamic> _defaultConfig(
  NodeType type,
  _AutomationCatalog catalog,
) {
  switch (type) {
    case NodeType.trigger:
      return {
        'event': 'all_messages',
        'keywords': [],
        'runOncePerDay': false,
      };
    case NodeType.criteriaRouter:
      return {
        'rules': [_newCriteriaRule(1)]
      };
    case NodeType.addTag:
      return {'tags': []};
    case NodeType.removeTag:
      return {'tags': []};
    case NodeType.assignAgent:
      return {
        'assignmentType': 'department_round_robin',
        'departmentId': '',
        'departmentName': '',
        'agentId': '',
        'agentName': '',
        'forceReassign': false,
        'queueIfUnavailable': false,
      };
    case NodeType.assignTeam:
      return {
        'departmentId': '',
        'departmentName': '',
        'keepOwner': false,
      };
    case NodeType.sendMessage:
      return {
        'messageType': 'text',
        'message': '',
        'templateId': '',
        'templateName': '',
        'languageCode': '',
      };
    case NodeType.closeConversation:
      return {'note': ''};
    case NodeType.createConversation:
      return <String, dynamic>{};
    case NodeType.setContactAttribute:
      return {
        'fieldKey': '',
        'fieldLabel': '',
        'value': '',
      };
    case NodeType.interactiveMessage:
      return {
        'interactiveType': 'button',
        'body': '',
        'header': '',
        'footer': '',
        'buttons': [
          {'id': 'btn_1', 'title': ''},
        ],
        'buttonText': 'Menu',
        'sections': [
          {
            'title': 'Section 1',
            'rows': [
              {'id': 'row_1', 'title': '', 'description': ''}
            ],
          }
        ],
      };
    case NodeType.googleSheets:
      return {
        'spreadsheetId': '',
        'sheetName': 'Sheet1',
        'columns': [
          {'source': 'name', 'value': ''},
        ],
      };
  }
}

Map<String, dynamic> _newCriteriaRule(int index) {
  return {
    'id': 'rule_$index',
    'match': 'all',
    'conditions': [_newCondition()],
  };
}

Map<String, dynamic> _newCondition() {
  return {
    'attribute': 'assigned_to.name',
    'operator': 'is_not_set',
    'value': '',
  };
}

List<Map<String, dynamic>> _criteriaRulesFrom(dynamic value) {
  if (value is List) {
    final rules = value
        .whereType<Map>()
        .map((rule) => Map<String, dynamic>.from(rule))
        .toList();
    if (rules.isNotEmpty) {
      return rules.map((rule) {
        final next = Map<String, dynamic>.from(rule);
        next['conditions'] = _conditionsFrom(next['conditions']);
        next['match'] = next['match']?.toString() == 'any' ? 'any' : 'all';
        return next;
      }).toList();
    }
  }
  return [_newCriteriaRule(1)];
}

List<Map<String, dynamic>> _conditionsFrom(dynamic value) {
  if (value is List) {
    final conditions = value
        .whereType<Map>()
        .map((condition) => Map<String, dynamic>.from(condition))
        .toList();
    return conditions.isEmpty ? [_newCondition()] : conditions;
  }
  return [_newCondition()];
}

List<Map<String, dynamic>> _cloneRules(List<Map<String, dynamic>> rules) {
  return rules.map((rule) {
    final next = Map<String, dynamic>.from(rule);
    next['conditions'] = _cloneConditions(_conditionsFrom(next['conditions']));
    return next;
  }).toList();
}

List<Map<String, dynamic>> _cloneConditions(
  List<Map<String, dynamic>> conditions,
) {
  return conditions
      .map((condition) => Map<String, dynamic>.from(condition))
      .toList();
}

List<String> _tagsFrom(dynamic value) {
  if (value is List) {
    return value
        .map((item) => item.toString())
        .where((item) => item.trim().isNotEmpty)
        .toList();
  }
  if (value is String) {
    return value
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
  return const [];
}

NodeModel? _nodeById(List<NodeModel> nodes, String? id) {
  if (id == null) return null;
  for (final node in nodes) {
    if (node.id == id) return node;
  }
  return null;
}

_PickerOption? _optionById(List<_PickerOption> options, String? id) {
  if (id == null) return null;
  for (final option in options) {
    if (option.id == id) return option;
  }
  return null;
}

String _stringValue(dynamic value) {
  if (value == null) return '';
  if (value is List) return value.join(', ');
  return value.toString();
}

bool _boolValue(dynamic value) => value == true || value == 'true';

String _flowTriggerLabel(FlowState flow) {
  for (final node in flow.nodes) {
    if (node.type == NodeType.trigger) {
      return 'Event: ${_configSummary(node)}';
    }
  }
  return 'Event: New message received';
}

String _configSummary(NodeModel node) {
  final config = node.config;

  switch (node.type) {
    case NodeType.trigger:
      final event = _optionById(_triggerOptions, config['event']?.toString());
      final keywords = _tagsFrom(config['keywords']);
      if (keywords.isNotEmpty) {
        return '${event?.label ?? 'Trigger'}: ${keywords.join(', ')}';
      }
      return event?.label ?? 'All messages';
    case NodeType.criteriaRouter:
      final rules = _criteriaRulesFrom(config['rules']);
      return '${rules.length} rule${rules.length == 1 ? '' : 's'} configured';
    case NodeType.sendMessage:
      if (config['messageType'] == 'template') {
        final tplName = config['templateName']?.toString() ?? '';
        return tplName.isNotEmpty ? 'Template: $tplName' : 'No template selected';
      }
      final message = config['message']?.toString().trim() ?? '';
      return message.isEmpty ? 'Message text is empty' : message;
    case NodeType.addTag:
    case NodeType.removeTag:
      final tags = _tagsFrom(config['tags']);
      return tags.isEmpty ? 'No tags selected' : tags.join(', ');
    case NodeType.assignAgent:
      final assignment =
          _optionById(_assignmentOptions, config['assignmentType']?.toString());
      final department = config['departmentName']?.toString();
      final agent = config['agentName']?.toString();
      if (config['assignmentType'] == 'specific_member') {
        return agent?.isNotEmpty == true ? agent! : 'No team member selected';
      }
      return [
        assignment?.label ?? 'Assignment',
        if (department?.isNotEmpty == true) department,
      ].whereType<String>().join(' - ');
    case NodeType.assignTeam:
      return config['departmentName']?.toString().isNotEmpty == true
          ? config['departmentName'].toString()
          : 'No department selected';
    case NodeType.closeConversation:
      return 'Resolve the active conversation';
    case NodeType.createConversation:
      return 'Split into a new thread';
    case NodeType.setContactAttribute:
      final fk = config['fieldKey']?.toString() ?? '';
      final fv = config['value']?.toString() ?? '';
      if (fk.isEmpty) return 'No field selected';
      return '${config['fieldLabel'] ?? fk} → $fv';
    case NodeType.interactiveMessage:
      final iType = config['interactiveType']?.toString() ?? 'button';
      if (iType == 'button') {
        final btns = (config['buttons'] as List?)?.length ?? 0;
        return 'Buttons ($btns) - ${config['body']?.toString() ?? ''}';
      }
      return 'List - ${config['buttonText'] ?? 'Menu'}';
    case NodeType.googleSheets:
      final sid = config['spreadsheetId']?.toString() ?? '';
      return sid.isEmpty ? 'No spreadsheet configured' : 'Sheet: ${config['sheetName'] ?? 'Sheet1'}';
  }
}

List<String> _nodeWarnings(NodeModel node) {
  final config = node.config;
  switch (node.type) {
    case NodeType.sendMessage:
      if (config['messageType'] == 'template') {
        return (config['templateName']?.toString().isEmpty ?? true)
            ? ['Select a template.']
            : const [];
      }
      return (config['message']?.toString().trim().isEmpty ?? true)
          ? ['Message text is required.']
          : const [];
    case NodeType.addTag:
    case NodeType.removeTag:
      return _tagsFrom(config['tags']).isEmpty
          ? ['Add at least one tag.']
          : const [];
    case NodeType.criteriaRouter:
      return _criteriaRulesFrom(config['rules']).isEmpty
          ? ['Add at least one criteria rule.']
          : const [];
    case NodeType.assignAgent:
      if (config['assignmentType'] == 'specific_member' &&
          (config['agentId']?.toString().isEmpty ?? true)) {
        return ['Choose a team member.'];
      }
      if ((config['departmentId']?.toString().isEmpty ?? true) &&
          config['assignmentType'] != 'specific_member') {
        return ['Choose a department.'];
      }
      return const [];
    case NodeType.assignTeam:
      return (config['departmentId']?.toString().isEmpty ?? true)
          ? ['Choose a department.']
          : const [];
    case NodeType.trigger:
    case NodeType.closeConversation:
    case NodeType.createConversation:
      return const [];
    case NodeType.setContactAttribute:
      return (config['fieldKey']?.toString().isEmpty ?? true)
          ? ['Select a contact field.']
          : const [];
    case NodeType.interactiveMessage:
      if (config['body']?.toString().trim().isEmpty ?? true) {
        return ['Body text is required.'];
      }
      if (config['interactiveType'] == 'button') {
        final buttons = config['buttons'] as List? ?? [];
        if (buttons.isEmpty || (buttons.first as Map?)?['title']?.toString().trim().isEmpty == true) {
          return ['Add at least one button.'];
        }
      }
      return const [];
    case NodeType.googleSheets:
      return (config['spreadsheetId']?.toString().isEmpty ?? true)
          ? ['Enter a Spreadsheet ID.']
          : const [];
  }
}

List<_ChipData> _nodeChips(NodeModel node) {
  switch (node.type) {
    case NodeType.trigger:
      return const [_ChipData('Trigger', Color(0xFF3B82F6))];
    case NodeType.criteriaRouter:
      return const [_ChipData('Rules', Color(0xFFF59E0B))];
    case NodeType.sendMessage:
      return const [_ChipData('Reply', Color(0xFF00B8D9))];
    case NodeType.addTag:
      return _tagsFrom(node.config['tags'])
          .map((tag) => _ChipData(tag, const Color(0xFF10B981)))
          .toList();
    case NodeType.removeTag:
      return _tagsFrom(node.config['tags'])
          .map((tag) => _ChipData(tag, const Color(0xFFE17055)))
          .toList();
    case NodeType.assignAgent:
      return [
        _ChipData(
          node.config['departmentName']?.toString().isNotEmpty == true
              ? node.config['departmentName'].toString()
              : 'Assignment',
          const Color(0xFF3B82F6),
        ),
      ];
    case NodeType.assignTeam:
      return [
        _ChipData(
          node.config['departmentName']?.toString().isNotEmpty == true
              ? node.config['departmentName'].toString()
              : 'Queue',
          const Color(0xFF9B51E0),
        ),
      ];
    case NodeType.closeConversation:
      return const [_ChipData('Resolve', Color(0xFF9CA3AF))];
    case NodeType.createConversation:
      return const [_ChipData('New Thread', Color(0xFF8B5CF6))];
    case NodeType.setContactAttribute:
      final fl = node.config['fieldLabel']?.toString() ?? '';
      return [_ChipData(fl.isNotEmpty ? fl : 'Attribute', const Color(0xFFF59E0B))];
    case NodeType.interactiveMessage:
      return [_ChipData(
        node.config['interactiveType'] == 'list' ? 'List' : 'Buttons',
        const Color(0xFF00CEC9),
      )];
    case NodeType.googleSheets:
      return const [_ChipData('Sheets', Color(0xFF0F9D58))];
  }
}

Offset _edgeOutputPoint(NodeModel node) {
  return node.position +
      const Offset(_FlowMetrics.nodeWidth + 11, _FlowMetrics.nodeHeight / 2);
}

Offset _edgeInputPoint(NodeModel node) {
  return node.position + const Offset(-11, _FlowMetrics.nodeHeight / 2);
}

String _nodeDescription(NodeType type) {
  switch (type) {
    case NodeType.trigger:
      return 'Starts the automation';
    case NodeType.criteriaRouter:
      return 'Route by attributes and rules';
    case NodeType.sendMessage:
      return 'Send a chat reply or note';
    case NodeType.addTag:
      return 'Attach tags to a contact';
    case NodeType.removeTag:
      return 'Remove tags from a contact';
    case NodeType.assignAgent:
      return 'Assign with round robin rules';
    case NodeType.assignTeam:
      return 'Push into a team queue';
    case NodeType.closeConversation:
      return 'Resolve the chat';
    case NodeType.createConversation:
      return 'Split into a new conversation';
    case NodeType.setContactAttribute:
      return 'Update a contact field value';
    case NodeType.interactiveMessage:
      return 'Send buttons or list menus';
    case NodeType.googleSheets:
      return 'Add a row to Google Sheets';
  }
}

Color _nodeColor(NodeType type) {
  switch (type) {
    case NodeType.trigger:
      return const Color(0xFF3B82F6);
    case NodeType.criteriaRouter:
      return const Color(0xFFF59E0B);
    case NodeType.sendMessage:
      return const Color(0xFF00B8D9);
    case NodeType.addTag:
      return const Color(0xFF10B981);
    case NodeType.removeTag:
      return const Color(0xFFE17055);
    case NodeType.assignAgent:
      return const Color(0xFF3B82F6);
    case NodeType.assignTeam:
      return const Color(0xFF9B51E0);
    case NodeType.closeConversation:
      return const Color(0xFF9CA3AF);
    case NodeType.createConversation:
      return const Color(0xFF8B5CF6);
    case NodeType.setContactAttribute:
      return const Color(0xFFF59E0B);
    case NodeType.interactiveMessage:
      return const Color(0xFF00CEC9);
    case NodeType.googleSheets:
      return const Color(0xFF0F9D58);
  }
}

IconData _nodeIcon(NodeType type) {
  switch (type) {
    case NodeType.trigger:
      return Icons.bolt_rounded;
    case NodeType.criteriaRouter:
      return Icons.alt_route_rounded;
    case NodeType.sendMessage:
      return Icons.forum_rounded;
    case NodeType.addTag:
      return Icons.label_rounded;
    case NodeType.removeTag:
      return Icons.label_off_rounded;
    case NodeType.assignAgent:
      return Icons.support_agent_rounded;
    case NodeType.assignTeam:
      return Icons.groups_rounded;
    case NodeType.closeConversation:
      return Icons.check_circle_rounded;
    case NodeType.createConversation:
      return Icons.add_comment_rounded;
    case NodeType.setContactAttribute:
      return Icons.edit_attributes_rounded;
    case NodeType.interactiveMessage:
      return Icons.touch_app_rounded;
    case NodeType.googleSheets:
      return Icons.grid_on_rounded;
  }
}

Color _readableNodeColor(ThemeData theme, Color color) {
  if (theme.brightness == Brightness.light) return color;
  return Color.lerp(color, Colors.white, 0.52)!;
}

InputDecoration _fieldDecoration(ThemeData theme, String hint) {
  return InputDecoration(
    hintText: hint,
    hintStyle: theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurface.withValues(alpha: 0.38),
    ),
    isDense: true,
    filled: true,
    fillColor: theme.colorScheme.onSurface.withValues(alpha: 0.035),
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: theme.dividerColor),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: theme.dividerColor),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: theme.colorScheme.primary, width: 1.5),
    ),
  );
}

Color _builderBackground(ThemeData theme) {
  return theme.brightness == Brightness.dark
      ? const Color(0xFF10131A)
      : const Color(0xFFF4F6FA);
}

Color _canvasBackground(ThemeData theme) {
  return theme.brightness == Brightness.dark
      ? const Color(0xFF0E1118)
      : const Color(0xFFF7F8FB);
}

String _cleanError(Object error) {
  return error.toString().replaceFirst('Exception: ', '');
}
