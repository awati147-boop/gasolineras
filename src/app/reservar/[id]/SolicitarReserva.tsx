"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { ACCESOS, ANTELACION_INSTANTANEA_H, COLUMNAS_GARAJE, estrellasTexto, textoNota, textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";
import Denunciar from "../../Denunciar";
import Compartir from "../../Compartir";
import {
  DIA_COMPLETO, disponibilidadDe, disponibleEn, enZona, estadoDia, horaTexto, huecosLibres, instante, resumenHorario,
  sumarDias, tramoDelDia, tramoTexto, zonaGaraje, type Disponibilidad, type EstadoDia, type Tramo,
} from "@/lib/disponibilidad";
import Calendario from "../../Calendario";
import { CANCELACION_GRATIS_H, TARIFA_SERVICIO, limpiarMatricula } from "@/lib/reservas";
import { COMISION_PCT, RESPUESTA_H, TARIFA_MIN, TARIFA_PCT, llamarPagos, tarifaServicio } from "@/lib/pagos";
import styles from "../../page.module.css";

type Modalidad = "horas" | "dias" | "mes";
type Ocupada = { inicio: Date; fin: Date };
type Opinion = { id: string; estrellas: number; comentario: string | null; creada: string };
const NOMBRE: Record<Modalidad, string> = { horas: "Por horas", dias: "Por días", mes: "Por meses" };

const euros = (n: number) => `${n.toFixed(2).replace(".", ",").replace(",00", "")} €`;
// Horas y días siempre en la zona horaria del garaje (península o Canarias), no en la del móvil
const hora = (d: Date, zona: string) => d.toLocaleTimeString("es-ES", { timeZone: zona, hour: "2-digit", minute: "2-digit" });
const dia = (d: Date, zona: string) => d.toLocaleDateString("es-ES", { timeZone: zona, weekday: "short", day: "numeric", month: "short" });
const minutosDe = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

type Valores = { fecha: string; horaIni: string; horaFin: string; dias: string; meses: string };
function valoresIniciales(): Valores {
  const manana = sumarDias(enZona(new Date(), "Europe/Madrid").fecha, 1);
  return { fecha: manana, horaIni: "09:00", horaFin: "13:00", dias: "1", meses: "1" };
}

/** Calcula inicio y fin a partir del formulario (igual que lo hará el servidor) */
function calcularRango(modalidad: Modalidad, v: Valores, zona: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha) || !/^\d{2}:\d{2}$/.test(v.horaIni) || !/^\d{2}:\d{2}$/.test(v.horaFin)) {
    return { inicio: new Date(NaN), fin: new Date(NaN) };
  }
  if (modalidad === "horas") {
    const inicio = instante(v.fecha, minutosDe(v.horaIni), zona);
    let fin = instante(v.fecha, minutosDe(v.horaFin), zona);
    // Termina al día siguiente (p. ej. 22:00 → 08:00)
    if (fin <= inicio) fin = instante(sumarDias(v.fecha, 1), minutosDe(v.horaFin), zona);
    return { inicio, fin };
  }
  const dias = modalidad === "dias" ? Math.max(1, Number(v.dias) || 1) : 30 * Math.max(1, Number(v.meses) || 1);
  return { inicio: instante(v.fecha, 0, zona), fin: instante(sumarDias(v.fecha, dias), 0, zona) };
}

/** Primer día disponible desde mañana (o hoy si no hay otro) y sus primeras horas libres */
function primerHueco(d: Disponibilidad, zona: string, modalidad: Modalidad, v: Valores): Valores {
  const hoy = enZona(new Date(), zona).fecha;
  for (const i of [...Array.from({ length: 90 }, (_, k) => k + 1), 0]) {
    const fecha = sumarDias(hoy, i);
    if (modalidad !== "horas") {
      const t = tramoDelDia(d, fecha);
      if (i > 0 && t && t[0] === 0 && t[1] === DIA_COMPLETO) return { ...v, fecha };
      continue;
    }
    // Si las horas propuestas (09:00–13:00) caben ese día, se quedan; si no, las primeras libres
    const r = calcularRango("horas", { ...v, fecha }, zona);
    if (r.inicio.getTime() > Date.now() && disponibleEn(d, r.inicio, r.fin, zona)) return { ...v, fecha };
    const [h] = huecosLibres(d, [], fecha, zona);
    if (h) return { ...v, ...horasEn(h, v), fecha };
  }
  return v;
}

