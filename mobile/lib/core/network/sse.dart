import 'dart:async';
import 'dart:convert';

import '../error/app_exception.dart';

/// Decodes a byte stream of Server-Sent Events into text deltas.
///
/// Frames are `data: {json}\n\n` where json is one of:
///   `{"text": "<delta>"}` (emit), `{"done": true}` (complete),
///   `{"error": "..."}` (throws [ServerException]).
/// Handles frames split across byte chunks via an internal buffer.
Stream<String> decodeSseText(Stream<List<int>> bytes) async* {
  var buffer = '';
  await for (final chunk in bytes) {
    buffer += utf8.decode(chunk, allowMalformed: true);
    while (true) {
      final sep = buffer.indexOf('\n\n');
      if (sep < 0) break;
      final frame = buffer.substring(0, sep);
      buffer = buffer.substring(sep + 2);
      for (final line in frame.split('\n')) {
        final trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        final payload = trimmed.substring(5).trim();
        if (payload.isEmpty) continue;
        final obj = jsonDecode(payload) as Map<String, dynamic>;
        if (obj['error'] != null) {
          throw ServerException(obj['error'].toString());
        }
        if (obj['done'] == true) return;
        final text = obj['text'];
        if (text is String && text.isNotEmpty) yield text;
      }
    }
  }
}
