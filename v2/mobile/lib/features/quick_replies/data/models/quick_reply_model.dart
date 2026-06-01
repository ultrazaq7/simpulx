// ============================================================
// Quick Reply Model (JSON Serializable)
// ============================================================
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/features/quick_replies/domain/entities/quick_reply_entity.dart';

class QuickReplyModel extends QuickReplyEntity {
  const QuickReplyModel({
    required super.id,
    required super.title,
    required super.content,
    super.shortcut,
    super.category,
    super.isGlobal,
    super.departmentId,
    super.createdByName,
    required super.createdAt,
    required super.updatedAt,
  });

  factory QuickReplyModel.fromJson(Map<String, dynamic> json) {
    String? createdByName;
    if (json['createdBy'] is Map) {
      createdByName =
          json['createdBy']['fullName'] ?? json['createdBy']['full_name'];
    }

    return QuickReplyModel(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      content: json['content'] as String? ?? '',
      shortcut: json['shortcut'] as String?,
      category: json['category'] as String?,
      isGlobal: json['isGlobal'] ?? json['is_global'] ?? true,
      departmentId: json['departmentId'] ?? json['department_id'],
      createdByName: createdByName,
      createdAt: AppDateTime.parseLocalOrNow(json['createdAt']),
      updatedAt: AppDateTime.parseLocalOrNow(json['updatedAt']),
    );
  }
}
