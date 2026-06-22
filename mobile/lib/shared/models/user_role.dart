/// User roles as defined by the backend (`services/gateway`): owner, admin,
/// manager, agent. Drives RBAC gating in the UI (the server still enforces).
enum UserRole {
  owner,
  admin,
  manager,
  agent,
  unknown;

  static UserRole fromString(String? raw) {
    switch (raw?.toLowerCase()) {
      case 'owner':
        return UserRole.owner;
      case 'admin':
        return UserRole.admin;
      case 'manager':
        return UserRole.manager;
      case 'agent':
        return UserRole.agent;
      default:
        return UserRole.unknown;
    }
  }

  String get wire => this == UserRole.unknown ? 'agent' : name;

  /// Owner/admin can reach team, roles, channels, org settings.
  bool get isAdminTier => this == UserRole.owner || this == UserRole.admin;

  /// Manager and above see the Live-Ops dashboard + unassigned queues.
  bool get isManagerTier => isAdminTier || this == UserRole.manager;

  String get label => switch (this) {
        UserRole.owner => 'Owner',
        UserRole.admin => 'Admin',
        UserRole.manager => 'Manager',
        UserRole.agent => 'Agent',
        UserRole.unknown => 'Member',
      };
}
