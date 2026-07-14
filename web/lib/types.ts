export interface User {
  id: string;
  org_id: string;
  role: string;
  name: string;
  email?: string;
  status?: string;
  is_online?: boolean;
  avatar?: string;
  is_super_admin?: boolean; // platform super admin (display label, not a role)
}

export interface Conversation {
  id: string;
  status: string;
  channel: string;
  is_bot_active: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_contact_message_at?: string | null; // last inbound (customer) msg -> 24h window anchor
  last_message_preview: string | null;
  last_message_direction: "agent" | "contact";
  last_sender_type?: string | null; // contact | agent | bot | system (of the latest message)
  customer_responded?: boolean; // true once the customer sends a genuine reply (not the CTWA opener)
  last_outbound_status?: string | null; // sent | delivered | read | failed (last outbound msg)
  contact_name: string | null;
  contact_phone: string | null;
  contact_email?: string | null;
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
  campaign_segment?: string | null;
  campaign_smart_summary?: boolean;
  campaign_auto_reply?: boolean; // campaign has Simpuler auto-reply enabled (gates the AI takeover control)
  lead_fields?: Record<string, string> | null;
  lead_summary: string | null;
  suggested_action: string | null;
  suggested_action_reason: string | null;
  suggested_action_confidence: number | null;
  lead_score: number | null;
  call_attempts: number | null;
  calling_enabled?: boolean;
  contact_id?: string | null;
  tags?: string[] | null;
  snoozed_until?: string | null;
}

export interface DashboardCards {
  open: number;
  hot: number;
  unreplied: number; // customer sent last, agent hasn't replied, still within 24h window
  unread: number;
}

export interface Stage { id: string; name: string; system_key?: string | null }

export type CustomFieldType = "text" | "number" | "date" | "select";
export interface CustomField {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[] | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}
export interface Disposition { id: string; name: string; category: string | null }

