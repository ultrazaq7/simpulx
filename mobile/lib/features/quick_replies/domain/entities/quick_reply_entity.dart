// ============================================================
// Quick Reply Entity (Domain)
// ============================================================
import 'package:equatable/equatable.dart';

class QuickReplyEntity extends Equatable {
  final String id;
  final String title;
  final String content;
  final String? shortcut;
  final String? category;
  final bool isGlobal;
  final String? departmentId;
  final String? createdByName;
  final DateTime createdAt;
  final DateTime updatedAt;

  const QuickReplyEntity({
    required this.id,
    required this.title,
    required this.content,
    this.shortcut,
    this.category,
    this.isGlobal = true,
    this.departmentId,
    this.createdByName,
    required this.createdAt,
    required this.updatedAt,
  });

  @override
  List<Object?> get props => [id, title, content, shortcut, category];
}
