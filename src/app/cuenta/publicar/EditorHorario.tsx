"use client";

import { DIA_COMPLETO, DIAS_CORTOS, DIAS_LARGOS, PLANTILLAS, horaTexto, type Horario, type Tramo } from "@/lib/disponibilidad";
import styles from "../../page.module.css";

/** Horario del editor: siempre 7 días (null = ese día no). Todos 24 h equivale a "siempre" (null en la base de datos) */
export type HorarioEditor = (Tramo | null)[];

export const SIEMPRE: HorarioEditor = Array(7).fill([0, DIA_COMPLETO]);
export const aEditor = (h: Horario | null): HorarioEditor => (h ? h.map((t) => (t ? [t[0], t[1]] : null)) : SIEMPRE);
export const aGuardar = (h: HorarioEditor): Horario | null =>
  h.every((t) => t && t[0] === 0 && t[1] === DIA_COMPLETO) ? null : h;
const iguales = (a: HorarioEditor, b: HorarioEditor) => JSON.stringify(a) === JSON.stringify(b);

/** Horas cada 30 min, más las que ya tuviera guardadas (múltiplos de 15) */
function opciones(desde: number, hasta: number, actual: number) {
  const lista: number[] = [];
  for (let m = desde; m <= hasta; m += 30) lista.push(m);
  if (!lista.includes(actual)) lista.push(actual);
  return lista.sort((a, b) => a - b);
}

/** Horario semanal: plantillas de un toque y, por cada día, si se alquila y de qué hora a qué hora */
export default function EditorHorario({ valor, onCambio }: { valor: HorarioEditor; onCambio: (h: HorarioEditor) => void }) {
  const cambiarDia = (i: number, t: Tramo | null) => onCambio(valor.map((x, j) => (j === i ? t : x)));

  return (
    <>
      <nav className={styles.chips} aria-label="Plantillas de horario">
        {PLANTILLAS.map((p) => {
          const h = aEditor(p.horario);
          return (
            <button key={p.nombre} type="button" onClick={() => onCambio(h)}
              className={iguales(h, valor) ? styles.chipActivo : styles.chip} aria-pressed={iguales(h, valor)}>
              {p.nombre}
            </button>
          );
        })}
      </nav>
      <div className={styles.horario}>
        {valor.map((t, i) => (
          <div key={DIAS_LARGOS[i]} className={styles.horarioDia}>
            <label>
              <input type="checkbox" checked={t !== null} onChange={(e) => cambiarDia(i, e.target.checked ? [480, 1200] : null)}
                aria-label={DIAS_LARGOS[i]} />
              <span aria-hidden>{DIAS_CORTOS[i]}</span>
            </label>
            {t ? (
              <div className={styles.horarioHoras}>
                <select value={t[0]} onChange={(e) => cambiarDia(i, [Number(e.target.value), t[1]])} aria-label={`${DIAS_LARGOS[i]}: desde`}>
                  {opciones(0, DIA_COMPLETO - 30, t[0]).map((m) => <option key={m} value={m}>{horaTexto(m)}</option>)}
                </select>
                a
                <select value={t[1]} onChange={(e) => cambiarDia(i, [t[0], Number(e.target.value)])} aria-label={`${DIAS_LARGOS[i]}: hasta`}
                  aria-invalid={t[1] <= t[0]}>
                  {opciones(30, DIA_COMPLETO, t[1]).map((m) => <option key={m} value={m}>{horaTexto(m)}</option>)}
                </select>
                {t[0] !== 0 || t[1] !== DIA_COMPLETO ? (
                  <button type="button" onClick={() => cambiarDia(i, [0, DIA_COMPLETO])} aria-label={`${DIAS_LARGOS[i]}: todo el día`}>24 h</button>
                ) : (
                  <span />
                )}
              </div>
            ) : (
              <span className={styles.sub}>No disponible</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
