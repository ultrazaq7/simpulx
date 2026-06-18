import type { TemplateButton, CarouselCard } from "@/lib/types";

// ── WhatsApp template authoring: sub-types + a pre-written template library ───
// Mirrors the WhatsApp Manager / BSP "Create Message Template" flow: a category,
// a sub-type (Standard / Carousel / Call permission request / Request contact
// info), and a searchable library of ready-made templates to clone. The library
// is localized; English is the canonical copy with Indonesian translations.

export type TemplateType = "standard" | "carousel" | "call_permission" | "request_contact";

export const TEMPLATE_TYPES: Record<TemplateType, { label: string; description: string }> = {
  standard: { label: "Standard", description: "Text, media and customizable buttons." },
  carousel: { label: "Carousel", description: "Up to 10 image/button cards in one message." },
  call_permission: { label: "Call Permission Request", description: "Ask customers if you can call them on WhatsApp." },
  request_contact: { label: "Request Contact Info", description: "Ask customers to share their contact details." },
};

// Sub-types offered per category (matches WhatsApp Manager).
export const TYPES_BY_CATEGORY: Record<string, TemplateType[]> = {
  MARKETING: ["standard", "carousel", "call_permission", "request_contact"],
  UTILITY: ["standard", "carousel", "call_permission", "request_contact"],
  AUTHENTICATION: ["standard"],
};

// Languages the library actually has content for (keeps the selector honest).
export const LIBRARY_LANGS = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian" },
];

export const TEMPLATE_TOPICS = [
  "Identity Verification", "Account Updates", "Order Management", "Payments",
  "Shipping", "Appointment", "Event Reminder", "Customer Care", "Promotions",
] as const;

interface Translation { body: string; header_text?: string; footer?: string; buttons?: string[] }

export interface LibraryTemplate {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  topic: typeof TEMPLATE_TOPICS[number];
  type: TemplateType;
  header_type: string;
  header_text?: string;
  body: string;
  footer?: string;
  buttons: TemplateButton[];
  variables: string[];
  cards?: CarouselCard[];
  i18n?: Record<string, Translation>; // localized copy per language code
}

