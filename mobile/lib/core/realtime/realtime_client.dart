import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/app_config.dart';
import '../storage/secure_store.dart';
import 'realtime_event.dart';

enum RealtimeStatus { disconnected, connecting, connected }

/// Single, long-lived WebSocket connection to the realtime hub
/// (`wss://.../ws?token=<jwt>`).
///
/// - Reconnects with exponential backoff + jitter (capped 30s).
/// - The server pings every 30s; Dart's socket auto-pongs, and the server
///   closes a stale socket after 60s -> our `onDone` triggers a reconnect.
/// - Re-reads the access token on each (re)connect, so a token refreshed by the
///   REST layer is picked up automatically.
class RealtimeClient {
  RealtimeClient({required AppConfig config, required SecureStore secureStore})
      : _config = config,
        _secureStore = secureStore;

  final AppConfig _config;
  final SecureStore _secureStore;

  final _events = StreamController<RealtimeEvent>.broadcast();
  final _status = StreamController<RealtimeStatus>.broadcast();
  final _gaps = StreamController<int>.broadcast();

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _reconnectTimer;
  int _attempt = 0;
  bool _active = false;
  bool _disposed = false;
  RealtimeStatus _current = RealtimeStatus.disconnected;

  /// Highest per-org sequence seen on this connection; 0 = no baseline yet.
  int _lastSeq = 0;
  int _gapCount = 0;

  Stream<RealtimeEvent> get events => _events.stream;
  Stream<RealtimeStatus> get status => _status.stream;
  RealtimeStatus get currentStatus => _current;

  /// Emits whenever a gap in the event sequence is detected — i.e. the socket was
  /// up but we provably MISSED one or more events (Redis pub/sub is
  /// fire-and-forget, so this happens for real). Listeners must reconcile by
  /// refetching; without this the UI silently stays stale until a manual reload.
  Stream<int> get gaps => _gaps.stream;

  /// Begin connecting and keep the connection alive (idempotent).
  void start() {
    if (_disposed || _active) return;
    _active = true;
    _attempt = 0;
    _connect();
  }

  /// Stop the connection and suppress reconnects (call on logout).
  Future<void> stop() async {
    _active = false;
    _reconnectTimer?.cancel();
    await _teardownSocket();
    _setStatus(RealtimeStatus.disconnected);
  }

  /// Force an immediate reconnect (e.g. app resumed from background).
  void reconnectNow() {
    if (!_active || _disposed) return;
    _reconnectTimer?.cancel();
    _attempt = 0;
    _teardownSocket().then((_) => _connect());
  }

  Future<void> _connect() async {
    if (!_active || _disposed) return;
    _setStatus(RealtimeStatus.connecting);

    final token = await _secureStore.readAccessToken();
    if (token == null || token.isEmpty) {
      // No session yet; retry shortly in case login is in flight.
      _scheduleReconnect();
      return;
    }

    try {
      final channel = WebSocketChannel.connect(_config.wsUri(token));
      _channel = channel;
      await channel.ready; // throws on handshake failure (e.g. 401)
      if (!_active || _disposed) {
        await _teardownSocket();
        return;
      }
      _attempt = 0;
      // New connection -> the old sequence is meaningless (events during the gap
      // are gone for good). Re-baseline on the next event; the refetch that the
      // reconnect already triggers is what covers the missed window.
      _lastSeq = 0;
      _setStatus(RealtimeStatus.connected);
      _sub = channel.stream.listen(
        _onData,
        onError: (_) => _onClosed(),
        onDone: _onClosed,
        cancelOnError: true,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[realtime] connect failed: $e');
      _scheduleReconnect();
    }
  }

  void _onData(dynamic raw) {
    if (raw is! String) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return;
      final event = RealtimeEvent.tryParse(decoded);
      if (event == null) return;
      _checkSequence(event.seq);
      _events.add(event);
    } catch (_) {
      // Ignore malformed frames.
    }
  }

  /// Detect dropped events via the relay's per-org sequence.
  ///
  /// - seq == 0: the relay couldn't stamp it -> unknown, skip (no false alarm).
  /// - no baseline yet: adopt it (the first event after connect can be any
  ///   number; the reconnect refetch already covers what came before).
  /// - seq <= last: duplicate/replay, or Redis was wiped and the counter
  ///   restarted -> re-baseline and reconcile, since we can't reason about it.
  /// - seq > last + 1: we provably missed (seq - last - 1) events -> reconcile.
  void _checkSequence(int seq) {
    if (seq <= 0) return;
    final last = _lastSeq;
    _lastSeq = seq;
    if (last == 0) return; // first event on this connection: baseline only
    if (seq == last + 1) return; // in order, nothing missed
    if (kDebugMode) {
      debugPrint('[realtime] sequence gap: $last -> $seq (resyncing)');
    }
    if (!_gaps.isClosed) _gaps.add(++_gapCount);
  }

  void _onClosed() {
    if (!_active || _disposed) return;
    _setStatus(RealtimeStatus.disconnected);
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!_active || _disposed) return;
    _teardownSocket();
    final seconds = min(30, pow(2, _attempt).toInt());
    _attempt++;
    final delay = Duration(
      seconds: seconds,
      milliseconds: Random().nextInt(1000),
    );
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, _connect);
  }

  Future<void> _teardownSocket() async {
    await _sub?.cancel();
    _sub = null;
    await _channel?.sink.close();
    _channel = null;
  }

  void _setStatus(RealtimeStatus s) {
    _current = s;
    if (!_status.isClosed) _status.add(s);
  }

  Future<void> dispose() async {
    _disposed = true;
    _active = false;
    _reconnectTimer?.cancel();
    await _teardownSocket();
    await _events.close();
    await _status.close();
    await _gaps.close();
  }
}
