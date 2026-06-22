import 'package:json_annotation/json_annotation.dart';

import '../../../../shared/models/auth_user.dart';
import '../../../../shared/models/user_role.dart';

part 'auth_user_model.g.dart';

/// Wire model for the backend user object. Maps snake_case JSON to the
/// [AuthUser] entity.
@JsonSerializable()
class AuthUserModel {
  const AuthUserModel({
    required this.id,
    required this.orgId,
    required this.role,
    required this.name,
    required this.email,
    this.avatar,
    this.isOnline,
  });

  final String id;
  @JsonKey(name: 'org_id')
  final String orgId;
  final String role;
  final String name;
  final String email;
  final String? avatar;
  @JsonKey(name: 'is_online')
  final bool? isOnline;

  factory AuthUserModel.fromJson(Map<String, dynamic> json) =>
      _$AuthUserModelFromJson(json);

  Map<String, dynamic> toJson() => _$AuthUserModelToJson(this);

  AuthUser toEntity() => AuthUser(
        id: id,
        orgId: orgId,
        role: UserRole.fromString(role),
        name: name,
        email: email,
        avatarUrl: (avatar == null || avatar!.isEmpty) ? null : avatar,
        isOnline: isOnline ?? false,
      );
}
