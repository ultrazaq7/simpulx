// Native implementation - uses dart:io
import 'dart:io';
import 'dart:typed_data';

Future<Uint8List?> readFileBytes(String path) async {
  final file = File(path);
  if (await file.exists()) {
    final bytes = await file.readAsBytes();
    // Clean up temp file
    file.delete().catchError((_) => file);
    return bytes;
  }
  return null;
}
