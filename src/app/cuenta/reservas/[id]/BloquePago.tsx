"use client";

import { COMISION_PCT, TEXTO_PAGO, fechaTransferencia, limiteRespuesta, type Pago } from "@/lib/pagos";
import { eurosReserva, type Reserva } from "@/lib/reservas";
import styles from "../../../page.module.css";

const fecha = (d: Date) =>
  d.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Desglose y estado del pago en la app de una reserva (para el conductor o para el dueño) */
export default function BloquePago({
  pago, r, comprobando, ocupado, onPagar,
}: {
  pago: Pago;
  r: Reserva;
  comprobando: boolean;
  ocupado: boolean;
  onPagar: () => void;
}) {
  const soyDueno = r.rol === "propietario";
  const texto = TEXTO_PAGO[pago.estado][soyDueno ? "propietario" : "conductor"];
  const bien = ["autorizado", "cobrado", "transferido"].includes(pago.estado);
  const puedePagar = !soyDueno && pago.estado === "por_pagar" && r.estado === "pendiente";

  return (
    <section className={`${styles.tarjeta} ${styles.bloquePago}`} aria-label="Pago">
      <div className={styles.cabBloque}>
        <h2 className={styles.subtitulo}>💳 Pago en la app</h2>
        {!pago.es_real && <span className={styles.etiquetaPrueba} title="No se mueve dinero real">🧪 Modo prueba</span>}
      </div>

      <p className={bien ? styles.estadoAceptada : pago.estado === "por_pagar" ? styles.estadoPendiente : styles.sub} role="status">
        {comprobando && pago.estado === "por_pagar" ? "⏳ Comprobando el pago…" : `● ${texto}`}
      </p>

      <dl className={styles.desglose}>
        {soyDueno ? (
          <>
            <dt>Tu precio</dt>
            <dd>{eurosReserva(pago.precio)}</dd>
            <dt>Comisión ({COMISION_PCT} %)</dt>
            <dd>−{eurosReserva(pago.comision ?? 0)}</dd>
            <dt className={styles.desgloseTotal}>Recibes</dt>
            <dd className={styles.desgloseTotal}>{eurosReserva(pago.para_dueno ?? 0)}</dd>
          </>
        ) : (
          <>
            <dt>Precio del dueño</dt>
            <dd>{eurosReserva(pago.precio)}</dd>
            <dt>Tarifa de servicio</dt>
            <dd>{eurosReserva(pago.tarifa)}</dd>
            <dt className={styles.desgloseTotal}>Total</dt>
            <dd className={styles.desgloseTotal}>{eurosReserva(pago.total)}</dd>
            {pago.devuelto > 0 && (
              <>
                <dt>Devuelto</dt>
                <dd>−{eurosReserva(pago.devuelto)}</dd>
              </>
            )}
          </>
        )}
      </dl>

      {/* Qué va a pasar ahora */}
      {soyDueno ? (
        <p className={styles.notaPrivacidad}>
          {pago.estado === "por_pagar" && "Podrás aceptarla cuando el conductor complete el pago."}
          {pago.estado === "autorizado" && r.estado === "pendiente" &&
            `El importe está retenido en su tarjeta. Responde antes del ${fecha(limiteRespuesta(r.creada))}: si no, se cancela y se libera.`}
          {pago.estado === "cobrado" && !pago.retener &&
            `Lo recibirás en tu cuenta de cobro a partir del ${fecha(fechaTransferencia(r.inicio))} (24 h después del inicio).`}
          {pago.estado === "cobrado" && pago.retener && "El pago está en revisión por una reclamación. Te escribiremos."}
          {pago.estado === "transferido" && "Enviado a tu cuenta de cobro. El banco puede tardar unos días en mostrarlo."}
          {pago.estado === "devuelto" && "Se ha devuelto al conductor lo que pagó."}
        </p>
      ) : (
        <p className={styles.notaPrivacidad}>
          {pago.estado === "por_pagar" && "Completa el pago para que el dueño pueda aceptarla. Si no, la solicitud se cancela sola en 1 hora."}
          {pago.estado === "autorizado" && "Solo se te cobrará si el dueño acepta. Si la rechaza o no responde en 48 h, se libera."}
          {pago.estado === "devuelto" && "La devolución puede tardar de 5 a 10 días en aparecer en tu tarjeta."}
        </p>
      )}

      {puedePagar && (
        <button type="button" className={styles.boton} onClick={onPagar} disabled={ocupado}>
          {ocupado ? "Abriendo el pago…" : `Pagar ${eurosReserva(pago.total)}`}
        </button>
      )}
    </section>
  );
}
