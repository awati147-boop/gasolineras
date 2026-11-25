"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { urlFoto } from "@/lib/garajes";
import { ESTADOS, eurosReserva, fechaReserva, terminada, type Reserva } from "@/lib/reservas";
import styles from "../../../page.module.css";
import Denunciar from "../../../Denunciar";

type Mensaje = { id: number; autor: string; texto: string; creado: string };
type Direccion = { lat: number; lon: number; direccion: string | null; indicaciones: string | null };

const horaMensaje = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("es-ES", hoy ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function DetalleReserva({ reservaId, ...config }: ConfigSupabase & { reservaId: string }) {
  const [db] = useState(() => supabaseNavegador(config)); // mismo cliente siempre (no cambia entre renders)
  const [r, setR] = useState<Reserva | null | undefined>(undefined);
  const [yo, setYo] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<Direccion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [nueva] = useState(() => typeof window !== "undefined" && window.location.search.includes("nueva=1"));
  const finChat = useRef<HTMLDivElement>(null);

  const cargarReserva = useCallback(async () => {
    const { data } = await db.rpc("mis_reservas");
    const res = ((data as Reserva[] | null) ?? []).find((x) => x.id === reservaId) ?? null;
    setR(res);
    if (res) {
      // La base de datos solo la devuelve al dueño o al conductor de una reserva aceptada
      const { data: dir } = await db.rpc("direccion_reserva", { id_reserva: reservaId });
      setDireccion((dir as Direccion[] | null)?.[0] ?? null);
    }
  }, [db, reservaId]);

  useEffect(() => {
    db.auth.getUser().then(({ data }) => setYo(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    cargarReserva();
    const cargarMensajes = () =>
      db.from("mensajes")
        .select("id, autor, texto, creado")
        .eq("reserva_id", reservaId)
        .order("creado")
        .then(({ data }) => setMensajes((data as Mensaje[] | null) ?? []));
    cargarMensajes();

    // Tiempo real: mensajes nuevos y cambios de estado de esta reserva
    const canal = db
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
    return () => {
      db.removeChannel(canal);
    };
  }, [db, reservaId, cargarReserva]);

  // Bajar al último mensaje
  useEffect(() => {
    finChat.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mensajes.length]);

  async function cambiarEstado(estado: "aceptada" | "rechazada" | "cancelada") {
    const preguntas = {
      aceptada: "¿Aceptar esta reserva? El conductor verá la dirección exacta del garaje.",
      rechazada: "¿Rechazar esta solicitud?",
      cancelada: "¿Cancelar esta reserva? Avisaremos a la otra persona.",
    };
    if (!confirm(preguntas[estado])) return;
    setError("");
    setOcupado(true);
    const { error } = await db.from("reservas").update({ estado }).eq("id", reservaId);
    setOcupado(false);
    if (error) return setError(/permission/i.test(error.message) ? "No se ha podido cambiar la reserva." : error.message);
    cargarReserva();
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

  return (
    <>
      <Link href="/cuenta" className={styles.volver}>← Mi cuenta</Link>
      {nueva && <p className={styles.exito}>✅ ¡Solicitud enviada! Te avisaremos aquí cuando el dueño responda.</p>}

      <section className={`${styles.tarjeta} ${styles.resumenGaraje}`}>
        {r.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(config.url, r.foto)} alt="" />
        )}
        <div>
          <span className={styles.sub}>{soyDueno ? "Solicitud para tu garaje" : "Tu reserva"}</span>
          <strong>{r.titulo}</strong>
          <span className={styles.sub}>{fechaReserva(r.inicio, conHora)} → {fechaReserva(r.fin, conHora)}</span>
          <b className={styles.precioResumen}>{eurosReserva(r.precio)}</b>
          <span className={styles[estado.clase as keyof typeof styles]}>
            ● {pasada && r.estado === "aceptada" ? "Terminada" : estado.texto}
            {r.estado === "cancelada" && r.cancelada_por && ` por ${r.cancelada_por === (soyDueno ? "propietario" : "conductor") ? "ti" : otro}`}
          </span>
        </div>
      </section>

      {/* ---------- Acciones según quién soy y el estado ---------- */}
      {error && <p className={styles.error}>{error}</p>}
      {!pasada && soyDueno && r.estado === "pendiente" && (
        <div className={styles.accionesReserva}>
          <button className={styles.botonPeligro} onClick={() => cambiarEstado("rechazada")} disabled={ocupado}>Rechazar</button>
          <button className={styles.boton} onClick={() => cambiarEstado("aceptada")} disabled={ocupado}>Aceptar reserva</button>
        </div>
      )}
      {!soyDueno && r.estado === "pendiente" && (
        <p className={styles.aviso}>⏳ Esperando a que el dueño responda. Mientras, podéis hablar por el chat.</p>
      )}

      {/* ---------- Dirección (dueño siempre; conductor solo si está aceptada) ---------- */}
      {direccion && (r.estado === "aceptada" || soyDueno) && (
        <section className={`${styles.tarjeta} ${styles.bloqueDireccion}`}>
          <h2 className={styles.subtitulo}>📍 {soyDueno ? "Tu dirección (privada)" : "Dirección del garaje"}</h2>
          <p><b>{direccion.direccion ?? "El dueño no ha indicado la dirección: pregúntale por el chat."}</b></p>
          {direccion.indicaciones && <p className={styles.sub}>{direccion.indicaciones}</p>}
          {!soyDueno && (
            <a className={styles.boton} target="_blank" rel="noopener"
              href={`https://www.google.com/maps/dir/?api=1&destination=${direccion.lat},${direccion.lon}`}>
              Cómo llegar
            </a>
          )}
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
