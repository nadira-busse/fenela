// Mirrors src/lib/notificationPath.ts's safeNotificationPath(). This is a
// classic (non-module) service worker script — it cannot import a
// TypeScript/ES module — so this is a deliberate, tested-elsewhere
// duplicate. Keep in sync with that file if this logic ever changes.
// Only a relative, same-origin path starting with exactly one "/" is
// accepted; anything else (missing, external, protocol-relative, or a
// backslash trick some browsers normalize to protocol-relative) falls
// back to "/" instead of becoming a navigation target.
function safeNotificationPath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return "/";
  if (!/^\/(?!\/|\\)\S*$/.test(candidate)) return "/";
  if (candidate.includes("://")) return "/";
  return candidate;
}

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "Fenéla";
  const options = {
    body: data.body || "",
    data: { url: safeNotificationPath(data.url) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const path = safeNotificationPath(event.notification.data && event.notification.data.url);
      const urlToOpen = new URL(path, self.location.origin).toString();

      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const existing = allClients.find((c) => c.url === urlToOpen);
      if (existing) {
        existing.focus();
        return;
      }

      await clients.openWindow(urlToOpen);
    })()
  );
});
