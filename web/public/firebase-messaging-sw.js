/* Firebase Cloud Messaging service worker — handles background (tab closed) pushes.
   Uses the compat SDK via importScripts (service workers can't import npm modules).
   The config is public (apiKey is an identifier, not a secret). */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBZPxwDLJEzQ3vl25xXoWxpIVTXnxyB49U",
  authDomain: "simpulx-1.firebaseapp.com",
  projectId: "simpulx-1",
  storageBucket: "simpulx-1.firebasestorage.app",
  messagingSenderId: "1077409983428",
  appId: "1:1077409983428:web:9950dd86dfd773dae35291",
});

const messaging = firebase.messaging();

// Data-only messages: render here. If a tab is open (even unfocused) the in-app
// handler shows it, so skip to avoid a duplicate; only show when no tab is open.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    if (wins.length > 0) return;
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
  const url = convId ? `/inbox?c=${convId}` : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ("focus" in w) { w.focus(); w.navigate && w.navigate(url); return; } }
      return clients.openWindow(url);
    })
  );
});
