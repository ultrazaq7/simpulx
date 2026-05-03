// ============================================================
// WebSocket Service - Socket.io Client
// ============================================================
import 'dart:async';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:simpulx/core/constants/api_constants.dart';

class WebSocketService {
  io.Socket? _socket;
  final FlutterSecureStorage _storage;

  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  final _conversationController = StreamController<Map<String, dynamic>>.broadcast();
  final _typingController = StreamController<Map<String, dynamic>>.broadcast();
  final _agentStatusController = StreamController<Map<String, dynamic>>.broadcast();

  // Public streams
  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;
  Stream<Map<String, dynamic>> get conversationStream => _conversationController.stream;
  Stream<Map<String, dynamic>> get typingStream => _typingController.stream;
  Stream<Map<String, dynamic>> get agentStatusStream => _agentStatusController.stream;

  bool get isConnected => _socket?.connected ?? false;

  WebSocketService({required FlutterSecureStorage storage}) : _storage = storage;

  // ── Connect ───────────────────────────────────────────
  Future<void> connect() async {
    final token = await _storage.read(key: 'access_token');
    if (token == null) return;

    _socket = io.io(
      '${ApiConstants.wsUrl}/chat',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .setReconnectionAttempts(double.maxFinite.toInt())
          .build(),
    );

    _socket!.onConnect((_) {
      print('🔌 WebSocket connected');
    });

    _socket!.onDisconnect((_) {
      print('🔌 WebSocket disconnected');
    });

    _socket!.onConnectError((error) {
      print('❌ WebSocket connection error: $error');
    });

    // ── Listen to events ──────────────────────────────
    _socket!.on('message:new', (data) {
      _messageController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('conversation:new', (data) {
      _conversationController.add({
        'type': 'new',
        ...Map<String, dynamic>.from(data),
      });
    });

    _socket!.on('conversation:updated', (data) {
      _conversationController.add({
        'type': 'updated',
        ...Map<String, dynamic>.from(data),
      });
    });

    _socket!.on('typing:start', (data) {
      _typingController.add({
        'isTyping': true,
        ...Map<String, dynamic>.from(data),
      });
    });

    _socket!.on('typing:stop', (data) {
      _typingController.add({
        'isTyping': false,
        ...Map<String, dynamic>.from(data),
      });
    });

    _socket!.on('agent:online', (data) {
      _agentStatusController.add({
        'isOnline': true,
        ...Map<String, dynamic>.from(data),
      });
    });

    _socket!.on('agent:offline', (data) {
      _agentStatusController.add({
        'isOnline': false,
        ...Map<String, dynamic>.from(data),
      });
    });
  }

  // ── Join/Leave Conversation Room ──────────────────────
  void joinConversation(String conversationId) {
    _socket?.emit('conversation:join', {'conversationId': conversationId});
  }

  void leaveConversation(String conversationId) {
    _socket?.emit('conversation:leave', {'conversationId': conversationId});
  }

  // ── Typing Indicators ────────────────────────────────
  void startTyping(String conversationId) {
    _socket?.emit('typing:start', {'conversationId': conversationId});
  }

  void stopTyping(String conversationId) {
    _socket?.emit('typing:stop', {'conversationId': conversationId});
  }

  // ── Reconnect (e.g., on app resume) ────────────────────
  void reconnectIfNeeded() {
    if (_socket != null && !_socket!.connected) {
      _socket!.connect();
    }
  }

  // ── Disconnect ────────────────────────────────────────
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _conversationController.close();
    _typingController.close();
    _agentStatusController.close();
  }
}
