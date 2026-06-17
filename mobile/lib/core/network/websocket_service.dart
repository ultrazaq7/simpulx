// ============================================================
// WebSocket Service - Standard WebSocket Channel
// ============================================================
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:simpulx/core/constants/api_constants.dart';

class WebSocketService {
  WebSocketChannel? _channel;
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

  bool _isConnected = false;
  bool get isConnected => _isConnected;

  WebSocketService({required FlutterSecureStorage storage}) : _storage = storage;

  // ── Connect ───────────────────────────────────────────
  Future<void> connect() async {
    final token = await _storage.read(key: 'access_token');
    final orgDataStr = await _storage.read(key: 'org_data');
    if (token == null || orgDataStr == null) return;

    try {
      final orgData = jsonDecode(orgDataStr) as Map<String, dynamic>;
      final orgId = orgData['id'] as String;

      final wsUri = Uri.parse('${ApiConstants.wsUrl}?org=$orgId');
      
      _channel = WebSocketChannel.connect(wsUri);
      _isConnected = true;
      debugPrint('🔌 WebSocket connected to $wsUri');

      _channel!.stream.listen(
        (message) {
          _handleIncomingMessage(message);
        },
        onDone: () {
          _isConnected = false;
          debugPrint('🔌 WebSocket disconnected');
          // Implement simple reconnect logic
          Future.delayed(const Duration(seconds: 5), () {
            reconnectIfNeeded();
          });
        },
        onError: (error) {
          _isConnected = false;
          debugPrint('❌ WebSocket connection error: $error');
        },
      );
    } catch (e) {
      debugPrint('❌ WebSocket setup error: $e');
    }
  }

  void _handleIncomingMessage(dynamic rawMessage) {
    try {
      final data = jsonDecode(rawMessage as String) as Map<String, dynamic>;
      final eventType = data['type'] as String?;
      final payload = data['payload'] as Map<String, dynamic>? ?? data;

      switch (eventType) {
        case 'message:new':
          _messageController.add(payload);
          break;
        case 'conversation:new':
          _conversationController.add({
            'type': 'new',
            ...payload,
          });
          break;
        case 'conversation:updated':
          _conversationController.add({
            'type': 'updated',
            ...payload,
          });
          break;
        case 'typing:start':
          _typingController.add({
            'isTyping': true,
            ...payload,
          });
          break;
        case 'typing:stop':
          _typingController.add({
            'isTyping': false,
            ...payload,
          });
          break;
        case 'agent:online':
          _agentStatusController.add({
            'isOnline': true,
            ...payload,
          });
          break;
        case 'agent:offline':
          _agentStatusController.add({
            'isOnline': false,
            ...payload,
          });
          break;
        default:
          debugPrint('⚠️ Unknown websocket event: $eventType');
      }
    } catch (e) {
      debugPrint('Error parsing websocket message: $e');
    }
  }

  // ── Send Methods ──────────────────────────────────────
  void _sendEvent(String eventType, Map<String, dynamic> payload) {
    if (_isConnected && _channel != null) {
      _channel!.sink.add(jsonEncode({
        'type': eventType,
        'payload': payload,
      }));
    }
  }

  // ── Join/Leave Conversation Room ──────────────────────
  void joinConversation(String conversationId) {
    _sendEvent('conversation:join', {'conversationId': conversationId});
  }

  void leaveConversation(String conversationId) {
    _sendEvent('conversation:leave', {'conversationId': conversationId});
  }

  // ── Typing Indicators ────────────────────────────────
  void startTyping(String conversationId) {
    _sendEvent('typing:start', {'conversationId': conversationId});
  }

  void stopTyping(String conversationId) {
    _sendEvent('typing:stop', {'conversationId': conversationId});
  }

  // ── Reconnect (e.g., on app resume) ────────────────────
  void reconnectIfNeeded() {
    if (!_isConnected) {
      connect();
    }
  }

  // ── Disconnect ────────────────────────────────────────
  void disconnect() {
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _conversationController.close();
    _typingController.close();
    _agentStatusController.close();
  }
}
