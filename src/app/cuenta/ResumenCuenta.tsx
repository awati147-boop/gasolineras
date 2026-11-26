"use client";

import Link from "next/link";
import { comisionDueno } from "@/lib/pagos";
import { eurosReserva, fechaReserva, resumenReservas, type Reserva } from "@/lib/reservas";
import styles from "../page.module.css";

/** Panel de un vistazo: qué hay que responder, cuál es la próxima reserva y lo ganado este mes */
export default function ResumenCuenta({ reservas }: { reservas: Reserva[] }) {
  const r = resumenReservas(reservas, comisionDueno);
  const mes = new Date().toLocaleDateString("es-ES", { month: "long" });
  // Tarjetas pequeñas (dueño: por responder y este mes; conductor: esperando respuesta)
  const pequenas = (r.esDueno ? 2 : r.esperando > 0 ? 1 : 0) + (r.porValorar.length ? 1 : 0);

  return (
    <section className={styles.panelCuenta} aria-label="Resumen">
      {r.esDueno && (
        <a href="#reservas" className={`${styles.tarjeta} ${styles.panelDato} ${r.porResponder ? styles.panelAlerta : ""}`}>
          <small>📩 Por responder</small>
          <b>{r.porResponder}</b>
          <span>{r.porResponder ? (r.porResponder === 1 ? "solicitud nueva" : "solicitudes nuevas") : "Todo al día"}</span>
        </a>
      )}
      {!r.esDueno && r.esperando > 0 && (
        <a href="#reservas" className={`${styles.tarjeta} ${styles.panelDato}`}>
          <small>⏳ Esperando respuesta</small>
          <b>{r.esperando}</b>
          <span>{r.esperando === 1 ? "solicitud enviada" : "solicitudes enviadas"}</span>
        </a>
      )}

      {r.esDueno && (
        <a href="#reservas" className={`${styles.tarjeta} ${styles.panelDato}`}>
          <small>💶 En {mes}</small>
          <b>{eurosReserva(r.ganadoMes)}</b>
          <span>{r.reservasMes} {r.reservasMes === 1 ? "reserva aceptada" : "reservas aceptadas"}</span>
        </a>
      )}

      {r.porValorar.length > 0 && (
        <Link href={`/cuenta/reservas/${r.porValorar[0].id}`} className={`${styles.tarjeta} ${styles.panelDato}`}>
          <small>⭐ Por valorar</small>
          <b>{r.porValorar.length}</b>
          <span>{r.porValorar.length === 1 ? "reserva terminada" : "reservas terminadas"}</span>
        </Link>
      )}

      {/* Ocupa toda la fila en el móvil si las tarjetas pequeñas son pares (o no hay) */}
      {r.proxima ? (
        <Link href={`/cuenta/reservas/${r.proxima.id}`} className={`${styles.tarjeta} ${styles.panelDato} ${pequenas % 2 ? "" : styles.panelAncho}`}>
          <small>📅 Próxima reserva{r.proxima.rol === "propietario" ? " en tu garaje" : ""}</small>
          <b className={styles.panelTexto}>{fechaReserva(r.proxima.inicio, true)}</b>
          <span>{r.proxima.titulo}</span>
        </Link>
      ) : (
        <Link href="/aparcar" className={`${styles.tarjeta} ${styles.panelDato} ${pequenas % 2 ? "" : styles.panelAncho}`}>
          <small>📅 Próxima reserva</small>
          <b className={styles.panelTexto}>Ninguna</b>
          <span>Buscar un garaje →</span>
        </Link>
      )}
    </section>
  );
}
