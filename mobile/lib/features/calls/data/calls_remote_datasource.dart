import 'package:dio/dio.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/error_mapper.dart';
import '../../../core/utils/json_parse.dart';

/// Result of requesting call permission. [granted] short-circuits straight to
/// placing the call (the customer already approved within the window).
class CallPermission {
  const CallPermission({required this.callId, required this.granted});
  final String callId;
  final bool granted;
}

/// Signaling transport for the WhatsApp Business Calling API (via the gateway).
class CallsRemoteDataSource {
  CallsRemoteDataSource(this._dio);
  final Dio _dio;

  /// POST /api/calls/request-permission {conversation_id}
  /// -> {call_id, status: "granted"|"requesting"|...}.
  Future<CallPermission> requestPermission(String conversationId) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.callRequestPermission,
        data: {'conversation_id': conversationId},
      );
      final m = (res.data as Map).cast<String, dynamic>();
      return CallPermission(
        callId: asString(m['call_id']),
        granted: asString(m['status']) == 'granted',
      );
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }

  /// POST /api/calls/initiate {call_id, sdp_offer}.
  Future<void> initiate({
    required String callId,
    required String sdpOffer,
  }) =>
      _post(ApiEndpoints.callInitiate, {'call_id': callId, 'sdp_offer': sdpOffer});

  /// POST /api/calls/{id}/accept {sdp_answer} (inbound).
  Future<void> accept({required String callId, required String sdpAnswer}) =>
      _post(ApiEndpoints.callAccept(callId), {'sdp_answer': sdpAnswer});

  /// POST /api/calls/{id}/reject.
  Future<void> reject(String callId) =>
      _post(ApiEndpoints.callReject(callId), const {});

  /// POST /api/calls/{id}/end.
  Future<void> end(String callId) =>
      _post(ApiEndpoints.callEnd(callId), const {});

  Future<void> _post(String path, Map<String, dynamic> body) async {
    try {
      await _dio.post(path, data: body);
    } on DioException catch (e) {
      throw ErrorMapper.fromDio(e);
    }
  }
}
