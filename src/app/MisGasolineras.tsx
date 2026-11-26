"use client";

import { useEffect, useState } from "react";
import { distintivo } from "@/lib/marcas";
import { nombrePropio } from "@/lib/texto";
import {
  alCambiarFavoritas, alternarFavorita, apuntarPrecios, guardarPreciosVistos, leerFavoritas, type Cambio, type Favorita,
} from "@/lib/favoritas";
import styles from "./page.module.css";

type Dato = { id: number; precio: number; lat: number; lon: number; direccion: string; localidad: string };
const euros = (p: number) => p.toFixed(3).replace(".", ",");
/** 0,020 € → "2 cts"; 0,005 € → "0,5 cts" */
const centimos = (d: number) => `${String(Math.round(Math.abs(d) * 1000) / 10).replace(".", ",")} cts`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "long" });

/** "Mis gasolineras": las favoritas con su precio de ahora y si ha bajado o subido desde la visita anterior */
export default function MisGasolineras({ carburante, nombreCarburante, onVer }: {
  carburante: string; nombreCarburante: string; onVer: (p: { lat: number; lon: number }) => void;
}) {
  const [favoritas, setFavoritas] = useState<Favorita[] | null>(null);
  const [datos, setDatos] = useState<Map<number, Dato>>(new Map());
  const [cambios, setCambios] = useState<Map<number, Cambio>>(new Map());
  const ids = (favoritas ?? []).map((f) => f.id).join(",");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavoritas(leerFavoritas());
    return alCambiarFavoritas(setFavoritas);
  }, []);

  // Precios de las favoritas (estén donde estén en el mapa) y cambio desde la visita anterior
  useEffect(() => {
    if (!ids) return;
    const ctrl = new AbortController();
    fetch(`/api/gasolineras?c=${encodeURIComponent(carburante)}&ids=${ids}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ gasolineras }: { gasolineras: Dato[] }) => {
        const mapa = new Map(gasolineras.map((g) => [g.id, g]));
        const r = apuntarPrecios(leerFavoritas(), carburante, new Map(gasolineras.map((g) => [g.id, g.precio])));
        guardarPreciosVistos(r.lista);
        setDatos(mapa);
        setCambios(r.cambios);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ids, carburante]);

  if (favoritas === null) return null;
  if (!favoritas.length) {
    return <p className={styles.consejo}>💡 Toca una gasolinera del mapa y pulsa <b>☆ Guardar</b>: te diremos si baja de precio.</p>;
  }

  return (
    <section className={`${styles.tarjeta} ${styles.misGasolineras}`} aria-label="Mis gasolineras">
      <h2 className={styles.subtitulo}>⭐ Mis gasolineras <small>· {nombreCarburante}</small></h2>
      <ul>
        {favoritas.map((f) => {
          const d = datos.get(f.id);
          const c = cambios.get(f.id);
          const marca = distintivo(f.rotulo);
          return (
            <li key={f.id}>
              <button type="button" className={styles.favorita} onClick={() => d && onVer(d)} disabled={!d}>
                <span className="marca" style={{ background: marca.color }}>{marca.texto}</span>
                <span className={styles.info}>
                  <strong>{f.rotulo}</strong>
                  <span className={styles.sub}>{d ? `${nombrePropio(d.direccion)} · ${nombrePropio(d.localidad)}` : nombrePropio(f.localidad)}</span>
                  {c && Math.abs(c.diferencia) >= 0.001 ? (
                    <span className={c.diferencia < 0 ? styles.baja : styles.sube}>
                      {c.diferencia < 0 ? "▼ Ha bajado" : "▲ Ha subido"} {centimos(c.diferencia)} desde el {dia(c.desde)}
                    </span>
                  ) : c ? (
                    <span className={styles.sub}>= Igual que el {dia(c.desde)}</span>
                  ) : null}
                </span>
                <span className={styles.derecha}>
                  {d ? <b className={styles.precioFav}>{euros(d.precio)} €</b> : <small className={styles.sub}>Sin {nombreCarburante}</small>}
                </span>
              </button>
              <button type="button" className={styles.quitarFav} onClick={() => alternarFavorita(f)} aria-label={`Quitar ${f.rotulo} de mis gasolineras`}>×</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
