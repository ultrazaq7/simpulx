import type { Agent, AIAgent, Analytics, AppNotification, AuditEntry, Automation, AutomationAction, AutomationDetail, AutomationFlow, Broadcast, Campaign, CampaignAnalyticsRow, CampaignDetail, Channel, Contact, Conversation, InternalNote, KnowledgeSource, Message, Organization, OrgSettings, QuickReply, RolePermissions, Stats, DashboardCards, Template, TemplateButton, TemplateComponents, User, UserAccount, UserActivity, WebApiSource, SourcePlatform, WaFlow, WaFlowDetail, WaFlowResponse, FlowDefinition, GoogleSheetsInfo, OrgRow, CatalogItem } from "./types";

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

// Build the ?campaign_id&channel_id&agent_id query string for analytics endpoints.
function analyticsQs(f?: { campaign_id?: string; channel_id?: string; agent_id?: string; source?: string; from?: string; to?: string }): string {
  if (!f) return "";
  const q = new URLSearchParams();
  if (f.campaign_id) q.set("campaign_id", f.campaign_id);
  if (f.channel_id) q.set("channel_id", f.channel_id);
  if (f.agent_id) q.set("agent_id", f.agent_id);
  if (f.source) q.set("source", f.source);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  const qs = q.toString();
  return qs ? "?" + qs : "";
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
  // Confirm an email change from the link sent to the new address (no auth; token is the proof).
  async verifyEmailChange(token: string): Promise<{ message: string; email: string }> {
    const res = await fetch(API + "/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error((await res.text()) || "Verification failed");
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
  // Stream a fresh customer-facing reply draft (SSE). Mirrors streamSummary.
  async streamDraftReply(convId: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<void> {
    const token = getToken();
    const res = await fetch(`${API}/api/conversations/${convId}/draft-reply?lang=${encodeURIComponent(getAppLang())}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || "Draft failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
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
  // The endpoint returns a paginated { data, next_cursor }; tolerate both shapes
  // so callers that just want the latest messages (e.g. the contacts chat popup)
  // always get an array instead of crashing on `.map`.
  getMessages: async (id: string): Promise<Message[]> => {
    const r = await req<Message[] | { data: Message[] }>(`/api/conversations/${id}/messages`);
    return Array.isArray(r) ? r : (r?.data ?? []);
  },
  getMessagesPaginated: (id: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append("cursor", cursor);
    return req<{ data: Message[]; next_cursor: string | null }>(`/api/conversations/${id}/messages?${params.toString()}`);
  },
  searchMessages: (id: string, query: string) =>
    req<{ data: Message[] }>(`/api/conversations/${id}/messages/search?q=${encodeURIComponent(query)}`),
  // Open Graph preview for a URL in a chat message (fetched server-side; CORS
  // blocks doing this from the browser).
  linkPreview: (url: string) =>
    req<{ url: string; title?: string; description?: string; image?: string; site_name?: string }>(
      `/api/link-preview?url=${encodeURIComponent(url)}`),
  sendMessage: (id: string, body: string) =>
    req(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  sendMedia: (id: string, type: string, mediaUrl: string, caption: string) =>
    req(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ type, media_url: mediaUrl, body: caption }) }),
  // Upload via XHR so we can surface progress + a timeout + the server's error text
  // (a big file on a slow link otherwise looks like an infinite spinner).
  uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ url: string; type: string; name: string }> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", API + "/api/uploads");
      const tok = getToken();
      if (tok) xhr.setRequestHeader("Authorization", `Bearer ${tok}`);
      xhr.timeout = 180000; // 3 min ceiling so it never hangs forever
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Invalid upload response")); }
        } else if (xhr.status === 413) {
          reject(new Error("File too large for the server"));
        } else {
          reject(new Error((xhr.responseText || "").trim() || `Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file or a faster connection"));
      xhr.send(fd);
    });
  },
  assign: (id: string, agentId?: string) =>
    req(`/api/conversations/${id}/assign`, { method: "POST", body: JSON.stringify(agentId ? { agent_id: agentId } : {}) }),
  unassign: (id: string) =>
    req(`/api/conversations/${id}/assign`, { method: "POST", body: JSON.stringify({ unassign: true }) }),
  snooze: (id: string, until: string) =>
    req(`/api/conversations/${id}/snooze`, { method: "POST", body: JSON.stringify({ until }) }),
  registerFCMToken: (token: string, platform = "web") =>
    req("/api/users/fcm-token", { method: "POST", body: JSON.stringify({ token, platform }) }),
  // authToken lets logout pass a JWT captured BEFORE clearSession, so this DELETE
  // still authenticates even though it runs async after the session is cleared
  // (otherwise the server never drops the token and keeps pushing post-logout).
  unregisterFCMToken: (token: string, authToken?: string) => {
    const jwt = authToken ?? getToken();
    return fetch(`${API}/api/users/fcm-token`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify({ token }),
    }).then(() => {});
  },
  listNotifications: () => req<{ notifications: AppNotification[]; unread: number }>("/api/notifications"),
  markNotificationsRead: (id?: string) =>
    req("/api/notifications/read", { method: "POST", body: JSON.stringify(id ? { id } : {}) }),
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
  getStats: (f?: { campaign_id?: string; channel_id?: string; agent_id?: string; source?: string; from?: string; to?: string }) => req<Stats>(`/api/stats${analyticsQs(f)}`),
  getDashboardCards: (f?: { campaign_id?: string; source?: string }) => req<DashboardCards>(`/api/dashboard/cards${analyticsQs(f)}`),
  getAnalytics: (f?: { campaign_id?: string; channel_id?: string; agent_id?: string; source?: string; from?: string; to?: string }) => req<Analytics>(`/api/analytics${analyticsQs(f)}`),
  listQuickReplies: () => req<QuickReply[]>("/api/quick-replies"),
  createQuickReply: (shortcut: string, title: string, body: string) =>
    req("/api/quick-replies", { method: "POST", body: JSON.stringify({ shortcut, title, body }) }),
  deleteQuickReply: (id: string) => req(`/api/quick-replies/${id}`, { method: "DELETE" }),
  getNotes: (convId: string) => req<InternalNote[]>(`/api/conversations/${convId}/notes`),
  addNote: (convId: string, body: string) =>
    req(`/api/conversations/${convId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  deleteNote: (convId: string, noteId: string) => req(`/api/conversations/${convId}/notes/${noteId}`, { method: "DELETE" }),
  listStages: () => req<import("./types").Stage[]>("/api/stages"),
  listDispositions: () => req<import("./types").Disposition[]>("/api/dispositions"),
  patchConversation: (id: string, patch: { stage_id?: string; disposition_id?: string; interest_level?: string; unread_count?: number; lost_reason?: string; status?: string }) =>
    req(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listContacts: () => req<Contact[]>("/api/contacts"),
  createContact: (body: { full_name?: string; phone?: string; tags?: string[]; attributes?: Record<string, unknown> }) =>
    req<Contact>("/api/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, body: { full_name?: string; phone?: string; tags?: string[]; blacklisted?: boolean; attributes?: Record<string, unknown>; stage_id?: string; interest_level?: string; assigned_agent_id?: string }) =>
    req<void>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteContact: (id: string) => req<void>(`/api/contacts/${id}`, { method: "DELETE" }),
  // Bulk stage / interest / owner / tags / blacklist across many contacts.
  bulkUpdateContacts: (body: {
    contact_ids: string[];
    set: { stage_id?: string; interest_level?: string; assigned_agent_id?: string; add_tags?: string[]; remove_tags?: string[]; blacklisted?: boolean };
  }) => req<{ updated: number; skipped: { contact_id: string; reason: string }[] }>("/api/contacts/bulk-update", { method: "POST", body: JSON.stringify(body) }),
  // Initiate chat: send an approved WhatsApp template to contacts (get-or-create conversation).
  sendTemplateToContacts: (body: { contact_ids: string[]; channel_id?: string; template_id: string; variables: string[] }) =>
    req<{ queued: number; skipped: { contact_id: string; reason: string }[] }>("/api/contacts/send-template", { method: "POST", body: JSON.stringify(body) }),

  // Custom (typed) contact fields — org-defined schema; values live in contact.attributes.
  listCustomFields: () => req<import("./types").CustomField[]>("/api/custom-fields"),
  createCustomField: (body: { key?: string; label: string; type: string; options?: string[]; sort_order?: number }) =>
    req<{ id: string; key: string }>("/api/custom-fields", { method: "POST", body: JSON.stringify(body) }),
  updateCustomField: (id: string, body: Partial<{ label: string; type: string; options: string[]; sort_order: number }>) =>
    req<void>(`/api/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCustomField: (id: string) => req<void>(`/api/custom-fields/${id}`, { method: "DELETE" }),
  getContactActivity: (id: string) => req<import("./types").ContactActivity[]>(`/api/contacts/${id}/activity`),
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
  updateUser: (id: string, patch: { full_name?: string; email?: string; role?: string; status?: string; password?: string; avatar_url?: string }) =>
    req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // Self-service password change (proves the current password; no email round-trip).
  changePassword: (current_password: string, new_password: string) =>
    req<{ message: string }>("/api/account/password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  // Request an email change: emails a confirmation link to the NEW address.
  requestEmailChange: (new_email: string) =>
    req<{ message: string }>("/api/account/email", { method: "POST", body: JSON.stringify({ new_email }) }),
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
  // ── Organization (workspace settings) ──
  getOrganization: () => req<Organization>("/api/organization"),
  updateOrganization: (patch: { name?: string; settings?: OrgSettings }) =>
    req<Organization>("/api/organization", { method: "PATCH", body: JSON.stringify(patch) }),
  // ── Audit log ──
  listAuditLog: () => req<AuditEntry[]>("/api/audit-log"),
  systemLog: (kind: "messages" | "conversations" | "calls" | "activity", p: { limit?: number; offset?: number; from?: string; to?: string; campaign_id?: string; channel_id?: string; label?: string }) => {
    const q = new URLSearchParams();
    if (p.limit != null) q.set("limit", String(p.limit));
    if (p.offset != null) q.set("offset", String(p.offset));
    if (p.from) q.set("from", p.from);
    if (p.to) q.set("to", p.to);
    if (p.campaign_id) q.set("campaign_id", p.campaign_id);
    if (p.channel_id) q.set("channel_id", p.channel_id);
    if (p.label) q.set("label", p.label);
    const qs = q.toString();
    // NOTE: no type arg on req() here on purpose — a nested generic type arg
    // (LogPage<Record<...>>) mis-transpiled in the prod build ("Record is not
    // defined"). Cast the result instead.
    return req(`/api/system-logs/${kind}${qs ? "?" + qs : ""}`) as Promise<{ rows: unknown[]; total: number }>;
  },
  createExport: (kind: "messages" | "conversations" | "calls" | "activity", from?: string, to?: string, filters?: { campaign_id?: string; channel_id?: string; label?: string }) =>
    req<{ id: string; status: string }>("/api/exports", { method: "POST", body: JSON.stringify({ kind, from: from || "", to: to || "", campaign_id: filters?.campaign_id || "", channel_id: filters?.channel_id || "", label: filters?.label || "" }) }),
  listExports: () => req<import("./types").ExportJob[]>("/api/exports"),
  // Direct CSV download (authenticated) of the full team roster. Fetches with the
  // bearer token, then triggers a browser download from the blob.
  async downloadTeamCsv(): Promise<void> {
    const token = getToken();
    const res = await fetch(`${API}/api/export/team`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url; a.download = `teams-${stamp}.csv`; a.click();
    URL.revokeObjectURL(url);
  },
  // ── Web API lead sources ──
  listWebApiSources: () => req<WebApiSource[]>("/api/web-api-sources"),
  createWebApiSource: (input: { name: string; slug?: string; auto_template_name?: string; webhook_url?: string; campaign_id?: string; platform?: SourcePlatform }) =>
    req<{ id: string }>("/api/web-api-sources", { method: "POST", body: JSON.stringify(input) }),
  updateWebApiSource: (id: string, patch: { name?: string; slug?: string; auto_template_name?: string; webhook_url?: string; is_active?: boolean; campaign_id?: string; platform?: SourcePlatform }) =>
    req(`/api/web-api-sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  regenerateWebApiKey: (id: string) => req<{ api_key: string }>(`/api/web-api-sources/${id}/regenerate-key`, { method: "POST" }),
  deleteWebApiSource: (id: string) => req(`/api/web-api-sources/${id}`, { method: "DELETE" }),
  // ── Campaigns ──
  listCampaigns: () => req<Campaign[]>("/api/campaigns"),
  getCampaignAnalytics: () => req<CampaignAnalyticsRow[]>("/api/analytics/campaigns"),
  getCampaign: (id: string) => req<CampaignDetail>(`/api/campaigns/${id}`),
  getCampaignCredits: (id: string) => req<{ allocated_credits: number; used_credits: number; low_balance_threshold: number; remaining_credits: number }>(`/api/campaigns/${id}/credits`),
  allocateCampaignCredits: (id: string, input: { allocated_credits?: number; low_balance_threshold?: number }) =>
    req(`/api/campaigns/${id}/credits/allocate`, { method: "POST", body: JSON.stringify(input) }),
  getCampaignUsage: (id: string) => req<{ day: string; credits: number }[]>(`/api/campaigns/${id}/usage`),
  // ── Segment-generic campaign catalog / KB (per-campaign pricing) ──
  getCampaignCatalog: (id: string) => req<CatalogItem[]>(`/api/campaigns/${id}/catalog`),
  uploadCampaignCatalog: (id: string, input: { effective_month?: string; source_ref?: string; segment?: string; replace?: boolean; rows: { item_name: string; variant_name?: string; location_name?: string; category_type?: string; headline_price?: number | null; attributes?: Record<string, unknown> }[] }) =>
    req<{ inserted: number; replaced: boolean }>(`/api/campaigns/${id}/catalog`, { method: "POST", body: JSON.stringify(input) }),
  // PDF pricelist -> LLM extraction (via ai-agent). Returns rows to review + import.
  extractCatalogPdf: (id: string, input: { pdf_base64: string; segment?: string }) =>
    req<{ rows: { item_name: string; variant_name?: string; location_name?: string; category_type?: string; headline_price?: number | null; attributes?: Record<string, unknown> }[]; warning?: string; error?: string }>(`/api/campaigns/${id}/catalog/extract`, { method: "POST", body: JSON.stringify(input) }),
  clearCampaignCatalog: (id: string) => req<{ deleted: number }>(`/api/campaigns/${id}/catalog`, { method: "DELETE" }),
  getSubscription: () => req<{ package_name: string; status: string; renewal_date: string | null; quotas: Record<string, number>; used_users: number; used_simpuler_credits: number; used_custom_fields: number }>("/api/subscription"),
  // ── Platform super admin (email-gated, not a role) ──
  platformAccess: () => req<{ super_admin: boolean }>("/api/platform/access"),
  listOrgs: () => req<OrgRow[]>("/api/platform/orgs"),
  createOrg: (input: { name: string; owner_name?: string; owner_email: string; owner_password: string; package_name?: string; users?: number; simpuler_credits?: number; custom_fields?: number }) =>
    req<{ id: string; slug: string; owner_id: string }>("/api/platform/orgs", { method: "POST", body: JSON.stringify(input) }),
  updateOrg: (id: string, patch: { name?: string; package_name?: string; status?: string; renewal_date?: string; quotas?: Record<string, number> }) =>
    req(`/api/platform/orgs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOrg: (id: string) => req(`/api/platform/orgs/${id}`, { method: "DELETE" }),
  createCampaign: (input: { name: string; dealer_name?: string; routing_strategy?: string; channel_id?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[]; supervisor_ids?: string[]; calling_enabled?: boolean }) =>
    req<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify(input) }),
  updateCampaign: (id: string, patch: { name?: string; dealer_name?: string; status?: string; routing_strategy?: string; channel_id?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[]; supervisor_ids?: string[]; calling_enabled?: boolean; segment?: string; brand?: string; ai_auto_reply?: boolean; ai_language?: string; ai_dynamic_language?: boolean; ai_smart_summary?: boolean; intake_form_id?: string }) =>
    req(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCampaign: (id: string) => req(`/api/campaigns/${id}`, { method: "DELETE" }),
  // ── Branches (sub-units of a campaign) ──
  listCampaignBranches: (campaignId: string) => req<import("./types").Branch[]>(`/api/campaigns/${campaignId}/branches`),
  createBranch: (campaignId: string, input: { name: string; coverage?: string; ad_source_ids?: string[]; agent_ids?: string[]; supervisor_ids?: string[]; web_source_ids?: string[] }) =>
    req<{ id: string }>(`/api/campaigns/${campaignId}/branches`, { method: "POST", body: JSON.stringify(input) }),
  updateBranch: (id: string, patch: { name?: string; coverage?: string; ad_source_ids?: string[]; agent_ids?: string[]; supervisor_ids?: string[]; web_source_ids?: string[] }) =>
    req(`/api/branches/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteBranch: (id: string) => req(`/api/branches/${id}`, { method: "DELETE" }),
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
  // Real Meta Embedded Signup: the FB popup returns code + ids, the gateway
  // exchanges the code, subscribes the app to the WABA and registers the number.
  embeddedSignup: (input: { code: string; waba_id: string; phone_number_id: string; name?: string }) =>
    req<{ id: string; status: string; warning?: string }>("/api/channels/embedded-signup", { method: "POST", body: JSON.stringify(input) }),
  // Viber: verify the Public Account token + register the inbound webhook.
  connectViber: (input: { auth_token: string; name?: string }) =>
    req<{ id: string; status: string; warning?: string }>("/api/channels/viber/connect", { method: "POST", body: JSON.stringify(input) }),

  // Ad performance
  listAdAccounts: () => req<import("./types").AdAccount[]>("/api/ad-accounts"),
  createAdAccount: (input: { platform: string; external_account_id: string; name?: string; access_token: string; config?: Record<string, unknown> }) =>
    req<{ id: string; sync_error?: string }>("/api/ad-accounts", { method: "POST", body: JSON.stringify(input) }),
  updateAdAccount: (id: string, patch: { name?: string; external_account_id?: string; access_token?: string }) =>
    req<{ status: string }>(`/api/ad-accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAdAccount: (id: string) => req<void>(`/api/ad-accounts/${id}`, { method: "DELETE" }),
  syncAdAccount: (id: string) => req<{ ok: boolean }>(`/api/ad-accounts/${id}/sync`, { method: "POST" }),
  listAdCampaigns: () => req<import("./types").AdCampaignRow[]>("/api/ad-campaigns"),
  mapAdCampaign: (id: string, campaign_ids: string[]) =>
    req<{ ok: boolean }>(`/api/ad-campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ campaign_ids }) }),
  adPerformance: (from?: string, to?: string, campaign_ids?: string[], platforms?: string[], account_ids?: string[]) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from); if (to) q.set("to", to);
    if (campaign_ids && campaign_ids.length) q.set("campaign_id", campaign_ids.join(","));
    if (platforms && platforms.length) q.set("platform", platforms.join(","));
    if (account_ids && account_ids.length) q.set("account_id", account_ids.join(","));
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
  // ── WhatsApp Forms (native Meta Flows) ──
  listFlows: (channelId?: string) =>
    req<WaFlow[]>(`/api/wa-flows${channelId ? `?channel_id=${channelId}` : ""}`),
  getFlow: (id: string) => req<WaFlowDetail>(`/api/wa-flows/${id}`),
  createFlow: (input: { name: string; channel_id?: string; categories?: string[]; definition?: FlowDefinition }) =>
    req<{ id: string }>("/api/wa-flows", { method: "POST", body: JSON.stringify(input) }),
  updateFlow: (id: string, patch: { name?: string; channel_id?: string; categories?: string[]; definition?: FlowDefinition; sheet_id?: string; sheet_tab?: string; sheet_enabled?: boolean }) =>
    req(`/api/wa-flows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getGoogleSheetsInfo: () => req<GoogleSheetsInfo>("/api/integrations/google-sheets"),
  deleteFlow: (id: string) => req(`/api/wa-flows/${id}`, { method: "DELETE" }),
  publishFlow: (id: string) =>
    req<{ status: string; meta_flow_id: string }>(`/api/wa-flows/${id}/publish`, { method: "POST", body: "{}" }),
  sendFlow: (id: string, to: string, cta?: string, body?: string) =>
    req<{ status: string; flow_token: string }>(`/api/wa-flows/${id}/send`, { method: "POST", body: JSON.stringify({ to, cta, body }) }),
  listFlowResponses: (flowId?: string) =>
    req<WaFlowResponse[]>(`/api/wa-flows/responses${flowId ? `?flow_id=${flowId}` : ""}`),
  // ── WhatsApp Business Calling API ──
  requestCallPermission: (conversationId: string) =>
    req<{ call_id: string; status: string }>("/api/calls/request-permission", { method: "POST", body: JSON.stringify({ conversation_id: conversationId }) }),
  initiateCall: (callId: string, sdpOffer: string) =>
    req<{ call_id: string; status: string }>("/api/calls/initiate", { method: "POST", body: JSON.stringify({ call_id: callId, sdp_offer: sdpOffer }) }),
  acceptCall: (callId: string, sdpAnswer: string) =>
    req<{ call_id: string; status: string }>(`/api/calls/${callId}/accept`, { method: "POST", body: JSON.stringify({ sdp_answer: sdpAnswer }) }),
  rejectCall: (callId: string) =>
    req<{ status: string }>(`/api/calls/${callId}/reject`, { method: "POST" }),
  // Confirm actual pickup on an outbound call (inbound audio detected) so the
  // backend's talk-time duration starts at the right moment.
  callConnected: (callId: string) =>
    req<{ status: string }>(`/api/calls/${callId}/connected`, { method: "POST" }),
  endCall: (callId: string) =>
    req<{ status: string; duration_seconds: number }>(`/api/calls/${callId}/end`, { method: "POST" }),
  getCall: (callId: string) =>
    req<Record<string, unknown>>(`/api/calls/${callId}`),
  saveCallRecording: (callId: string, url: string) =>
    req<{ ok: boolean }>(`/api/calls/${callId}/recording`, { method: "POST", body: JSON.stringify({ url }) }),
};
