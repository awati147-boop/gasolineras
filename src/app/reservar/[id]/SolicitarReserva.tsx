"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { ACCESOS, textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";
import styles from "../../page.module.css";

type Modalidad = "horas" | "dias" | "mes";
const NOMBRE: Record<Modalidad, string> = { horas: "Por horas", dias: "Por días", mes: "Por meses" };

// Fechas en formato de los campos <input type="date"> y <input type="time"> (hora local)
const dosCifras = (n: number) => String(n).padStart(2, "0");
const fechaInput = (d: Date) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
const euros = (n: number) => `${n.toFixed(2).replace(".", ",").replace(",00", "")} €`;

function valoresIniciales() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return { fecha: fechaInput(d), horaIni: "09:00", horaFin: "13:00", dias: "1", meses: "1" };
}

/** Calcula inicio y fin a partir del formulario (igual que lo hará el servidor) */
function calcularRango(modalidad: Modalidad, v: ReturnType<typeof valoresIniciales>) {
  const inicio = new Date(`${v.fecha}T${modalidad === "horas" ? v.horaIni : "00:00"}`);
  let fin: Date;
  if (modalidad === "horas") {
    fin = new Date(`${v.fecha}T${v.horaFin}`);
    if (fin <= inicio) fin.setDate(fin.getDate() + 1); // termina al día siguiente (p. ej. 22:00 → 08:00)
  } else if (modalidad === "dias") {
    fin = new Date(inicio);
    fin.setDate(fin.getDate() + Math.max(1, Number(v.dias) || 1));
  } else {
    fin = new Date(inicio);
    fin.setDate(fin.getDate() + 30 * Math.max(1, Number(v.meses) || 1));
  }
  return { inicio, fin };
}

