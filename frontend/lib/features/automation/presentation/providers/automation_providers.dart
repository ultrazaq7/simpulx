// ============================================================
// Automation Riverpod Providers - Real API State Management
// ============================================================
import 'dart:ui';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:simpulx/features/automation/data/repositories/automation_repository.dart';
import 'package:simpulx/features/automation/data/models/automation_models.dart';

// ── Repository singleton ──────────────────────────────────
final automationRepoProvider = Provider((_) => AutomationRepository());

// ── WhatsApp channels list ────────────────────────────────
final channelsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(automationRepoProvider).getChannels();
});

String _readableAutomationError(Object error) {
  final message = error.toString();
  if (message.contains('XMLHttpRequest') ||
      message.contains('connection error') ||
      message.contains('DioException')) {
    return 'Could not reach the automation service. Refresh the page, then sign in again if the session is stale.';
  }
  return message.replaceFirst('Exception: ', '');
}

// ══════════════════════════════════════════════════════════
// Dashboard - list of automation rules
// ══════════════════════════════════════════════════════════
class DashboardState {
  final List<Map<String, dynamic>> rules;
  final bool loading;
  final String? error;
  final String search;
  final String filterTrigger; // '' = all
  final String filterChannel; // '' = all

  const DashboardState({
    this.rules = const [],
    this.loading = true,
    this.error,
    this.search = '',
    this.filterTrigger = '',
    this.filterChannel = '',
  });

  DashboardState copyWith({
    List<Map<String, dynamic>>? rules,
    bool? loading,
    String? error,
    String? search,
    String? filterTrigger,
    String? filterChannel,
  }) =>
      DashboardState(
        rules: rules ?? this.rules,
        loading: loading ?? this.loading,
        error: error,
        search: search ?? this.search,
        filterTrigger: filterTrigger ?? this.filterTrigger,
        filterChannel: filterChannel ?? this.filterChannel,
      );

  List<Map<String, dynamic>> get filtered {
    return rules.where((r) {
      final name = (r['name'] ?? '').toString().toLowerCase();
      if (search.isNotEmpty && !name.contains(search.toLowerCase())) {
        return false;
      }
      if (filterTrigger.isNotEmpty &&
          (r['triggerType'] ?? '') != filterTrigger) {
        return false;
      }
      if (filterChannel.isNotEmpty) {
        final conditions =
            r['triggerConditions'] as Map<String, dynamic>? ?? {};
        final ruleChannel = (conditions['channelId'] ?? '').toString();
        if (ruleChannel != filterChannel) return false;
      }
      return true;
    }).toList();
  }
}

class DashboardNotifier extends StateNotifier<DashboardState> {
  final AutomationRepository _repo;

  DashboardNotifier(this._repo) : super(const DashboardState()) {
    load();
  }

  Future<void> load() async {
    state = state.copyWith(loading: true, error: null);
    try {
      final rules = await _repo.getRules();
      state = state.copyWith(rules: rules, loading: false);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: _readableAutomationError(e),
      );
    }
  }

  void setSearch(String q) => state = state.copyWith(search: q);
  void setFilter(String trigger) =>
      state = state.copyWith(filterTrigger: trigger);
  void setChannelFilter(String channel) =>
      state = state.copyWith(filterChannel: channel);

  Future<void> toggleRule(String id, bool current) async {
    try {
      await _repo.toggleRule(id, current);
      await load();
    } catch (_) {}
  }

  Future<void> deleteRule(String id) async {
    try {
      await _repo.deleteRule(id);
      await load();
    } catch (_) {}
  }

  Future<void> duplicateRule(Map<String, dynamic> original) async {
    try {
      final data = <String, dynamic>{
        'name': '${original['name']} (Copy)',
        'triggerType': original['triggerType'],
        'triggerConditions': original['triggerConditions'],
        'actions': original['actions'],
        'isActive': false,
      };
      if (original['priorityOrder'] != null) {
        data['priorityOrder'] = original['priorityOrder'];
      }
      await _repo.createRule(data);
      await load();
    } catch (_) {}
  }

  Future<void> createRule(Map<String, dynamic> data) async {
    await _repo.createRule(data);
    await load();
  }

  Future<void> updateRule(String id, Map<String, dynamic> data) async {
    await _repo.updateRule(id, data);
    await load();
  }
}

