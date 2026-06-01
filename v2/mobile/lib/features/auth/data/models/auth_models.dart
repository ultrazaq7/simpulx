// ============================================================
// Auth Data Models (JSON Serializable)
// ============================================================
import 'package:simpulx/features/auth/domain/entities/auth_entities.dart';

class UserModel extends UserEntity {
  const UserModel({
    required super.id,
    required super.email,
    required super.fullName,
    required super.role,
    super.avatarUrl,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: (json['fullName'] ?? json['name'] ?? 'Unknown') as String,
      role: json['role'] as String,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'fullName': fullName,
        'role': role,
        'avatarUrl': avatarUrl,
      };
}

class OrganizationModel extends OrganizationEntity {
  const OrganizationModel({
    required super.id,
    required super.name,
    required super.slug,
    required super.plan,
    super.rolePermissions,
  });

  factory OrganizationModel.fromJson(Map<String, dynamic> json) {
    final rawPerms = json['rolePermissions'] as Map<String, dynamic>? ?? {};
    final perms = rawPerms.map<String, Map<String, bool>>((role, val) {
      final map = (val as Map<String, dynamic>).map<String, bool>(
        (k, v) => MapEntry(k, v as bool? ?? false),
      );
      return MapEntry(role, map);
    });
    return OrganizationModel(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      plan: json['plan'] as String,
      rolePermissions: perms,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'slug': slug,
        'plan': plan,
        'rolePermissions': rolePermissions,
      };
}

class AuthSessionModel extends AuthSession {
  const AuthSessionModel({
    required super.accessToken,
    required super.refreshToken,
    required super.user,
    required super.organization,
  });

  factory AuthSessionModel.fromJson(Map<String, dynamic> json) {
    final userJson = json['user'] as Map<String, dynamic>;
    return AuthSessionModel(
      accessToken: (json['accessToken'] ?? json['token']) as String,
      refreshToken: (json['refreshToken'] ?? '') as String,
      user: UserModel.fromJson(userJson),
      organization: json['organization'] != null
          ? OrganizationModel.fromJson(json['organization'] as Map<String, dynamic>)
          : OrganizationModel(
              id: userJson['org_id'] as String? ?? '000',
              name: 'Demo Organization',
              slug: 'demo',
              plan: 'enterprise',
            ),
    );
  }
}
