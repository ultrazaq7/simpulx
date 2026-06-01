import 'dart:js_interop';
import 'package:web/web.dart' as html;

void webDownloadFile(String url, String filename) {
  // Fetch the file as a blob, then create a same-origin blob URL for download.
  // This bypasses the cross-origin restriction on the anchor download attribute.
  html.window.fetch(url.toJS).toDart.then((response) {
    response.blob().toDart.then((blob) {
      final blobUrl = html.URL.createObjectURL(blob);
      final anchor = html.HTMLAnchorElement()
        ..href = blobUrl
        ..download = filename;
      html.document.body?.append(anchor);
      anchor.click();
      anchor.remove();
      html.URL.revokeObjectURL(blobUrl);
    });
  });
}
