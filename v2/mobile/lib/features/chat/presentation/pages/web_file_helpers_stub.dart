// Stub for non-web platforms - paste listener is web-only
import 'dart:async';
import 'dart:typed_data';

/// On mobile, clipboard paste is not supported.
/// Returns a null cancel callback (no-op).
void Function()? initPasteListener(void Function(String name, Uint8List bytes) onImage) {
  return null;
}

/// Web-only file picker using FileUploadInputElement.
/// On mobile, returns null - the caller should use file_picker package instead.
Future<({String name, Uint8List bytes})?> pickFileForWeb() async {
  return null;
}

/// Stub for non-web - not needed on native.
Future<Uint8List?> fetchBlobBytes(String blobUrl) async {
  return null;
}
