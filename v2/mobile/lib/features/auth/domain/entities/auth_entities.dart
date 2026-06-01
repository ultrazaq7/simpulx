// ============================================================
// Auth Entities
// ============================================================
import 'package:equatable/equatable.dart';

class UserEntity extends Equatable {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String? avatarUrl;

  const UserEntity({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.avatarUrl,
  });

  @override
  List<Object?> get props => [id, email, fullName, role, avatarUrl];
}

class OrganizationEntity extends Equatable {
  final String id;
  final String name;
  final String slug;
  final String plan;
  final Map<String, Map<String, bool>> rolePermissions;

  const OrganizationEntity({
    required this.id,
    required this.name,
    required this.slug,
    required this.plan,
    this.rolePermissions = const {},
  });

  @override
  List<Object?> get props => [id, name, slug, plan, rolePermissions];
}

class AuthSession extends Equatable {
  final String accessToken;
  final String refreshToken;
  final UserEntity user;
  final OrganizationEntity organization;

  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.organization,
  });

  /// Check if the current user has a specific permission.
  /// Owner/Admin always have all permissions.
  /// If no custom permissions are saved for this role, fall back to defaults.
  bool hasPermission(String permKey) {
    final role = user.role;
    if (role == 'owner' || role == 'admin') return true;
    final perms = organization.rolePermissions[role];
    if (perms != null && perms.containsKey(permKey)) return perms[permKey]!;
    // Fallback to built-in defaults
    return _defaultPermission(role, permKey);
  }

  static bool _defaultPermission(String role, String key) {
    // Sidebar menu defaults - all roles see main items by default
    if (key.startsWith('menu_')) {
      if (role == 'manager') return true;
      if (role == 'supervisor') {
        return key == 'menu_dashboard' ||
            key == 'menu_chats' ||
            key == 'menu_contacts' ||
            key == 'menu_settings';
      }
      // agent
      return key == 'menu_dashboard' ||
          key == 'menu_chats' ||
          key == 'menu_contacts' ||
          key == 'menu_settings';
    }
    if (role == 'manager') {
      return key != 'manage_roles' && key != 'manage_channels';
    }
    if (role == 'supervisor') {
      return key.startsWith('view_') ||
          key == 'assign_chats' ||
          key == 'close_chats' ||
          key == 'create_contacts' ||
          key == 'edit_contacts';
    }
    // agent
    return key == 'view_dashboard' ||
        key == 'view_team_chats' ||
        key == 'view_contacts' ||
        key == 'create_contacts' ||
        key == 'edit_contacts' ||
        key == 'close_chats';
  }

  @override
  List<Object?> get props => [accessToken, refreshToken, user, organization];
}
