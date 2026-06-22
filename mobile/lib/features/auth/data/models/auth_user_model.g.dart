// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_user_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuthUserModel _$AuthUserModelFromJson(Map<String, dynamic> json) =>
    AuthUserModel(
      id: json['id'] as String,
      orgId: json['org_id'] as String,
      role: json['role'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      avatar: json['avatar'] as String?,
      isOnline: json['is_online'] as bool?,
    );

Map<String, dynamic> _$AuthUserModelToJson(AuthUserModel instance) =>
    <String, dynamic>{
      'id': instance.id,
      'org_id': instance.orgId,
      'role': instance.role,
      'name': instance.name,
      'email': instance.email,
      'avatar': instance.avatar,
      'is_online': instance.isOnline,
    };
