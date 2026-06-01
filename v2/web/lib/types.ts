export interface User {
  id: string;
  org_id: string;
  role: string;
  name: string;
  email?: string;
}

export interface Conversation {
  id: string;
  status: string;
  channel: string;
  is_bot_active: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  interest_level: string | null;
  ai_stage: string | null;
  stage_id: string | null;
  stage_name: string | null;
  disposition_id: string | null;
  disposition_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  car_brand: string | null;
  car_model: string | null;
  city: string | null;
  purchase_timeframe: string | null;
  lost_reason: string | null;
}

export interface Stage { id: string; name: string }
export interface Disposition { id: string; name: string; category: string | null }

export interface Analytics {
  funnel: { total: number; replied: number; intent: number; strong_intent: number; hot: number; warm: number; cold: number; unknown: number; followups: number; call_attempts: number; call_duration_sec: number };
  stages: { name: string; system_key: string; sort_order: number; count: number }[];
  categories: { category: string; count: number }[];
  tiers: { cold: number; lukewarm: number; warm: number; engaged: number; hot: number };
  agents: { agent: string; leads: number; replied: number; intent: number; strong: number; won: number; median_rt_min: number; avg_first_rt_min?: number; avg_rt_min?: number; within_5_pct: number }[];
  daily: { day: string; leads: number; replied: number }[];
  response_time: {
    median_min: number; avg_min: number; within_5_min_pct: number; within_1_hr_pct: number; leads_with_rt: number;
    d_lt1: number; d_1_5: number; d_5_15: number; d_15_60: number; d_1_4h: number; d_4_24h: number; d_gt24h: number;
  };
  junk: number;
  lost?: number;
  lost_reasons?: { reason: string; count: number }[];
}

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  type: string;
  body: string | null;
  media_url: string | null;
  status: string;
  created_at: string;
}

export interface Agent {
  id: string;
  full_name: string;
  is_online: boolean;
  open_count: number;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  source_type: string;
  status: string;
  chunks: number;
  created_at: string;
}

export interface Stats {
  active: number;
  unassigned: number;
  bot_active: number;
  messages: number;
  contacts: number;
  team: number;
  ai_replies: number;
  handoffs: number;
  broadcasts: number;
  total_leads?: number;
  avg_rt_min?: number;
  bookings?: number;
  lost?: number;
}

export interface Broadcast {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
  scheduled_at: string | null;
  template_name: string | null;
}

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone?: string;
}
export interface Template {
  id: string;
  name: string;
  category: string;        // MARKETING | UTILITY | AUTHENTICATION
  language: string;
  header_type: string | null;  // NONE | TEXT | IMAGE | VIDEO | DOCUMENT
  header_text: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  variables: string[] | null;
  status: string;          // DRAFT | PENDING | APPROVED | REJECTED
  meta_template_id: string | null;
  rejected_reason: string | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  created_at: string;
}

export interface InternalNote {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  full_name: string | null;
  phone: string | null;
  source_channel: string | null;
  interest_level: string | null;
  stage_name: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  type: string;            // whatsapp | messenger | instagram | telegram | ...
  name: string;
  status: string;          // connected | pending | disconnected | error
  is_active: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  display_id: string | null;
  config: Record<string, unknown> | null;
  has_token: boolean;
  connected_at: string | null;
  created_at: string;
}

export interface Department { id: string; name: string; members: number; }

export interface Campaign {
  id: string;
  name: string;
  dealer_name: string | null;
  status: string;            // active | paused
  routing_strategy: string;  // round_robin | manual
  ad_source_ids: string[] | null;
  keywords: string[] | null;
  lead_count: number;
  agent_count: number;
  agent_names: string[] | null;
  conversations: number;
  created_at: string;
}
export interface CampaignDetail extends Campaign { agent_ids: string[]; }
export interface CampaignAnalyticsRow {
  id: string;
  name: string;
  dealer_name: string | null;
  status: string;
  lead_count: number;
  agents: number;
  conversations: number;
  replied: number;
  intent: number;
  strong: number;
  won: number;
}

export interface SequenceStep { delay_minutes: number; body: string; }
export interface Sequence {
  id: string;
  name: string;
  trigger: string;            // no_reply | new_lead
  is_active: boolean;
  campaign_id: string | null;
  campaign_name: string | null;
  steps: number;
  active_enrollments: number;
  created_at: string;
  updated_at: string;
}
export interface SequenceDetail {
  id: string; name: string; trigger: string; is_active: boolean;
  campaign_id: string | null; steps: SequenceStep[];
}

export interface OrgBranding { page_title?: string; meta_title?: string; }
export interface OrgNotifications { newMessages?: boolean; newConversations?: boolean; emailDigest?: boolean; sound?: boolean; }
export interface OrgSettings { notifications?: OrgNotifications; branding?: OrgBranding; [k: string]: unknown; }
export interface Organization { id: string; name: string; settings: OrgSettings | null; }

export interface WebApiSource {
  id: string;
  name: string;
  slug: string | null;
  api_key: string;
  webhook_url: string | null;
  auto_assign_dept_id: string | null;
  department: string | null;
  auto_template_name: string | null;
  is_active: boolean;
  lead_count: number;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface UserAccount {
  id: string;
  full_name: string;
  email: string;
  role: string;          // owner | admin | manager | agent
  status: string;        // active | inactive
  is_online: boolean;
  last_seen_at: string | null;
  last_login_at: string | null;
  created_at: string;
  departments: number;
  department_names: string[] | null;
  campaign_names: string[] | null;
  open_chats: number;
}

export interface RolePermissions {
  matrix: Record<string, Record<string, boolean>>;
  custom_roles: Record<string, string>;
}

export interface AutomationAction { type: string; params?: Record<string, unknown>; }
export interface FlowNode { id: string; type: string; x: number; y: number; config?: Record<string, unknown>; }
export interface FlowEdge { from: string; to: string; label?: string; }
export interface AutomationFlow { nodes: FlowNode[]; edges: FlowEdge[]; }

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  channel_id: string | null;
  channel_name: string | null;
  actions: AutomationAction[] | null;
  is_active: boolean;
  run_count: number;
  created_at: string;
  updated_at: string;
}
export interface AutomationDetail extends Automation { flow: AutomationFlow; }

export interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  mode: string;
  handoff_threshold: number;
  is_active: boolean;
}
