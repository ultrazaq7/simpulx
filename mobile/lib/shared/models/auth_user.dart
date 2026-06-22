import 'package:equatable/equatable.dart';

import 'user_role.dart';

/// The signed-in user. Cross-cutting (session, settings, chat assignment), so
/// it lives in `shared/` rather than a single feature.
///
/// Shapes (verified against `services/gateway`):
///   - `/auth/login` user: {id, org_id, role, name, email, is_online, avatar}
///   - `/api/me`:          {id, org_id, role, name, email, avatar}
class AuthUser extends Equatable {
  const AuthUser({
    required this.id,
    required this.orgId,
    required this.role,
    required this.name,
    required this.email,
    this.avatarUrl,
    this.isOnline = false,
  });

  final String id;
  final String orgId;
  final UserRole role;
  final String name;
  final String email;
  final String? avatarUrl;
  final bool isOnline;

  String get initials {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  AuthUser copyWith({bool? isOnline, String? name, String? avatarUrl}) {
    return AuthUser(
      id: id,
      orgId: orgId,
      role: role,
      name: name ?? this.name,
      email: email,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isOnline: isOnline ?? this.isOnline,
    );
  }

  @override
  List<Object?> get props => [id, orgId, role, name, email, avatarUrl, isOnline];
}
