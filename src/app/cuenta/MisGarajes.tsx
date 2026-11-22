"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";
import styles from "../page.module.css";

/** Lista de los garajes del usuario, con pausar/activar y borrar */
export default function MisGarajes(config: ConfigSupabase) {
  const [garajes, setGarajes] = useState<Garaje[] | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabaseNavegador(config).rpc("mis_garajes");
    if (error) return setError("No se han podido cargar tus garajes.");
    setGarajes(data as Garaje[]);
  }, [config]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  async function alternar(g: Garaje) {
    const { error } = await supabaseNavegador(config).from("garajes").update({ activo: !g.activo }).eq("id", g.id);
    if (error) return setError("No se ha podido cambiar el estado.");
    cargar();
  }

  async function borrar(g: Garaje) {
    if (!confirm(`¿Borrar «${g.titulo}»? No se puede deshacer.`)) return;
    const db = supabaseNavegador(config);
    const { error } = await db.from("garajes").delete().eq("id", g.id);
    if (error) return setError("No se ha podido borrar.");
    const rutas = g.fotos?.length ? g.fotos : g.foto ? [g.foto] : [];
    if (rutas.length) await db.storage.from("garajes").remove(rutas);
    cargar();
  }

  return (
    <section className={`${styles.tarjeta} ${styles.bloqueCuenta}`}>
      <div className={styles.cabBloque}>
        <h2 className={styles.subtitulo}>🏠 Mis garajes</h2>
        {garajes && garajes.length < 5 && (
          <Link href="/cuenta/publicar" className={styles.boton}>+ Publicar</Link>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {garajes === null ? (
        <div className={styles.esqueleto} />
      ) : garajes.length === 0 ? (
        <div className={styles.vacioGaraje}>
          <p><b>¿Tienes un garaje que no usas todo el día?</b><br />Publícalo gratis y gana dinero alquilándolo por horas, días o meses.</p>
          <Link href="/cuenta/publicar" className={styles.boton}>Publicar mi garaje</Link>
        </div>
      ) : (
        <ul className={styles.lista}>
          {garajes.map((g) => (
            <li key={g.id} className={styles.miGaraje}>
              {g.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlFoto(config.url, g.foto)} alt="" className={styles.miniatura} />
              ) : (
                <span className={styles.miniatura}>{g.tipo === "cerrado" ? "🏠" : "🅿️"}</span>
              )}
              <div className={styles.info}>
                <strong>{g.titulo}</strong>
                <span className={styles.sub}>{textoPrecio(g)}</span>
                <span className={g.activo ? styles.estadoActivo : styles.estadoPausado}>
                  {g.activo ? "● Publicado" : "● Pausado"}
                </span>
              </div>
              <div className={styles.accionesGaraje}>
                <Link href={`/cuenta/publicar?editar=${g.id}`} className={styles.botonSec}>Editar</Link>
                <button className={styles.botonSec} onClick={() => alternar(g)}>{g.activo ? "Pausar" : "Activar"}</button>
                <button className={styles.botonPeligro} onClick={() => borrar(g)} aria-label={`Borrar ${g.titulo}`}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
