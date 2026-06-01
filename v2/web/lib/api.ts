import type { Agent, AIAgent, Analytics, AuditEntry, Automation, AutomationAction, AutomationDetail, AutomationFlow, Broadcast, Campaign, CampaignAnalyticsRow, CampaignDetail, Channel, Contact, Conversation, Department, InternalNote, KnowledgeSource, Message, Organization, OrgSettings, QuickReply, RolePermissions, Sequence, SequenceDetail, SequenceStep, Stats, Template, TemplateButton, User, UserAccount, WebApiSource } from "./types";

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
export function setSession(token: string, user: User) {
  localStorage.setItem("simpulx_token", token);
  localStorage.setItem("simpulx_user", JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem("simpulx_token");
  localStorage.removeItem("simpulx_user");
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : (res.text() as unknown)) as Promise<T>;
}

export const api = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(API + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Incorrect email or password");
    return res.json();
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
  me: () => req<User>("/api/me"),
  listConversations: (status = "") =>
    req<Conversation[]>(`/api/conversations${status ? `?status=${status}` : ""}`),
  getMessages: (id: string) => req<Message[]>(`/api/conversations/${id}/messages`),
  getMessagesPaginated: (id: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append("cursor", cursor);
    return req<{ data: Message[]; next_cursor: string | null }>(`/api/conversations/${id}/messages?${params.toString()}`);
  },
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
  getStats: () => req<Stats>("/api/stats"),
  getAnalytics: () => req<Analytics>("/api/analytics"),
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
  listBroadcasts: () => req<Broadcast[]>("/api/broadcasts"),
  createBroadcast: (input: { name: string; body?: string; template_id?: string; scheduled_at?: string; audience?: string }) =>
    req<{ id: string; total_recipients: number; status: string }>("/api/broadcasts", { method: "POST", body: JSON.stringify(input) }),
  // ── Templates (WhatsApp HSM) ──
  listTemplates: () => req<Template[]>("/api/templates"),
  createTemplate: (input: {
    name: string; category: string; language: string; header_type?: string; header_text?: string;
    body: string; footer?: string; buttons?: TemplateButton[]; variables?: string[]; channel_id?: string;
  }) => req<{ id: string; status: string }>("/api/templates", { method: "POST", body: JSON.stringify(input) }),
  updateTemplate: (id: string, patch: {
    name?: string; category?: string; language?: string; header_type?: string; header_text?: string;
    body?: string; footer?: string; buttons?: TemplateButton[]; variables?: string[];
  }) => req(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTemplate: (id: string) => req(`/api/templates/${id}`, { method: "DELETE" }),
  submitTemplate: (id: string) => req<{ status: string; simulated: boolean }>(`/api/templates/${id}/submit`, { method: "POST" }),
  // ── Users (org accounts) ──
  listUsers: () => req<UserAccount[]>("/api/users"),
  createUser: (input: { email: string; full_name: string; role?: string; password?: string }) =>
    req<{ id: string }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (id: string, patch: { full_name?: string; email?: string; role?: string; status?: string; password?: string }) =>
    req(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
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
  createCampaign: (input: { name: string; dealer_name?: string; routing_strategy?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[] }) =>
    req<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify(input) }),
  updateCampaign: (id: string, patch: { name?: string; dealer_name?: string; status?: string; routing_strategy?: string; ad_source_ids?: string[]; keywords?: string[]; agent_ids?: string[] }) =>
    req(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCampaign: (id: string) => req(`/api/campaigns/${id}`, { method: "DELETE" }),
  // ── Channels ──
  listChannels: () => req<Channel[]>("/api/channels"),
  createChannel: (input: {
    type: string; name: string;
    phone_number_id?: string; waba_id?: string; access_token?: string;
    display_id?: string; config?: Record<string, unknown>;
  }) => req<{ id: string; status: string }>("/api/channels", { method: "POST", body: JSON.stringify(input) }),
  updateChannel: (id: string, patch: { name?: string; is_active?: boolean; display_id?: string; access_token?: string; config?: Record<string, unknown> }) =>
    req(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteChannel: (id: string) => req(`/api/channels/${id}`, { method: "DELETE" }),
  testChannel: (id: string) => req<{ status: string }>(`/api/channels/${id}/test`, { method: "POST" }),
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
};