final dashboardProvider =
    StateNotifierProvider<DashboardNotifier, DashboardState>(
  (ref) => DashboardNotifier(ref.read(automationRepoProvider)),
);

// ══════════════════════════════════════════════════════════
// Flow Builder - canvas state (nodes, edges, selection)
// ══════════════════════════════════════════════════════════
class FlowState {
  final String ruleId;
  final String ruleName;
  final List<NodeModel> nodes;
  final List<EdgeModel> edges;
  final List<FlowSnapshot> undoStack;
  final List<FlowSnapshot> redoStack;
  final String? selectedNodeId;
  final String? connectingFromId;
  final bool loading;
  final bool saving;
  final bool dirty;
  final String? error;

  const FlowState({
    this.ruleId = '',
    this.ruleName = '',
    this.nodes = const [],
    this.edges = const [],
    this.undoStack = const [],
    this.redoStack = const [],
    this.selectedNodeId,
    this.connectingFromId,
    this.loading = true,
    this.saving = false,
    this.dirty = false,
    this.error,
  });

  FlowState copyWith({
    String? ruleId,
    String? ruleName,
    List<NodeModel>? nodes,
    List<EdgeModel>? edges,
    List<FlowSnapshot>? undoStack,
    List<FlowSnapshot>? redoStack,
    String? selectedNodeId,
    String? connectingFromId,
    bool? loading,
    bool? saving,
    bool? dirty,
    String? error,
    bool clearSelection = false,
    bool clearConnecting = false,
  }) =>
      FlowState(
        ruleId: ruleId ?? this.ruleId,
        ruleName: ruleName ?? this.ruleName,
        nodes: nodes ?? this.nodes,
        edges: edges ?? this.edges,
        undoStack: undoStack ?? this.undoStack,
        redoStack: redoStack ?? this.redoStack,
        selectedNodeId:
            clearSelection ? null : (selectedNodeId ?? this.selectedNodeId),
        connectingFromId: clearConnecting
            ? null
            : (connectingFromId ?? this.connectingFromId),
        loading: loading ?? this.loading,
        saving: saving ?? this.saving,
        dirty: dirty ?? this.dirty,
        error: error,
      );

  bool get canUndo => undoStack.isNotEmpty;
  bool get canRedo => redoStack.isNotEmpty;
}

class FlowSnapshot {
  final List<NodeModel> nodes;
  final List<EdgeModel> edges;
  final String? selectedNodeId;

  const FlowSnapshot({
    required this.nodes,
    required this.edges,
    required this.selectedNodeId,
  });
}

class FlowNotifier extends StateNotifier<FlowState> {
  final AutomationRepository _repo;
  FlowSnapshot? _moveSnapshot;

  FlowNotifier(this._repo) : super(const FlowState());

  FlowSnapshot _snapshot() => FlowSnapshot(
        nodes: List<NodeModel>.from(state.nodes),
        edges: List<EdgeModel>.from(state.edges),
        selectedNodeId: state.selectedNodeId,
      );

  List<FlowSnapshot> _pushHistory(FlowSnapshot snapshot) {
    final next = [...state.undoStack, snapshot];
    return next.length > 80 ? next.sublist(next.length - 80) : next;
  }

  void _commit(FlowState nextState) {
    _moveSnapshot = null;
    state = nextState.copyWith(
      undoStack: _pushHistory(_snapshot()),
      redoStack: const [],
    );
  }

