"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../../../page.module.css";

const ETIQUETAS = ["", "Muy mal", "Mal", "Normal", "Bien", "¡Genial!"];

/** Valorar una reserva terminada: estrellas (obligatorio) y un comentario corto (opcional) */
export default function Valorar({ db, reservaId, soyDueno, onHecho }: {
  db: SupabaseClient; reservaId: string; soyDueno: boolean; onHecho: () => void;
}) {
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!estrellas) return setError("Elige de 1 a 5 estrellas.");
    setEnviando(true);
    setError("");
    const { error } = await db.from("valoraciones").insert({ reserva_id: reservaId, estrellas, comentario: comentario.trim() || null });
    setEnviando(false);
    if (error && !/duplicate|unique/i.test(error.message)) {
      return setError(/plazo|termine|propias/.test(error.message) ? error.message : "No se ha podido enviar. Inténtalo de nuevo.");
    }
    onHecho();
  }

  return (
    <form onSubmit={enviar} className={`${styles.tarjeta} ${styles.valorar}`} aria-label="Valorar">
      <h2 className={styles.subtitulo}>⭐ {soyDueno ? "¿Qué tal el conductor?" : "¿Qué tal el garaje?"}</h2>
      <p className={styles.zona}>
        {soyDueno
          ? "Ayuda a otros dueños: solo la verán cuando este conductor les pida una reserva."
          : "Tu opinión ayuda a otros conductores. Se publica sin tu nombre."}
      </p>
      <div className={styles.estrellas} role="radiogroup" aria-label="Estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={estrellas === n} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            className={n <= estrellas ? styles.estrellaOn : styles.estrellaOff} onClick={() => setEstrellas(n)}>
            ★
          </button>
        ))}
        <span className={styles.sub}>{ETIQUETAS[estrellas]}</span>
      </div>
      {!soyDueno && (
        <label className={styles.campo}>
          Comentario <small>(opcional)</small>
          <textarea rows={2} maxLength={300} value={comentario} onChange={(e) => setComentario(e.target.value)}
            placeholder="Fácil de encontrar, buen acceso, el dueño muy atento…" />
        </label>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.boton} disabled={enviando || !estrellas}>
        {enviando ? "Enviando…" : "Enviar valoración"}
      </button>
    </form>
  );
}