export default function SolicitarReserva({ garajeId, ...config }: ConfigSupabase & { garajeId: string }) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const router = useRouter();
  const [garaje, setGaraje] = useState<Garaje | null | undefined>(undefined);
  const [sesion, setSesion] = useState<"cargando" | "no" | "si">("cargando");
  const [modalidad, setModalidad] = useState<Modalidad>("horas");
  const [v, setV] = useState(valoresIniciales);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    db.auth.getUser().then(({ data }) => setSesion(data.user && !data.user.is_anonymous ? "si" : "no"));
    db.from("garajes")
      .select("id, titulo, descripcion, tipo, precio_hora, precio_dia, precio_mes, disponibilidad, altura_max, acceso, enchufe, foto, fotos, lat_aprox, lon_aprox, activo, creado")
      .eq("id", garajeId)
      .eq("activo", true)
      .maybeSingle()
      .then(({ data }) => {
        const g = data as Garaje | null;
        setGaraje(g);
        if (g) setModalidad(g.precio_hora ? "horas" : g.precio_dia ? "dias" : "mes");
      });
  }, [db, garajeId]);

  const modalidades = useMemo<Modalidad[]>(
    () => (garaje ? ([garaje.precio_hora && "horas", garaje.precio_dia && "dias", garaje.precio_mes && "mes"].filter(Boolean) as Modalidad[]) : []),
    [garaje],
  );

  // Precio estimado (el definitivo lo calcula el servidor con la misma regla)
  const { inicio, fin } = calcularRango(modalidad, v);
  const valido = !Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime()) && fin > inicio;
  let unidades = 0, precioUnidad = 0, textoUnidades = "";
  if (garaje && valido) {
    const ms = fin.getTime() - inicio.getTime();
    if (modalidad === "horas") { unidades = Math.ceil(ms / 3600e3); precioUnidad = Number(garaje.precio_hora); textoUnidades = `${unidades} h`; }
    // Días y meses: 1 hora de margen por el cambio de hora (mismo cálculo que el servidor)
    if (modalidad === "dias") { unidades = Math.max(1, Math.ceil((ms - 3600e3) / 86400e3)); precioUnidad = Number(garaje.precio_dia); textoUnidades = `${unidades} ${unidades === 1 ? "día" : "días"}`; }
    if (modalidad === "mes") { unidades = Math.max(1, Math.ceil((ms - 3600e3) / (86400e3 * 30))); precioUnidad = Number(garaje.precio_mes); textoUnidades = `${unidades} ${unidades === 1 ? "mes" : "meses"}`; }
  }
  const total = unidades * precioUnidad;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!valido) return setError("Revisa las fechas: el final debe ser posterior al inicio.");
    if (inicio.getTime() < Date.now() - 15 * 60e3) return setError("La reserva no puede empezar en el pasado.");
    setEnviando(true);
    const { data: r, error } = await db
      .from("reservas")
      .insert({ garaje_id: garajeId, modalidad, inicio: inicio.toISOString(), fin: fin.toISOString() })
      .select("id")
      .single();
    if (error) {
      setEnviando(false);
      // Los mensajes de las reglas del servidor ya están en español y son claros
      return setError(/permission/i.test(error.message) ? "No se ha podido enviar la solicitud." : error.message);
    }
    if (mensaje.trim()) await db.from("mensajes").insert({ reserva_id: r.id, texto: mensaje.trim() });
    router.push(`/cuenta/reservas/${r.id}?nueva=1`);
  }

  if (garaje === undefined || sesion === "cargando") return <div className={styles.esqueleto} style={{ height: 320 }} />;
  if (garaje === null) {
    return (
      <div className={styles.vacio}>
        <p>Este garaje ya no está disponible.</p>
        <Link href="/aparcar" className={styles.boton}>Ver otros garajes</Link>
      </div>
    );
  }

  const portada = garaje.fotos?.[0] ?? garaje.foto;
  return (
    <>
      <Link href="/aparcar" className={styles.volver}>← Volver al mapa</Link>
      <section className={`${styles.tarjeta} ${styles.resumenGaraje}`}>
        {portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(config.url, portada)} alt="" />
        )}
        <div>
          <strong>{garaje.titulo}</strong>
          <span className={styles.sub}>
            {garaje.tipo === "cerrado" ? "Garaje cerrado" : "Plaza en garaje"}
            {garaje.acceso && ` · ${ACCESOS[garaje.acceso]}`}
            {garaje.enchufe && " · ⚡"}
          </span>
          <b className={styles.precioResumen}>{textoPrecio(garaje)}</b>
          {garaje.disponibilidad && <span className={styles.sub}>🗓️ {garaje.disponibilidad}</span>}
        </div>
      </section>

      <h1 className={styles.titulo}>Solicitar reserva</h1>

      {sesion === "no" ? (
        <div className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
          <p>Para pedir una reserva necesitas una cuenta. Es gratis y sin contraseñas.</p>
          <Link href="/cuenta" className={styles.boton}>Entrar con Google o email</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className={styles.formGaraje}>
          {modalidades.length > 1 && (
            <nav className={styles.chips} aria-label="Modalidad">
              {modalidades.map((m) => (
                <button key={m} type="button" onClick={() => setModalidad(m)}
                  className={modalidad === m ? styles.chipActivo : styles.chip} aria-pressed={modalidad === m}>
                  {NOMBRE[m]}
                </button>
              ))}
            </nav>
          )}

          <fieldset className={styles.seccion}>
            <legend><span>1</span> ¿Cuándo?</legend>
            <label className={styles.campo}>
              {modalidad === "horas" ? "Día" : "Desde el día"}
              <input type="date" value={v.fecha} min={fechaInput(new Date())} required
                onChange={(e) => setV((x) => ({ ...x, fecha: e.target.value }))} />
            </label>
            {modalidad === "horas" && (
              <div className={styles.fila2}>
                <label className={styles.campo}>
                  Desde
                  <input type="time" value={v.horaIni} step={900} required onChange={(e) => setV((x) => ({ ...x, horaIni: e.target.value }))} />
                </label>
                <label className={styles.campo}>
                  Hasta
                  <input type="time" value={v.horaFin} step={900} required onChange={(e) => setV((x) => ({ ...x, horaFin: e.target.value }))} />
                </label>
              </div>
            )}
            {modalidad === "dias" && (
              <label className={styles.campo}>
                Número de días
                <input type="number" min={1} max={90} value={v.dias} onChange={(e) => setV((x) => ({ ...x, dias: e.target.value }))} />
              </label>
            )}
            {modalidad === "mes" && (
              <label className={styles.campo}>
                Número de meses
                <input type="number" min={1} max={3} value={v.meses} onChange={(e) => setV((x) => ({ ...x, meses: e.target.value }))} />
              </label>
            )}
            {valido && (
              <p className={styles.zona} style={{ marginTop: 10 }}>
                Del {inicio.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: modalidad === "horas" ? "2-digit" : undefined, minute: modalidad === "horas" ? "2-digit" : undefined })}{" "}
                al {fin.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: modalidad === "horas" ? "2-digit" : undefined, minute: modalidad === "horas" ? "2-digit" : undefined })}
              </p>
            )}
          </fieldset>

          <fieldset className={styles.seccion}>
            <legend><span>2</span> Mensaje para el dueño</legend>
            <label className={styles.campo}>
              <textarea rows={3} maxLength={1000} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
                placeholder="Hola, lo necesitaría para un coche mediano. ¿Cómo sería la entrega del mando?" />
            </label>
          </fieldset>

          <section className={styles.totalReserva} aria-live="polite">
            <span>{valido ? `${textoUnidades} × ${euros(precioUnidad)}` : "Elige las fechas"}</span>
            <b>{valido ? euros(total) : "—"}</b>
            <small>No pagas nada ahora: el pago se acuerda con el dueño cuando acepte.</small>
          </section>

          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.boton} disabled={enviando || !valido}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
          <p className={styles.notaPrivacidad} style={{ textAlign: "center" }}>
            El dueño verá tu solicitud y podrá aceptarla o rechazarla. La dirección exacta se comparte al aceptar.
            Al enviarla aceptas las <Link href="/condiciones">condiciones de uso</Link>.
          </p>
        </form>
      )}
    </>
  );
}
