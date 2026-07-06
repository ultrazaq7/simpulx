// Shared catalogs for automations + the flow builder.

export const TRIGGERS: Record<string, { label: string; desc: string }> = {
  new_conversation: { label: "New conversation", desc: "When a contact starts a new conversation" },
  new_message: { label: "New message received", desc: "On every inbound message" },
  ad_click: { label: "Ad click / CTWA referral", desc: "When a contact arrives from a click-to-WhatsApp ad" },
  conversation_idle: { label: "Conversation idle", desc: "When a conversation has no reply for N minutes" },
  keyword_match: { label: "Keyword match", desc: "When an inbound message contains a keyword" },
  button_click: { label: "Button click", desc: "When a contact taps a template / quick-reply button (by callback id)" },
  contact_tag: { label: "Contact label added", desc: "When a label is added to a contact" },
  office_hours: { label: "Office hours", desc: "During configured business hours" },
  after_hours: { label: "After hours", desc: "Outside configured business hours" },
};

export const ACTIONS: Record<string, { label: string; desc: string }> = {
  send_message: { label: "Send auto reply", desc: "Send a text message to the contact" },
  send_template: { label: "Send template", desc: "Send an approved WhatsApp template" },
  send_form: { label: "Send WhatsApp Form", desc: "Send a published form for the contact to fill" },
  assign_agent: { label: "Assign to team member", desc: "Route the conversation to a specific agent" },
  unassign_team: { label: "Unassign from team", desc: "Clear the assigned agent" },
  assign_campaign: { label: "Add to campaign", desc: "Route the conversation to a campaign" },
  remove_campaign: { label: "Remove from campaign", desc: "Clear the conversation's campaign" },
  blacklist: { label: "Mark blacklisted", desc: "Block the contact from outreach" },
  send_email: { label: "Send email notification", desc: "Email a notification (supports {placeholders})" },
  add_tag: { label: "Add label", desc: "Attach one or more labels" },
  remove_tag: { label: "Remove label", desc: "Detach one or more labels" },
  set_contact_attribute: { label: "Set contact attribute", desc: "Save a value to a contact field" },
  set_priority: { label: "Set priority", desc: "Mark the conversation priority" },
  set_stage: { label: "Set stage", desc: "Move the lead to a pipeline stage" },
  set_interest: { label: "Set interest level", desc: "Set the lead temperature (hot / warm / cold)" },
  set_conversation_status: { label: "Set conversation status", desc: "Open, snooze or close the conversation" },
  google_sheet: { label: "Add row to Google Sheet", desc: "Append contact data as a new sheet row" },
  webhook_notify: { label: "Webhook notification", desc: "POST the event to an external URL" },
  rest_api: { label: "Call REST API", desc: "Send an HTTP request (method, headers, body) with {placeholders}" },
};

export const TRIGGER_KEYS = Object.keys(TRIGGERS);
export const ACTION_KEYS = Object.keys(ACTIONS);

export function triggerLabel(t: string) { return TRIGGERS[t]?.label ?? t.replace(/_/g, " "); }
export function actionLabel(t: string) { return ACTIONS[t]?.label ?? t.replace(/_/g, " "); }

// Automation entry EVENTS ("when it fires"), grouped for the create picker. This
// is chosen at create time (-> trigger_type); the flow's trigger node refines it
// with conditions. `live` = the backend engine fires it today; others are
// selectable but not evaluated yet (they need firing hooks outside inbound).
export const EVENT_GROUPS: { group: string; events: { value: string; label: string; live?: boolean }[] }[] = [
  { group: "Messages", events: [
    { value: "new_message", label: "New incoming message", live: true },
    { value: "new_conversation", label: "New incoming message from new contact", live: true },
    { value: "outgoing_message", label: "New outgoing message" },
    { value: "voice_call", label: "New voice call" },
  ] },
  { group: "Conversations", events: [
    { value: "conversation_closed", label: "Conversation closed" },
  ] },
  { group: "Tags", events: [
    { value: "tag_added", label: "When a tag is added" },
    { value: "tag_removed", label: "When a tag is removed" },
  ] },
  { group: "Contacts", events: [
    { value: "contact_updated", label: "When a contact field is updated" },
  ] },
  { group: "Payments", events: [
    { value: "payment_received", label: "Payment received on WhatsApp" },
  ] },
  { group: "Social", events: [
    { value: "social_comment", label: "Comment received on a post" },
  ] },
  { group: "Technical", events: [
    { value: "webhook_received", label: "Webhook received" },
  ] },
];

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_GROUPS.flatMap((g) => g.events.map((e) => [e.value, e.label] as const)),
);
export const EVENT_LIVE: Record<string, boolean> = Object.fromEntries(
  EVENT_GROUPS.flatMap((g) => g.events.map((e) => [e.value, !!e.live] as const)),
);
export function eventLabel(v: string): string {
  return EVENT_LABELS[v] ?? TRIGGERS[v]?.label ?? v.replace(/_/g, " ");
}
