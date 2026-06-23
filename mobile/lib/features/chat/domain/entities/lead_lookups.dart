import 'package:equatable/equatable.dart';

/// Pipeline stage (`GET /api/stages` -> `{id, name}`).
class Stage extends Equatable {
  const Stage({required this.id, required this.name});
  final String id;
  final String name;
  @override
  List<Object?> get props => [id, name];
}

/// Outcome/disposition (`GET /api/dispositions` -> `{id, name, category}`).
class Disposition extends Equatable {
  const Disposition({
    required this.id,
    required this.name,
    required this.category,
  });
  final String id;
  final String name;
  final String category; // won | lost | follow_up | spam | interested | ...
  @override
  List<Object?> get props => [id, name, category];
}

/// Saved reply (`GET /api/quick-replies` -> `{id, shortcut, title, body}`).
class QuickReply extends Equatable {
  const QuickReply({
    required this.id,
    required this.shortcut,
    required this.title,
    required this.body,
  });
  final String id;
  final String shortcut;
  final String title;
  final String body;
  @override
  List<Object?> get props => [id, shortcut, title, body];
}

/// Internal note (`GET /api/conversations/{id}/notes` -> `{id, body, author, created_at}`).
class Note extends Equatable {
  const Note({
    required this.id,
    required this.body,
    required this.author,
    required this.createdAt,
  });
  final String id;
  final String body;
  final String author;
  final DateTime createdAt;
  @override
  List<Object?> get props => [id, body, author, createdAt];
}

/// WhatsApp message template (`GET /api/templates`).
class MessageTemplate extends Equatable {
  const MessageTemplate({
    required this.id,
    required this.name,
    required this.language,
    required this.body,
    required this.status,
    this.variables = const [],
  });

  final String id;
  final String name;
  final String language;
  final String body;
  final String status; // draft | pending | approved | rejected
  final List<String> variables;

  bool get isApproved => status.toLowerCase() == 'approved';

  /// Body with {{1}}, {{2}}... substituted by the stored sample variables
  /// (matches the backend's renderTemplate).
  String get rendered {
    var out = body;
    for (var i = 0; i < variables.length; i++) {
      out = out.replaceAll('{{${i + 1}}}', variables[i]);
    }
    return out;
  }

  @override
  List<Object?> get props => [id, name, language, body, status, variables];
}

/// Assignable agent (`GET /api/agents` -> `{id, full_name, is_online, open_count}`).
class AgentRef extends Equatable {
  const AgentRef({
    required this.id,
    required this.name,
    required this.isOnline,
    required this.openCount,
  });
  final String id;
  final String name;
  final bool isOnline;
  final int openCount;
  @override
  List<Object?> get props => [id, name, isOnline, openCount];
}
