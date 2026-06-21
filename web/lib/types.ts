export interface User {
  id: string;
  org_id: string;
  role: string;
  name: string;
  email?: string;
  status?: string;
  is_online?: boolean;
}

export interface Conversation {
  id: string;
  status: string;
  channel: string;
  is_bot_active: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "agent" | "contact";
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
  lead_summary: string | null;
  suggested_action: string | null;
  suggested_action_reason: string | null;
  suggested_action_confidence: number | null;
  lead_score: number | null;
  call_attempts: number | null;
  calling_enabled?: boolean;
  contact_id?: string | null;
  tags?: string[] | null;
}

export interface DashboardCards {
  open: number;
  hot: number;
  follow_up: number;
  need_call: number;
  unread: number;
}

export interface Stage { id: string; name: string }
export interface Disposition { id: string; name: string; category: string | null }

export interface Analytics {
  // replied = AGENT responded; engaged = lead/customer responded; won/lost = disposition category
  funnel: { total: number; replied: number; engaged: number; intent: number; hot: number; warm: number; cold: number; unknown: number; won: number; lost: number; followups: number; call_attempts: number; call_duration_sec: number };
  // Real pipeline funnel: cumulative "reached this stage or beyond"
  funnel_stages?: { name: string; system_key: string; sort_order: number; reached: number }[];
  stages: { name: string; system_key: string; sort_order: number; count: number }[];
  categories: { category: string; count: number }[];
  tiers: { cold: number; lukewarm: number; warm: number; engaged: number; hot: number };
  agents: { agent: string; branch: string; leads: number; total_chat: number; replied: number; hot: number; won: number; avg_rt_min: number; avg_resp_min: number; within_5_pct: number; call_attempts: number; call_duration_sec: number; updated: number; contacted: number; qualified: number; appointment: number; negotiation: number; purchase: number }[];
  daily: { day: string; leads: number; replied: number }[];
  response_time: {
    median_min: number; avg_min: number; within_5_min_pct: number; within_1_hr_pct: number; leads_with_rt: number;
    d_lt1: number; d_1_5: number; d_5_15: number; d_15_60: number; d_1_4h: number; d_4_24h: number; d_gt24h: number;
  };
  junk: number;
  lost?: number;
  lost_reasons?: { reason: string; count: number }[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  read_at: string | null;
  created_at: string;
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
  email?: string;
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
  status: string;          // draft | scheduled | queued | sending | completed | failed
  audience: string | null; // all | tags | selected
  body: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
  scheduled_at: string | null;
  template_name: string | null;
}

export interface BroadcastDetail {
  id: string;
  name: string;
  status: string;
  audience: string | null;
  body: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  responses: number;
  read_count: number;
  delivered_count: number;
  clicks: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  template_name: string | null;
  template_language: string | null;
  channel_name: string | null;
  channel_display: string | null;
  created_by_name: string | null;
}

export interface BroadcastRecipient {
  id: string;
  contact_id: string;
  contact_name: string | null;
  phone: string | null;
  send_status: string;   // pending | sent | failed
  read_status: string;   // pending | sent | delivered | read
  type: string;
  error: string | null;
  sent_at: string | null;
  responded: boolean | null;
  clicked: boolean | null;
  clicked_button: string | null;
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
  header_media_url?: string | null;  // sample media for IMAGE/VIDEO/DOCUMENT headers
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  variables: string[] | null;
  status: string;          // DRAFT | PENDING | APPROVED | REJECTED
  meta_template_id: string | null;
  rejected_reason: string | null;
  channel_id: string | null;
  campaign_ids: string[] | null;   // campaigns this template is limited to ([] / null = all)
  template_type?: string;          // standard | carousel | call_permission | request_contact
  components?: TemplateComponents | null;
  created_at: string;
  updated_at: string;
}

export interface CarouselCard {
  media_type: "IMAGE" | "VIDEO";
  media_url?: string;
  body: string;
  buttons: TemplateButton[];
}
export interface TemplateComponents {
  cards?: CarouselCard[];
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
  stage_id?: string | null;
  stage_name: string | null;
  last_message_at: string | null;
  created_at: string;
  ai_summary?: string | null;
  tags?: string[] | null;
  assigned_agent_id?: string | null;
  agent_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  updated_at?: string | null;
  blacklisted?: boolean | null;
  channel_name?: string | null;       // real channel name (e.g. "Test Channel")
  conversation_id?: string | null;    // latest conversation (for the Chat popup)
  web_api_source_name?: string | null;
  source_id?: string | null;          // CTWA / referral source id
  source_url?: string | null;         // CTWA / referral ad URL
}

export interface AdAccount {
  id: string;
  platform: string;                    // meta | tiktok | google
  external_account_id: string;
  name: string;
  status: string;                      // connected | error
  currency: string | null;
  has_token: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  campaign_count: number;
  created_at: string;
}
export interface AdCampaignRow {
  id: string;
  platform: string;
  external_id: string;
  name: string;
  campaign_id: string | null;          // mapped to OUR campaign
  campaign_name: string | null;
  account_name: string | null;
  spend: number;
  impressions: number;
}
export interface AdPerfCampaign {
  campaign_id: string;
  campaign_name: string;
  spend: number; impressions: number; reach: number; clicks: number; results: number;
  leads: number; sales: number;
}
export interface AdPerfDaily {
  date: string;
  impressions: number; reach: number; clicks: number; results: number; spend: number;
}
export interface AdPerformance {
  from: string; to: string;
  campaigns: AdPerfCampaign[];
  daily: AdPerfDaily[];
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
  calling_enabled?: boolean;
  connected_at: string | null;
  created_at: string;
}

export interface Department { id: string; name: string; members: number; }

// A branch is a sub-unit of a campaign (office / store / dealer) with its own
// coverage, ad sources and agents. Leads route by ad source to the branch.
export interface Branch {
  id: string;
  name: string;
  coverage: string;
  ad_source_ids: string[];
  lead_count: number;
  agent_ids: string[];
  supervisor_ids?: string[];
  web_source_ids: string[];
}

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
  channel_id: string | null;
  channel_name?: string | null;
  calling_enabled?: boolean;
  created_at: string;
}
export interface CampaignDetail extends Campaign { agent_ids: string[]; supervisor_ids?: string[]; }
export interface CampaignAnalyticsRow {
  id: string;
  name: string;
  agents: number;
  leads: number;
  total_chat: number;
  replied: number;
  avg_rt_min: number;
  avg_resp_min: number;
  within_5_pct: number;
  call_attempts: number;
  call_duration_sec: number;
  updated: number;
  contacted: number;
  qualified: number;
  appointment: number;
  negotiation: number;
  purchase: number;
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
  campaign_id: string | null;
  campaign_name: string | null;
  is_active: boolean;
  lead_count: number;
  created_at: string;
}

