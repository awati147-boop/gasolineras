"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { urlFoto } from "@/lib/garajes";
import styles from "../../../page.module.css";

type Reserva = {
  id: string; garaje_id: string; titulo: string; foto: string | null; rol: "conductor" | "propietario";
  modalidad: string; inicio: string; fin: string; precio: number; estado: string; cancelada_por: string | null;
};

export const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de respuesta", clase: "estadoPendiente" },
  aceptada: { texto: "Aceptada", clase: "estadoAceptada" },
  rechazada: { texto: "Rechazada", clase: "estadoRechazada" },
  cancelada: { texto: "Cancelada", clase: "estadoRechazada" },
};

const fecha = (iso: string, conHora: boolean) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "short", day: "numeric", month: "short",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

/** Resumen de una reserva (la conversación y los botones de aceptar/rechazar llegan en el siguiente paso) */
export default function DetalleReserva({ reservaId, ...config }: ConfigSupabase & { reservaId: string }) {
  const [r, setR] = useState<Reserva | null | undefined>(undefined);
  const [nueva] = useState(() => typeof window !== "undefined" && window.location.search.includes("nueva=1"));

  useEffect(() => {
    supabaseNavegador(config)
      .rpc("mis_reservas")
      .then(({ data }) => setR(((data as Reserva[] | null) ?? []).find((x) => x.id === reservaId) ?? null));
  }, [config, reservaId]);

  if (r === undefined) return <div className={styles.esqueleto} style={{ height: 240 }} />;
  if (r === null) {
    return (
      <div className={styles.vacio}>
        <p>No encontramos esta reserva. Puede que tengas que entrar en tu cuenta.</p>
        <Link href="/cuenta" className={styles.boton}>Ir a Mi cuenta</Link>
      </div>
    );
  }

  const estado = ESTADOS[r.estado];
  const conHora = r.modalidad === "horas";
  return (
    <>
      <Link href="/cuenta" className={styles.volver}>← Mi cuenta</Link>
      {nueva && (
        <p className={styles.exito}>
          ✅ ¡Solicitud enviada! El dueño la verá en su cuenta y podrá aceptarla o rechazarla.
        </p>
      )}
      <section className={`${styles.tarjeta} ${styles.resumenGaraje}`}>
        {r.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(config.url, r.foto)} alt="" />
        )}
        <div>
          <strong>{r.titulo}</strong>
          <span className={styles.sub}>{fecha(r.inicio, conHora)} → {fecha(r.fin, conHora)}</span>
          <b className={styles.precioResumen}>{Number(r.precio).toFixed(2).replace(".", ",")} €</b>
          <span className={styles[estado.clase as keyof typeof styles]}>● {estado.texto}</span>
        </div>
      </section>
      <div className={`${styles.tarjeta} ${styles.proximo}`}>
        <span>
          💬 Muy pronto podréis hablar por un <b>chat</b> aquí mismo, y {r.rol === "propietario" ? "podrás aceptar o rechazar la solicitud" : "verás la dirección exacta cuando el dueño acepte"}.
        </span>
      </div>
    </>
  );
}
