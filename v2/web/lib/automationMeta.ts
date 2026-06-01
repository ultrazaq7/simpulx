// Shared catalogs for automations + the flow builder.

export const TRIGGERS: Record<string, { label: string; desc: string }> = {
  new_conversation: { label: "New conversation", desc: "When a contact starts a new conversation" },
  new_message: { label: "New message received", desc: "On every inbound message" },
  ad_click: { label: "Ad click / CTWA referral", desc: "When a contact arrives from a click-to-WhatsApp ad" },
  conversation_idle: { label: "Conversation idle", desc: "When a conversation has no reply for N minutes" },
  keyword_match: { label: "Keyword match", desc: "When an inbound message contains a keyword" },
  contact_tag: { label: "Contact tag added", desc: "When a tag is added to a contact" },
  office_hours: { label: "Office hours", desc: "During configured business hours" },
  after_hours: { label: "After hours", desc: "Outside configured business hours" },
};

export const ACTIONS: Record<string, { label: string; desc: string }> = {
  send_message: { label: "Send auto reply", desc: "Send a text message to the contact" },
  send_template: { label: "Send template", desc: "Send an approved WhatsApp template" },
  assign_agent: { label: "Assign to agent", desc: "Route the conversation to a specific agent" },
  assign_team: { label: "Assign to department", desc: "Route to a team / queue" },
  add_tag: { label: "Add tag", desc: "Attach one or more tags" },
  remove_tag: { label: "Remove tag", desc: "Detach one or more tags" },
  set_priority: { label: "Set priority", desc: "Mark the conversation priority" },
  close_conversation: { label: "Close conversation", desc: "Resolve and close the conversation" },
  webhook_notify: { label: "Webhook notification", desc: "POST the event to an external URL" },
};

export const TRIGGER_KEYS = Object.keys(TRIGGERS);
export const ACTION_KEYS = Object.keys(ACTIONS);

export function triggerLabel(t: string) { return TRIGGERS[t]?.label ?? t.replace(/_/g, " "); }
export function actionLabel(t: string) { return ACTIONS[t]?.label ?? t.replace(/_/g, " "); }
