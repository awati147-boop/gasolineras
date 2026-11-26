"use client";

import { useState, type ReactNode } from "react";
import { enZona, sumarDias, diaSemana, type EstadoDia } from "@/lib/disponibilidad";
import styles from "./page.module.css";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const CABECERA = ["L", "M", "X", "J", "V", "S", "D"];

const CLASE: Record<EstadoDia, string> = {
  libre: styles.calLibre,
  parcial: styles.calParcial,
  ocupado: styles.calOcupado,
  cerrado: styles.calCerrado,
  bloqueado: styles.calBloqueado,
  pasado: styles.calPasado,
};
const TEXTO: Record<EstadoDia, string> = {
  libre: "libre",
  parcial: "con horas libres",
  ocupado: "completo",
  cerrado: "no disponible",
  bloqueado: "bloqueado",
  pasado: "pasado",
};

type Props = {
  zona: string;
  /** Estado de cada día ("2026-11-27") */
  estado: (fecha: string) => EstadoDia;
  seleccion?: string | null;
  onElegir: (fecha: string) => void;
  /** Marca pequeña debajo del número (p. ej. reservas de ese día) */
  marca?: (fecha: string) => ReactNode;
  /** Qué estados aparecen en la leyenda */
  leyenda?: EstadoDia[];
  /** Meses hacia delante que se pueden ver (desde el actual) */
  meses?: number;
};

/** Calendario de un mes (lunes primero), con el estado de cada día por colores */
export default function Calendario({ zona, estado, seleccion, onElegir, marca, leyenda = ["libre", "parcial", "ocupado", "cerrado"], meses = 12 }: Props) {
  const hoy = enZona(new Date(), zona).fecha;
  const [anoHoy, mesHoy] = hoy.split("-").map(Number);
  const inicial = (seleccion ?? hoy).split("-").map(Number);
  const [vista, setVista] = useState({ ano: inicial[0], mes: inicial[1] }); // mes 1–12
  const indice = (vista.ano - anoHoy) * 12 + (vista.mes - mesHoy);

  const mover = (n: number) =>
    setVista(({ ano, mes }) => {
      const total = ano * 12 + (mes - 1) + n;
      return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
    });

  const primero = `${vista.ano}-${String(vista.mes).padStart(2, "0")}-01`;
  const diasMes = new Date(Date.UTC(vista.ano, vista.mes, 0)).getUTCDate();
  const huecosAntes = diaSemana(primero);

  return (
    <div className={styles.calendario}>
      <div className={styles.calCab}>
        <button type="button" onClick={() => mover(-1)} disabled={indice <= 0} aria-label="Mes anterior">‹</button>
        <strong>{MESES[vista.mes - 1]} {vista.ano}</strong>
        <button type="button" onClick={() => mover(1)} disabled={indice >= meses - 1} aria-label="Mes siguiente">›</button>
      </div>
      <div className={styles.calRejilla}>
        {CABECERA.map((d) => <span key={d} className={styles.calSemana} aria-hidden>{d}</span>)}
        {Array.from({ length: huecosAntes }, (_, i) => <span key={`h${i}`} />)}
        {Array.from({ length: diasMes }, (_, i) => {
          const fecha = sumarDias(primero, i);
          const e = estado(fecha);
          const elegido = fecha === seleccion;
          return (
            <button
              key={fecha}
              type="button"
              className={`${styles.calDia} ${CLASE[e]} ${elegido ? styles.calElegido : ""} ${fecha === hoy ? styles.calHoy : ""}`}
              onClick={() => onElegir(fecha)}
              disabled={e === "pasado"}
              aria-pressed={elegido}
              aria-label={`${i + 1} de ${MESES[vista.mes - 1]}: ${TEXTO[e]}`}
            >
              <span>{i + 1}</span>
              {marca?.(fecha)}
            </button>
          );
        })}
      </div>
      <div className={styles.calLeyenda} aria-hidden>
        {leyenda.map((e) => (
          <span key={e}><i className={`${styles.calMuestra} ${CLASE[e]}`} />{TEXTO[e]}</span>
        ))}
      </div>
    </div>
  );
}
