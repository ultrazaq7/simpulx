/// Canonical REST endpoint map for the Simpulx gateway (:8080).
///
/// Realigned to the CURRENT backend (`services/gateway`). The legacy app had
/// drifted (e.g. `/api/departments`, `/api/publishers`, per-field conversation
/// mutation routes, `/auth/change-password`) - those are intentionally absent.
/// Conversation mutations are a single `PATCH /api/conversations/{id}`.
class ApiEndpoints {
  ApiEndpoints._();

  // ── Auth ───────────────────────────────────────────────
  static const login = '/auth/login';
  static const refresh = '/auth/refresh';
  static const logout = '/auth/logout';
  static const forgotPassword = '/auth/forgot-password';
  static const resetPassword = '/auth/reset-password';

  // ── Current user / account ─────────────────────────────
  static const me = '/api/me';
  static const presence = '/api/users/me/presence'; // PATCH {is_online}
  static const fcmToken = '/api/users/fcm-token'; // POST {token, platform}
  static const accountPassword = '/api/account/password'; // POST
  static const accountEmail = '/api/account/email'; // POST

  // ── Conversations / inbox ──────────────────────────────
  static const conversations = '/api/conversations';
  static String conversation(String id) => '/api/conversations/$id';
  static String messages(String id) => '/api/conversations/$id/messages';
  static String messageSearch(String id) =>
      '/api/conversations/$id/messages/search';
  // OG preview for a URL in a chat message (server-side fetch).
  static const linkPreview = '/api/link-preview';
  static String assign(String id) => '/api/conversations/$id/assign';
  static String close(String id) => '/api/conversations/$id/close';
  static String snooze(String id) => '/api/conversations/$id/snooze';
  static String bot(String id) => '/api/conversations/$id/bot';
  static String notes(String id) => '/api/conversations/$id/notes';
  static String calls(String id) => '/api/conversations/$id/calls';

  // ── WebRTC calling (WhatsApp Business Calling API) ─────
  static const callRequestPermission = '/api/calls/request-permission';
  static const callInitiate = '/api/calls/initiate';
  static String callAccept(String id) => '/api/calls/$id/accept';
  static String callReject(String id) => '/api/calls/$id/reject';
  static String callEnd(String id) => '/api/calls/$id/end';
  static String callInfo(String id) => '/api/calls/$id';
  static String summary(String id) => '/api/conversations/$id/summary'; // SSE

  // ── Pipeline ───────────────────────────────────────────
  static const stages = '/api/stages';
  static const dispositions = '/api/dispositions';

  // ── Quick replies ──────────────────────────────────────
  static const quickReplies = '/api/quick-replies';
  static String quickReply(String id) => '/api/quick-replies/$id';

  // ── Contacts / leads ───────────────────────────────────
  static const contacts = '/api/contacts';
  static String contact(String id) => '/api/contacts/$id';
  static String contactActivity(String id) => '/api/contacts/$id/activity';

  // ── Agents / team ──────────────────────────────────────
  static const agents = '/api/agents';
  static const users = '/api/users';
  static String user(String id) => '/api/users/$id';
  static const rolePermissions = '/api/role-permissions';

  // ── Dashboard / analytics ──────────────────────────────
  static const stats = '/api/stats';
  static const dashboardCards = '/api/dashboard/cards';
  static const analytics = '/api/analytics';
  static const adPerformance = '/api/ad-performance';

  // ── Media ──────────────────────────────────────────────
  static const uploads = '/api/uploads'; // multipart

  // ── Notifications ──────────────────────────────────────
  static const notifications = '/api/notifications';
  static const notificationsRead = '/api/notifications/read';

  // ── Back-office (Workspace hub, role-gated) ────────────
  static const broadcasts = '/api/broadcasts';
  static const templates = '/api/templates';
  static const channels = '/api/channels';
  static const campaigns = '/api/campaigns';
  static const automations = '/api/automations';
  static const adAccounts = '/api/ad-accounts';
  static const webApiSources = '/api/web-api-sources';
  static const auditLog = '/api/audit-log';
  static const organization = '/api/organization';

  /// Endpoints that must NOT carry the access token / trigger refresh.
  static const Set<String> public = {
    login,
    refresh,
    forgotPassword,
    resetPassword,
  };
}
