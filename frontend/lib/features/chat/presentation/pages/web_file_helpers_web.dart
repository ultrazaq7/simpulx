// Web implementation - clipboard paste & file picker using dart:html
import 'dart:async';
import 'dart:html' as html;
import 'dart:typed_data';

StreamSubscription? initPasteListener(void Function(String name, Uint8List bytes) onImage) {
  return html.document.onPaste.listen((html.ClipboardEvent event) {
    final items = event.clipboardData?.items;
    if (items == null) return;

    final len = items.length ?? 0;
    for (var i = 0; i < len; i++) {
      final item = items[i];
      if (item == null) continue;
      if (item.type != null && item.type!.startsWith('image/')) {
        event.preventDefault();
        final blob = item.getAsFile();
        if (blob == null) continue;

        // Capture MIME before async - item may be invalid after event ends
        final mimeType = item.type!;
        final sub = mimeType.split('/').last.toLowerCase();
        final ext = _mimeToExt(sub);

        final reader = html.FileReader();
        reader.onLoadEnd.listen((_) {
          final result = reader.result;
          Uint8List? bytes;
          if (result is ByteBuffer) {
            bytes = Uint8List.view(result);
          } else if (result is Uint8List) {
            bytes = result;
          }
          if (bytes != null) {
            final name = 'pasted_image_${DateTime.now().millisecondsSinceEpoch}.$ext';
            onImage(name, bytes);
          }
        });
        reader.readAsArrayBuffer(blob);
        break;
      }
    }
  });
}

String _mimeToExt(String sub) {
  switch (sub) {
    case 'jpeg': return 'jpg';
    case 'png': return 'png';
    case 'gif': return 'gif';
    case 'webp': return 'webp';
    case 'bmp': return 'bmp';
    case 'svg+xml': return 'svg';
    case 'tiff': return 'tiff';
    default: return sub.isNotEmpty ? sub : 'png';
  }
}

Future<({String name, Uint8List bytes})?> pickFileForWeb() async {
  final input = html.FileUploadInputElement()..accept = '*/*';
  input.click();
  await input.onChange.first;

  final file = input.files?.isNotEmpty == true ? input.files!.first : null;
  if (file == null) return null;

  final reader = html.FileReader();
  final completer = Completer<Uint8List>();

  reader.onLoadEnd.listen((_) {
    final result = reader.result;
    if (result is ByteBuffer) {
      completer.complete(Uint8List.view(result));
    } else if (result is Uint8List) {
      completer.complete(result);
    } else {
      completer.completeError('Unexpected file reader result');
    }
  });

  reader.onError.listen((_) {
    completer.completeError('Failed to read the selected file');
  });

  reader.readAsArrayBuffer(file);
  final bytes = await completer.future;
  return (name: file.name, bytes: bytes);
}

/// Fetch bytes from a blob URL on web using XMLHttpRequest.
Future<Uint8List?> fetchBlobBytes(String blobUrl) async {
  try {
    final completer = Completer<Uint8List>();
    final xhr = html.HttpRequest();
    xhr.open('GET', blobUrl);
    xhr.responseType = 'arraybuffer';
    xhr.onLoad.listen((_) {
      final buf = xhr.response as ByteBuffer;
      completer.complete(Uint8List.view(buf));
    });
    xhr.onError.listen((_) {
      completer.completeError('XHR failed for blob URL');
    });
    xhr.send();
    return await completer.future;
  } catch (e) {
    return null;
  }
}
