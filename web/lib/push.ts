"use client";
import { api } from "@/lib/api";
import { getMessagingClient, getToken, deleteToken, onMessage, VAPID_KEY } from "@/lib/firebase";

let registered = false;

// Stable per-browser id sent with the FCM token so the server keeps ONE token
// row per browser (a token refresh replaces it) · prevents duplicate web push.
function browserDeviceId(): string {
  try {
    let id = localStorage.getItem("simpulx_device_id");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
      localStorage.setItem("simpulx_device_id", id);
    }
    return id;
  } catch {
    return "";
  }
}

// registerPush asks for notification permission, obtains an FCM token via the
// service worker, and saves it so the gateway can push to this device. Foreground
// messages trigger onForeground (e.g. refresh the bell). Best-effort + idempotent.
export async function registerPush(onForeground?: () => void) {
  if (registered || typeof window === "undefined") return;
  if (!VAPID_KEY) return; // not configured yet -> push disabled
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return;
    const messaging = await getMessagingClient();
    if (!messaging) return;
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) return;
    await api.registerFCMToken(token, "web", browserDeviceId()).catch(() => {});
    registered = true;
    // Foreground (tab focused): FCM doesn't auto-show data-only messages, so we
    // render the popup here. Background/closed is handled by the service worker.
    onMessage(messaging, async (payload) => {
      onForeground?.(); // refresh the bell
      const d = (payload && (payload as any).data) || {};
      const convId: string | undefined = d.conversationId;
      // Skip if you're already viewing this conversation.
      if (convId && document.visibilityState === "visible" && window.location.search.includes(`c=${convId}`)) return;
      if (Notification.permission !== "granted") return;
      try {
        // Show via the service worker registration, not `new Notification()` -
        // the latter is unreliable/blocked when a service worker controls the page.
        // The SW's notificationclick handles the click (focus tab + open chat).
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(d.title || "Simpulx", {
          body: d.body || "", icon: "/simpulx_logo.png", tag: convId || undefined, data: d,
        });
      } catch { /* ignore */ }
    });
  } catch { /* best effort */ }
}

// unregisterPush removes this browser's FCM token on logout · both server-side
// (so the gateway stops pushing) and client-side (invalidate the token) · so a
// logged-out tab never receives notifications. Best-effort.
// authToken: JWT captured by logout() before the session is cleared, so the
// server-side token removal authenticates despite running after clearSession.
export async function unregisterPush(authToken?: string) {
  if (typeof window === "undefined" || !VAPID_KEY) return;
  try {
    const messaging = await getMessagingClient();
    if (!messaging) return;
    const swReg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg || undefined,
    }).catch(() => null);
    if (token) await api.unregisterFCMToken(token, authToken).catch(() => {});
    await deleteToken(messaging).catch(() => {});
  } catch { /* best effort */ }
  registered = false;
}
