"use client";

import { useState } from "react";

/** Botón para compartir un enlace: menú del móvil (WhatsApp, etc.) o, si no lo hay, copiar el enlace */
export default function Compartir({ titulo, texto, ruta, className, etiqueta = "📤 Compartir" }: {
  titulo: string; texto: string; ruta: string; className?: string; etiqueta?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = new URL(ruta, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
      } catch {
        // cancelado por el usuario
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copia el enlace:", url);
    }
  }

  return (
    <button type="button" className={className} onClick={compartir} aria-live="polite">
      {copiado ? "✓ Enlace copiado" : etiqueta}
    </button>
  );
}
