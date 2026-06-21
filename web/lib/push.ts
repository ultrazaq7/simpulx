"use client";
import { api } from "@/lib/api";
import { getMessagingClient, getToken, onMessage, VAPID_KEY } from "@/lib/firebase";

let registered = false;

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
    await api.registerFCMToken(token, "web").catch(() => {});
    registered = true;
    onMessage(messaging, () => { onForeground?.(); });
  } catch { /* best effort */ }
}
