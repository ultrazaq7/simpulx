class SettingsDepartmentModel {
  final String id;
  final String name;
  final String? description;
  final bool isActive;
  final DateTime? createdAt;

  const SettingsDepartmentModel({
    required this.id,
    required this.name,
    this.description,
    required this.isActive,
    this.createdAt,
  });

  factory SettingsDepartmentModel.fromJson(Map<String, dynamic> json) {
    return SettingsDepartmentModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }
}

class SettingsDepartmentRef {
  final String id;
  final String name;

  const SettingsDepartmentRef({
    required this.id,
    required this.name,
  });

  factory SettingsDepartmentRef.fromJson(Map<String, dynamic> json) {
    return SettingsDepartmentRef(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }
}

class SettingsUserRef {
  final String id;
  final String fullName;

  const SettingsUserRef({
    required this.id,
    required this.fullName,
  });

  factory SettingsUserRef.fromJson(Map<String, dynamic> json) {
    return SettingsUserRef(
      id: json['id'] as String,
      fullName: json['fullName'] as String,
    );
  }
}

class SettingsTeamMemberModel {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String status;
  final bool isOnline;
  final int maxConcurrentChats;
  final bool availableForRoundRobin;
  final DateTime? createdAt;
  final DateTime? lastSeenAt;
  final SettingsDepartmentRef? department;
  final SettingsUserRef? supervisor;

  const SettingsTeamMemberModel({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.status,
    required this.isOnline,
    required this.maxConcurrentChats,
    this.availableForRoundRobin = true,
    this.createdAt,
    this.lastSeenAt,
    this.department,
    this.supervisor,
  });

  factory SettingsTeamMemberModel.fromJson(Map<String, dynamic> json) {
    return SettingsTeamMemberModel(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: json['fullName'] as String,
      role: json['role'] as String,
      status: json['status'] as String,
      isOnline: json['isOnline'] as bool? ?? false,
      maxConcurrentChats: (json['maxConcurrentChats'] as num?)?.toInt() ?? 0,
      availableForRoundRobin: json['availableForRoundRobin'] as bool? ?? true,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
      lastSeenAt: json['lastSeenAt'] != null
          ? DateTime.tryParse(json['lastSeenAt'] as String)
          : null,
      department: json['department'] is Map<String, dynamic>
          ? SettingsDepartmentRef.fromJson(
              json['department'] as Map<String, dynamic>,
            )
          : null,
      supervisor: json['supervisor'] is Map<String, dynamic>
          ? SettingsUserRef.fromJson(json['supervisor'] as Map<String, dynamic>)
          : null,
    );
  }
}

class SettingsTeamPageModel {
  final List<SettingsTeamMemberModel> users;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  const SettingsTeamPageModel({
    required this.users,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  factory SettingsTeamPageModel.fromJson(Map<String, dynamic> json) {
    final meta = json['meta'] as Map<String, dynamic>? ?? const {};

    return SettingsTeamPageModel(
      users: (json['data'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SettingsTeamMemberModel.fromJson)
          .toList(),
      total: (meta['total'] as num?)?.toInt() ?? 0,
      page: (meta['page'] as num?)?.toInt() ?? 1,
      limit: (meta['limit'] as num?)?.toInt() ?? 10,
      totalPages: (meta['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}
