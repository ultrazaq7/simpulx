// ============================================================
// Contact Model (JSON Serializable)
// ============================================================
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/features/contacts/domain/entities/contact_entity.dart';

class ContactModel extends ContactEntity {
  const ContactModel({
    required super.id,
    super.whatsappId,
    super.instagramId,
    super.facebookId,
    super.phone,
    super.email,
    super.name,
    super.avatarUrl,
    super.tags,
    super.metadata,
    super.notes,
    super.isBlocked,
    super.sourceChannel,
    super.firstSeenAt,
    super.lastSeenAt,
    required super.createdAt,
  });

  factory ContactModel.fromJson(Map<String, dynamic> json) {
    return ContactModel(
      id: json['id'] as String,
      whatsappId: json['whatsappId'] ?? json['whatsapp_id'],
      instagramId: json['instagramId'] ?? json['instagram_id'],
      facebookId: json['facebookId'] ?? json['facebook_id'],
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] ?? json['avatar_url'],
      tags: (json['tags'] as List<dynamic>?)?.cast<String>() ?? [],
      metadata: json['metadata'] is Map
          ? Map<String, dynamic>.from(json['metadata'])
          : {},
      notes: json['notes'] as String?,
      isBlocked: json['isBlocked'] ?? json['is_blocked'] ?? false,
      sourceChannel: json['sourceChannel'] ?? json['source_channel'],
      firstSeenAt: json['firstSeenAt'] != null
          ? AppDateTime.parseLocal(json['firstSeenAt'])
          : null,
      lastSeenAt: json['lastSeenAt'] != null
          ? AppDateTime.parseLocal(json['lastSeenAt'])
          : (json['last_seen_at'] != null
              ? AppDateTime.parseLocal(json['last_seen_at'])
              : null),
      createdAt: json['createdAt'] != null
          ? AppDateTime.parseLocalOrNow(json['createdAt'])
          : (json['created_at'] != null
              ? AppDateTime.parseLocalOrNow(json['created_at'])
              : DateTime.now()),
    );
  }
}
