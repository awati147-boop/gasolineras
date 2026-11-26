"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AVISO_MIN, PRECISION_MALA_M, alCambiarCoche, alarmaTicket, guardarCoche, leerCoche, localizarPreciso, verCocheEnMapa,
  type MiCoche as Coche,
} from "@/lib/miCoche";
import styles from "./page.module.css";

const hora = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const duracion = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const TICKETS = [30, 60, 120];

/** Tarjeta "Mi coche": guardar dónde aparqué, volver andando y cuenta atrás del ticket de la ORA */
export default function MiCoche({ enMeVoy = false }: { enMeVoy?: boolean }) {
  const [coche, setCoche] = useState<Coche | null | undefined>(undefined); // undefined = aún sin leer
  const [ahora, setAhora] = useState(() => Date.now());
  const [estado, setEstado] = useState<"" | "localizando">("");
  const [precisionAhora, setPrecisionAhora] = useState<number | null>(null); // mientras se busca la señal
  const [error, setError] = useState("");
  const [otraHora, setOtraHora] = useState("");

  // Lee lo guardado (solo existe en el navegador) y se entera de los cambios
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoche(leerCoche());
    return alCambiarCoche(setCoche);
  }, []);

  // Cuenta atrás: cada 15 s; aviso en el móvil 10 min antes del fin del ticket (si la web está abierta)
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setAhora(n);
      const c = leerCoche();
      if (!c?.ticketHasta || c.avisado) return;
      const queda = (new Date(c.ticketHasta).getTime() - n) / 60e3;
      if (queda <= AVISO_MIN) {
        guardarCoche({ ...c, avisado: true });
        navigator.vibrate?.([200, 100, 200]);
        if ("Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.getRegistration().then((reg) =>
            reg?.showNotification("🚗 Se acaba tu ticket", { body: `Quedan ${duracion(queda)}. Renuévalo o mueve el coche.`, tag: "ticket" }),
          );
        }
      }
    }, 15e3);
    return () => clearInterval(t);
  }, []);

  async function aparcarAqui() {
    setError("");
    if (!navigator.geolocation) return setError("Tu navegador no permite obtener la ubicación.");
    setEstado("localizando");
    setPrecisionAhora(null);
    try {
      // Espera unos segundos a la señal del GPS y se queda con la lectura más precisa
      const p = await localizarPreciso(setPrecisionAhora);
      guardarCoche({ lat: p.lat, lon: p.lon, precision: p.precision, aparcado: new Date().toISOString(), ticketHasta: null });
    } catch (e) {
      setError((e as Error).message || "No se ha podido obtener tu ubicación. Revisa que el navegador tenga permiso.");
    } finally {
      setEstado("");
    }
  }

  function ponerTicket(hasta: Date) {
    if (!coche) return;
    if (hasta.getTime() <= Date.now()) return setError("Esa hora ya ha pasado.");
    setError("");
    guardarCoche({ ...coche, ticketHasta: hasta.toISOString(), avisado: false });
  }

  function ticketAHora(e: React.FormEvent) {
    e.preventDefault();
    const [h, m] = otraHora.split(":").map(Number);
    if (!Number.isFinite(h)) return;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    if (d.getTime() < Date.now() - 60e3) d.setDate(d.getDate() + 1); // p. ej. a las 23:00 pone las 01:00
    ponerTicket(d);
  }

  function descargarAlarma() {
    if (!coche?.ticketHasta) return;
    const url = URL.createObjectURL(alarmaTicket(new Date(coche.ticketHasta)));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticket-aparcamiento.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (coche === undefined) return null;

  // ---------- Sin coche guardado ----------
  if (!coche) {
    if (enMeVoy) return null;
    return (
      <section className={`${styles.tarjeta} ${styles.miCoche}`} aria-label="Mi coche">
        <div className={styles.miCocheCab}>
          <span aria-hidden>🚗</span>
          <p><b>¿Ya has aparcado?</b> Guarda dónde para volver al coche y controlar el ticket de la ORA.</p>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="button" className={`${styles.boton} ${styles.botonAncho}`} onClick={aparcarAqui} disabled={estado === "localizando"}>
          {estado === "localizando"
            ? `Buscando señal GPS…${precisionAhora !== null ? ` ±${precisionAhora} m` : ""}`
            : "📍 He aparcado aquí"}
        </button>
        <p className={styles.notaPrivacidad}>📱 Se guarda solo en este móvil.</p>
      </section>
    );
  }

  // ---------- Coche guardado ----------
  const aparcado = new Date(coche.aparcado);
  const hasta = coche.ticketHasta ? new Date(coche.ticketHasta) : null;
  const queda = hasta ? (hasta.getTime() - ahora) / 60e3 : null;
  // Navegación a pie directa hasta el coche (Google Maps: app si la tienes, si no, la web)
  const comoVolver = `https://www.google.com/maps/dir/?api=1&destination=${coche.lat},${coche.lon}&travelmode=walking&dir_action=navigate`;
  const imprecisa = coche.precision != null && coche.precision > PRECISION_MALA_M;

  return (
    <section className={`${styles.tarjeta} ${styles.miCoche}`} aria-label="Mi coche">
      <div className={styles.miCocheCab}>
        <span aria-hidden>🚗</span>
        <p>
          <b>Tu coche</b>
          <small>Aparcado a las {hora(aparcado)} · {ahora - aparcado.getTime() < 60e3 ? "ahora mismo" : `hace ${duracion((ahora - aparcado.getTime()) / 60e3)}`}</small>
          <small>
            {coche.precision === null ? "📍 Colocado a mano en el mapa" : coche.precision != null ? `📍 Guardado con ±${coche.precision} m` : null}
            {" · "}
            {enMeVoy ? (
              <Link href="/aparcar#coche" className={styles.enlaceBoton}>Ver en el mapa</Link>
            ) : (
              <button type="button" className={styles.enlaceBoton} onClick={verCocheEnMapa}>Ver en el mapa</button>
            )}
          </small>
        </p>
      </div>
      {imprecisa && (
        <p className={styles.aviso}>
          ⚠️ La ubicación es poco precisa (±{coche.precision} m). Mira el 🚗 en el mapa y arrástralo a su sitio, o
          vuelve a guardarla con el GPS activado.
        </p>
      )}

      {/* Ticket de la ORA o del parquímetro */}
      {hasta && queda !== null ? (
        <div className={queda <= 0 ? styles.ticketCaducado : queda <= AVISO_MIN ? styles.ticketPoco : styles.ticket} aria-live="polite">
          <b>{queda > 0 ? `🎫 Te quedan ${duracion(queda)}` : `⚠️ El ticket se acabó hace ${duracion(-queda)}`}</b>
          <small>Hasta las {hora(hasta)}</small>
          <div className={styles.ticketBotones}>
            {queda > 0 && <button type="button" className={styles.enlaceBoton} onClick={descargarAlarma}>⏰ Ponerme una alarma</button>}
            <button type="button" className={styles.enlaceBoton} onClick={() => guardarCoche({ ...coche, ticketHasta: null, avisado: false })}>
              Cambiar ticket
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.ticketNuevo}>
          <small>🎫 ¿Has sacado ticket? Te avisamos antes de que se acabe:</small>
          <div className={styles.chips}>
            {TICKETS.map((m) => (
              <button key={m} type="button" className={styles.chip} onClick={() => ponerTicket(new Date(Date.now() + m * 60e3))}>
                {duracion(m)}
              </button>
            ))}
          </div>
          <form onSubmit={ticketAHora} className={styles.ticketHora}>
            <label>
              Hasta las
              <input type="time" value={otraHora} onChange={(e) => setOtraHora(e.target.value)} required />
            </label>
            <button type="submit" className={styles.botonSec}>Guardar</button>
          </form>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.miCocheBotones}>
        <a href={comoVolver} target="_blank" rel="noopener" className={styles.boton}>🚶 Cómo volver</a>
        {enMeVoy ? (
          <button type="button" className={styles.botonSec} onClick={() => guardarCoche(null)}>Olvidar</button>
        ) : (
          <Link href="/me-voy" className={styles.botonSec}>Me voy</Link>
        )}
      </div>
      <p className={styles.notaPrivacidad}>
        📱 Se guarda solo en este móvil.{hasta && queda !== null && queda > 0 && " El aviso suena si tienes la app abierta; con la alarma, también cerrada."}
      </p>
    </section>
  );
}
