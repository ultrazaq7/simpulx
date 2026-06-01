// Web implementation - clipboard paste & file picker using package:web
import 'dart:async';
import 'package:web/web.dart' as web;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

void Function()? initPasteListener(
    void Function(String name, Uint8List bytes) onImage) {
  final jsListener = ((web.Event e) {
    final event = e as web.ClipboardEvent;
    final items = event.clipboardData?.items;
    if (items == null) return;

    final len = items.length;
    for (var i = 0; i < len; i++) {
      final item = items.getProperty<web.DataTransferItem?>(i.toJS);
      if (item != null && item.type.startsWith('image/')) {
        event.preventDefault();
        final blob = item.getAsFile();
        if (blob == null) continue;

        final mimeType = item.type;
        final sub = mimeType.split('/').last.toLowerCase();
        final ext = _mimeToExt(sub);

        final reader = web.FileReader();
        reader.onloadend = ((web.ProgressEvent _) {
          final result = reader.result;
          Uint8List? bytes;
          if (result != null) {
            final arrayBuffer = result as JSArrayBuffer;
            bytes = arrayBuffer.toDart.asUint8List();
          }
          if (bytes != null) {
            final name =
                'pasted_image_${DateTime.now().millisecondsSinceEpoch}.$ext';
            onImage(name, bytes);
          }
        }).toJS;
        reader.readAsArrayBuffer(blob);
        break;
      }
    }
  }).toJS;

  web.document.addEventListener('paste', jsListener);
  return () => web.document.removeEventListener('paste', jsListener);
}

String _mimeToExt(String sub) {
  switch (sub) {
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'webp':
      return 'webp';
    case 'bmp':
      return 'bmp';
    case 'svg+xml':
      return 'svg';
    case 'tiff':
      return 'tiff';
    default:
      return sub.isNotEmpty ? sub : 'png';
  }
}

Future<({String name, Uint8List bytes})?> pickFileForWeb() async {
  final input = web.document.createElement('input') as web.HTMLInputElement;
  input.type = 'file';
  input.accept = '*/*';

  final completer = Completer<({String name, Uint8List bytes})?>();

  input.onchange = ((web.Event _) {
    final files = input.files;
    if (files == null || files.length == 0) {
      completer.complete(null);
      return;
    }
    final file = files.item(0)!;

    final reader = web.FileReader();
    reader.onloadend = ((web.ProgressEvent _) {
      final result = reader.result;
      if (result != null) {
        final arrayBuffer = result as JSArrayBuffer;
        final bytes = arrayBuffer.toDart.asUint8List();
        completer.complete((name: file.name, bytes: bytes));
      } else {
        completer.completeError('Unexpected file reader result');
      }
    }).toJS;

    reader.onerror = ((web.ProgressEvent _) {
      completer.completeError('Failed to read the selected file');
    }).toJS;

    reader.readAsArrayBuffer(file);
  }).toJS;

  input.click();
  return completer.future;
}

/// Fetch bytes from a blob URL on web using fetch.
Future<Uint8List?> fetchBlobBytes(String blobUrl) async {
  try {
    final response = await web.window.fetch(blobUrl.toJS).toDart;
    final arrayBuffer = await response.arrayBuffer().toDart;
    return arrayBuffer.toDart.asUint8List();
  } catch (e) {
    return null;
  }
}
