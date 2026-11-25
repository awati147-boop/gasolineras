"use client";

import { useEffect, useState } from "react";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import styles from "../page.module.css";

type Estado = "cargando" | "no-soportado" | "ios-sin-instalar" | "apagados" | "activados" | "bloqueados";

/** Clave pública VAPID (base64url) -> bytes, como pide pushManager.subscribe() */
function aBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const instalada = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Botón "Activar avisos" para este dispositivo (solicitudes, respuestas y mensajes de reservas) */
export default function ActivarAvisos({ vapid, ...config }: ConfigSupabase & { vapid: string }) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // En iPhone, los avisos solo existen si la web está instalada en la pantalla de inicio
        return setEstado(esIOS() && !instalada() ? "ios-sin-instalar" : "no-soportado");
      }
      if (Notification.permission === "denied") return setEstado("bloqueados");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub && Notification.permission === "granted" ? "activados" : "apagados");
    })().catch(() => setEstado("no-soportado"));
  }, []);

  async function activar() {
    setError("");
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueados" : "apagados");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(vapid) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await db.rpc("registrar_dispositivo", {
        p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth,
      });
      if (error) throw new Error(error.message);
      setEstado("activados");
    } catch {
      setError("No se han podido activar los avisos en este dispositivo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await db.from("push_suscripciones").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("apagados");
    } catch {
      setError("No se han podido desactivar los avisos. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando" || estado === "no-soportado") return null;

  return (
    <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
      <h2 className={styles.subtitulo}>🔔 Avisos</h2>
      {estado === "activados" && (
        <>
          <p className={styles.zona}>✅ Recibirás avisos en este dispositivo de solicitudes, respuestas y mensajes.</p>
          <button className={styles.botonSec} onClick={desactivar} disabled={ocupado}>Desactivar en este dispositivo</button>
        </>
      )}
      {estado === "apagados" && (
        <>
          <p className={styles.zona}>Entérate al momento cuando alguien pida tu garaje, te acepten una reserva o te escriban.</p>
          <button className={styles.boton} onClick={activar} disabled={ocupado}>{ocupado ? "Activando…" : "Activar avisos"}</button>
        </>
      )}
      {estado === "ios-sin-instalar" && (
        <p className={styles.zona}>
          En iPhone los avisos solo funcionan con la app instalada: pulsa <b>Compartir ⬆️</b> →{" "}
          <b>Añadir a pantalla de inicio</b>, ábrela desde el icono y vuelve aquí.
        </p>
      )}
      {estado === "bloqueados" && (
        <p className={styles.zona}>
          Has bloqueado los avisos para esta web. Para activarlos, cambia el permiso de <b>Notificaciones</b> en los ajustes del
          navegador (icono del candado junto a la dirección) y recarga.
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
