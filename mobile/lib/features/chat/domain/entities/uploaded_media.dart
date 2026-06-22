/// Result of `POST /api/uploads` -> `{url, type, name}`.
/// `type` is the server-derived media category (image/audio/video/document)
/// and is used directly as the outbound message `type`.
class UploadedMedia {
  const UploadedMedia({
    required this.url,
    required this.type,
    required this.name,
  });

  final String url;
  final String type;
  final String name;
}