/** Ajusta las horas a un hueco libre: empieza al principio y mantiene la duración elegida si cabe */
function horasEn(h: Tramo, v: Valores) {
  let duracion = minutosDe(v.horaFin) - minutosDe(v.horaIni);
  if (duracion <= 0) duracion += DIA_COMPLETO;
  const fin = Math.min(h[1], h[0] + duracion);
  return { horaIni: horaTexto(h[0]), horaFin: horaTexto(fin === DIA_COMPLETO ? 0 : fin) };
}

export default function SolicitarReserva({ garajeId, pagos, ...config }: ConfigSupabase & { garajeId: string; pagos: boolean }) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const router = useRouter();
  const [garaje, setGaraje] = useState<Garaje | null | undefined>(undefined);
  const [sesion, setSesion] = useState<"cargando" | "no" | "si">("cargando");
  const [ocupadas, setOcupadas] = useState<Ocupada[]>([]);
  const [opiniones, setOpiniones] = useState<Opinion[]>([]);
  const [todasOpiniones, setTodasOpiniones] = useState(false);
  const [cobraApp, setCobraApp] = useState(false); // ¿el dueño cobra en la app?
  const [modalidad, setModalidad] = useState<Modalidad>("horas");
  const [v, setV] = useState<Valores>(valoresIniciales);
  const [matricula, setMatricula] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Hora actual (se refresca cada minuto) para saber si la reserva se confirmará al momento
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60e3);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    db.auth.getUser().then(({ data }) => setSesion(data.user && !data.user.is_anonymous ? "si" : "no"));
    db.from("garajes")
      .select(COLUMNAS_GARAJE)
      .eq("id", garajeId)
      .eq("activo", true)
      .maybeSingle()
      .then(({ data }) => {
        const g = data as Garaje | null;
        setGaraje(g);
        if (!g) return;
        const m: Modalidad = g.precio_hora ? "horas" : g.precio_dia ? "dias" : "mes";
        setModalidad(m);
        // Empieza en el primer día que el garaje está libre (según su horario)
        setV((x) => primerHueco(disponibilidadDe(g), zonaGaraje(g.lon_aprox), m, x));
      });
    // ¿Se paga en la app? (si aún no existe la función en la base de datos, es que no: pago directo)
    db.rpc("garaje_cobra_en_app", { id_garaje: garajeId }).then(({ data, error }) => setCobraApp(!error && data === true));
    // Opiniones de otros conductores (sin nombre). Si aún no existe la función, no se muestran
    db.rpc("valoraciones_garaje", { id_garaje: garajeId }).then(({ data }) => setOpiniones((data as Opinion[] | null) ?? []));
    // Horas ya reservadas (solo inicio y fin, sin saber de quién)
    db.rpc("horas_ocupadas", { id_garaje: garajeId }).then(({ data }) =>
      setOcupadas(((data as { inicio: string; fin: string }[] | null) ?? []).map((o) => ({ inicio: new Date(o.inicio), fin: new Date(o.fin) }))),
    );
  }, [db, garajeId]);

  const modalidades = useMemo<Modalidad[]>(
    () => (garaje ? ([garaje.precio_hora && "horas", garaje.precio_dia && "dias", garaje.precio_mes && "mes"].filter(Boolean) as Modalidad[]) : []),
    [garaje],
  );

  const zona = garaje ? zonaGaraje(garaje.lon_aprox) : "Europe/Madrid";
  const disp = useMemo<Disponibilidad>(() => (garaje ? disponibilidadDe(garaje) : { horario: null, bloqueados: [] }), [garaje]);

  // Precio estimado (el definitivo lo calcula el servidor con la misma regla)
  const { inicio, fin } = calcularRango(modalidad, v, zona);
  const valido = !Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime()) && fin > inicio;
  let unidades = 0, precioUnidad = 0, textoUnidades = "";
  if (garaje && valido) {
    const ms = fin.getTime() - inicio.getTime();
    if (modalidad === "horas") { unidades = Math.ceil(ms / 3600e3); precioUnidad = Number(garaje.precio_hora); textoUnidades = `${unidades} h`; }
    // Días y meses: 1 hora de margen por el cambio de hora (mismo cálculo que el servidor)
    if (modalidad === "dias") { unidades = Math.max(1, Math.ceil((ms - 3600e3) / 86400e3)); precioUnidad = Number(garaje.precio_dia); textoUnidades = `${unidades} ${unidades === 1 ? "día" : "días"}`; }
    if (modalidad === "mes") { unidades = Math.max(1, Math.ceil((ms - 3600e3) / (86400e3 * 30))); precioUnidad = Number(garaje.precio_mes); textoUnidades = `${unidades} ${unidades === 1 ? "mes" : "meses"}`; }
  }
  const subtotal = unidades * precioUnidad;
  // Con pago en la app hay tarifa de servicio (10 %, mín. 0,50 €); con pago directo al dueño, gratis
  const tarifa = cobraApp ? (subtotal > 0 ? tarifaServicio(subtotal) : 0) : TARIFA_SERVICIO;
  const total = Math.round((subtotal + tarifa) * 100) / 100;
  const sinPagos = cobraApp && !pagos; // el garaje cobra en la app pero este servidor no tiene los pagos activos

  // ¿Choca con una reserva ya aceptada? ¿Está dentro del horario del dueño?
  const choque = valido ? ocupadas.find((o) => inicio < o.fin && fin > o.inicio) : undefined;
  const fueraHorario = valido && !choque && !disponibleEn(disp, inicio, fin, zona);
  const huecosDia = modalidad === "horas" ? huecosLibres(disp, ocupadas, v.fecha, zona) : [];
  const proximas = modalidad !== "horas" ? ocupadas.slice(0, 5) : [];
  // En el calendario, por días o meses solo cuentan los días libres las 24 h (y no hoy: ya ha empezado)
  const estadoCalendario = (f: string): EstadoDia => {
    const e = estadoDia(disp, ocupadas, f, zona);
    if (modalidad === "horas" || e === "pasado" || e === "bloqueado" || e === "cerrado") return e;
    if (f === enZona(new Date(), zona).fecha) return "pasado";
    const t = tramoDelDia(disp, f);
    if (!t || t[0] !== 0 || t[1] !== DIA_COMPLETO) return "cerrado";
    return e === "libre" ? "libre" : "ocupado";
  };
  // Al cambiar entre horas, días y meses: si lo elegido ya no cabe, se pasa al primer día que sí
  function cambiarModalidad(m: Modalidad) {
    setModalidad(m);
    setV((x) => {
      const r = calcularRango(m, x, zona);
      const cabe = r.inicio.getTime() > Date.now() - 15 * 60e3 && disponibleEn(disp, r.inicio, r.fin, zona);
      return cabe ? x : primerHueco(disp, zona, m, x);
    });
  }
  function elegirDia(fecha: string) {
    setError("");
    setV((x) => {
      if (modalidad !== "horas") return { ...x, fecha };
      // Si las horas elegidas no caben ese día, se pasan a su primer hueco libre
      const huecos = huecosLibres(disp, ocupadas, fecha, zona);
      const r = calcularRango("horas", { ...x, fecha }, zona);
      const caben = disponibleEn(disp, r.inicio, r.fin, zona) && !ocupadas.some((o) => r.inicio < o.fin && r.fin > o.inicio);
      return caben || !huecos.length ? { ...x, fecha } : { ...x, ...horasEn(huecos[0], x), fecha };
    });
  }
  // Reserva instantánea: se confirma sola si empieza con antelación suficiente
  const alMomento = Boolean(garaje?.instantanea) && valido && inicio.getTime() >= ahora + ANTELACION_INSTANTANEA_H * 3600e3;
  const matriculaLimpia = limpiarMatricula(matricula);
  const matriculaMal = matriculaLimpia.length > 0 && (matriculaLimpia.length < 2 || matriculaLimpia.length > 10);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!valido) return setError("Revisa las fechas: el final debe ser posterior al inicio.");
    if (inicio.getTime() < Date.now() - 15 * 60e3) return setError("La reserva no puede empezar en el pasado.");
    if (choque) return setError("Esas horas ya están reservadas. Elige otras.");
    if (fueraHorario) return setError("El garaje no está disponible en ese horario. Elige otro en el calendario.");
    if (matriculaMal) return setError("Revisa la matrícula (entre 2 y 10 letras o números).");
    setEnviando(true);
    const { data: r, error } = await db
      .from("reservas")
      .insert({ garaje_id: garajeId, modalidad, inicio: inicio.toISOString(), fin: fin.toISOString(), matricula: matriculaLimpia || null })
      .select("id, con_pago, estado")
      .single();
    if (error) {
      setEnviando(false);
      // Los mensajes de las reglas del servidor ya están en español y son claros
      return setError(/permission|violates|constraint/i.test(error.message) ? "No se ha podido enviar la solicitud." : error.message);
    }
    if (mensaje.trim()) await db.from("mensajes").insert({ reserva_id: r.id, texto: mensaje.trim() });
    if (r.con_pago) {
      // A la página de pago segura. Si no se puede abrir, desde la reserva se puede volver a intentar.
      try {
        const { data: s } = await db.auth.getSession();
        const pago = await llamarPagos<{ url?: string }>(s.session?.access_token, "/api/pagos/checkout", { reserva: r.id });
        if (pago.url) return window.location.assign(pago.url);
      } catch {
        return router.push(`/cuenta/reservas/${r.id}?pago=error`);
      }
    }
    router.push(`/cuenta/reservas/${r.id}?${r.estado === "aceptada" ? "confirmada" : "nueva"}=1`);
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
  const conHora = modalidad === "horas";
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
            {garaje.enchufe && " · 🔌"}
          </span>
          <b className={styles.precioResumen}>{textoPrecio(garaje)}</b>
          <span className={styles.sub}>{textoNota(garaje.nota, garaje.num_valoraciones) ?? "⭐ Nuevo: aún sin valoraciones"}</span>
          <span className={styles.sub}>🗓️ {resumenHorario(disp.horario)}</span>
          {garaje.instantanea && <span className={styles.etiquetaInstantanea}>⚡ Reserva instantánea</span>}
          <Compartir className={styles.enlaceBoton} titulo={garaje.titulo} texto={`${garaje.titulo} · ${textoPrecio(garaje)}`}
            ruta={`/reservar/${garaje.id}`} etiqueta="📤 Compartir este garaje" />
          {garaje.disponibilidad && <span className={styles.sub}>💬 {garaje.disponibilidad}</span>}
        </div>
      </section>

      {opiniones.some((o) => o.comentario) && (
        <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`} aria-label="Opiniones">
          <h2 className={styles.subtitulo}>Opiniones de conductores</h2>
          <ul className={styles.opiniones}>
            {opiniones.filter((o) => o.comentario).slice(0, todasOpiniones ? 10 : 2).map((o) => (
              <li key={o.id}>
                <span className={styles.estrellasFijas} aria-label={`${o.estrellas} de 5`}>{estrellasTexto(o.estrellas)}</span>{" "}
                <small>{new Date(o.creada).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</small>
                <p>{o.comentario}</p>
                <Denunciar tipo="valoracion" objetoId={o.id} {...config} />
              </li>
            ))}
          </ul>
          {opiniones.filter((o) => o.comentario).length > 2 && (
            <button type="button" className={styles.verMas} onClick={() => setTodasOpiniones((x) => !x)}>
              {todasOpiniones ? "Ver menos" : "Ver más opiniones"}
            </button>
          )}
        </section>
      )}

      <h1 className={styles.titulo}>Reservar</h1>

      {sesion === "no" ? (
        <div className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
          <p>Para pedir una reserva necesitas una cuenta. Es gratis y sin contraseñas.</p>
          <Link href="/cuenta" className={styles.boton}>Entrar con Google o email</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className={styles.reservaGrid}>
          <div className={styles.formGaraje}>
            {modalidades.length > 1 && (
              <nav className={styles.chips} aria-label="Modalidad">
                {modalidades.map((m) => (
                  <button key={m} type="button" onClick={() => cambiarModalidad(m)}
                    className={modalidad === m ? styles.chipActivo : styles.chip} aria-pressed={modalidad === m}>
                    {NOMBRE[m]}
                  </button>
                ))}
              </nav>
            )}

            <fieldset className={styles.seccion}>
              <legend><span>1</span> ¿Cuándo?</legend>
              <Calendario zona={zona} estado={estadoCalendario} seleccion={v.fecha} onElegir={elegirDia} />
              <p className={styles.diaElegido}>
                {conHora ? "Día" : "Desde el día"}: <b>{dia(instante(v.fecha, 720, zona), zona)}</b>
              </p>
              {conHora && (
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

              {/* Horas libres de ese día (se pueden tocar para elegirlas) */}
              {conHora && (
                <div className={styles.huecos} aria-live="polite">
                  {huecosDia.length > 0 ? (
                    <>
                      <span>Libre ese día:</span>
                      {huecosDia.map((h) => (
                        <button key={h[0]} type="button" className={styles.hueco} onClick={() => setV((x) => ({ ...x, ...horasEn(h, x) }))}>
                          {tramoTexto(h)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span>Ese día no quedan horas libres. Elige otro en el calendario.</span>
                  )}
                </div>
              )}
              {proximas.length > 0 && (
                <div className={styles.ocupadas}>
                  <span>Fechas ya reservadas:</span>
                  {proximas.map((o) => (
                    <span key={o.inicio.toISOString()} className={styles.ocupadoChip}>{dia(o.inicio, zona)} → {dia(o.fin, zona)}</span>
                  ))}
                </div>
              )}
              {choque && (
                <p className={styles.error} role="alert">
                  Esas horas coinciden con otra reserva ({dia(choque.inicio, zona)} {hora(choque.inicio, zona)} → {dia(choque.fin, zona)} {hora(choque.fin, zona)}). Elige otras.
                </p>
              )}
              {fueraHorario && (
                <p className={styles.error} role="alert">
                  {conHora
                    ? `Fuera del horario del garaje (${resumenHorario(disp.horario)}). Elige otras horas.`
                    : "Por días o meses solo se puede reservar si el garaje está libre las 24 h todos esos días. Elige otras fechas o reserva por horas."}
                </p>
              )}
            </fieldset>

            <fieldset className={styles.seccion}>
              <legend><span>2</span> Tu coche</legend>
              <label className={styles.campo}>
                Matrícula <small className={styles.sub}>(opcional)</small>
                <input value={matricula} onChange={(e) => setMatricula(e.target.value.toUpperCase())} maxLength={12}
                  autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="1234 ABC" aria-invalid={matriculaMal} />
              </label>
              <p className={styles.notaPrivacidad}>🔒 Solo la verá el dueño de este garaje. Se borra al día siguiente de terminar la reserva.</p>
            </fieldset>

            <fieldset className={styles.seccion}>
              <legend><span>3</span> Mensaje para el dueño</legend>
              <label className={styles.campo}>
                <textarea rows={3} maxLength={1000} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Hola, lo necesitaría para un coche mediano. ¿Cómo sería la entrega del mando?" />
              </label>
            </fieldset>
          </div>

          {/* ---------- Resumen (fijo al lado en pantallas anchas) ---------- */}
          <aside className={`${styles.tarjeta} ${styles.resumenReserva}`} aria-live="polite">
            <h2 className={styles.subtitulo}>Resumen</h2>
            {valido ? (
              <p className={styles.sub}>
                {dia(inicio, zona)}{conHora && `, ${hora(inicio, zona)}`} → {dia(fin, zona)}{conHora && `, ${hora(fin, zona)}`}
              </p>
            ) : (
              <p className={styles.sub}>Elige las fechas</p>
            )}
            <dl className={styles.desglose}>
              <dt>{valido ? `${textoUnidades} × ${euros(precioUnidad)}` : "Precio"}</dt>
              <dd>{valido ? euros(subtotal) : "—"}</dd>
              <dt>
                Tarifa de servicio
                {cobraApp ? (
                  <small className={styles.notaTarifa}>{TARIFA_PCT} % (mín. {euros(TARIFA_MIN)}): pago seguro y gestión</small>
                ) : (
                  tarifa === 0 && <small className={styles.etiquetaGratis}>Gratis en el lanzamiento</small>
                )}
              </dt>
              <dd>{valido ? euros(tarifa) : "—"}</dd>
              <dt className={styles.desgloseTotal}>Total</dt>
              <dd className={styles.desgloseTotal}>{valido ? euros(total) : "—"}</dd>
            </dl>
            <p className={styles.notaPrivacidad}>
              ✅ Cancelación gratis hasta {CANCELACION_GRATIS_H} h antes del inicio.{" "}
              <Link href="/condiciones#cancelacion">Ver política</Link>
            </p>
            {cobraApp && alMomento ? (
              <p className={styles.notaPrivacidad}>
                💳 Pagas con tarjeta en la página segura de pago y la reserva <b>queda confirmada al momento</b>.
              </p>
            ) : cobraApp ? (
              <p className={styles.notaPrivacidad}>
                💳 Pagas con tarjeta en la página segura de pago, pero <b>solo se retiene el importe</b>: se cobra
                si el dueño acepta. Si la rechaza o no responde en {RESPUESTA_H} h, se libera.
              </p>
            ) : (
              <p className={styles.notaPrivacidad}>💳 No pagas nada ahora: el pago se acuerda con el dueño{alMomento ? "." : " cuando acepte."}</p>
            )}
            {sinPagos && (
              <p className={styles.aviso} role="status">
                Este garaje se paga en la app y ahora mismo los pagos no están disponibles. Inténtalo más tarde.
              </p>
            )}

            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.boton} disabled={enviando || !valido || Boolean(choque) || fueraHorario || sinPagos}>
              {enviando ? (cobraApp ? "Abriendo el pago…" : "Enviando…") : cobraApp ? `Continuar al pago · ${euros(total)}` : alMomento ? "⚡ Reservar ya" : "Enviar solicitud"}
            </button>
            <p className={styles.notaPrivacidad} style={{ textAlign: "center" }}>
              {alMomento
                ? "⚡ Reserva instantánea: se confirma al momento y verás la dirección exacta."
                : garaje.instantanea
                  ? `Empieza en menos de ${ANTELACION_INSTANTANEA_H} h, así que el dueño tiene que aceptarla. La dirección exacta se comparte al aceptar.`
                  : "El dueño podrá aceptarla o rechazarla. La dirección exacta se comparte al aceptar."}
              {cobraApp && ` El dueño recibe su precio menos un ${COMISION_PCT} % de comisión.`}{" "}
              Al enviarla aceptas las <Link href="/condiciones">condiciones de uso</Link>.
            </p>
          </aside>
        </form>
      )}
    </>
  );
}
