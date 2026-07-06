self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "Fenéla";
  const options = {
    body: data.body || "",
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const urlToOpen = new URL("/", self.location.origin).toString();

      const existing = allClients.find((c) => c.url === urlToOpen);
      if (existing) {
        existing.focus();
        return;
      }

      await clients.openWindow(urlToOpen);
    })()
  );
});
