class AuditLogModel {
  final String id;
  final String category;
  final String action;
  final String? userId;
  final String? userName;
  final String? targetId;
  final String? targetType;
  final Map<String, dynamic> metadata;
  final String? ipAddress;
  final DateTime? createdAt;

  const AuditLogModel({
    required this.id,
    required this.category,
    required this.action,
    this.userId,
    this.userName,
    this.targetId,
    this.targetType,
    required this.metadata,
    this.ipAddress,
    this.createdAt,
  });

  factory AuditLogModel.fromJson(Map<String, dynamic> json) {
    return AuditLogModel(
      id: json['id'] as String,
      category: json['category'] as String? ?? 'system',
      action: json['action'] as String? ?? 'unknown',
      userId: json['userId'] as String?,
      userName: json['userName'] as String?,
      targetId: json['targetId'] as String?,
      targetType: json['targetType'] as String?,
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
      ipAddress: json['ipAddress'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }
}

class AuditLogPageModel {
  final List<AuditLogModel> logs;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  const AuditLogPageModel({
    required this.logs,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  factory AuditLogPageModel.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as List<dynamic>? ?? const [];

    return AuditLogPageModel(
      logs: data
          .whereType<Map<String, dynamic>>()
          .map(AuditLogModel.fromJson)
          .toList(),
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 20,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}

class PaginatedResult {
  final List<Map<String, dynamic>> data;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  const PaginatedResult({
    required this.data,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  factory PaginatedResult.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'] as List<dynamic>? ?? const [];
    return PaginatedResult(
      data: rawData.whereType<Map<String, dynamic>>().toList(),
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 25,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}
