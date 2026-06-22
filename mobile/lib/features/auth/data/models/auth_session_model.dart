import 'package:json_annotation/json_annotation.dart';

import 'auth_user_model.dart';

part 'auth_session_model.g.dart';

/// `POST /auth/login` response: `{token, refresh_token, user}`.
@JsonSerializable()
class AuthSessionModel {
  const AuthSessionModel({
    required this.token,
    required this.refreshToken,
    required this.user,
  });

  final String token;
  @JsonKey(name: 'refresh_token')
  final String refreshToken;
  final AuthUserModel user;

  factory AuthSessionModel.fromJson(Map<String, dynamic> json) =>
      _$AuthSessionModelFromJson(json);

  Map<String, dynamic> toJson() => _$AuthSessionModelToJson(this);
}
