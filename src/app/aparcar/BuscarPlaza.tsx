"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapaML, GeoJSONSource, MapLayerMouseEvent, GeolocateControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import styles from "../page.module.css";

type Plaza = { id: number; lat: number; lon: number; creada: string; expira: string };

const ZONA_INICIAL: [number, number, number, number] = [-0.56, 38.32, -0.44, 38.39]; // Alicante ciudad
const REFRESCO_MS = 15_000;

const minutosDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const textoMinutos = (m: number) => (m === 0 ? "ahora" : `${m} min`);

export default function BuscarPlaza(config: ConfigSupabase) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const plazasRef = useRef<Plaza[]>([]);
  const geolocalizar = useRef<GeolocateControl | null>(null);
  const [vigentes, setVigentes] = useState(0);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [error, setError] = useState("");

  /** Repinta las plazas (los minutos cambian aunque no haya datos nuevos) */
  const pintar = useCallback(() => {
    const fuente = mapaRef.current?.getSource("plazas") as GeoJSONSource | undefined;
    const ahora = Date.now();
    const activas = plazasRef.current.filter((p) => new Date(p.expira).getTime() > ahora);
    setVigentes(activas.length);
    fuente?.setData({
      type: "FeatureCollection",
      features: activas
        .map((p) => {
          const min = minutosDesde(p.creada);
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            properties: { id: p.id, minutos: min, etiqueta: textoMinutos(min) },
          };
        }),
    });
  }, []);

  /** Pide a Supabase las plazas vigentes de la zona visible */
  const cargar = useCallback(async () => {
    const m = mapaRef.current;
    if (!m || document.hidden) return;
    const b = m.getBounds();
    const { data, error } = await supabaseNavegador(config)
      .from("plazas")
      .select("id, lat, lon, creada, expira")
      .gte("lat", b.getSouth())
      .lte("lat", b.getNorth())
      .gte("lon", b.getWest())
      .lte("lon", b.getEast())
      .order("creada", { ascending: false })
      .limit(500);
    if (error) return setError("No se han podido cargar las plazas. Lo reintentamos en unos segundos.");
    setError("");
    plazasRef.current = data;

    setActualizado(new Date());
    pintar();
  }, [config, pintar]);

  useEffect(() => {
    let cancelado = false;
    let espera: ReturnType<typeof setTimeout>;
    const intervalo = setInterval(cargar, REFRESCO_MS);
    const repintar = setInterval(pintar, 30_000);
    const alVolver = () => !document.hidden && cargar();
    document.addEventListener("visibilitychange", alVolver);

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !contenedor.current) return;
      maplibregl.setWorkerUrl(URL_WORKER_MAPA);
      const m = new maplibregl.Map({ container: contenedor.current, style: ESTILO_MAPA, bounds: ZONA_INICIAL });
      mapaRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.FullscreenControl(), "top-right");
      // La ubicación solo se usa en el navegador para centrar el mapa; no se envía ni se guarda.
      const geo = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        fitBoundsOptions: { maxZoom: 16 },
        trackUserLocation: true,
      });
      geolocalizar.current = geo;
      m.addControl(geo, "top-right");

      m.on("load", () => {
        m.addSource("plazas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // Círculo: verde si es reciente, naranja a mitad, gris cuando está a punto de caducar
        m.addLayer({
          id: "plazas-circulo",
          type: "circle",
          source: "plazas",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 9, 17, 16],
            "circle-color": ["step", ["get", "minutos"], "#1a9850", 4, "#e6a700", 8, "#9ca3af"],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });
        m.addLayer({
          id: "plazas-letra",
          type: "symbol",
          source: "plazas",
          layout: { "text-field": "P", "text-font": ["Open Sans Semibold"], "text-size": 14, "text-allow-overlap": true },
          paint: { "text-color": "#fff" },
        });
        m.addLayer({
          id: "plazas-minutos",
          type: "symbol",
          source: "plazas",
          layout: {
            "text-field": ["get", "etiqueta"],
            "text-font": ["Open Sans Semibold"],
            "text-size": 12,
            "text-offset": [0, 1.8],
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#1a1a1a", "text-halo-color": "#fff", "text-halo-width": 1.5 },
        });

        const abrir = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const min = Number(f.properties.minutos);
          new maplibregl.Popup({ offset: 14, className: "ficha" })
            .setLngLat([lon, lat])
            .setHTML(
              `<div class="ficha-cab"><span class="marca" style="background:#0a7d3b">P</span>` +
                `<div><strong>Plaza libre</strong><small>${min === 0 ? "Hace menos de 1 min" : `Hace ${min} min`}</small></div></div>` +
                `<p>Puede que ya la haya ocupado alguien: cuanto más reciente, mejor.</p>` +
                `<a class="ficha-ir" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" rel="noopener">Cómo llegar</a>`,
            )
            .addTo(m);
        };
        for (const capa of ["plazas-circulo", "plazas-letra"]) {
          m.on("click", capa, abrir);
          m.on("mouseenter", capa, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", capa, () => (m.getCanvas().style.cursor = ""));
        }
        cargar();
      });
      m.on("moveend", () => {
        clearTimeout(espera);
        espera = setTimeout(cargar, 300);
      });
    })();

    return () => {
      cancelado = true;
      clearTimeout(espera);
      clearInterval(intervalo);
      clearInterval(repintar);
      document.removeEventListener("visibilitychange", alVolver);
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [cargar, pintar]);


  return (
    <>
      <div className={styles.barraPlazas}>
        <button type="button" className={styles.boton} onClick={() => geolocalizar.current?.trigger()}>
          📍 Cerca de mí
        </button>
        <span className={styles.zona}>
          {vigentes === 0
            ? "Ahora mismo no hay plazas libres en esta zona."
            : `${vigentes} ${vigentes === 1 ? "plaza libre" : "plazas libres"} en el mapa`}
          {actualizado && ` · actualizado ${actualizado.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
        </span>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div ref={contenedor} className={styles.mapaGrande} />
      <p className={styles.leyenda}>
        <span style={{ background: "#1a9850" }} /> Menos de 4 min
        <span style={{ background: "#e6a700" }} /> 4–8 min
        <span style={{ background: "#9ca3af" }} /> A punto de caducar
      </p>
      <p className={styles.zona}>
        Próximamente aquí: parkings públicos y de pago, zonas de parquímetro (ORA) y garajes de particulares por horas o días.
      </p>
    </>
  );
}