export interface LogPage<T> { rows: T[]; total: number; }
export interface LogMessage {
  created_at: string; direction: string; message_type: string; message: string | null;
  file_url: string | null; status: string; message_id: string;
  conversation_id: string; channel_id: string | null; channel_name: string | null;
  contact_id: string | null; contact_name: string | null; contact_phone: string | null;
  agent_name: string | null; agent_email: string | null;
  source_id: string | null; source_url: string | null;
}
export interface LogConversation {
  agent_name: string | null; email: string | null; department_name: string | null;
  customer_name: string | null; disposition: string | null; contact_number: string | null;
  assigned_at: string | null; closed_at: string | null; first_response_sec: number; closing_sec: number;
  agent_messages: number; status: string; chat_initiation: string | null; id: string;
}
export interface LogCall {
  direction: string | null; name: string | null; phone: string | null; duration_seconds: number;
  received_at: string | null; ended_at: string | null; call_status: string | null; end_reason: string | null;
  agent: string | null; id: string;
}
export interface LogActivity {
  agent_name: string | null; agent_email: string | null;
  kind: string; event: string; detail: Record<string, unknown> | null; action_at: string;
}

export interface ExportJob {
  id: string;
  kind: string;
  date_from: string | null;
  date_to: string | null;
  status: string;            // queued | processing | completed | failed
  row_count: number | null;
  file_url: string | null;
  error: string | null;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
  requested_by: string | null;
  campaign_id: string | null;
  channel_id: string | null;
  label: string | null;
  campaign_name: string | null;
  channel_name: string | null;
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
  status: string;        // active | inactive (operational gate)
  is_online: boolean;    // presence (cosmetic)
  is_inactive?: boolean;        // billing: account paused
  inactive_since?: string | null; // billing: when it was paused
  is_deleted?: boolean;         // billing: tombstoned
  last_seen_at: string | null;
  last_login_at: string | null;
  created_at: string;
  departments: number;
  department_names: string[] | null;
  department_ids: string[] | null;
  campaign_names: string[] | null;
  open_chats: number;
}

export interface UserActivity {
  user_id: string;
  from: string;
  to: string;
  presence: {
    currently_online: boolean;
    online_seconds: number;
    online_hours: number;
    availability_pct: number;
    sessions: number;
    last_online_at: string | null;
  };
  billing: {
    active_seconds: number;
    active_days: number;
    is_inactive: boolean;
    is_deleted: boolean;
  };
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

export interface Call {
  call_id: string;
  conversation_id: string;
  direction?: 'inbound' | 'outbound';
  agent_id?: string;
  contact_name?: string;
  contact_phone?: string;
  permission_status: 'pending' | 'granted' | 'denied' | 'expired';
  call_status: 'idle' | 'requesting' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'failed';
  sdp_offer?: string;
  sdp_answer?: string;
  external_call_id?: string;
  duration_seconds: number;
  end_reason?: string;
  created_at?: string;
}
