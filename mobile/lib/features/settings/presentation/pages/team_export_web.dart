import 'dart:convert';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

void exportCsv(String csv, String filename) {
  final bytes = utf8.encode(csv);
  final blob = web.Blob(
    [bytes.toJS].toJS,
    web.BlobPropertyBag(type: 'text/csv;charset=utf-8'),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename;
  anchor.click();
  web.URL.revokeObjectURL(url);
}