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
  RealtimeClient({
    required AppConfig config,
    required SecureStore secureStore,
    Future<String?> Function()? refreshToken,
  })  : _config = config,
        _secureStore = secureStore,
        _refreshToken = refreshToken;

  final AppConfig _config;
  final SecureStore _secureStore;

  /// Forces a token refresh (shared single-flight with the REST layer). The WS
  /// doesn't go through Dio, so without this an expired access token left the
  /// socket permanently rejected ("token is expired") until some REST call
  /// happened to refresh it — realtime silently died every ~15 min.
  final Future<String?> Function()? _refreshToken;
  // One refresh attempt per connect chain, so a genuinely dead session can't
  // spin the refresh endpoint. Reset on every successful connect.
  bool _authRetried = false;

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

  // App-level heartbeat. A mobile TCP socket frequently dies SILENTLY (WiFi<->cell
  // handoff, carrier NAT timeout) with no close frame, so `onDone` never fires and
  // the client keeps believing it's connected — the UI then sits stale until the
  // server's 60s read deadline reaps it, which is exactly what makes users
  // pull-to-refresh. We ping on an interval and reconnect the moment we've heard
  // nothing back within the liveness window, so a dead link self-heals in seconds.
  Timer? _heartbeat;
  DateTime _lastActivity = DateTime.now();
  static const _pingInterval = Duration(seconds: 15);
  static const _livenessTimeout = Duration(seconds: 35); // ~2 missed pings

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

    var token = await _secureStore.readAccessToken();
    if (token == null || token.isEmpty) {
      // No/blank access token: try a refresh (we may still hold a valid refresh
      // token) before giving up and backing off.
      token = await _maybeRefresh();
      if (token == null || token.isEmpty) {
        _scheduleReconnect();
        return;
      }
    }

    try {
      final channel = WebSocketChannel.connect(_config.wsUri(token));
      _channel = channel;
      await channel.ready; // throws on handshake failure (e.g. 401 expired token)
      if (!_active || _disposed) {
        await _teardownSocket();
        return;
      }
      _attempt = 0;
      _authRetried = false; // healthy connection: allow a fresh refresh next time
      // New connection -> the old sequence is meaningless (events during the gap
      // are gone for good). Re-baseline on the next event; the refetch that the
      // reconnect already triggers is what covers the missed window.
      _lastSeq = 0;
      _lastActivity = DateTime.now();
      _setStatus(RealtimeStatus.connected);
      _sub = channel.stream.listen(
        _onData,
        onError: (_) => _onClosed(),
        onDone: _onClosed,
        cancelOnError: true,
      );
      _startHeartbeat();
    } catch (e) {
      if (kDebugMode) debugPrint('[realtime] connect failed: $e');
      // The #1 handshake failure in prod is an EXPIRED access token — the WS
      // doesn't go through Dio, so nothing refreshed it. Refresh once and retry
      // immediately before falling back to backoff; this is what stops realtime
      // from dying every ~15 min until the user pulls to refresh.
      if (!_authRetried) {
        final fresh = await _maybeRefresh();
        if (fresh != null && fresh.isNotEmpty) {
          _authRetried = true;
          await _teardownSocket();
          _connect();
          return;
        }
      }
      _scheduleReconnect();
    }
  }

  Future<String?> _maybeRefresh() async {
    final cb = _refreshToken;
    if (cb == null) return null;
    try {
      return await cb();
    } catch (_) {
      return null;
    }
  }

  void _onData(dynamic raw) {
    // ANY frame proves the link is alive — feed the liveness watchdog.
    _lastActivity = DateTime.now();
    if (raw is! String) return;
    // Heartbeat reply: liveness only, never a real event.
    if (raw.contains('"type":"pong"')) return;
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

  void _startHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(_pingInterval, (_) {
      if (!_active || _disposed) return;
      // Heard nothing back within the window -> the socket is silently dead.
      // Reconnect now (which re-baselines + triggers the catch-up refetch), so a
      // dead link self-heals in seconds instead of leaving the UI stale.
      if (DateTime.now().difference(_lastActivity) > _livenessTimeout) {
        if (kDebugMode) {
          debugPrint('[realtime] liveness timeout -> forcing reconnect');
        }
        reconnectNow();
        return;
      }
      try {
        _channel?.sink.add('{"type":"ping"}');
      } catch (_) {
        // Sink already broken; onDone/onError will drive the reconnect.
      }
    });
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
    _heartbeat?.cancel();
    _heartbeat = null;
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
