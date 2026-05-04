// ============================================================
// API Constants
// ============================================================

class ApiConstants {
  ApiConstants._();

  static const String baseUrl = 'https://app.simpulx.com/api/v1';
  static const String wsUrl = 'https://app.simpulx.com';

  // Auth
  static const String login = '/auth/login';
  static const String register = '/auth/register';
  static const String refresh = '/auth/refresh';
  static const String changePassword = '/auth/change-password';
  static const String createAccount = '/auth/create-account';
  static const String invite = '/auth/invite';

  // Chat
  static const String conversations = '/chat/conversations';
  static const String conversationFilters = '/chat/conversation-filters';
  static String messages(String convId) =>
      '/chat/conversations/$convId/messages';
  static String assignAgent(String convId) =>
      '/chat/conversations/$convId/assign';
  static String markRead(String convId) => '/chat/conversations/$convId/read';
  static String conversationStatus(String convId) =>
      '/chat/conversations/$convId/status';
  static String conversationStage(String convId) =>
      '/chat/conversations/$convId/stage';
  static String conversationInterestLevel(String convId) =>
      '/chat/conversations/$convId/interest-level';
  static String conversationNotes(String convId) =>
      '/chat/conversations/$convId/notes';
  static String conversationNote(String convId, String noteId) =>
      '/chat/conversations/$convId/notes/$noteId';

  // Stages
  static const String stages = '/stages';
  static const String stagesActive = '/stages/active';
  static String stage(String id) => '/stages/$id';

  // Dispositions (legacy settings screen still uses this endpoint)
  static const String dispositions = '/dispositions';

  // Contacts
  static const String contacts = '/contacts';
  static String contact(String id) => '/contacts/$id';

  // Departments
  static const String departments = '/departments';
  static String department(String id) => '/departments/$id';

  // Users
  static const String users = '/users';
  static String user(String id) => '/users/$id';
  static String deleteUserPermanent(String id) => '/users/$id/permanent';
  static String reactivateUser(String id) => '/users/$id/reactivate';

  // Audit Logs
  static const String auditLogs = '/audit-logs';
  static const String auditLogMessages = '/audit-logs/messages';
  static const String auditLogConversations = '/audit-logs/conversations';

  // Organization
  static const String organization = '/organization';
  static const String agents = '/organization/agents';
  static const String rolePermissions = '/organization/role-permissions';

  // Dashboard
  static const String dashboardStats = '/dashboard/stats';

  // Automation
  static const String automationRules = '/automation/rules';
  static String automationRule(String id) => '/automation/rules/$id';
  static String automationRuleToggle(String id) =>
      '/automation/rules/$id/toggle';

  // Broadcasts
  static const String broadcasts = '/broadcasts';
  static String broadcast(String id) => '/broadcasts/$id';
  static String broadcastSend(String id) => '/broadcasts/$id/send';
  static const String broadcastTestSend = '/broadcasts/test-send';

  // Quick Replies
  static const String quickReplies = '/quick-replies';
  static const String quickReplyCategories = '/quick-replies/categories';
  static String quickReply(String id) => '/quick-replies/$id';

  // WhatsApp Channels
  static const String channels = '/channels';
  static const String channelEmbeddedSignup = '/channels/embedded-signup';
  static String channel(String id) => '/channels/$id';
  static String channelTest(String id) => '/channels/$id/test';
  static String channelTemplates(String channelId) =>
      '/channels/$channelId/templates';
  static String channelTemplatesSync(String channelId) =>
      '/channels/$channelId/templates/sync';
  static String channelTemplate(String channelId, String templateId) =>
      '/channels/$channelId/templates/$templateId';
  static String channelTemplateDepartments(
          String channelId, String templateId) =>
      '/channels/$channelId/templates/$templateId/departments';

  // Meta Channels
  static const String metaChannels = '/meta-channels';
  static String metaChannel(String id) => '/meta-channels/$id';
  static String metaChannelTest(String id) => '/meta-channels/$id/test';

  // Chat Templates
  static String sendTemplate(String conversationId) =>
      '/chat/conversations/$conversationId/send-template';

  // Publishers
  static const String publishers = '/publishers';
  static String publisher(String id) => '/publishers/$id';
  static String publisherRegenKey(String id) =>
      '/publishers/$id/regenerate-key';
}
