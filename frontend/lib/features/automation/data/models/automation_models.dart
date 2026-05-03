// ============================================================
// Automation Visual Engine - Data Models
// ============================================================
import 'dart:ui';

// ── Automation Model (Dashboard level) ─────────────────────
class AutomationModel {
  final String id;
  final String title;
  final String channel;
  final String channelPhone;
  final String event;
  final AutomationStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isFallback;
  final bool disableOnAssignment;

  const AutomationModel({
    required this.id,
    required this.title,
    this.channel = 'whatsapp',
    this.channelPhone = '',
    required this.event,
    this.status = AutomationStatus.active,
    required this.createdAt,
    required this.updatedAt,
    this.isFallback = false,
    this.disableOnAssignment = false,
  });

  AutomationModel copyWith({
    String? title,
    String? channel,
    String? channelPhone,
    String? event,
    AutomationStatus? status,
    DateTime? updatedAt,
    bool? isFallback,
    bool? disableOnAssignment,
  }) {
    return AutomationModel(
      id: id,
      title: title ?? this.title,
      channel: channel ?? this.channel,
      channelPhone: channelPhone ?? this.channelPhone,
      event: event ?? this.event,
      status: status ?? this.status,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isFallback: isFallback ?? this.isFallback,
      disableOnAssignment: disableOnAssignment ?? this.disableOnAssignment,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'channel': channel,
        'channelPhone': channelPhone,
        'event': event,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'isFallback': isFallback,
        'disableOnAssignment': disableOnAssignment,
      };

  factory AutomationModel.fromJson(Map<String, dynamic> json) {
    return AutomationModel(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      channel: json['channel'] ?? 'whatsapp',
      channelPhone: json['channelPhone'] ?? '',
      event: json['event'] ?? '',
      status: AutomationStatus.values.firstWhere(
        (s) => s.name == json['status'],
        orElse: () => AutomationStatus.active,
      ),
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt'] ?? '') ?? DateTime.now(),
      isFallback: json['isFallback'] ?? false,
      disableOnAssignment: json['disableOnAssignment'] ?? false,
    );
  }
}

enum AutomationStatus { active, paused }

// ── Node Model (Canvas level) ──────────────────────────────
class NodeModel {
  final String id;
  final NodeType type;
  final Offset position;
  final Map<String, dynamic> config;

  const NodeModel({
    required this.id,
    required this.type,
    required this.position,
    this.config = const {},
  });

  NodeModel copyWith({
    Offset? position,
    Map<String, dynamic>? config,
  }) {
    return NodeModel(
      id: id,
      type: type,
      position: position ?? this.position,
      config: config ?? this.config,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.name,
        'x': position.dx,
        'y': position.dy,
        'config': config,
      };

  factory NodeModel.fromJson(Map<String, dynamic> json) {
    return NodeModel(
      id: json['id'] ?? '',
      type: NodeType.values.firstWhere(
        (t) => t.name == json['type'],
        orElse: () => NodeType.trigger,
      ),
      position: Offset(
        (json['x'] as num?)?.toDouble() ?? 0,
        (json['y'] as num?)?.toDouble() ?? 0,
      ),
      config: Map<String, dynamic>.from(json['config'] ?? {}),
    );
  }
}

enum NodeType {
  trigger,
  criteriaRouter,
  sendMessage,
  interactiveMessage,
  addTag,
  removeTag,
  assignAgent,
  assignTeam,
  closeConversation,
  createConversation,
  setContactAttribute,
  googleSheets,
}

// ── Edge Model (Connection between nodes) ──────────────────
class EdgeModel {
  final String id;
  final String sourceNodeId;
  final String targetNodeId;
  final String? label;

  const EdgeModel({
    required this.id,
    required this.sourceNodeId,
    required this.targetNodeId,
    this.label,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'sourceNodeId': sourceNodeId,
        'targetNodeId': targetNodeId,
        if (label != null) 'label': label,
      };

  factory EdgeModel.fromJson(Map<String, dynamic> json) {
    return EdgeModel(
      id: json['id'] ?? '',
      sourceNodeId: json['sourceNodeId'] ?? '',
      targetNodeId: json['targetNodeId'] ?? '',
      label: json['label'],
    );
  }
}

// ── Node metadata helpers ──────────────────────────────────
class NodeMeta {
  static String label(NodeType type) {
    switch (type) {
      case NodeType.trigger:
        return 'Trigger';
      case NodeType.criteriaRouter:
        return 'Criteria Router';
      case NodeType.sendMessage:
        return 'Send Message';
      case NodeType.interactiveMessage:
        return 'Interactive Message';
      case NodeType.addTag:
        return 'Add Tags';
      case NodeType.removeTag:
        return 'Remove Tags';
      case NodeType.assignAgent:
        return 'Assign To Team Member';
      case NodeType.assignTeam:
        return 'Assign To Department Queue';
      case NodeType.closeConversation:
        return 'Close Conversation';
      case NodeType.createConversation:
        return 'New Conversation Thread';
      case NodeType.setContactAttribute:
        return 'Set Contact Attribute';
      case NodeType.googleSheets:
        return 'Google Sheets';
    }
  }

  static String category(NodeType type) {
    switch (type) {
      case NodeType.trigger:
        return 'Trigger';
      case NodeType.criteriaRouter:
        return 'Workflow';
      case NodeType.sendMessage:
        return 'Messaging';
      case NodeType.interactiveMessage:
        return 'Messaging';
      case NodeType.addTag:
        return 'Customer';
      case NodeType.removeTag:
        return 'Customer';
      case NodeType.assignAgent:
        return 'Customer';
      case NodeType.assignTeam:
        return 'Customer';
      case NodeType.closeConversation:
        return 'Customer';
      case NodeType.createConversation:
        return 'Customer';
      case NodeType.setContactAttribute:
        return 'Customer';
      case NodeType.googleSheets:
        return 'Integration';
    }
  }
}
