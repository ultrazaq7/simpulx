/// A place returned by the send-location picker (Google Places proxy) or built
/// from a dropped pin / the device's current position.
class PlaceResult {
  const PlaceResult({
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String name;
  final String address;
  final double latitude;
  final double longitude;

  factory PlaceResult.fromJson(Map<String, dynamic> j) => PlaceResult(
        name: (j['name'] ?? '').toString(),
        address: (j['address'] ?? '').toString(),
        latitude: (j['latitude'] as num?)?.toDouble() ?? 0,
        longitude: (j['longitude'] as num?)?.toDouble() ?? 0,
      );
}