export interface Analytics {
  // replied = AGENT responded; engaged = lead/customer responded; won/lost = disposition category
  funnel: { total: number; replied: number; engaged: number; intent: number; hot: number; warm: number; cold: number; unknown: number; won: number; lost: number; followups: number; call_attempts: number; call_duration_sec: number };
  // Real pipeline funnel: cumulative "reached this stage or beyond"
  funnel_stages?: { name: string; system_key: string; sort_order: number; reached: number }[];
  stages: { name: string; system_key: string; sort_order: number; count: number }[];
  categories: { category: string; count: number }[];
  tiers: { cold: number; lukewarm: number; warm: number; engaged: number; hot: number };
  agents: { agent: string; branch: string; leads: number; total_chat: number; replied: number; hot: number; won: number; avg_rt_min: number; avg_resp_min: number; within_5_pct: number; call_attempts: number; call_duration_sec: number; updated: number; contacted: number; qualified: number; appointment: number; negotiation: number; purchase: number; lost: number }[];
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

export interface MessageMetadata {
  // CTWA (click-to-WhatsApp) ad creative the customer arrived from.
  referral?: {
    image_url?: string;
    headline?: string;
    body?: string;
    source_url?: string;
    media_type?: string;
  };
  // Shared contact card(s).
  contacts?: { name: string; phone?: string; org?: string }[];
  // Shared pinned location.
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  raw_webhook?: unknown;
}

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  type: string;
  body: string | null;
  media_url: string | null;
  metadata?: MessageMetadata | null;
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
  created_by?: string;
  created_by_name?: string;
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
  email: string | null;
  source_channel: string | null;
  interest_level: string | null;
  stage_id?: string | null;
  stage_name: string | null;
  lost_reason?: string | null;
  lead_score?: number | null;
  car_brand?: string | null;
  car_model?: string | null;
  city?: string | null;
  purchase_timeframe?: string | null;
  last_message_at: string | null;
  created_at: string;
  ai_summary?: string | null;
  tags?: string[] | null;
  attributes?: Record<string, unknown> | null;
  assigned_agent_id?: string | null;
  agent_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  updated_at?: string | null;
  blacklisted?: boolean | null;
  channel_name?: string | null;       // real channel name (e.g. "Test Channel")
  conversation_id?: string | null;    // latest conversation (for the Chat popup)
  web_api_source_name?: string | null;
  web_api_source_platform?: SourcePlatform | null;
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
  updated_at?: string;
}
export interface AdCampaignRow {
  id: string;
  platform: string;
  external_id: string;
  name: string;
  campaign_id: string | null;          // legacy single mapping (first of campaign_ids)
  campaign_name: string | null;
  campaign_ids?: string[];             // many-to-many: OUR campaigns this ad campaign feeds
  campaign_names?: string | null;      // comma-joined names for display
  account_name: string | null;
  ad_account_id?: string;
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
  impressions: number; reach: number; clicks: number; results: number; spend: number; leads: number; sales: number;
}
export interface AdPerfCreative {
  source_id: string;
  source_url: string | null;
  image_url: string | null;   // CTWA ad creative image / thumbnail
  headline: string | null;    // CTWA ad headline
  body: string | null;        // CTWA ad body copy
  spend: number; impressions: number; clicks: number;  // ad-level (level=ad) insights
  leads: number; sales: number;
}
export interface AdBreakdown {
  dimension: string;
  value: string;
  impressions: number; reach: number; clicks: number; results: number; spend: number;
}
export interface AdPerfSource {
  source: string;   // meta_ads | tiktok_ads | google_ads | website | direct
  label: string;
  impressions: number; clicks: number; spend: number;
  leads: number; purchases: number; ctr: number; cvr: number;
}
export interface AdKeyword {
  keyword: string; match_type: string;
  impressions: number; clicks: number; ctr: number; cost: number; conversions: number;
}
export interface AdPerfDailySource { date: string; source: string; leads: number; impressions?: number; clicks?: number; spend?: number }
export interface AdPerfRecentLead {
  conversation_id: string;
  contact_id: string | null;
  created_at: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  channel: string;
  source: string;         // classified: meta_ads | tiktok_ads | google_ads | website | direct
  stage: string | null;
  interest_level: string | null; // hot | warm | cold (AI-inferred)
}
export interface AdPerformance {
  from: string; to: string;
  campaigns: AdPerfCampaign[];
  daily: AdPerfDaily[];
  daily_sources?: AdPerfDailySource[];
  recent_leads?: AdPerfRecentLead[];
  creatives: AdPerfCreative[];
  sources?: AdPerfSource[];
  age?: AdBreakdown[];
  gender?: AdBreakdown[];
  region?: AdBreakdown[];
}

// GA4 landing-page performance (from the GA4 Data API).
export interface Ga4Row {
  landing_page: string;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number;   // 0..1
  avg_engagement_sec: number;
  views: number;
  total_users: number;
  active_users: number;
  new_users: number;
}
export interface Ga4Report {
  connected: boolean;
  error?: string;
  rows: Ga4Row[];
  totals?: Omit<Ga4Row, "landing_page">;
}

// A connected GA4 property (org-scoped, optionally mapped to one campaign).
export interface Ga4Connection {
  id: string;
  property_id: string;
  name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

// A GA4 property discovered during Sign-in-with-Google (Admin API).
export interface Ga4Property {
  property_id: string;
  display_name: string;
  account_name: string;
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
  updated_at?: string;
}
export interface CampaignDetail extends Campaign {
  agent_ids: string[]; supervisor_ids?: string[];
  segment?: string | null;
  brand?: string | null;
  ai_auto_reply?: boolean;
  ai_language?: string | null;         // id | en
  ai_dynamic_language?: boolean;
  ai_smart_summary?: boolean;          // show the composer Smart Summary button
  intake_form_id?: string | null;
  followup_template_id?: string | null; // approved template for out-of-window follow-ups
  monthly_budget?: number | null;      // optional user-set monthly ad budget
}
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

export interface OrgBranding { page_title?: string; meta_title?: string; }
export interface OrgNotifications { newMessages?: boolean; newConversations?: boolean; emailDigest?: boolean; sound?: boolean; }
export interface OrgSettings { notifications?: OrgNotifications; branding?: OrgBranding; [k: string]: unknown; }
export interface Organization { id: string; name: string; settings: OrgSettings | null; }

// One row of a campaign's segment-generic catalog / KB (WS-A).
export interface CatalogItem {
  id: string;
  segment: string | null;
  category_type: string | null;
  item_name: string;
  variant_name: string | null;
  location_name: string | null;
  headline_price: number | null;
  effective_month: string | null;
  source_ref: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
}

// Platform super-admin org row (full columns): profile + credit pool + usage.
export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  package_name: string;
  status: string;
  renewal_date: string | null;
  quotas: Record<string, number>;
  users_active: number;
  users_total: number;
  campaigns: number;
  credits_used_month: number;
}

