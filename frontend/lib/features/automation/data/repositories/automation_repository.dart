// ============================================================
// Automation Repository - Real API (No Mocks)
// ============================================================
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';

class AutomationRepository {
  final _dio = di.sl<DioClient>().dio;

  // ── Rules CRUD ───────────────────────────────────────────

  Future<List<Map<String, dynamic>>> getRules() async {
    final response = await _dio.get(ApiConstants.automationRules);
    final data = response.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map && data['data'] is List) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return [];
  }

  Future<Map<String, dynamic>> getRule(String id) async {
    final response = await _dio.get(ApiConstants.automationRule(id));
    return Map<String, dynamic>.from(response.data);
  }

  Future<Map<String, dynamic>> createRule(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConstants.automationRules, data: data);
    return Map<String, dynamic>.from(response.data);
  }

  Future<Map<String, dynamic>> updateRule(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _dio.patch(
      ApiConstants.automationRule(id),
      data: data,
    );
    return Map<String, dynamic>.from(response.data);
  }

  Future<void> deleteRule(String id) async {
    await _dio.delete(ApiConstants.automationRule(id));
  }

  Future<Map<String, dynamic>> toggleRule(String id, bool isActive) async {
    final response = await _dio.patch(
      ApiConstants.automationRule(id),
      data: {'isActive': !isActive},
    );
    return Map<String, dynamic>.from(response.data);
  }

  // ── WhatsApp Channels ─────────────────────────────────────

  Future<List<Map<String, dynamic>>> getChannels() async {
    final response = await _dio.get(ApiConstants.channels);
    final data = response.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map && data['data'] is List) {
      return List<Map<String, dynamic>>.from(data['data']);
    }
    return [];
  }

  // ── Flow (nodes/edges) - stored in rule's triggerConditions.flow ──

  Future<Map<String, dynamic>> getFlow(String ruleId) async {
    final rule = await getRule(ruleId);
    final conditions = rule['triggerConditions'] as Map<String, dynamic>? ?? {};
    return {
      'nodes': conditions['flowNodes'] ?? [],
      'edges': conditions['flowEdges'] ?? [],
    };
  }

  Future<void> saveFlow(
    String ruleId, {
    required List<Map<String, dynamic>> nodes,
    required List<Map<String, dynamic>> edges,
  }) async {
    final rule = await getRule(ruleId);
    final conditions =
        Map<String, dynamic>.from(rule['triggerConditions'] ?? {});
    conditions['flowNodes'] = nodes;
    conditions['flowEdges'] = edges;
    await _dio.patch(
      ApiConstants.automationRule(ruleId),
      data: {'triggerConditions': conditions},
    );
  }
}
