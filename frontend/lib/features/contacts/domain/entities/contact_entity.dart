// ============================================================
// Contact Entity (Domain)
// ============================================================
import 'package:equatable/equatable.dart';

class ContactEntity extends Equatable {
  final String id;
  final String? whatsappId;
  final String? instagramId;
  final String? facebookId;
  final String? phone;
  final String? email;
  final String? name;
  final String? avatarUrl;
  final List<String> tags;
  final Map<String, dynamic> metadata;
  final String? notes;
  final bool isBlocked;
  final String? sourceChannel;
  final DateTime? firstSeenAt;
  final DateTime? lastSeenAt;
  final DateTime createdAt;

  const ContactEntity({
    required this.id,
    this.whatsappId,
    this.instagramId,
    this.facebookId,
    this.phone,
    this.email,
    this.name,
    this.avatarUrl,
    this.tags = const [],
    this.metadata = const {},
    this.notes,
    this.isBlocked = false,
    this.sourceChannel,
    this.firstSeenAt,
    this.lastSeenAt,
    required this.createdAt,
  });

  String get displayName => name ?? phone ?? whatsappId ?? 'Unknown';

  @override
  List<Object?> get props => [id, name, phone, email, whatsappId, tags, isBlocked, lastSeenAt];
}
