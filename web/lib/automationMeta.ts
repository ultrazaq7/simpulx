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
  assign_agent: { label: "Assign to agent", desc: "Route the conversation to a specific agent" },
  assign_campaign: { label: "Assign to campaign", desc: "Route the conversation to a campaign" },
  add_tag: { label: "Add label", desc: "Attach one or more labels" },
  remove_tag: { label: "Remove label", desc: "Detach one or more labels" },
  set_contact_attribute: { label: "Set contact attribute", desc: "Save a value to a contact field" },
  set_priority: { label: "Set priority", desc: "Mark the conversation priority" },
  set_conversation_status: { label: "Set conversation status", desc: "Open, snooze or close the conversation" },
  close_conversation: { label: "Close conversation", desc: "Resolve and close the conversation" },
  google_sheet: { label: "Add row to Google Sheet", desc: "Append contact data as a new sheet row" },
  webhook_notify: { label: "Webhook notification", desc: "POST the event to an external URL" },
};

export const TRIGGER_KEYS = Object.keys(TRIGGERS);
export const ACTION_KEYS = Object.keys(ACTIONS);

export function triggerLabel(t: string) { return TRIGGERS[t]?.label ?? t.replace(/_/g, " "); }
export function actionLabel(t: string) { return ACTIONS[t]?.label ?? t.replace(/_/g, " "); }
