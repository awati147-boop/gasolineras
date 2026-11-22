"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { urlFoto } from "@/lib/garajes";
import { ESTADOS, eurosReserva, fechaReserva, type Reserva } from "@/lib/reservas";
import styles from "../page.module.css";

/** Reservas recibidas (como dueño) y enviadas (como conductor) */
export default function MisReservas(config: ConfigSupabase) {
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [pestana, setPestana] = useState<"recibidas" | "enviadas" | null>(null);

  useEffect(() => {
    const db = supabaseNavegador(config);
    const cargar = () =>
      db.rpc("mis_reservas").then(({ data }) => setReservas((data as Reserva[] | null) ?? []));
    cargar();
    // Si llega una solicitud nueva o cambia un estado, se actualiza sola
    const canal = db
      .channel("mis-reservas")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, cargar)
      .subscribe();
    return () => {
      db.removeChannel(canal);
    };
  }, [config]);

  if (reservas === null) return <div className={styles.esqueleto} />;
  if (reservas.length === 0) return null; // sin reservas todavía: no mostramos el bloque

  const recibidas = reservas.filter((r) => r.rol === "propietario");
  const enviadas = reservas.filter((r) => r.rol === "conductor");
  const pendientes = recibidas.filter((r) => r.estado === "pendiente").length;
  const activa = pestana ?? (recibidas.length ? "recibidas" : "enviadas");
  const lista = activa === "recibidas" ? recibidas : enviadas;

  return (
    <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
      <h2 className={styles.subtitulo}>📅 Mis reservas</h2>
      <nav className={styles.chips} aria-label="Tipo de reservas">
        <button type="button" onClick={() => setPestana("recibidas")}
          className={activa === "recibidas" ? styles.chipActivo : styles.chip}>
          Recibidas {pendientes > 0 && <span className={styles.insignia}>{pendientes}</span>}
        </button>
        <button type="button" onClick={() => setPestana("enviadas")}
          className={activa === "enviadas" ? styles.chipActivo : styles.chip}>
          Enviadas
        </button>
      </nav>

      {lista.length === 0 ? (
        <p className={styles.zona}>
          {activa === "recibidas" ? "Aún no has recibido solicitudes para tus garajes." : "Aún no has pedido ninguna reserva."}
        </p>
      ) : (
        <ul className={styles.lista}>
          {lista.map((r) => {
            const estado = ESTADOS[r.estado];
            return (
              <li key={r.id}>
                <Link href={`/cuenta/reservas/${r.id}`} className={`${styles.miGaraje} ${styles.enlaceReserva}`}>
                  {r.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlFoto(config.url, r.foto)} alt="" className={styles.miniatura} />
                  ) : (
                    <span className={styles.miniatura}>🏠</span>
                  )}
                  <div className={styles.info}>
                    <strong>{r.titulo}</strong>
                    <span className={styles.sub}>
                      {fechaReserva(r.inicio, r.modalidad === "horas")} · {eurosReserva(r.precio)}
                    </span>
                    <span className={styles[estado.clase as keyof typeof styles]}>
                      ● {r.rol === "propietario" && r.estado === "pendiente" ? "Nueva solicitud: responde" : estado.texto}
                    </span>
                  </div>
                  <span className={styles.flecha} aria-hidden>›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
