import type { Agent, AIAgent, Analytics, AuditEntry, Automation, AutomationAction, AutomationDetail, AutomationFlow, Broadcast, Campaign, CampaignAnalyticsRow, CampaignDetail, Channel, Contact, Conversation, Department, InternalNote, KnowledgeSource, Message, Organization, OrgSettings, QuickReply, RolePermissions, Sequence, SequenceDetail, SequenceStep, Stats, DashboardCards, Template, TemplateButton, TemplateComponents, User, UserAccount, UserActivity, WebApiSource } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8082";

// ── Session (token + user di localStorage) ──────────────────
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("simpulx_token");
}
export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("simpulx_user");
  return raw ? (JSON.parse(raw) as User) : null;
}
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("simpulx_refresh");
}
export function setSession(token: string, user: User, refresh?: string) {
  localStorage.setItem("simpulx_token", token);
  localStorage.setItem("simpulx_user", JSON.stringify(user));
  if (refresh) localStorage.setItem("simpulx_refresh", refresh);
}
export function clearSession() {
  localStorage.removeItem("simpulx_token");
  localStorage.removeItem("simpulx_user");
  localStorage.removeItem("simpulx_refresh");
}
// App UI language. Single source for now (English); wire to real i18n later.
export function getAppLang(): string {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("simpulx_lang") || "en";
}