  void undo() {
    if (state.undoStack.isEmpty) return;
    _moveSnapshot = null;
    final previous = state.undoStack.last;
    state = state.copyWith(
      nodes: previous.nodes,
      edges: previous.edges,
      selectedNodeId: previous.selectedNodeId,
      clearSelection: previous.selectedNodeId == null,
      clearConnecting: true,
      undoStack: state.undoStack.sublist(0, state.undoStack.length - 1),
      redoStack: [...state.redoStack, _snapshot()],
      dirty: true,
    );
  }

  void redo() {
    if (state.redoStack.isEmpty) return;
    _moveSnapshot = null;
    final next = state.redoStack.last;
    state = state.copyWith(
      nodes: next.nodes,
      edges: next.edges,
      selectedNodeId: next.selectedNodeId,
      clearSelection: next.selectedNodeId == null,
      clearConnecting: true,
      undoStack: _pushHistory(_snapshot()),
      redoStack: state.redoStack.sublist(0, state.redoStack.length - 1),
      dirty: true,
    );
  }

  void beginNodeMove() {
    _moveSnapshot ??= _snapshot();
  }

  void endNodeMove() {
    final snapshot = _moveSnapshot;
    if (snapshot == null) return;
    _moveSnapshot = null;
    state = state.copyWith(
      undoStack: _pushHistory(snapshot),
      redoStack: const [],
      dirty: true,
    );
  }

  void cancelNodeMove() {
    _moveSnapshot = null;
  }

