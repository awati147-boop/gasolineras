"use client";

import { useState } from "react";
import { asegurarSesion, supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";

const MOTIVOS: [string, string][] = [
  ["estafa", "Estafa o anuncio falso"],
  ["inapropiado", "Contenido ofensivo o inapropiado"],
  ["datos_personales", "Muestra datos personales"],
  ["spam", "Spam o publicidad"],
  ["otro", "Otro motivo"],
];

/** Enlace "Denunciar" que despliega un pequeño formulario */
export default function Denunciar({ tipo, objetoId, ...config }: ConfigSupabase & { tipo: "garaje" | "reserva"; objetoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("estafa");
  const [detalle, setDetalle] = useState("");
  const [estado, setEstado] = useState<"" | "enviando" | "hecho">("");
  const [error, setError] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEstado("enviando");
    const db = supabaseNavegador(config);
    try {
      await asegurarSesion(db); // sin cuenta se usa un usuario anónimo
      const { error } = await db.from("denuncias").insert({ tipo, objeto_id: objetoId, motivo, detalle: detalle.trim() || null });
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(/demasiadas|muchas/.test(error.message) ? error.message : "No se ha podido enviar la denuncia.");
      setEstado("hecho");
    } catch (err) {
      setError((err as Error).message);
      setEstado("");
    }
  }

  if (estado === "hecho") {
    return <p className="denuncia-hecha">Gracias. Revisaremos {tipo === "garaje" ? "el anuncio" : "la conversación"} lo antes posible.</p>;
  }
  if (!abierto) {
    return (
      <button type="button" className="denunciar-enlace" onClick={() => setAbierto(true)}>
        ⚑ Denunciar {tipo === "garaje" ? "anuncio" : "conversación"}
      </button>
    );
  }
  return (
    <form className="denuncia" onSubmit={enviar}>
      <strong>¿Qué ocurre?</strong>
      {MOTIVOS.map(([v, t]) => (
        <label key={v}>
          <input type="radio" name={`motivo-${objetoId}`} value={v} checked={motivo === v} onChange={() => setMotivo(v)} />
          {t}
        </label>
      ))}
      <textarea rows={2} maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Cuéntanos algo más (opcional)" />
      {error && <p className="denuncia-error">{error}</p>}
      <div className="denuncia-botones">
        <button type="button" onClick={() => setAbierto(false)}>Cancelar</button>
        <button type="submit" disabled={estado === "enviando"}>{estado === "enviando" ? "Enviando…" : "Enviar denuncia"}</button>
      </div>
    </form>
  );
}
