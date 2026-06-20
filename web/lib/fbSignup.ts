// WhatsApp Embedded Signup — thin wrapper over Meta's Facebook JS SDK.
//
// launchWhatsAppSignup() loads the SDK, opens Meta's real Embedded Signup popup,
// and resolves with the OAuth `code` plus the selected `waba_id` /
// `phone_number_id` (read from the popup's postMessage session info). The gateway
// (POST /api/channels/embedded-signup) finishes provisioning server-side.
//
// Reads NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID (baked at build
// time). When unset, isMetaSignupConfigured() is false and the UI hides the
// Facebook button — the Direct Cloud API path still works.

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const GRAPH_VERSION = "v21.0";

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || "";

export function isMetaSignupConfigured(): boolean {
  return Boolean(APP_ID && CONFIG_ID);
}

export type WaSignupResult = { code: string; waba_id: string; phone_number_id: string };

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Facebook SDK can only load in the browser"));
    const w = window as any;
    if (w.FB) return resolve();
    w.fbAsyncInit = function () {
      w.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: GRAPH_VERSION });
      resolve();
    };
    if (document.getElementById("facebook-jssdk")) return; // init handler will resolve
    const s = document.createElement("script");
    s.id = "facebook-jssdk";
    s.src = SDK_SRC;
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => { sdkPromise = null; reject(new Error("Failed to load the Facebook SDK")); };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

// launchWhatsAppSignup opens the popup and resolves once both the auth code and
// the WABA session info are available.
export async function launchWhatsAppSignup(): Promise<WaSignupResult> {
  if (!isMetaSignupConfigured()) {
    throw new Error("WhatsApp signup is not configured (NEXT_PUBLIC_META_APP_ID / NEXT_PUBLIC_META_CONFIG_ID).");
  }
  await loadSdk();
  const FB = (window as any).FB;
  if (!FB) throw new Error("Facebook SDK is unavailable");

  return new Promise<WaSignupResult>((resolve, reject) => {
    const session: { waba_id?: string; phone_number_id?: string } = {};

    const onMessage = (event: MessageEvent) => {
      // Only trust messages from Facebook's own origins.
      if (!event.origin || !/\.facebook\.com$/.test(new URL(event.origin).hostname)) return;
      let data: any;
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
      catch { return; } // non-JSON SDK chatter
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.data?.waba_id) session.waba_id = data.data.waba_id;
      if (data.data?.phone_number_id) session.phone_number_id = data.data.phone_number_id;
      if (data.event === "CANCEL" || data.event === "ERROR") {
        cleanup();
        reject(new Error(data.data?.error_message || "WhatsApp signup was cancelled"));
      }
    };
    const cleanup = () => window.removeEventListener("message", onMessage);
    window.addEventListener("message", onMessage);

    FB.login(
      (response: any) => {
        cleanup();
        const code = response?.authResponse?.code;
        if (!code) return reject(new Error("Facebook login was not completed"));
        if (!session.waba_id || !session.phone_number_id) {
          return reject(new Error("Could not read the WhatsApp account from the signup. Please try again."));
        }
        resolve({ code, waba_id: session.waba_id, phone_number_id: session.phone_number_id });
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  });
}