// localize returns a copy of the template with body/header/footer/button text
// swapped for the requested language (falls back to English).
export function localizeLibrary(t: LibraryTemplate, lang: string): LibraryTemplate {
  const tr = lang === "en" ? undefined : t.i18n?.[lang];
  if (!tr) return t;
  return {
    ...t,
    body: tr.body ?? t.body,
    header_text: tr.header_text ?? t.header_text,
    footer: tr.footer ?? t.footer,
    buttons: t.buttons.map((b, i) => (tr.buttons?.[i] ? { ...b, text: tr.buttons[i] } : b)),
  };
}

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  { id: "account_creation_confirmation", name: "account_creation_confirmation", category: "UTILITY", topic: "Identity Verification", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your new account has been created successfully. Please verify {{2}} to complete your profile.",
    buttons: [{ type: "QUICK_REPLY", text: "Verify account" }], variables: ["Andi", "your email"],
    i18n: { id: { body: "Hai {{1}}, akun baru Anda telah berhasil dibuat. Mohon verifikasi {{2}} untuk melengkapi profil Anda.", buttons: ["Verifikasi akun"] } } },
  { id: "address_update", name: "address_update", category: "UTILITY", topic: "Account Updates", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your shipping address has been updated to {{2}}. Contact {{3}} if this was not you.",
    buttons: [], variables: ["Andi", "Jl. Sudirman No. 1", "support"],
    i18n: { id: { body: "Hai {{1}}, alamat pengiriman Anda telah diperbarui ke {{2}}. Hubungi {{3}} jika ini bukan Anda." } } },
  { id: "appointment_confirmation", name: "appointment_confirmation", category: "UTILITY", topic: "Appointment", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your appointment for {{2}} is confirmed on {{3}} at {{4}}.",
    buttons: [{ type: "QUICK_REPLY", text: "Reschedule" }], variables: ["Andi", "a test drive", "Sat 21 Jun", "10:00"],
    i18n: { id: { body: "Hai {{1}}, janji temu Anda untuk {{2}} telah dikonfirmasi pada {{3}} pukul {{4}}.", buttons: ["Jadwal ulang"] } } },
  { id: "appointment_cancellation", name: "appointment_cancellation", category: "UTILITY", topic: "Appointment", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your upcoming appointment with {{2}} on {{3}} at {{4}} has been cancelled.",
    buttons: [{ type: "QUICK_REPLY", text: "View details" }], variables: ["Andi", "our showroom", "Sat 21 Jun", "10:00"],
    i18n: { id: { body: "Hai {{1}}, janji temu Anda dengan {{2}} pada {{3}} pukul {{4}} telah dibatalkan.", buttons: ["Lihat detail"] } } },
  { id: "appointment_reminder", name: "appointment_reminder", category: "UTILITY", topic: "Event Reminder", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, reminder: your appointment for {{2}} is on {{3}} at {{4}}. Reply to reschedule.",
    buttons: [], variables: ["Andi", "a test drive", "tomorrow", "10:00"],
    i18n: { id: { body: "Hai {{1}}, pengingat: janji temu Anda untuk {{2}} pada {{3}} pukul {{4}}. Balas untuk menjadwalkan ulang." } } },
  { id: "order_confirmation", name: "order_confirmation", category: "UTILITY", topic: "Order Management", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, we received your order {{2}}. Total: {{3}}. We will notify you when it ships.",
    buttons: [], variables: ["Andi", "#BR-10231", "Rp 215.000.000"],
    i18n: { id: { body: "Hai {{1}}, kami telah menerima pesanan Anda {{2}}. Total: {{3}}. Kami akan memberi tahu saat dikirim." } } },
  { id: "order_shipped", name: "order_shipped", category: "UTILITY", topic: "Shipping", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your order {{2}} has shipped and is on its way.",
    buttons: [{ type: "URL", text: "Track order", url: "https://" }], variables: ["Andi", "#BR-10231"],
    i18n: { id: { body: "Hai {{1}}, pesanan Anda {{2}} telah dikirim dan sedang dalam perjalanan.", buttons: ["Lacak pesanan"] } } },
  { id: "order_delivered", name: "order_delivered", category: "UTILITY", topic: "Shipping", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your order {{2}} has been delivered. We hope you love it!",
    buttons: [], variables: ["Andi", "#BR-10231"],
    i18n: { id: { body: "Hai {{1}}, pesanan Anda {{2}} telah sampai. Semoga Anda menyukainya!" } } },
  { id: "payment_received", name: "payment_received", category: "UTILITY", topic: "Payments", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, we received your payment of {{2}} for {{3}}. Thank you.",
    buttons: [], variables: ["Andi", "Rp 5.000.000", "your booking"],
    i18n: { id: { body: "Hai {{1}}, kami telah menerima pembayaran Anda sebesar {{2}} untuk {{3}}. Terima kasih." } } },
  { id: "payment_reminder", name: "payment_reminder", category: "UTILITY", topic: "Payments", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, a friendly reminder that {{2}} is due on {{3}}. Please complete your payment to avoid delays.",
    buttons: [{ type: "URL", text: "Pay now", url: "https://" }], variables: ["Andi", "your installment", "30 Jun 2026"],
    i18n: { id: { body: "Hai {{1}}, pengingat bahwa {{2}} akan jatuh tempo pada {{3}}. Mohon selesaikan pembayaran Anda agar tidak terlambat.", buttons: ["Bayar sekarang"] } } },
  { id: "payment_failed", name: "payment_failed", category: "UTILITY", topic: "Payments", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your payment for {{2}} could not be processed. Please update your payment method.",
    buttons: [{ type: "URL", text: "Update payment", url: "https://" }], variables: ["Andi", "your order"],
    i18n: { id: { body: "Hai {{1}}, pembayaran Anda untuk {{2}} tidak dapat diproses. Mohon perbarui metode pembayaran Anda.", buttons: ["Perbarui pembayaran"] } } },
  { id: "invoice_ready", name: "invoice_ready", category: "UTILITY", topic: "Payments", type: "standard",
    header_type: "DOCUMENT", body: "Hi {{1}}, your invoice {{2}} for {{3}} is ready. You can view or download it anytime.",
    buttons: [{ type: "URL", text: "View invoice", url: "https://" }], variables: ["Andi", "#INV-5521", "Rp 2.500.000"],
    i18n: { id: { body: "Hai {{1}}, faktur Anda {{2}} untuk {{3}} sudah siap. Anda dapat melihat atau mengunduhnya kapan saja.", buttons: ["Lihat faktur"] } } },
  { id: "document_reminder", name: "document_reminder", category: "UTILITY", topic: "Customer Care", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, we still need {{2}} to process your {{3}}. Please send it at your earliest convenience.",
    buttons: [], variables: ["Andi", "a copy of your ID (KTP)", "financing application"],
    i18n: { id: { body: "Hai {{1}}, kami masih memerlukan {{2}} untuk memproses {{3}} Anda. Mohon kirimkan sesegera mungkin." } } },
  { id: "feedback_request", name: "feedback_request", category: "UTILITY", topic: "Customer Care", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, how was your experience with {{2}}? Your feedback helps us improve.",
    buttons: [{ type: "QUICK_REPLY", text: "Great" }, { type: "QUICK_REPLY", text: "Could be better" }], variables: ["Andi", "our service"],
    i18n: { id: { body: "Hai {{1}}, bagaimana pengalaman Anda dengan {{2}}? Masukan Anda membantu kami menjadi lebih baik.", buttons: ["Bagus", "Bisa lebih baik"] } } },
  { id: "test_drive_confirmation", name: "test_drive_confirmation", category: "UTILITY", topic: "Appointment", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your test drive for the {{2}} is confirmed on {{3}} at {{4}}. Please bring a valid ID.",
    buttons: [{ type: "QUICK_REPLY", text: "Reschedule" }], variables: ["Andi", "Honda Brio", "Sat 21 Jun", "HR Muhammad showroom"],
    i18n: { id: { body: "Hai {{1}}, test drive Anda untuk {{2}} telah dikonfirmasi pada {{3}} di {{4}}. Mohon bawa identitas yang sah.", buttons: ["Jadwal ulang"] } } },
  { id: "ticket_update", name: "ticket_update", category: "UTILITY", topic: "Customer Care", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, your support ticket {{2}} is now {{3}}. We will keep you posted.",
    buttons: [], variables: ["Andi", "#T-8842", "in progress"],
    i18n: { id: { body: "Hai {{1}}, tiket dukungan Anda {{2}} sekarang {{3}}. Kami akan terus mengabari Anda." } } },
  { id: "call_permission_request", name: "call_permission_request", category: "UTILITY", topic: "Customer Care", type: "call_permission",
    header_type: "NONE", body: "Hi {{1}}, we would like to call you on WhatsApp to discuss {{2}} in more detail. Do you allow us to call you?",
    buttons: [], variables: ["Andi", "your booking"],
    i18n: { id: { body: "Hai {{1}}, kami ingin menelepon Anda melalui WhatsApp untuk membahas {{2}} lebih lanjut. Apakah Anda mengizinkan kami menelepon?" } } },
  { id: "request_contact_info", name: "request_contact_info", category: "UTILITY", topic: "Customer Care", type: "request_contact",
    header_type: "NONE", body: "Hi {{1}}, to continue with {{2}} we need a few details. Tap below to share your contact info.",
    buttons: [], variables: ["Andi", "your request"],
    i18n: { id: { body: "Hai {{1}}, untuk melanjutkan {{2}} kami memerlukan beberapa data. Ketuk di bawah untuk membagikan info kontak Anda." } } },
  { id: "product_carousel", name: "product_carousel", category: "MARKETING", topic: "Promotions", type: "carousel",
    header_type: "NONE", body: "Hi {{1}}, check out our latest {{2}}. Tap a card to learn more.",
    buttons: [], variables: ["Andi", "arrivals"],
    cards: [
      { media_type: "IMAGE", media_url: "", body: "{{1}} - now available with special pricing.", buttons: [{ type: "URL", text: "View", url: "https://" }] },
      { media_type: "IMAGE", media_url: "", body: "{{1}} - limited units, order today.", buttons: [{ type: "URL", text: "View", url: "https://" }] },
    ],
    i18n: { id: { body: "Hai {{1}}, lihat {{2}} terbaru kami. Ketuk kartu untuk info lebih lanjut." } } },
  { id: "verification_code", name: "verification_code", category: "AUTHENTICATION", topic: "Identity Verification", type: "standard",
    header_type: "NONE", body: "{{1}} is your verification code. For your security, do not share this code with anyone.",
    buttons: [{ type: "QUICK_REPLY", text: "Copy code" }], variables: ["123456"],
    i18n: { id: { body: "{{1}} adalah kode verifikasi Anda. Demi keamanan, jangan bagikan kode ini kepada siapa pun.", buttons: ["Salin kode"] } } },
  { id: "login_otp", name: "login_otp", category: "AUTHENTICATION", topic: "Identity Verification", type: "standard",
    header_type: "NONE", body: "{{1}} is your login code. It will expire in 10 minutes.",
    buttons: [{ type: "QUICK_REPLY", text: "Copy code" }], variables: ["884412"],
    i18n: { id: { body: "{{1}} adalah kode masuk Anda. Kode akan kedaluwarsa dalam 10 menit.", buttons: ["Salin kode"] } } },
  { id: "welcome_offer", name: "welcome_offer", category: "MARKETING", topic: "Promotions", type: "standard",
    header_type: "TEXT", header_text: "Welcome to {{1}}", body: "Hi {{2}}, welcome aboard! Use code {{3}} for 10% off your first purchase.",
    footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Shop now", url: "https://" }], variables: ["Simpulx", "Andi", "WELCOME10"],
    i18n: { id: { header_text: "Selamat datang di {{1}}", body: "Hai {{2}}, selamat bergabung! Gunakan kode {{3}} untuk diskon 10% pembelian pertama Anda.", footer: "Balas STOP untuk berhenti berlangganan", buttons: ["Belanja sekarang"] } } },
  { id: "flash_sale", name: "flash_sale", category: "MARKETING", topic: "Promotions", type: "standard",
    header_type: "IMAGE", body: "Hi {{1}}, flash sale on {{2}} ends {{3}}. Grab yours before it's gone.",
    footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Shop now", url: "https://" }], variables: ["Andi", "the Honda Brio", "Sunday"],
    i18n: { id: { body: "Hai {{1}}, flash sale untuk {{2}} berakhir {{3}}. Dapatkan sebelum kehabisan.", footer: "Balas STOP untuk berhenti berlangganan", buttons: ["Belanja sekarang"] } } },
  { id: "back_in_stock", name: "back_in_stock", category: "MARKETING", topic: "Promotions", type: "standard",
    header_type: "NONE", body: "Hi {{1}}, good news! {{2}} is back in stock. Order before it sells out again.",
    buttons: [{ type: "URL", text: "View product", url: "https://" }], variables: ["Andi", "the Honda Brio"],
    i18n: { id: { body: "Hai {{1}}, kabar baik! {{2}} kembali tersedia. Pesan sebelum kehabisan lagi.", buttons: ["Lihat produk"] } } },
];
