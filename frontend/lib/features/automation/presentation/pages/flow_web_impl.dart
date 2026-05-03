// Web implementation - flow export/import using browser APIs
import 'dart:convert';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

void exportFlowJson(String json, String filename) {
  final bytes = utf8.encode(json);
  final blob = web.Blob(
    [bytes.toJS].toJS,
    web.BlobPropertyBag(type: 'application/json'),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename;
  anchor.click();
  web.URL.revokeObjectURL(url);
}

void importFlowJson(void Function(String content) onLoaded) {
  final input = web.HTMLInputElement()
    ..type = 'file'
    ..accept = '.json';
  input.click();
  input.addEventListener(
      'change',
      (web.Event _) {
        final file = input.files?.item(0);
        if (file == null) return;
        final reader = web.FileReader();
        reader.readAsText(file);
        reader.addEventListener(
            'loadend',
            (web.Event _) {
              try {
                final result = (reader.result as JSString).toDart;
                onLoaded(result);
              } catch (_) {}
            }.toJS);
      }.toJS);
}