// Single-flight access-token refresh: when the short-lived access token expires
// many in-flight requests can 401 at once; they all await the same /auth/refresh
// call (rotating the refresh token), then retry — so the user is never bounced
// to /login mid-session. Only a hard refresh failure clears the session.
let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(API + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data?.token) return false;
        localStorage.setItem("simpulx_token", data.token);
        if (data.refresh_token) localStorage.setItem("simpulx_refresh", data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function req<T>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const token = getToken();
  const res = await fetch(API + path, {
    cache: "no-store",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // Access token likely expired — try one silent refresh + retry before giving up.
    if (!retried && (await refreshAccessToken())) {
      return req<T>(path, opts, true);
    }
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : (res.text() as unknown)) as Promise<T>;
}

export const api = {
  async login(email: string, password: string): Promise<{ token: string; refresh_token: string; user: User }> {
    const res = await fetch(API + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Incorrect email or password");
    return res.json();
  },
  async logout(): Promise<void> {
    const rt = getRefreshToken();
    if (!rt) return;
    try {
      await fetch(API + "/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
    } catch { /* best effort: server-side revoke */ }
  },
  async forgotPassword(email: string): Promise<{ message: string }> {
    const res = await fetch(API + "/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Request failed");
    return res.json();
  },
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch(API + "/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Reset failed");
    return res.json();
  },
  // Stream an on-demand AI briefing (SSE). Calls onChunk for each token; resolves when done.
  async streamSummary(convId: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<void> {
    const token = getToken();
    const res = await fetch(`${API}/api/conversations/${convId}/summary?lang=${encodeURIComponent(getAppLang())}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || "Summary failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || ""; // keep the trailing partial line for the next chunk
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data) continue;
        let evt: { text?: string; error?: string; done?: boolean };
        try { evt = JSON.parse(data); } catch { continue; }
        if (evt.error) throw new Error(evt.error);
        if (typeof evt.text === "string") onChunk(evt.text);
      }
    }
  },
  me: () => req<User>("/api/me"),
  listConversations: (status = "") =>
    req<Conversation[]>(`/api/conversations${status ? `?status=${status}` : ""}`),
  getMessages: (id: string) => req<Message[]>(`/api/conversations/${id}/messages`),
  getMessagesPaginated: (id: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append("cursor", cursor);
    return req<{ data: Message[]; next_cursor: string | null }>(`/api/conversations/${id}/messages?${params.toString()}`);
  },
  searchMessages: (id: string, query: string) =>
    req<{ data: Message[] }>(`/api/conversations/${id}/messages/search?q=${encodeURIComponent(query)}`),
  sendMessage: (id: string, body: string) =>
    req(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  sendMedia: (id: string, type: string, mediaUrl: string, caption: string) =>
    req(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ type, media_url: mediaUrl, body: caption }) }),
  async uploadFile(file: File): Promise<{ url: string; type: string; name: string }> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API + "/api/uploads", {
      method: "POST",
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: fd,
    });
    if (!res.ok) throw new Error((await res.text()) || "upload failed");
    return res.json();
  },
  assign: (id: string, agentId?: string) =>
    req(`/api/conversations/${id}/assign`, { method: "POST", body: JSON.stringify(agentId ? { agent_id: agentId } : {}) }),
  close: (id: string, reason = "resolved") =>
    req(`/api/conversations/${id}/close`, { method: "POST", body: JSON.stringify({ reason }) }),
  toggleBot: (id: string, active: boolean) =>
    req(`/api/conversations/${id}/bot`, { method: "POST", body: JSON.stringify({ active }) }),
  listAgents: () => req<Agent[]>("/api/agents"),
  listKnowledge: () => req<KnowledgeSource[]>("/api/knowledge"),
  addKnowledge: (title: string, content: string) =>
    req("/api/knowledge", { method: "POST", body: JSON.stringify({ title, content }) }),
  deleteKnowledge: (id: string) =>
    req(`/api/knowledge/${id}`, { method: "DELETE" }),
  getAIAgent: () => req<AIAgent | null>("/api/ai-agent"),
  updateAIAgent: (patch: Partial<AIAgent>) =>
    req<AIAgent>("/api/ai-agent", { method: "PUT", body: JSON.stringify(patch) }),
  listLLMModels: () => req<{ id: string; name: string }[]>("/api/llm-models"),
  getStats: (campaignId?: string) => req<Stats>(`/api/stats${campaignId ? `?campaign_id=${campaignId}` : ""}`),
  getDashboardCards: () => req<DashboardCards>("/api/dashboard/cards"),
  getAnalytics: (campaignId?: string) => req<Analytics>(`/api/analytics${campaignId ? `?campaign_id=${campaignId}` : ""}`),
  listQuickReplies: () => req<QuickReply[]>("/api/quick-replies"),
  createQuickReply: (shortcut: string, title: string, body: string) =>
    req("/api/quick-replies", { method: "POST", body: JSON.stringify({ shortcut, title, body }) }),
  deleteQuickReply: (id: string) => req(`/api/quick-replies/${id}`, { method: "DELETE" }),
  getNotes: (convId: string) => req<InternalNote[]>(`/api/conversations/${convId}/notes`),
  addNote: (convId: string, body: string) =>
    req(`/api/conversations/${convId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  listStages: () => req<import("./types").Stage[]>("/api/stages"),
  listDispositions: () => req<import("./types").Disposition[]>("/api/dispositions"),
  patchConversation: (id: string, patch: { stage_id?: string; disposition_id?: string; interest_level?: string; unread_count?: number }) =>
    req(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listContacts: () => req<Contact[]>("/api/contacts"),
  createContact: (body: { full_name?: string; phone?: string; tags?: string[] }) =>
    req<Contact>("/api/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, body: { full_name?: string; phone?: string; tags?: string[]; blacklisted?: boolean }) =>
    req<void>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteContact: (id: string) => req<void>(`/api/contacts/${id}`, { method: "DELETE" }),
  listBroadcasts: () => req<Broadcast[]>("/api/broadcasts"),
  createBroadcast: (input: {
    name: string; body?: string; template_id?: string; scheduled_at?: string;
    channel_id?: string; audience?: string; tags?: string[]; contact_ids?: string[]; send_now?: boolean;
  }) => req<{ id: string; total_recipients: number; status: string }>("/api/broadcasts", { method: "POST", body: JSON.stringify(input) }),
  getBroadcast: (id: string) => req<import("./types").BroadcastDetail>(`/api/broadcasts/${id}`),
  listBroadcastRecipients: (id: string) => req<import("./types").BroadcastRecipient[]>(`/api/broadcasts/${id}/recipients`),
  sendBroadcast: (id: string) => req<{ status: string }>(`/api/broadcasts/${id}/send`, { method: "POST" }),
  retryBroadcast: (id: string) => req<{ status: string; retried: number }>(`/api/broadcasts/${id}/retry`, { method: "POST" }),
  deleteBroadcast: (id: string) => req<void>(`/api/broadcasts/${id}`, { method: "DELETE" }),
  testSendBroadcast: (input: { channel_id?: string; contact_id: string; body?: string; template_id?: string }) =>
    req<{ status: string }>("/api/broadcasts/test-send", { method: "POST", body: JSON.stringify(input) }),
  // ── Templates (WhatsApp HSM) ──
  listTemplates: (filters?: { channel_id?: string; campaign_id?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.channel_id) qs.set("channel_id", filters.channel_id);
    if (filters?.campaign_id) qs.set("campaign_id", filters.campaign_id);
    const q = qs.toString();
    return req<Template[]>(`/api/templates${q ? `?${q}` : ""}`);
  },
  createTemplate: (input: {
    name: string; category: string; language: string; header_type?: string; header_text?: string;
    header_media_url?: string; body: string; footer?: string; buttons?: TemplateButton[]; variables?: string[];
    channel_id?: string; campaign_ids?: string[]; template_type?: string; components?: TemplateComponents;
  }) => req<{ id: string; status: string }>("/api/templates", { method: "POST", body: JSON.stringify(input) }),
  updateTemplate: (id: string, patch: {
    name?: string; category?: string; language?: string; header_type?: string; header_text?: string;
    header_media_url?: string; body?: string; footer?: string; buttons?: TemplateButton[]; variables?: string[];
    channel_id?: string; campaign_ids?: string[]; template_type?: string; components?: TemplateComponents;
  }) => req(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTemplate: (id: string) => req<{ status: string; warning?: string }>(`/api/templates/${id}`, { method: "DELETE" }),
  submitTemplate: (id: string) => req<{ status: string; simulated: boolean }>(`/api/templates/${id}/submit`, { method: "POST" }),
  // ── Users (org accounts) ──
  listUsers: () => req<UserAccount[]>("/api/users"),
  createUser: (input: { email: string; full_name: string; role?: string; password?: string }) =>
    req<{ id: string }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (id: string, patch: { full_name?: string; email?: string; role?: string; status?: string; password?: string }) =>
    req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // Self presence (online/offline). Writes is_online only; never the account status.
  setPresence: (online: boolean) =>
    req<{ is_online: boolean }>("/api/users/me/presence", { method: "PATCH", body: JSON.stringify({ online }) }),
  // Agent-performance + billing metrics from the activity log (self, or privileged for any user).
  getUserActivity: (id: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return req<UserActivity>(`/api/users/${id}/activity${qs ? `?${qs}` : ""}`);
  },
  deleteUser: (id: string) => req(`/api/users/${id}`, { method: "DELETE" }),
  // ── Role permissions ──
  getRolePermissions: () => req<RolePermissions>("/api/role-permissions"),
  updateRolePermissions: (doc: RolePermissions) =>
    req<RolePermissions>("/api/role-permissions", { method: "PUT", body: JSON.stringify(doc) }),
  // ── Departments ──
  listDepartments: () => req<Department[]>("/api/departments"),
  createDepartment: (name: string) => req<{ id: string }>("/api/departments", { method: "POST", body: JSON.stringify({ name }) }),
  updateDepartment: (id: string, name: string) => req(`/api/departments/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteDepartment: (id: string) => req(`/api/departments/${id}`, { method: "DELETE" }),
  // ── Organization (workspace settings) ──
  getOrganization: () => req<Organization>("/api/organization"),
  updateOrganization: (patch: { name?: string; settings?: OrgSettings }) =>
    req<Organization>("/api/organization", { method: "PATCH", body: JSON.stringify(patch) }),
  // ── Audit log ──
  listAuditLog: () => req<AuditEntry[]>("/api/audit-log"),
  systemLog: <T,>(kind: "messages" | "conversations" | "calls", p: { limit?: number; offset?: number; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (p.limit != null) q.set("limit", String(p.limit));
    if (p.offset != null) q.set("offset", String(p.offset));
    if (p.from) q.set("from", p.from);
    if (p.to) q.set("to", p.to);
    const qs = q.toString();
    return req<import("./types").LogPage<T>>(`/api/system-logs/${kind}${qs ? "?" + qs : ""}`);
  },
  // ── Web API lead sources ──
  listWebApiSources: () => req<WebApiSource[]>("/api/web-api-sources"),
  createWebApiSource: (input: { name: string; slug?: string; auto_assign_dept_id?: string; auto_template_name?: string; webhook_url?: string }) =>
    req<{ id: string }>("/api/web-api-sources", { method: "POST", body: JSON.stringify(input) }),
  updateWebApiSource: (id: string, patch: { name?: string; slug?: string; auto_assign_dept_id?: string; auto_template_name?: string; webhook_url?: string; is_active?: boolean }) =>
    req(`/api/web-api-sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  regenerateWebApiKey: (id: string) => req<{ api_key: string }>(`/api/web-api-sources/${id}/regenerate-key`, { method: "POST" }),
  deleteWebApiSource: (id: string) => req(`/api/web-api-sources/${id}`, { method: "DELETE" }),
  // ── Campaigns ──
  listCampaigns: () => req<Campaign[]>("/api/campaigns"),
  getCampaignAnalytics: () => req<CampaignAnalyticsRow[]>("/api/analytics/campaigns"),
  // ── Sequences (drip / follow-up) ──
  listSequences: () => req<Sequence[]>("/api/sequences"),
  getSequence: (id: string) => req<SequenceDetail>(`/api/sequences/${id}`),
  createSequence: (input: { name: string; trigger?: string; campaign_id?: string; steps: SequenceStep[] }) =>
    req<{ id: string }>("/api/sequences", { method: "POST", body: JSON.stringify(input) }),
  updateSequence: (id: string, patch: { name?: string; trigger?: string; campaign_id?: string; is_active?: boolean; steps?: SequenceStep[] }) =>
    req(`/api/sequences/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSequence: (id: string) => req(`/api/sequences/${id}`, { method: "DELETE" }),
  getCampaign: (id: string) => req<CampaignDetail>(`/api/campaigns/${id}`),
  createCampaign: (input: { name: string; dealer_name?: string; routing_strategy?: string; channel_id?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[]; calling_enabled?: boolean }) =>
    req<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify(input) }),
  updateCampaign: (id: string, patch: { name?: string; dealer_name?: string; status?: string; routing_strategy?: string; channel_id?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[]; calling_enabled?: boolean }) =>
    req(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCampaign: (id: string) => req(`/api/campaigns/${id}`, { method: "DELETE" }),
  // ── Channels ──
  listChannels: () => req<Channel[]>("/api/channels"),
  createChannel: (input: {
    type: string; name: string;
    phone_number_id?: string; waba_id?: string; access_token?: string;
    display_id?: string; config?: Record<string, unknown>;
  }) => req<{ id: string; status: string }>("/api/channels", { method: "POST", body: JSON.stringify(input) }),
  updateChannel: (id: string, patch: { name?: string; is_active?: boolean; display_id?: string; access_token?: string; config?: Record<string, unknown>; calling_enabled?: boolean }) =>
    req(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChannel: (id: string) => req(`/api/channels/${id}`, { method: "DELETE" }),
  testChannel: (id: string) => req<{ status: string }>(`/api/channels/${id}/test`, { method: "POST" }),

  // Ad performance
  listAdAccounts: () => req<import("./types").AdAccount[]>("/api/ad-accounts"),
  createAdAccount: (input: { platform: string; external_account_id: string; name?: string; access_token: string; config?: Record<string, unknown> }) =>
    req<{ id: string; sync_error?: string }>("/api/ad-accounts", { method: "POST", body: JSON.stringify(input) }),
  deleteAdAccount: (id: string) => req<void>(`/api/ad-accounts/${id}`, { method: "DELETE" }),
  syncAdAccount: (id: string) => req<{ ok: boolean }>(`/api/ad-accounts/${id}/sync`, { method: "POST" }),
  listAdCampaigns: () => req<import("./types").AdCampaignRow[]>("/api/ad-campaigns"),
  mapAdCampaign: (id: string, campaign_id: string | null) =>
    req<{ ok: boolean }>(`/api/ad-campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ campaign_id }) }),
  adPerformance: (from?: string, to?: string, campaign_id?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from); if (to) q.set("to", to); if (campaign_id) q.set("campaign_id", campaign_id);
    const qs = q.toString();
    return req<import("./types").AdPerformance>(`/api/ad-performance${qs ? "?" + qs : ""}`);
  },
  // ── Automations ──
  listAutomations: () => req<Automation[]>("/api/automations"),
  getAutomation: (id: string) => req<AutomationDetail>(`/api/automations/${id}`),
  createAutomation: (input: {
    name: string; description?: string; trigger_type: string;
    trigger_config?: Record<string, unknown>; channel_id?: string; actions?: AutomationAction[];
  }) => req<{ id: string }>("/api/automations", { method: "POST", body: JSON.stringify(input) }),
  updateAutomation: (id: string, patch: {
    name?: string; description?: string; trigger_type?: string;
    trigger_config?: Record<string, unknown>; channel_id?: string;
    actions?: AutomationAction[]; flow?: AutomationFlow; is_active?: boolean;
  }) => req(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAutomation: (id: string) => req(`/api/automations/${id}`, { method: "DELETE" }),
  // ── WhatsApp Business Calling API ──
  requestCallPermission: (conversationId: string) =>
    req<{ call_id: string; status: string }>("/api/calls/request-permission", { method: "POST", body: JSON.stringify({ conversation_id: conversationId }) }),
  initiateCall: (callId: string, sdpOffer: string) =>
    req<{ call_id: string; status: string }>("/api/calls/initiate", { method: "POST", body: JSON.stringify({ call_id: callId, sdp_offer: sdpOffer }) }),
  acceptCall: (callId: string, sdpAnswer: string) =>
    req<{ call_id: string; status: string }>(`/api/calls/${callId}/accept`, { method: "POST", body: JSON.stringify({ sdp_answer: sdpAnswer }) }),
  rejectCall: (callId: string) =>
    req<{ status: string }>(`/api/calls/${callId}/reject`, { method: "POST" }),
  endCall: (callId: string) =>
    req<{ status: string; duration_seconds: number }>(`/api/calls/${callId}/end`, { method: "POST" }),
  getCall: (callId: string) =>
    req<Record<string, unknown>>(`/api/calls/${callId}`),
};
