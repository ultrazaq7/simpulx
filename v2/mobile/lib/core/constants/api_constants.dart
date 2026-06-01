// ============================================================
// API Constants
// ============================================================
import 'package:flutter/foundation.dart';

class ApiConstants {
  ApiConstants._();

  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:8080';
    return 'http://10.0.2.2:8080';
  }

  static String get wsUrl {
    if (kIsWeb) return 'ws://localhost:8082/ws';
    return 'ws://10.0.2.2:8082/ws';
  }

  // Auth
  static const String login = '/auth/login';
  static const String register = '/api/users'; // fallback
  static const String refresh = '/auth/refresh';
  static const String changePassword = '/auth/change-password';
  static const String createAccount = '/api/users';
  static const String invite = '/api/users';

  // Chat
  static const String conversations = '/api/conversations';
  static const String conversationFilters = '/api/conversation-filters';
  static String messages(String convId) =>
      '/api/conversations/$convId/messages';
  static String assignAgent(String convId) =>
      '/api/conversations/$convId/assign';
  static String markRead(String convId) => '/api/conversations/$convId/read';
  static String conversationStatus(String convId) =>
      '/api/conversations/$convId/status';
  static String conversationStage(String convId) =>
      '/api/conversations/$convId/stage';
  static String conversationInterestLevel(String convId) =>
      '/api/conversations/$convId/interest-level';
  static String conversationNotes(String convId) =>
      '/api/conversations/$convId/notes';
  static String conversationNote(String convId, String noteId) =>
      '/api/conversations/$convId/notes/$noteId';

  // Stages
  static const String stages = '/api/stages';
  static const String stagesActive = '/api/stages/active';
  static String stage(String id) => '/api/stages/$id';

  // Dispositions (legacy settings screen still uses this endpoint)
  static const String dispositions = '/api/dispositions';

  // Contacts
  static const String contacts = '/api/contacts';
  static String contact(String id) => '/api/contacts/$id';

  // Departments
  static const String departments = '/api/departments';
  static String department(String id) => '/api/departments/$id';

  // Users
  static const String users = '/api/users';
  static String user(String id) => '/api/users/$id';
  static String deleteUserPermanent(String id) => '/api/users/$id/permanent';
  static String reactivateUser(String id) => '/api/users/$id/reactivate';

  // Audit Logs
  static const String auditLogs = '/api/audit-logs';
  static const String auditLogMessages = '/api/audit-logs/messages';
  static const String auditLogConversations = '/api/audit-logs/conversations';

  // Organization
  static const String organization = '/api/organization';
  static const String agents = '/api/agents'; // mapped to handleListAgents
  static const String rolePermissions = '/api/organization/role-permissions';

  // Dashboard
  static const String dashboardStats = '/api/stats';

  // Automation
  static const String automationRules = '/api/automations';
  static String automationRule(String id) => '/api/automations/$id';
  static String automationRuleToggle(String id) =>
      '/api/automations/$id/toggle';

  // Broadcasts
  static const String broadcasts = '/api/broadcasts';
  static String broadcast(String id) => '/api/broadcasts/$id';
  static String broadcastSend(String id) => '/api/broadcasts/$id/send';
  static const String broadcastTestSend = '/api/broadcasts/test-send';

  // Quick Replies
  static const String quickReplies = '/api/quick-replies';
  static const String quickReplyCategories = '/api/quick-replies/categories';
  static String quickReply(String id) => '/api/quick-replies/$id';

  // WhatsApp Channels
  static const String channels = '/api/channels';
  static const String channelEmbeddedSignup = '/api/channels/embedded-signup';
  static String channel(String id) => '/api/channels/$id';
  static String channelTest(String id) => '/api/channels/$id/test';
  static String channelTemplates(String channelId) =>
      '/api/channels/$channelId/templates';
  static String channelTemplatesSync(String channelId) =>
      '/api/channels/$channelId/templates/sync';
  static String channelTemplate(String channelId, String templateId) =>
      '/api/channels/$channelId/templates/$templateId';
  static String channelTemplateDepartments(
          String channelId, String templateId) =>
      '/api/channels/$channelId/templates/$templateId/departments';

  // Meta Channels
  static const String metaChannels = '/api/meta-channels';
  static String metaChannel(String id) => '/api/meta-channels/$id';
  static String metaChannelTest(String id) => '/api/meta-channels/$id/test';

  // Chat Templates
  static String sendTemplate(String conversationId) =>
      '/api/conversations/$conversationId/send-template';

  // Publishers
  static const String publishers = '/api/publishers';
  static String publisher(String id) => '/api/publishers/$id';
  static String publisherRegenKey(String id) =>
      '/api/publishers/$id/regenerate-key';
}
