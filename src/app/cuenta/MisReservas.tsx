"use client";

import { useState } from "react";
import Link from "next/link";
import { urlFoto } from "@/lib/garajes";
import { ESTADOS, agruparReservas, eurosReserva, fechaReserva, pendienteDeResponder, porValorar, textoEstado, type Reserva } from "@/lib/reservas";
import styles from "../page.module.css";

const ANTERIORES_VISIBLES = 3;

/** Reservas recibidas (como dueño) y enviadas (como conductor), ordenadas: por responder, próximas y anteriores */
export default function MisReservas({ reservas, url }: { reservas: Reserva[] | null; url: string }) {
  const [pestana, setPestana] = useState<"recibidas" | "enviadas" | null>(null);
  const [todas, setTodas] = useState(false);

  if (reservas === null) return <div className={styles.esqueleto} />;
  if (reservas.length === 0) return null; // sin reservas todavía: no mostramos el bloque

  const recibidas = reservas.filter((r) => r.rol === "propietario");
  const enviadas = reservas.filter((r) => r.rol === "conductor");
  const pendientes = recibidas.filter(pendienteDeResponder).length; // con pago: solo las ya pagadas
  const activa = pestana ?? (recibidas.length ? "recibidas" : "enviadas");
  const grupos = agruparReservas(activa === "recibidas" ? recibidas : enviadas);
  const anteriores = todas ? grupos.anteriores : grupos.anteriores.slice(0, ANTERIORES_VISIBLES);

  const fila = (r: Reserva) => (
    <li key={r.id}>
      <Link href={`/cuenta/reservas/${r.id}`} className={`${styles.miGaraje} ${styles.enlaceReserva}`}>
        {r.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(url, r.foto)} alt="" className={styles.miniatura} />
        ) : (
          <span className={styles.miniatura}>🏠</span>
        )}
        <div className={styles.info}>
          <strong>{r.titulo}</strong>
          <span className={styles.sub}>
            {fechaReserva(r.inicio, r.modalidad === "horas")} · {eurosReserva(r.precio)}
          </span>
          <span className={styles[ESTADOS[r.estado].clase as keyof typeof styles]}>
            ● {textoEstado(r)}
            {porValorar(r) && <span className={styles.etiquetaValorar}>⭐ Valorar</span>}
          </span>
        </div>
        <span className={styles.flecha} aria-hidden>›</span>
      </Link>
    </li>
  );

  const seccion = (titulo: string, lista: Reserva[], total = lista.length) =>
    lista.length > 0 && (
      <>
        <h3 className={styles.grupoReservas}>{titulo} <span>{total}</span></h3>
        <ul className={styles.lista}>{lista.map(fila)}</ul>
      </>
    );

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

      {grupos.pendientes.length + grupos.proximas.length + grupos.anteriores.length === 0 ? (
        <p className={styles.zona}>
          {activa === "recibidas" ? "Aún no has recibido solicitudes para tus garajes." : "Aún no has pedido ninguna reserva."}
        </p>
      ) : (
        <>
          {seccion("Pendientes", grupos.pendientes)}
          {seccion("Próximas", grupos.proximas)}
          {seccion("Anteriores", anteriores, grupos.anteriores.length)}
          {grupos.anteriores.length > ANTERIORES_VISIBLES && (
            <button type="button" className={styles.verMas} onClick={() => setTodas((x) => !x)}>
              {todas ? "Ver menos" : `Ver todas las anteriores (${grupos.anteriores.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
