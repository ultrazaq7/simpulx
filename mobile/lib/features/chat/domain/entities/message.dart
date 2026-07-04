import 'package:equatable/equatable.dart';

enum MessageDirection { inbound, outbound }

enum MessageSenderType { contact, agent, bot, system }

enum MessageType { text, image, audio, video, document, file, sticker, template, interactive, unsupported, call, contacts, location, reaction }

/// Includes a local-only `sending` status for optimistic bubbles.
enum MessageStatus { sending, queued, sent, delivered, read, failed }

MessageDirection directionFromWire(String? v) =>
    v == 'outbound' ? MessageDirection.outbound : MessageDirection.inbound;

MessageSenderType senderTypeFromWire(String? v) => switch (v) {
      'agent' => MessageSenderType.agent,
      'bot' => MessageSenderType.bot,
      'system' => MessageSenderType.system,
      _ => MessageSenderType.contact,
    };

MessageType messageTypeFromWire(String? v) => switch (v) {
      'image' => MessageType.image,
      'audio' => MessageType.audio,
      'video' => MessageType.video,
      'document' => MessageType.document,
      'file' => MessageType.file,
      'sticker' => MessageType.sticker,
      'template' => MessageType.template,
      'interactive' => MessageType.interactive,
      'unsupported' => MessageType.unsupported,
      'call' => MessageType.call,
      'contacts' => MessageType.contacts,
      'location' => MessageType.location,
      'reaction' => MessageType.reaction,
      _ => MessageType.text,
    };

MessageStatus messageStatusFromWire(String? v) => switch (v) {
      'queued' => MessageStatus.queued,
      'sent' => MessageStatus.sent,
      'delivered' => MessageStatus.delivered,
      'read' => MessageStatus.read,
      'failed' => MessageStatus.failed,
      _ => MessageStatus.sent,
    };

class Message extends Equatable {
  const Message({
    required this.id,
    required this.direction,
    required this.senderType,
    required this.type,
    required this.body,
    required this.status,
    required this.createdAt,
    this.mediaUrl,
    this.metadata,
    this.pending = false,
  });

  final String id;
  final MessageDirection direction;
  final MessageSenderType senderType;
  final MessageType type;
  final String body;
  final String? mediaUrl;
  /// Rich per-type payload (CTWA ad referral, shared contacts, location).
  final Map<String, dynamic>? metadata;
  final MessageStatus status;
  final DateTime createdAt;

  /// CTWA ad creative the customer arrived from (image/headline/body/link).
  Map<String, dynamic>? get referral =>
      metadata?['referral'] is Map ? Map<String, dynamic>.from(metadata!['referral'] as Map) : null;

  /// Shared contact card(s).
  List<Map<String, dynamic>> get contacts => metadata?['contacts'] is List
      ? (metadata!['contacts'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : const [];

  /// Shared pinned location.
  Map<String, dynamic>? get location =>
      metadata?['location'] is Map ? Map<String, dynamic>.from(metadata!['location'] as Map) : null;

  /// True for an optimistic bubble not yet confirmed by `message.persisted`.
  final bool pending;

  /// Outbound (agent/bot/system) messages render on the right.
  bool get isMine => direction == MessageDirection.outbound;

  bool get hasMedia => mediaUrl != null && mediaUrl!.isNotEmpty;

  Message copyWith(
      {String? id, MessageStatus? status, bool? pending, String? mediaUrl}) {
    return Message(
      id: id ?? this.id,
      direction: direction,
      senderType: senderType,
      type: type,
      body: body,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      metadata: metadata,
      status: status ?? this.status,
      createdAt: createdAt,
      pending: pending ?? this.pending,
    );
  }

  @override
  List<Object?> get props =>
      [id, direction, senderType, type, body, mediaUrl, metadata, status, createdAt, pending];
}
