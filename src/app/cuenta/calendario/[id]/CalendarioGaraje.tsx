"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import type { Garaje } from "@/lib/garajes";
import {
  disponibilidadDe, enZona, estadoDia, huecosLibres, instante, resumenHorario, tramoDelDia, tramoTexto, zonaGaraje,
  type Disponibilidad,
} from "@/lib/disponibilidad";
import { ESTADOS, textoEstado, type Reserva } from "@/lib/reservas";
import Calendario from "../../../Calendario";
import Compartir from "../../../Compartir";
import { textoPrecio } from "@/lib/garajes";
import { useMisReservas } from "../../useMisReservas";
import styles from "../../../page.module.css";

/** Calendario de un garaje para su dueño: reservas de cada día y bloquear o desbloquear días */
export default function CalendarioGaraje({ garajeId, ...config }: ConfigSupabase & { garajeId: string }) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const router = useRouter();
  const [garaje, setGaraje] = useState<Garaje | null>(null);
  const [disp, setDisp] = useState<Disponibilidad>({ horario: null, bloqueados: [] });
  const [dia, setDia] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const todas = useMisReservas(db, garaje !== null);

  useEffect(() => {
    (async () => {
      const { data } = await db.auth.getUser();
      if (!data.user || data.user.is_anonymous) return router.replace("/cuenta");
      const { data: mios } = await db.rpc("mis_garajes");
      const g = ((mios as Garaje[] | null) ?? []).find((x) => x.id === garajeId);
      if (!g) return router.replace("/cuenta");
      setGaraje(g);
      setDisp(disponibilidadDe(g));
      setDia(enZona(new Date(), zonaGaraje(g.lon_aprox)).fecha);
    })();
  }, [db, router, garajeId]);

  const zona = garaje ? zonaGaraje(garaje.lon_aprox) : "Europe/Madrid";
  // Reservas de este garaje que siguen en pie (pendientes o aceptadas)
  const reservas = useMemo(
    () => (todas ?? []).filter((r) => r.garaje_id === garajeId && r.rol === "propietario" && (r.estado === "pendiente" || r.estado === "aceptada")),
    [todas, garajeId],
  );
  const ocupadas = useMemo(
    () => reservas.filter((r) => r.estado === "aceptada").map((r) => ({ inicio: new Date(r.inicio), fin: new Date(r.fin) })),
    [reservas],
  );
  const delDia = (fecha: string) => {
    const ini = instante(fecha, 0, zona), fin = instante(fecha, 1440, zona);
    return reservas.filter((r) => new Date(r.inicio) < fin && new Date(r.fin) > ini);
  };

  if (!garaje || !dia) return <div className={styles.esqueleto} style={{ height: 420 }} />;

  const estadoHoy = estadoDia(disp, ocupadas, dia, zona);
  const bloqueado = disp.bloqueados.includes(dia);
  const reservasDia = delDia(dia);
  const aceptadasDia = reservasDia.filter((r) => r.estado === "aceptada");
  const tramo = tramoDelDia({ horario: disp.horario, bloqueados: [] }, dia);
  const huecos = huecosLibres(disp, ocupadas, dia, zona);
  const titulo = new Intl.DateTimeFormat("es-ES", { timeZone: zona, weekday: "long", day: "numeric", month: "long" }).format(instante(dia, 720, zona));

  async function alternarBloqueo() {
    if (!dia) return;
    if (!bloqueado && aceptadasDia.length > 0 &&
      !confirm(`Ese día tienes ${aceptadasDia.length === 1 ? "una reserva aceptada" : `${aceptadasDia.length} reservas aceptadas`}. Bloquearlo no ${aceptadasDia.length === 1 ? "la cancela" : "las cancela"}. ¿Bloquear igualmente?`)) return;
    setGuardando(true);
    setError("");
    const nuevos = bloqueado ? disp.bloqueados.filter((d) => d !== dia) : [...disp.bloqueados, dia];
    const { data, error } = await db.from("garajes").update({ bloqueados: nuevos }).eq("id", garajeId).select("bloqueados").single();
    setGuardando(false);
    if (error) return setError("No se ha podido guardar. Inténtalo de nuevo.");
    setDisp((d) => ({ ...d, bloqueados: (data as { bloqueados: string[] }).bloqueados }));
  }

  // Parte del día que ocupa cada reserva ("10:00–13:00" o "Todo el día")
  const rango = (r: Reserva) => {
    const ini = new Date(r.inicio), fin = new Date(r.fin);
    const a = ini <= instante(dia, 0, zona) ? 0 : enZona(ini, zona).minuto;
    const b = fin >= instante(dia, 1440, zona) ? 1440 : enZona(fin, zona).minuto;
    return a === 0 && b === 1440 ? "Todo el día" : tramoTexto([a, b]);
  };

  return (
    <>
      <Link href="/cuenta" className={styles.volver}>← Mi cuenta</Link>
      <h1 className={styles.titulo}>Calendario</h1>
      <p className={styles.zona}>
        <b>{garaje.titulo}</b> · {resumenHorario(disp.horario)}{" "}
        · <Link href={`/cuenta/publicar?editar=${garaje.id}#horario`}>Cambiar horario</Link>
      </p>
      {garaje.activo && (
        <Compartir className={`${styles.botonSec} ${styles.botonCompartir}`} titulo={garaje.titulo}
          texto={`Alquilo mi garaje: ${garaje.titulo} · ${textoPrecio(garaje)}`} ruta={`/reservar/${garaje.id}`}
          etiqueta="📤 Compartir mi anuncio" />
      )}

      <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
        <Calendario
          zona={zona}
          estado={(f) => estadoDia(disp, ocupadas, f, zona)}
          seleccion={dia}
          onElegir={setDia}
          leyenda={["libre", "parcial", "ocupado", "cerrado", "bloqueado"]}
          marca={(f) => {
            const rs = delDia(f);
            return rs.length ? (
              <span className={styles.calMarca} aria-hidden>
                {rs.slice(0, 3).map((r) => <i key={r.id} className={r.estado === "pendiente" ? styles.calPendiente : ""} />)}
              </span>
            ) : null;
          }}
        />

        <div className={styles.diaDetalle} aria-live="polite">
          <h3>{titulo}</h3>
          <p className={styles.sub}>
            {bloqueado
              ? "🚫 Bloqueado: nadie puede pedir reserva este día."
              : !tramo
                ? "No se alquila este día de la semana (según tu horario)."
                : estadoHoy === "pasado"
                  ? "Día pasado."
                  : huecos.length
                    ? `Horario ${tramoTexto(tramo)} · Libre: ${huecos.map(tramoTexto).join(", ")}`
                    : `Horario ${tramoTexto(tramo)} · Sin horas libres`}
          </p>

          {reservasDia.length > 0 ? (
            <ul>
              {reservasDia.map((r) => (
                <li key={r.id}>
                  <Link href={`/cuenta/reservas/${r.id}`}>
                    <span>{rango(r)}</span>
                    <span className={styles[ESTADOS[r.estado].clase as keyof typeof styles]}>{textoEstado(r)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            estadoHoy !== "pasado" && <p className={styles.sub}>Sin reservas este día.</p>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {estadoHoy !== "pasado" && (
            <div className={styles.acciones}>
              <button type="button" className={bloqueado ? styles.boton : styles.botonSec} onClick={alternarBloqueo} disabled={guardando}>
                {guardando ? "Guardando…" : bloqueado ? "✅ Desbloquear este día" : "🚫 Bloquear este día"}
              </button>
            </div>
          )}
          {reservasDia.some((r) => r.estado === "pendiente") && (
            <p className={styles.notaPrivacidad}>Bloquear el día no cancela las solicitudes pendientes: recházalas desde cada reserva.</p>
          )}
        </div>
      </section>
    </>
  );
}
