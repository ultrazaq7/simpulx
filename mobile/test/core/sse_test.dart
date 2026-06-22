import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:simpulx/core/error/app_exception.dart';
import 'package:simpulx/core/network/sse.dart';

Stream<List<int>> _bytes(List<String> chunks) async* {
  for (final c in chunks) {
    yield utf8.encode(c);
  }
}

void main() {
  test('yields text deltas and stops at done', () async {
    final out = await decodeSseText(_bytes([
      'data: {"text": "Hello"}\n\n',
      'data: {"text": " world"}\n\ndata: {"done": true}\n\n',
      'data: {"text": "after done"}\n\n',
    ])).toList();
    expect(out, ['Hello', ' world']);
  });

  test('reassembles frames split across byte chunks', () async {
    final out = await decodeSseText(_bytes([
      'data: {"text": "Par',
      'tial"}\n\nda',
      'ta: {"text": "!"}\n\n',
      'data: {"done": true}\n\n',
    ])).toList();
    expect(out, ['Partial', '!']);
  });

  test('throws ServerException on an error frame', () async {
    final stream = decodeSseText(_bytes([
      'data: {"error": "generation failed"}\n\n',
    ]));
    await expectLater(stream.toList(), throwsA(isA<ServerException>()));
  });
}