// Platform vocabulary shared with AdAccount.platform - keep these in sync.
export type SourcePlatform = "meta" | "tiktok" | "google" | "other";

export interface WebApiSource {
  id: string;
  name: string;
  slug: string | null;
  api_key: string;
  webhook_url: string | null;
  auto_template_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  is_active: boolean;
  lead_count: number;
  created_at: string;
  updated_at?: string;
  platform: SourcePlatform;
}

export interface LogPage<T> { rows: T[]; total: number; }
export interface LogMessage {
  created_at: string; direction: string; message_type: string; message: string | null;
  file_url: string | null; status: string; message_id: string;
  conversation_id: string; channel_id: string | null; channel_name: string | null;
  contact_id: string | null; contact_name: string | null; contact_phone: string | null;
  contact_email: string | null; campaign_name: string | null;
  agent_name: string | null; agent_email: string | null;
  source_id: string | null; source_url: string | null;
}
export interface LogConversation {
  agent_name: string | null; agent_email: string | null; campaign_name: string | null;
  customer_name: string | null; contact_number: string | null;
  stage: string | null; interest_level: string | null;
  chat_initiation: string | null; assigned_at: string | null;
  first_response_sec: number; avg_response_sec: number;
  closing_at: string | null; status: string; id: string;
}
export interface LogCall {
  direction: string | null; name: string | null; phone: string | null; duration_seconds: number;
  received_at: string | null; ended_at: string | null; call_status: string | null; end_reason: string | null;
  agent: string | null; id: string; recording_url: string | null;
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
  is_super_admin?: boolean; // platform super admin (display-only label, not a role)
  status: string;        // active | inactive (operational gate)
  is_online: boolean;    // presence (cosmetic)
  is_inactive?: boolean;        // billing: account paused
  inactive_since?: string | null; // billing: when it was paused
  is_deleted?: boolean;         // billing: tombstoned
  last_seen_at: string | null;
  last_login_at: string | null;
  created_at: string;
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
export interface FlowEdge { from: string; to: string; label?: string; handle?: string; }
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

// ── WhatsApp Forms (native Meta Flows) ──
export type FlowComponentType =
  | 'heading' | 'body' | 'caption'
  | 'text_input' | 'text_area' | 'dropdown' | 'radio' | 'checkbox' | 'date' | 'chips';

export interface FlowComponent {
  type: FlowComponentType;
  name?: string;     // field name (inputs)
  label?: string;
  text?: string;     // heading/body/caption
  required?: boolean;
  options?: string[];
}
export interface FlowScreen {
  id?: string;
  title: string;
  components: FlowComponent[];
}
export interface FlowDefinition {
  screens: FlowScreen[];
}
export interface WaFlow {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'deprecated';
  meta_flow_id?: string;
  categories?: string[];
  channel_id?: string;
  channel_name?: string;
  publish_error?: string;
  response_count?: number;
  created_at?: string;
  updated_at?: string;
}
export interface WaFlowDetail extends WaFlow {
  definition: FlowDefinition;
  flow_json?: unknown;
  sheet_id?: string;
  sheet_tab?: string;
  sheet_enabled?: boolean;
}
export interface GoogleSheetsInfo {
  connected: boolean;
  client_email: string;
}
export interface WaFlowResponse {
  id: string;
  flow_id?: string;
  flow_name?: string;
  contact_name?: string;
  contact_phone?: string;
  response: Record<string, unknown>;
  received_at: string;
}

export interface ContactActivity {
  type: string;                        // stage_changed | status_changed | interest_changed | assigned | closed | ...
  detail: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
}