  Future<void> loadFlow(String ruleId, String ruleName) async {
    state = state.copyWith(
      ruleId: ruleId,
      ruleName: ruleName,
      loading: true,
      error: null,
    );
    try {
      final flow = await _repo.getFlow(ruleId);
      final rawNodes = flow['nodes'] as List<dynamic>? ?? [];
      final rawEdges = flow['edges'] as List<dynamic>? ?? [];

      final nodes = rawNodes
          .map((n) => NodeModel.fromJson(Map<String, dynamic>.from(n)))
          .toList();
      final edges = rawEdges
          .map((e) => EdgeModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();

      // If empty, seed with a default trigger node
      if (nodes.isEmpty) {
        nodes.add(const NodeModel(
          id: 'trigger_0',
          type: NodeType.trigger,
          position: Offset(180, 220),
          config: {
            'event': 'all_messages',
            'keywords': [],
          },
        ));
      }

      state = state.copyWith(
        nodes: nodes,
        edges: edges,
        loading: false,
        dirty: false,
        clearSelection: true,
        clearConnecting: true,
        undoStack: const [],
        redoStack: const [],
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: _readableAutomationError(e),
      );
    }
  }

  Future<void> saveFlow() async {
    state = state.copyWith(saving: true);
    try {
      await _repo.saveFlow(
        state.ruleId,
        nodes: state.nodes.map((n) => n.toJson()).toList(),
        edges: state.edges.map((e) => e.toJson()).toList(),
      );
      state = state.copyWith(saving: false, dirty: false);
    } catch (e) {
      state = state.copyWith(
        saving: false,
        error: _readableAutomationError(e),
      );
    }
  }

  void importFlow(List<NodeModel> nodes, List<EdgeModel> edges) {
    _commit(state.copyWith(
      nodes: nodes,
      edges: edges,
      clearSelection: true,
      clearConnecting: true,
      dirty: true,
    ));
  }

  // ── Node operations ──

  void addNode(NodeModel node) {
    _commit(state.copyWith(
      nodes: [...state.nodes, node],
      dirty: true,
    ));
  }

  void moveNode(String id, Offset delta) {
    state = state.copyWith(
      nodes: state.nodes.map((n) {
        if (n.id == id) return n.copyWith(position: n.position + delta);
        return n;
      }).toList(),
      dirty: true,
    );
  }

  void updateNodeConfig(String id, Map<String, dynamic> config) {
    _commit(state.copyWith(
      nodes: state.nodes.map((n) {
        if (n.id == id) return n.copyWith(config: config);
        return n;
      }).toList(),
      dirty: true,
    ));
  }

  void removeNode(String id) {
    _commit(state.copyWith(
      nodes: state.nodes.where((n) => n.id != id).toList(),
      edges: state.edges
          .where((e) => e.sourceNodeId != id && e.targetNodeId != id)
          .toList(),
      clearSelection: true,
      dirty: true,
    ));
  }

  void duplicateNode(String id) {
    NodeModel? original;
    for (final n in state.nodes) {
      if (n.id == id) {
        original = n;
        break;
      }
    }
    if (original == null) return;
    final newId =
        '${original.type.name}_${DateTime.now().microsecondsSinceEpoch}';
    final newNode = NodeModel(
      id: newId,
      type: original.type,
      position: original.position + const Offset(40, 60),
      config: Map<String, dynamic>.from(original.config),
    );
    _commit(state.copyWith(
      nodes: [...state.nodes, newNode],
      selectedNodeId: newId,
      dirty: true,
    ));
  }

  void selectNode(String? id) {
    state = state.copyWith(
      selectedNodeId: id,
      clearSelection: id == null,
    );
  }

  // ── Edge operations ──

  void startConnecting(String fromNodeId) {
    state = state.copyWith(connectingFromId: fromNodeId);
  }

  void finishConnecting(String toNodeId) {
    final from = state.connectingFromId;
    if (from == null || from == toNodeId) {
      state = state.copyWith(clearConnecting: true);
      return;
    }
    // Prevent duplicate edges
    final exists = state.edges.any(
      (e) => e.sourceNodeId == from && e.targetNodeId == toNodeId,
    );
    if (!exists) {
      final edge = EdgeModel(
        id: 'edge_${DateTime.now().millisecondsSinceEpoch}',
        sourceNodeId: from,
        targetNodeId: toNodeId,
      );
      _commit(state.copyWith(
        edges: [...state.edges, edge],
        selectedNodeId: toNodeId,
        clearConnecting: true,
        dirty: true,
      ));
    } else {
      state = state.copyWith(
        selectedNodeId: toNodeId,
        clearConnecting: true,
      );
    }
  }

  void cancelConnecting() {
    state = state.copyWith(clearConnecting: true);
  }

  void removeEdge(String edgeId) {
    _commit(state.copyWith(
      edges: state.edges.where((e) => e.id != edgeId).toList(),
      dirty: true,
    ));
  }

  void rewireEdge(String edgeId, String targetNodeId) {
    EdgeModel? edge;
    for (final item in state.edges) {
      if (item.id == edgeId) {
        edge = item;
        break;
      }
    }
    if (edge == null || edge.sourceNodeId == targetNodeId) {
      state = state.copyWith(clearConnecting: true);
      return;
    }
    final sourceNodeId = edge.sourceNodeId;

    final duplicateExists = state.edges.any(
      (e) =>
          e.id != edgeId &&
          e.sourceNodeId == sourceNodeId &&
          e.targetNodeId == targetNodeId,
    );

    _commit(state.copyWith(
      edges: duplicateExists
          ? state.edges.where((e) => e.id != edgeId).toList()
          : state.edges.map((e) {
              if (e.id != edgeId) return e;
              return EdgeModel(
                id: e.id,
                sourceNodeId: e.sourceNodeId,
                targetNodeId: targetNodeId,
                label: e.label,
              );
            }).toList(),
      selectedNodeId: targetNodeId,
      clearConnecting: true,
      dirty: true,
    ));
  }

  void clearAll() {
    _commit(state.copyWith(
      nodes: [
        const NodeModel(
          id: 'trigger_0',
          type: NodeType.trigger,
          position: Offset(180, 220),
          config: {
            'event': 'all_messages',
            'keywords': [],
          },
        ),
      ],
      edges: [],
      clearSelection: true,
      clearConnecting: true,
      dirty: true,
    ));
  }
}

final flowProvider = StateNotifierProvider<FlowNotifier, FlowState>(
  (ref) => FlowNotifier(ref.read(automationRepoProvider)),
);
