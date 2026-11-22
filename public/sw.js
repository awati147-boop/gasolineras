// Service worker: recibe los avisos push aunque la web esté cerrada.
// (No guarda nada en caché: solo avisos.)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const esIOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent);

self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { titulo: "Aviso", cuerpo: evento.data ? evento.data.text() : "" };
  }
  const titulo = datos.titulo || "Aviso";
  const enlace = datos.enlace || "/cuenta";

  evento.waitUntil(
    (async () => {
      // Si ya estás mirando esa misma pantalla, no molestamos (en iPhone siempre se muestra:
      // Safari retira el permiso a las webs que reciben avisos sin enseñarlos)
      if (!esIOS) {
        const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const mirando = abiertas.some((c) => c.visibilityState === "visible" && new URL(c.url).pathname === enlace);
        if (mirando) return;
      }
      await self.registration.showNotification(titulo, {
        body: datos.cuerpo || "",
        icon: "/iconos/192.png",
        badge: "/iconos/192.png",
        tag: datos.etiqueta || "aviso",
        renotify: true,
        data: { enlace },
      });
    })(),
  );
});

// Al tocar el aviso: abrir (o enfocar) la pantalla correspondiente
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const enlace = (evento.notification.data && evento.notification.data.enlace) || "/cuenta";
  evento.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of abiertas) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(enlace);
          return;
        }
      }
      await self.clients.openWindow(enlace);
    })(),
  );
});
