import type { TemplateButton } from "@/lib/types";

// ── Meta-style template create: category + type + a starter library ──────────
// Mirrors WhatsApp Manager's "Set up template" step: pick a category, then a
// type, then either start from scratch or clone one of these ready-made
// templates (tailored to dealer / car-sales, in English).

export type TemplateType = "default" | "catalog" | "flows" | "calling_permission";

export interface LibraryTemplate {
  id: string;
  title: string;
  description: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  type: TemplateType;
  prefill: {
    name: string;
    header_type: string;        // NONE | TEXT | IMAGE | VIDEO | DOCUMENT
    header_text?: string;
    body: string;               // {{1}}, {{2}} ... placeholders
    footer?: string;
    buttons: TemplateButton[];
    variables: string[];        // sample values for the placeholders
  };
}

export const TEMPLATE_TYPES: Record<TemplateType, { label: string; description: string }> = {
  default: { label: "Default", description: "Send messages with media and customizable buttons to engage your customers." },
  catalog: { label: "Catalog", description: "Send messages that drive sales by connecting your product catalog." },
  flows: { label: "Flows", description: "Send a form to capture customer interests, appointment requests or run surveys." },
  calling_permission: { label: "Calling permissions request", description: "Ask customers if you can call them on WhatsApp." },
};

// Which types are offered per category (matches WhatsApp Manager).
export const TYPES_BY_CATEGORY: Record<string, TemplateType[]> = {
  MARKETING: ["default", "catalog", "flows", "calling_permission"],
  UTILITY: ["default", "flows", "calling_permission"],
  AUTHENTICATION: ["default"],
};

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  {
    id: "welcome_intro",
    title: "Welcome / intro",
    description: "Greet a new lead and open the conversation.",
    category: "MARKETING",
    type: "default",
    prefill: {
      name: "welcome_intro",
      header_type: "TEXT",
      header_text: "Welcome to {{1}}",
      body: "Hi {{2}}, thanks for your interest in the {{3}}. How can we help you today? You can reply here or book a test drive.",
      footer: "Reply STOP to opt out",
      buttons: [{ type: "QUICK_REPLY", text: "Book a test drive" }, { type: "QUICK_REPLY", text: "Get a quote" }],
      variables: ["Honda HR Muhammad", "Andi", "Honda Brio"],
    },
  },
  {
    id: "followup_4h",
    title: "Smart follow up",
    description: "Re-engage a lead who went quiet.",
    category: "UTILITY",
    type: "default",
    prefill: {
      name: "followup_check_in",
      header_type: "NONE",
      body: "Hi {{1}}, just checking in on your interest in the {{2}}. Would you like to schedule a test drive or talk to a sales advisor?",
      footer: "",
      buttons: [{ type: "QUICK_REPLY", text: "Schedule test drive" }, { type: "QUICK_REPLY", text: "Talk to advisor" }],
      variables: ["Andi", "Honda Brio"],
    },
  },
  {
    id: "test_drive_confirm",
    title: "Test drive confirmation",
    description: "Confirm a booked test drive with date and place.",
    category: "UTILITY",
    type: "default",
    prefill: {
      name: "test_drive_confirmation",
      header_type: "NONE",
      body: "Hi {{1}}, your test drive for the {{2}} is confirmed on {{3}} at {{4}}. Please bring a valid ID. See you there!",
      footer: "",
      buttons: [{ type: "QUICK_REPLY", text: "Reschedule" }, { type: "PHONE_NUMBER", text: "Call dealer", phone: "+62" }],
      variables: ["Andi", "Honda Brio", "Sat 21 Jun, 10:00", "HR Muhammad showroom"],
    },
  },
  {
    id: "price_quote",
    title: "Price quote",
    description: "Send a quote with a validity date.",
    category: "UTILITY",
    type: "default",
    prefill: {
      name: "price_quote",
      header_type: "NONE",
      body: "Hi {{1}}, here is your quote for the {{2}}: {{3}}. This price is valid until {{4}}. Reply to proceed with the booking.",
      footer: "",
      buttons: [{ type: "QUICK_REPLY", text: "Proceed to book" }],
      variables: ["Andi", "Honda Brio CVT", "Rp 215.000.000", "30 Jun 2026"],
    },
  },
  {
    id: "promo_offer",
    title: "Promo offer",
    description: "Drive sales with a limited-time offer.",
    category: "MARKETING",
    type: "default",
    prefill: {
      name: "promo_offer",
      header_type: "IMAGE",
      body: "Hi {{1}}, special offer this month on the {{2}}: get {{3}} or low monthly installments. Limited units available, reply to claim yours.",
      footer: "Reply STOP to opt out",
      buttons: [{ type: "URL", text: "View offer", url: "https://" }, { type: "QUICK_REPLY", text: "Claim now" }],
      variables: ["Andi", "Honda Brio", "Rp 10.000.000 cashback"],
    },
  },
  {
    id: "calling_permission",
    title: "Calling permission request",
    description: "Ask the customer if you can call them on WhatsApp.",
    category: "UTILITY",
    type: "calling_permission",
    prefill: {
      name: "calling_permission_request",
      header_type: "NONE",
      body: "Hi {{1}}, we would like to call you on WhatsApp to discuss the {{2}} in more detail. Do you allow us to call you?",
      footer: "",
      buttons: [{ type: "QUICK_REPLY", text: "Allow" }, { type: "QUICK_REPLY", text: "Not now" }],
      variables: ["Andi", "Honda Brio"],
    },
  },
  {
    id: "booking_update",
    title: "Booking / order update",
    description: "Notify the customer of a status change.",
    category: "UTILITY",
    type: "default",
    prefill: {
      name: "booking_update",
      header_type: "NONE",
      body: "Hi {{1}}, your booking {{2}} is now {{3}}. We will keep you posted on the next steps.",
      footer: "",
      buttons: [],
      variables: ["Andi", "#BR-10231", "approved"],
    },
  },
  {
    id: "document_reminder",
    title: "Document reminder",
    description: "Remind the customer to send required documents.",
    category: "UTILITY",
    type: "default",
    prefill: {
      name: "document_reminder",
      header_type: "NONE",
      body: "Hi {{1}}, we still need {{2}} to process your {{3}}. Please send it at your earliest convenience so we can continue.",
      footer: "",
      buttons: [],
      variables: ["Andi", "a copy of your ID (KTP)", "financing application"],
    },
  },
  {
    id: "auth_otp",
    title: "Verification code",
    description: "One-time passcode for authentication.",
    category: "AUTHENTICATION",
    type: "default",
    prefill: {
      name: "verification_code",
      header_type: "NONE",
      body: "{{1}} is your verification code. For your security, do not share this code.",
      footer: "",
      buttons: [{ type: "QUICK_REPLY", text: "Copy code" }],
      variables: ["123456"],
    },
  },
];
