import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../domain/entities/place_result.dart';
import '../controllers/chat_providers.dart';

/// WhatsApp-style location picker: a map with a fixed centre pin, "send your
/// current location", nearby places, and place search. Pops with the chosen
/// [PlaceResult]; the caller sends it as a location message.
class SendLocationPage extends ConsumerStatefulWidget {
  const SendLocationPage({super.key});

  @override
  ConsumerState<SendLocationPage> createState() => _SendLocationPageState();
}

class _SendLocationPageState extends ConsumerState<SendLocationPage> {
  // Jakarta as a safe default until the device fix arrives.
  static const _fallback = LatLng(-6.2088, 106.8456);

  GoogleMapController? _map;
  LatLng? _current; // device GPS fix
  double? _accuracy;
  LatLng _target = _fallback; // map centre (the pin)
  bool _locating = true;

  List<PlaceResult> _nearby = const [];
  bool _loadingNearby = false;
  bool _moved = false; // user dragged the map away from their GPS fix

  final _searchCtrl = TextEditingController();
  Timer? _searchDebounce;
  List<PlaceResult> _searchResults = const [];
  bool _searching = false;
  bool _searchMode = false;

  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _map?.dispose();
    super.dispose();
  }

  Future<void> _initLocation() async {
    try {
      final serviceOn = await Geolocator.isLocationServiceEnabled();
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      final granted = perm == LocationPermission.always ||
          perm == LocationPermission.whileInUse;
      if (serviceOn && granted) {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(accuracy: LocationAccuracy.high),
        );
        final here = LatLng(pos.latitude, pos.longitude);
        if (!mounted) return;
        setState(() {
          _current = here;
          _accuracy = pos.accuracy;
          _target = here;
          _locating = false;
        });
        _map?.animateCamera(CameraUpdate.newLatLngZoom(here, 16));
        _fetchNearby(here);
        return;
      }
    } catch (_) {
      // Fall through to the fallback centre + a gentle hint.
    }
    if (!mounted) return;
    setState(() => _locating = false);
    _fetchNearby(_target);
  }

  Future<void> _fetchNearby(LatLng at) async {
    setState(() => _loadingNearby = true);
    try {
      final res = await ref
          .read(chatRemoteDataSourceProvider)
          .nearbyPlaces(at.latitude, at.longitude);
      if (mounted) setState(() => _nearby = res);
    } catch (_) {
      // Nearby is best-effort; the picker still works via current/pin/search.
    } finally {
      if (mounted) setState(() => _loadingNearby = false);
    }
  }

  void _onSearchChanged(String q) {
    _searchDebounce?.cancel();
    if (q.trim().isEmpty) {
      setState(() {
        _searchResults = const [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final res = await ref.read(chatRemoteDataSourceProvider).searchPlaces(
              q,
              lat: _current?.latitude ?? _target.latitude,
              lng: _current?.longitude ?? _target.longitude,
            );
        if (mounted && _searchCtrl.text.trim() == q.trim()) {
          setState(() => _searchResults = res);
        }
      } catch (_) {
        // Ignore; keep the last results.
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _sendCurrent() async {
    final here = _current;
    if (here == null) {
      AppSnackbar.show(context, 'Location unavailable. Enable GPS and retry.'.tr(context), isError: true);
      return;
    }
    final addr = await _reverseGeocode(here);
    if (!mounted) return;
    _pop(PlaceResult(
      name: 'Current location'.tr(context),
      address: addr,
      latitude: here.latitude,
      longitude: here.longitude,
    ));
  }

  Future<void> _sendPin() async {
    final addr = await _reverseGeocode(_target);
    if (!mounted) return;
    _pop(PlaceResult(
      name: 'Pinned location'.tr(context),
      address: addr,
      latitude: _target.latitude,
      longitude: _target.longitude,
    ));
  }

  Future<String> _reverseGeocode(LatLng at) async {
    try {
      final marks =
          await Geocoding().placemarkFromCoordinates(at.latitude, at.longitude);
      if (marks.isNotEmpty) {
        final m = marks.first;
        final parts = <String>[
          if ((m.street ?? '').isNotEmpty) m.street!,
          if ((m.subLocality ?? '').isNotEmpty) m.subLocality!,
          if ((m.locality ?? '').isNotEmpty) m.locality!,
          if ((m.administrativeArea ?? '').isNotEmpty) m.administrativeArea!,
        ];
        final seen = <String>{};
        final addr = parts.where((p) => seen.add(p)).join(', ');
        if (addr.isNotEmpty) return addr;
      }
    } catch (_) {}
    return '${at.latitude.toStringAsFixed(5)}, ${at.longitude.toStringAsFixed(5)}';
  }

  void _pop(PlaceResult place) {
    if (_sending) return;
    setState(() => _sending = true);
    Navigator.of(context).pop(place);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: _searchMode
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Search places'.tr(context),
                ),
              )
            : Text('Send location'.tr(context)),
        actions: [
          IconButton(
            icon: Icon(_searchMode ? Icons.close_rounded : Icons.search_rounded),
            tooltip: (_searchMode ? 'Close' : 'Search places').tr(context),
            onPressed: () => setState(() {
              _searchMode = !_searchMode;
              if (!_searchMode) {
                _searchCtrl.clear();
                _searchResults = const [];
              }
            }),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Map (upper ~44%) with a fixed centre pin, WhatsApp-style ──
          SizedBox(
            height: MediaQuery.of(context).size.height * 0.44,
            child: Stack(
              alignment: Alignment.center,
              children: [
                GoogleMap(
                  initialCameraPosition:
                      CameraPosition(target: _target, zoom: 15),
                  onMapCreated: (c) {
                    _map = c;
                    if (_current != null) {
                      c.animateCamera(
                          CameraUpdate.newLatLngZoom(_current!, 16));
                    }
                  },
                  onCameraMoveStarted: () {
                    if (!_moved) setState(() => _moved = true);
                  },
                  onCameraMove: (pos) => _target = pos.target,
                  myLocationEnabled: true,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                ),
                // Centre pin: its tip marks the point, so lift it half its height.
                const Padding(
                  padding: EdgeInsets.only(bottom: 40),
                  child: Icon(Icons.location_on_rounded,
                      size: 44, color: Color(0xFFEA4335)),
                ),
                if (_locating)
                  const Positioned(top: 12, child: _LocatingChip()),
                // Recenter to the GPS fix (small, like WhatsApp's corner button).
                Positioned(
                  right: 14,
                  bottom: 14,
                  child: Material(
                    color: theme.colorScheme.surface,
                    shape: const CircleBorder(),
                    elevation: 3,
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _current == null
                          ? null
                          : () {
                              _map?.animateCamera(
                                  CameraUpdate.newLatLngZoom(_current!, 16));
                              setState(() => _moved = false);
                            },
                      child: const Padding(
                        padding: EdgeInsets.all(10),
                        child: Icon(Icons.my_location_rounded,
                            color: AppColors.primary, size: 22),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // ── List: send options + (search results | nearby) ──
          Expanded(
            child: Container(
              color: theme.scaffoldBackgroundColor,
              child: _searchMode && _searchCtrl.text.trim().isNotEmpty
                  ? _searchList()
                  : _nearbyList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _nearbyList() {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const SizedBox(height: 4),
        // Once the map is dragged, the pinned point leads (WhatsApp puts the
        // chosen location first); otherwise "send current location" is primary.
        if (_moved)
          _sendRow(
            icon: Icons.location_on_rounded,
            iconBg: const Color(0xFFEA4335),
            title: 'Send this location'.tr(context),
            subtitle: 'Pinned on the map'.tr(context),
            onTap: _sending ? null : _sendPin,
          ),
        _sendRow(
          icon: Icons.near_me_rounded,
          iconBg: AppColors.primary,
          title: 'Send your current location'.tr(context),
          subtitle: _accuracy != null
              ? 'Accurate to {m} meters'
                  .trp(context, {'m': _accuracy!.round().toString()})
              : 'Locating...'.tr(context),
          onTap: (_sending || _current == null) ? null : _sendCurrent,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
          child: Text('Nearby places'.tr(context).toUpperCase(),
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: AppColors.textMuted)),
        ),
        if (_loadingNearby)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else if (_nearby.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            child: Text(
                'No nearby places found. Use search or drop a pin on the map.'
                    .tr(context),
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          )
        else
          for (final p in _nearby) _placeTile(p),
        const SizedBox(height: 16),
      ],
    );
  }

  /// A primary send row: a filled brand/red disc + title + subtitle, WhatsApp's
  /// "send current location" / "send this location" style.
  Widget _sendRow({
    required IconData icon,
    required Color iconBg,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
  }) {
    return ListTile(
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
      title: Text(title,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      subtitle: Text(subtitle),
      onTap: onTap,
    );
  }

  Widget _searchList() {
    if (_searching && _searchResults.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_searchResults.isEmpty) {
      return Center(
        child: Text('No places found'.tr(context),
            style: TextStyle(color: AppColors.textSecondary)),
      );
    }
    return ListView(
      padding: EdgeInsets.zero,
      children: [for (final p in _searchResults) _placeTile(p)],
    );
  }

  Widget _placeTile(PlaceResult p) {
    return ListTile(
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.10),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.location_on_rounded, color: AppColors.primary, size: 20),
      ),
      title: Text(p.name.isNotEmpty ? p.name : 'Location'.tr(context),
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      subtitle: p.address.isNotEmpty
          ? Text(p.address, maxLines: 1, overflow: TextOverflow.ellipsis)
          : null,
      onTap: _sending ? null : () => _pop(p),
    );
  }
}

class _LocatingChip extends StatelessWidget {
  const _LocatingChip();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Text('Finding your location...'.tr(context),
              style: const TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }
}
