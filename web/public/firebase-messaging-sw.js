/* Firebase Cloud Messaging service worker — handles background (tab closed) pushes.
   Uses the compat SDK via importScripts (service workers can't import npm modules).
   The config is public (apiKey is an identifier, not a secret). */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC2QHoUeQqW5CpWKQkyccrD7FcgUttJ-M4",
  authDomain: "simpulx-ffbd1.firebaseapp.com",
  projectId: "simpulx-ffbd1",
  storageBucket: "simpulx-ffbd1.firebasestorage.app",
  messagingSenderId: "96923905702",
  appId: "1:96923905702:web:aa7c2f4fa426153b944e67",
});

// Activate a new service worker immediately so updates don't require closing all
// tabs (the previous version got stuck waiting).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// Data-only messages: render the OS notification here. onBackgroundMessage only
// fires when the page isn't focused, so show it; skip only if a tab is actually
// focused (the in-app handler covers that case) to avoid a duplicate.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    if (wins.some((w) => w.focused)) return;
    return self.registration.showNotification(d.title || "Simpulx", {
      body: d.body || "",
      icon: "/simpulx_logo.png",
      tag: d.conversationId || undefined,
      data: d,
    });
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const convId = event.notification.data && event.notification.data.conversationId;
  const url = convId ? `/inbox?c=${convId}` : "/inbox";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Reuse an open tab: focus it and tell the app to open the conversation
      // (an in-app message switches it even when already on /inbox).
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          if (convId && "postMessage" in w) w.postMessage({ type: "open-conversation", convId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
