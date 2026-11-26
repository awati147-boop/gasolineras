"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { estrellasTexto, textoNota, urlFoto } from "@/lib/garajes";
import {
  CANCELACION_GRATIS_H, ESTADOS, archivoCalendario, codigoReserva, eurosReserva, fechaReserva, terminada, textoEstado, type Reserva, porValorar } from "@/lib/reservas";
import { llamarPagos, type EstadoPago, type Pago } from "@/lib/pagos";
import styles from "../../../page.module.css";
import Denunciar from "../../../Denunciar";
import BloquePago from "./BloquePago";
import Valorar from "./Valorar";

type Mensaje = { id: number; autor: string; texto: string; creado: string };
type Direccion = { lat: number; lon: number; direccion: string | null; indicaciones: string | null };

const horaMensaje = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("es-ES", hoy ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function DetalleReserva({ reservaId, pagos, ...config }: ConfigSupabase & { reservaId: string; pagos: boolean }) {
  const [db] = useState(() => supabaseNavegador(config)); // mismo cliente siempre (no cambia entre renders)
  const [r, setR] = useState<Reserva | null | undefined>(undefined);
  const [yo, setYo] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<Direccion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  // De dónde se llega (useSearchParams: al venir de otra pantalla, window.location aún tiene la dirección anterior)
  const busqueda = useSearchParams();
  const nueva = busqueda.get("nueva") === "1";
  const alMomento = busqueda.get("confirmada") === "1";
  // Vuelta de la página de pago: ok (pagado), no (lo dejó a medias) o error (no se pudo abrir)
  const vueltaPago = busqueda.get("pago");
  const [pago, setPago] = useState<Pago | null>(null);
  const [comprobando, setComprobando] = useState(vueltaPago === "ok");
  const finChat = useRef<HTMLDivElement>(null);

  const cargarPago = useCallback(async () => {
    const { data } = await db.rpc("mi_pago", { id_reserva: reservaId });
    const p = (data as Pago[] | null)?.[0] ?? null;
    setPago(p);
    return p;
  }, [db, reservaId]);

  /** Pide a la web que haga ya lo que toque en el proveedor de pagos (cobrar, liberar, devolver…) */
  const sincronizar = useCallback(async (): Promise<EstadoPago | null> => {
    if (pagos) {
      try {
        const { data } = await db.auth.getSession();
        await llamarPagos(data.session?.access_token, "/api/pagos/sincronizar", { reserva: reservaId });
      } catch {
        /* se reintenta solo más tarde (tarea de cada 10 minutos) */
      }
    }
    return (await cargarPago())?.estado ?? null;
  }, [db, pagos, reservaId, cargarPago]);

  const cargarReserva = useCallback(async () => {
    const { data } = await db.rpc("mis_reservas");
    const res = ((data as Reserva[] | null) ?? []).find((x) => x.id === reservaId) ?? null;
    setR(res);
    if (res?.con_pago) cargarPago();
    if (res) {
      // La base de datos solo la devuelve al dueño o al conductor de una reserva aceptada
      const { data: dir } = await db.rpc("direccion_reserva", { id_reserva: reservaId });
      setDireccion((dir as Direccion[] | null)?.[0] ?? null);
    }
  }, [db, reservaId, cargarPago]);

  // Reserva con pago: al abrirla se pone al día el pago; al volver de pagar se comprueba unas cuantas veces
  const conPago = Boolean(r?.con_pago);
  useEffect(() => {
    if (!conPago) return;
    let parar = false;
    (async () => {
      const veces = vueltaPago === "ok" ? 6 : 1;
      for (let i = 0; i < veces && !parar; i++) {
        const estado = await sincronizar();
        if (estado !== "por_pagar" || i === veces - 1) break;
        await new Promise((ok) => setTimeout(ok, 2000));
      }
      if (!parar) setComprobando(false);
    })();
    return () => {
      parar = true;
    };
  }, [conPago, sincronizar, vueltaPago]);

  useEffect(() => {
    let vivo = true;
    let canal: ReturnType<typeof db.channel> | null = null;
    const cargarMensajes = () =>
      db.from("mensajes")
        .select("id, autor, texto, creado")
        .eq("reserva_id", reservaId)
        .order("creado")
        .then(({ data }) => setMensajes((data as Mensaje[] | null) ?? []));

    // Sin sesión no hay nada que leer (la base de datos lo denegaría): se pide entrar en la cuenta
    db.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (!data.session) return setR(null);
      setYo(data.session.user.id);
      cargarReserva();
      cargarMensajes();
      // Tiempo real: mensajes nuevos y cambios de estado de esta reserva
      canal = db
        .channel(`reserva-${reservaId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `reserva_id=eq.${reservaId}` },
          (p) => setMensajes((x) => (x.some((m) => m.id === p.new.id) ? x : [...x, p.new as Mensaje])))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reservas", filter: `id=eq.${reservaId}` },
          () => cargarReserva())
        // Al quedar lista la conexión en tiempo real, recargar por si llegó algo mientras se conectaba
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") {
            cargarMensajes();
            cargarReserva();
          }
        });
    });
    return () => {
      vivo = false;
      if (canal) db.removeChannel(canal);
    };
  }, [db, reservaId, cargarReserva]);

  // Bajar al último mensaje
  useEffect(() => {
    finChat.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mensajes.length]);

  async function cambiarEstado(estado: "aceptada" | "rechazada" | "cancelada") {
    // Cancelar una reserva aceptada con menos de 24 h de margen: recordar la política de cancelación
    const tarde =
      r?.estado === "aceptada" && r.rol === "conductor" &&
      new Date(r.inicio).getTime() - Date.now() < CANCELACION_GRATIS_H * 3600e3;
    const preguntas = {
      aceptada: "¿Aceptar esta reserva? El conductor verá la dirección exacta del garaje.",
      rechazada: "¿Rechazar esta solicitud?",
      cancelada: tarde
        ? `Quedan menos de ${CANCELACION_GRATIS_H} h para el inicio. Según la política de cancelación, el dueño puede quedarse con lo que le hayas pagado por adelantado. ¿Cancelar igualmente?`
        : "¿Cancelar esta reserva? Avisaremos a la otra persona.",
    };
    // Con pago en la app: decir exactamente qué pasa con el dinero
    if (r?.con_pago && pago) {
      const total = eurosReserva(pago.total);
      const cobrado = pago.estado === "cobrado" || pago.estado === "transferido";
      preguntas.aceptada = `¿Aceptar esta reserva? Se cobrará el pago del conductor y verá la dirección exacta. Recibirás ${eurosReserva(pago.para_dueno ?? 0)}.`;
      preguntas.rechazada = "¿Rechazar esta solicitud? Se liberará el importe retenido al conductor.";
      preguntas.cancelada = r.rol === "propietario"
        ? `¿Cancelar la reserva? Se devolverá al conductor todo lo que pagó (${total}).`
        : !cobrado
          ? "¿Cancelar la solicitud? No se te cobrará nada."
          : tarde
            ? `Quedan menos de ${CANCELACION_GRATIS_H} h para el inicio: según la política de cancelación no se devuelve el importe (${total}). ¿Cancelar igualmente?`
            : `¿Cancelar la reserva? Te devolveremos ${total} íntegros.`;
    }
    if (!confirm(preguntas[estado])) return;
    setError("");
    setOcupado(true);
    const { error } = await db.from("reservas").update({ estado }).eq("id", reservaId);
    setOcupado(false);
    if (error) {
      // Otra reserva aceptada a la vez para las mismas horas (lo impide la base de datos)
      if (/solape|exclusion/i.test(error.message)) return setError("Ya tienes otra reserva aceptada en esas fechas.");
      return setError(/permission/i.test(error.message) ? "No se ha podido cambiar la reserva." : error.message);
    }
    await cargarReserva();
    if (r?.con_pago) sincronizar(); // cobrar al aceptar, liberar o devolver al cancelar
  }

  async function pagarAhora() {
    setError("");
    setOcupado(true);
    try {
      const { data } = await db.auth.getSession();
      const p = await llamarPagos<{ url?: string; pagado?: boolean }>(data.session?.access_token, "/api/pagos/checkout", { reserva: reservaId });
      if (p.url) return window.location.assign(p.url);
      await sincronizar();
    } catch (e) {
      setError((e as Error).message);
    }
    setOcupado(false);
  }

  function anadirCalendario() {
    if (!r) return;
    const url = URL.createObjectURL(
      archivoCalendario({
        id: r.id,
        titulo: r.titulo,
        inicio: r.inicio,
        fin: r.fin,
        lugar: direccion?.direccion,
        notas: [`Código de reserva: ${codigoReserva(r.id)}`, direccion?.indicaciones, `${location.origin}/cuenta/reservas/${r.id}`]
          .filter(Boolean)
          .join("\n"),
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `reserva-${codigoReserva(r.id)}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    const { data, error } = await db
      .from("mensajes")
      .insert({ reserva_id: reservaId, texto: t })
      .select("id, autor, texto, creado")
      .single();
    if (error) {
      setTexto(t);
      return setError(/rápido/.test(error.message) ? error.message : "No se ha podido enviar el mensaje.");
    }
    setMensajes((x) => (x.some((m) => m.id === data.id) ? x : [...x, data as Mensaje]));
  }

  if (r === undefined) return <div className={styles.esqueleto} style={{ height: 300 }} />;
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
  const soyDueno = r.rol === "propietario";
  const pasada = terminada(r);
  const otro = soyDueno ? "el conductor" : "el dueño";
  const confirmada = r.estado === "aceptada" && !pasada;
  const verDireccion = direccion && (r.estado === "aceptada" || soyDueno);
  const esperandoPago = r.con_pago && pago?.estado !== "autorizado"; // el dueño aún no puede aceptar

  return (
    <>
      <Link href="/cuenta" className={styles.volver}>← Mi cuenta</Link>
      {nueva && <p className={styles.exito}>✅ ¡Solicitud enviada! Te avisaremos aquí cuando el dueño responda.</p>}
      {alMomento && r.estado === "aceptada" && <p className={styles.exito}>⚡ ¡Reserva confirmada! Abajo tienes la dirección y cómo llegar.</p>}
      {vueltaPago === "ok" && pago && pago.estado !== "por_pagar" && !soyDueno && r.estado === "pendiente" && (
        <p className={styles.exito}>✅ ¡Pago completado y solicitud enviada! Solo se te cobrará si el dueño acepta.</p>
      )}
      {vueltaPago === "ok" && !soyDueno && r.estado === "aceptada" && r.instantanea && (
        <p className={styles.exito}>⚡ ¡Pago completado y reserva confirmada! Abajo tienes la dirección y cómo llegar.</p>
      )}
      {vueltaPago === "no" && pago?.estado === "por_pagar" && r.estado === "pendiente" && (
        <p className={styles.aviso}>No has completado el pago. El dueño no verá la solicitud hasta que pagues.</p>
      )}
      {vueltaPago === "error" && pago?.estado === "por_pagar" && (
        <p className={styles.aviso}>No se ha podido abrir la página de pago. Inténtalo de nuevo con el botón «Pagar».</p>
      )}

      <section className={`${styles.tarjeta} ${styles.resumenGaraje}`}>
        {r.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(config.url, r.foto)} alt="" />
        )}
        <div>
          <span className={styles.sub}>{soyDueno ? "Solicitud para tu garaje" : "Tu reserva"}</span>
          <strong>{r.titulo}</strong>
          <span className={styles.sub}>{fechaReserva(r.inicio, conHora)} → {fechaReserva(r.fin, conHora)}</span>
          <b className={styles.precioResumen}>{eurosReserva(r.con_pago && pago && !soyDueno ? pago.total : r.precio)}</b>
          {r.matricula && <span className={styles.sub}>🚗 {r.matricula}</span>}
          {soyDueno && r.valoracion && (
            <span className={styles.sub}>
              👤 Conductor: {textoNota(r.valoracion.nota_conductor, r.valoracion.num_conductor) ?? "nuevo, aún sin valoraciones"}
            </span>
          )}
          <span className={styles[estado.clase as keyof typeof styles]}>
            ● {pasada && r.estado === "aceptada" ? "Terminada" : textoEstado({ ...r, pago: pago?.estado ?? r.pago })}
            {r.estado === "cancelada" && r.cancelada_por && r.cancelada_por !== "sistema" &&
              ` por ${r.cancelada_por === (soyDueno ? "propietario" : "conductor") ? "ti" : otro}`}
          </span>
        </div>
      </section>

      {/* ---------- Acciones según quién soy y el estado ---------- */}
      {error && <p className={styles.error}>{error}</p>}
      {!pasada && soyDueno && r.estado === "pendiente" && (
        <div className={styles.accionesReserva}>
          <button className={styles.botonPeligro} onClick={() => cambiarEstado("rechazada")} disabled={ocupado}>Rechazar</button>
          <button className={styles.boton} onClick={() => cambiarEstado("aceptada")} disabled={ocupado || esperandoPago}
            title={esperandoPago ? "Podrás aceptarla cuando el conductor pague" : undefined}>
            Aceptar reserva
          </button>
        </div>
      )}
      {!soyDueno && r.estado === "pendiente" && !(r.con_pago && pago?.estado === "por_pagar") && (
        <p className={styles.aviso}>⏳ Esperando a que el dueño responda. Mientras, podéis hablar por el chat.</p>
      )}

      {/* ---------- Pago en la app ---------- */}
      {r.con_pago && pago && (
        <BloquePago pago={pago} r={r} comprobando={comprobando} ocupado={ocupado} onPagar={pagarAhora} />
      )}

      {/* ---------- Valorar al terminar ---------- */}
      {porValorar(r) && <Valorar db={db} reservaId={r.id} soyDueno={soyDueno} onHecho={cargarReserva} />}
      {r.valoracion?.mia != null && (
        <p className={styles.exito}>
          Tu valoración: <span className={styles.estrellasFijas} aria-label={`${r.valoracion.mia} de 5`}>{estrellasTexto(r.valoracion.mia)}</span> · ¡Gracias!
        </p>
      )}

      {/* ---------- Reserva confirmada: código, horario, cómo llegar y calendario ---------- */}
      {confirmada && (
        <section className={`${styles.tarjeta} ${styles.pase}`} aria-label="Reserva confirmada">
          <h2 className={styles.subtitulo}>🎫 Reserva confirmada</h2>
          <div className={styles.paseCodigo}>
            <small>Código de reserva</small>
            <b>{codigoReserva(r.id)}</b>
            <small>{soyDueno ? "El conductor puede enseñártelo al llegar." : "Enséñaselo al dueño si te lo pide."}</small>
          </div>
          <ol className={styles.paseHorario}>
            <li><small>Entra desde</small><b>{fechaReserva(r.inicio, true)}</b></li>
            <li><small>Sal antes de</small><b>{fechaReserva(r.fin, true)}</b></li>
          </ol>
          {verDireccion && !soyDueno && (
            <div className={styles.paseDireccion}>
              <b>📍 {direccion.direccion ?? "El dueño no ha indicado la dirección: pregúntale por el chat."}</b>
              {direccion.indicaciones && <p className={styles.sub}>{direccion.indicaciones}</p>}
            </div>
          )}
          <div className={styles.paseBotones}>
            {verDireccion && !soyDueno && (
              <a className={styles.boton} target="_blank" rel="noopener"
                href={`https://www.google.com/maps/dir/?api=1&destination=${direccion.lat},${direccion.lon}`}>
                Cómo llegar
              </a>
            )}
            <button type="button" className={styles.botonSec} onClick={anadirCalendario}>📅 Añadir al calendario</button>
          </div>
        </section>
      )}

      {/* ---------- Dirección del dueño (privada), o del garaje si la reserva ya pasó ---------- */}
      {verDireccion && (soyDueno || !confirmada) && (
        <section className={`${styles.tarjeta} ${styles.bloqueDireccion}`}>
          <h2 className={styles.subtitulo}>📍 {soyDueno ? "Tu dirección (privada)" : "Dirección del garaje"}</h2>
          <p><b>{direccion.direccion ?? "El dueño no ha indicado la dirección: pregúntale por el chat."}</b></p>
          {direccion.indicaciones && <p className={styles.sub}>{direccion.indicaciones}</p>}
          {soyDueno && r.estado !== "aceptada" && (
            <p className={styles.notaPrivacidad}>🔒 El conductor la verá solo si aceptas la reserva.</p>
          )}
        </section>
      )}

      {/* ---------- Chat ---------- */}
      <section className={`${styles.tarjeta} ${styles.chat}`}>
        <h2 className={styles.subtitulo}>💬 Chat con {otro}</h2>
        <div className={styles.mensajes} role="log" aria-live="polite">
          {mensajes.length === 0 && <p className={styles.zona}>Aún no hay mensajes. Saluda y acordad los detalles.</p>}
          {mensajes.map((m) => (
            <div key={m.id} className={m.autor === yo ? styles.mioMsg : styles.suyoMsg}>
              <p>{m.texto}</p>
              <time>{horaMensaje(m.creado)}</time>
            </div>
          ))}
          <div ref={finChat} />
        </div>
        {r.estado === "rechazada" || r.estado === "cancelada" ? (
          <p className={styles.zona}>Esta reserva está {r.estado}: el chat queda cerrado.</p>
        ) : (
          <form onSubmit={enviar} className={styles.escribir}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000}
              placeholder="Escribe un mensaje…" aria-label="Mensaje" enterKeyHint="send" />
            <button type="submit" className={styles.boton} disabled={!texto.trim()} aria-label="Enviar">➤</button>
          </form>
        )}
        <p className={styles.notaPrivacidad}>🔒 No compartas datos bancarios por el chat. Nunca te pediremos contraseñas.</p>
        <Denunciar tipo="reserva" objetoId={reservaId} {...config} />
      </section>

      {/* ---------- Cancelar ---------- */}
      {!pasada && (r.estado === "pendiente" || r.estado === "aceptada") && (
        <button className={styles.enlaceCancelar} onClick={() => cambiarEstado("cancelada")} disabled={ocupado}>
          Cancelar {soyDueno && r.estado === "pendiente" ? "" : "la reserva"}
        </button>
      )}
    </>
  );
}
