"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapaML, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { asegurarSesion, supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import styles from "../page.module.css";
import { IconoCheck, IconoCoche, IconoPin, IconoReloj } from "../Iconos";

type Punto = { lat: number; lon: number };
type Plaza = { id: number; lat: number; lon: number; expira: string };
type Estado =
  | { paso: "inicio" }
  | { paso: "localizando" }
  | { paso: "confirmar"; punto: Punto }
  | { paso: "enviando"; punto: Punto }
  | { paso: "hecho"; plaza: Plaza };

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

export default function DejarPlaza(config: ConfigSupabase) {
  const [estado, setEstado] = useState<Estado>({ paso: "inicio" });
  const [error, setError] = useState("");

  /** Pide la ubicación al navegador. Solo se usa para colocar el punto; no se guarda hasta que confirmas. */
  function localizar() {
    setError("");
    if (!navigator.geolocation) return setError("Tu navegador no permite obtener la ubicación.");
    setEstado({ paso: "localizando" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setEstado({ paso: "confirmar", punto: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      () => {
        setEstado({ paso: "inicio" });
        setError("No se ha podido obtener tu ubicación. Revisa que el navegador tenga permiso.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function confirmar(punto: Punto) {
    setError("");
    setEstado({ paso: "enviando", punto });
    try {
      const db = supabaseNavegador(config);
      await asegurarSesion(db);
      const { data, error } = await db
        .from("plazas")
        .insert({ lat: punto.lat, lon: punto.lon })
        .select("id, lat, lon, expira")
        .single();
      if (error) throw new Error(/minutos/.test(error.message) ? error.message : "No se ha podido compartir la plaza.");
      setEstado({ paso: "hecho", plaza: data });
    } catch (e) {
      setError((e as Error).message);
      setEstado({ paso: "confirmar", punto });
    }
  }

  async function yaNoEstaLibre(plaza: Plaza) {
    const db = supabaseNavegador(config);
    await db.from("plazas").delete().eq("id", plaza.id);
    setEstado({ paso: "inicio" });
  }

  return (
    <section className={styles.meVoy}>
      <ol className={styles.pasos} aria-label="Pasos">
        {["Ubicar", "Confirmar", "¡Listo!"].map((t, i) => {
          const actual = estado.paso === "hecho" ? 2 : estado.paso === "confirmar" || estado.paso === "enviando" ? 1 : 0;
          return (
            <li key={t} className={i === actual ? styles.pasoActivo : undefined} aria-current={i === actual ? "step" : undefined}>
              <b>{i < actual ? "✓" : i + 1}</b>
              {t}
            </li>
          );
        })}
      </ol>

      {error && <p className={styles.error}>{error}</p>}

      {(estado.paso === "inicio" || estado.paso === "localizando") && (
        <>
          <button className={styles.botonCirculo} onClick={localizar} disabled={estado.paso === "localizando"}>
            <IconoCoche tam={46} />
            {estado.paso === "localizando" ? "Localizando…" : "Dejo mi plaza"}
            <span>{estado.paso === "localizando" ? "un segundo" : "aquí y ahora"}</span>
          </button>
          <ul className={styles.notas}>
            <li><IconoReloj tam={18} /> Púlsalo justo antes de arrancar el coche.</li>
            <li><IconoPin tam={18} /> Podrás ajustar el punto en el mapa antes de confirmar.</li>
            <li><IconoCheck tam={18} /> Sin registro. La plaza se borra a los 10 minutos y nadie sabe quién la dejó.</li>
          </ul>
        </>
      )}

      {(estado.paso === "confirmar" || estado.paso === "enviando") && (
        <>
          <p className={styles.zona}>¿Está el punto sobre tu plaza? Si no, <strong>arrástralo</strong>.</p>
          <MapaPunto
            punto={estado.punto}
            onMover={(p) => estado.paso === "confirmar" && setEstado({ paso: "confirmar", punto: p })}
          />
          <div className={styles.acciones}>
            <button className={styles.botonSec} onClick={() => setEstado({ paso: "inicio" })} disabled={estado.paso === "enviando"}>
              Cancelar
            </button>
            <button className={styles.boton} onClick={() => confirmar(estado.punto)} disabled={estado.paso === "enviando"}>
              {estado.paso === "enviando" ? "Compartiendo…" : "Confirmar plaza libre"}
            </button>
          </div>
        </>
      )}

      {estado.paso === "hecho" && (
        <div className={styles.hecho}>
          <div className={styles.checkGrande} aria-hidden><IconoCheck tam={44} /></div>
          <h2 className={styles.subtitulo}>¡Gracias! Acabas de ahorrarle vueltas a alguien</h2>
          <span className={styles.caducidad}>
            <IconoReloj tam={16} /> Visible hasta las {hora(estado.plaza.expira)}
          </span>
          <MapaPunto punto={estado.plaza} />
          <button className={styles.botonSec} onClick={() => yaNoEstaLibre(estado.plaza)}>
            Ya no está libre / me he equivocado
          </button>
        </div>
      )}
    </section>
  );
}

/** Mapa pequeño con un marcador (arrastrable si se pasa onMover) */
function MapaPunto({ punto, onMover }: { punto: Punto; onMover?: (p: Punto) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const marcador = useRef<Marker | null>(null);
  const alMover = useRef(onMover);
  useEffect(() => {
    alMover.current = onMover;
  });
  const arrastrable = Boolean(onMover);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !contenedor.current) return;
      maplibregl.setWorkerUrl(URL_WORKER_MAPA);
      const m = new maplibregl.Map({
        container: contenedor.current,
        style: ESTILO_MAPA,
        center: [punto.lon, punto.lat],
        zoom: 18,
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const mk = new maplibregl.Marker({ color: "#0a7d3b", draggable: arrastrable, scale: 1.3 })
        .setLngLat([punto.lon, punto.lat])
        .addTo(m);
      mk.on("dragend", () => {
        const { lat, lng } = mk.getLngLat();
        alMover.current?.({ lat, lon: lng });
      });
      mapa.current = m;
      marcador.current = mk;
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; el punto inicial no se vuelve a aplicar al arrastrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastrable]);

  return <div ref={contenedor} className={styles.mapaPequeno} />;
}
