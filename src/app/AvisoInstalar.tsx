"use client";

import { useEffect, useState } from "react";
import { NOMBRE_CORTO } from "@/lib/app";
import { Logo } from "./Iconos";

// Evento de Chrome/Edge/Android para instalar la PWA (no está en los tipos estándar)
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const CLAVE = "aviso-instalar-cerrado";
const DIAS_SIN_MOLESTAR = 30;
const RETRASO_MS = 6000;

function yaInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function esIOS() {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac con pantalla táctil
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function cerradoHacePoco() {
  try {
    const t = Number(localStorage.getItem(CLAVE));
    return Number.isFinite(t) && Date.now() - t < DIAS_SIN_MOLESTAR * 86_400_000;
  } catch {
    return false; // sin almacenamiento (modo privado…): se muestra igualmente
  }
}

/** Tarjeta que invita a instalar la app: botón en Android/escritorio, pasos en iPhone */
export default function AvisoInstalar() {
  const [modo, setModo] = useState<"ios" | "boton" | null>(null);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    if (yaInstalada() || cerradoHacePoco()) return;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    if (esIOS()) {
      temporizador = setTimeout(() => setModo("ios"), RETRASO_MS);
    }
    const alPoderInstalar = (e: Event) => {
      if (esIOS()) return; // en iPhone/iPad se muestran los pasos de Safari
      e.preventDefault(); // guardamos el evento para lanzarlo desde nuestro botón
      setEvento(e as EventoInstalar);
      temporizador = setTimeout(() => setModo("boton"), RETRASO_MS);
    };
    const alInstalar = () => setModo(null);
    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  function cerrar() {
    setModo(null);
    try {
      localStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      /* sin almacenamiento: solo se cierra esta vez */
    }
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    if (outcome === "accepted") setModo(null);
    else cerrar();
  }

  if (!modo) return null;

  return (
    <aside className="aviso-instalar" role="dialog" aria-label="Instalar la app">
      <button className="aviso-cerrar" onClick={cerrar} aria-label="Cerrar">×</button>
      <div className="aviso-cab">
        <Logo tam={44} />
        <div>
          <strong>Instala {NOMBRE_CORTO}</strong>
          <small>Ábrela como una app, a pantalla completa y sin buscarla.</small>
        </div>
      </div>

      {modo === "boton" ? (
        <button className="aviso-boton" onClick={instalar}>Instalar app gratis</button>
      ) : (
        <ol className="aviso-pasos">
          <li>
            <span>1</span>
            Pulsa
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Compartir">
              <path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>
            <b>Compartir</b> en la barra de Safari
          </li>
          <li>
            <span>2</span>
            Elige
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
            </svg>
            <b>Añadir a pantalla de inicio</b>
          </li>
        </ol>
      )}
    </aside>
  );
}
