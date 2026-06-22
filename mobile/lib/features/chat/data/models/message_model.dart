import '../../../../core/utils/json_parse.dart';
import '../../domain/entities/message.dart';

/// Maps a `GET /api/conversations/{id}/messages` row to a [Message].
class MessageModel {
  MessageModel._();

  static Message fromJson(Map<String, dynamic> json) {
    return Message(
      id: asString(json['id']),
      direction: directionFromWire(asStringOrNull(json['direction'])),
      senderType: senderTypeFromWire(asStringOrNull(json['sender_type'])),
      type: messageTypeFromWire(asStringOrNull(json['type'])),
      body: asString(json['body']),
      mediaUrl: asStringOrNull(json['media_url']),
      status: messageStatusFromWire(asStringOrNull(json['status'])),
      createdAt: asDateOrNull(json['created_at']) ?? DateTime.now(),
    );
  }
}
