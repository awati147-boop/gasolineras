"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapaML, GeoJSONSource, MapLayerMouseEvent, GeolocateControl, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { ORA_ALICANTE, enAlicante } from "@/lib/ora";
import { nombrePropio } from "@/lib/texto";
import styles from "../page.module.css";
import { IconoInfo, IconoUbicacion } from "../Iconos";
import { ACCESOS, textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";

type Plaza = { id: number; lat: number; lon: number; creada: string; expira: string };
type Aparcamiento = {
  id: string; clase: "parking" | "parquimetro"; nombre: string | null; tipo: string | null; acceso: string | null;
  de_pago: boolean | null; plazas: number | null; plazas_pmr: number | null; horario: string | null;
  operador: string | null; precio: string | null; lat: number; lon: number;
};
type Filtro = "todo" | "libres" | "garajes" | "gratis" | "pago" | "ora";

const ZONA_INICIAL: [number, number, number, number] = [-0.515, 38.335, -0.47, 38.36]; // centro de Alicante
const REFRESCO_MS = 15_000;
const ZOOM_MINIMO_PARKINGS = 12;

// Colores por categoría (mismos en mapa, filtros y leyenda)
const COLOR = { libre: "#16a34a", gratis: "#0d9488", pago: "#2563eb", nd: "#64748b", ora: "#7c3aed", garaje: "#ea580c" };

const FILTROS: { id: Filtro; texto: string; color?: string }[] = [
  { id: "todo", texto: "Todo" },
  { id: "libres", texto: "Plazas libres", color: COLOR.libre },
  { id: "gratis", texto: "Gratis", color: COLOR.gratis },
  { id: "pago", texto: "De pago", color: COLOR.pago },
  { id: "garajes", texto: "Garajes", color: COLOR.garaje },
  { id: "ora", texto: "Zona ORA", color: COLOR.ora },
];

const TIPO_TEXTO: Record<string, string> = {
  superficie: "Al aire libre",
  subterraneo: "Subterráneo",
  varias_plantas: "Edificio de varias plantas",
  azotea: "En azotea",
  calle: "En la calle",
};

const minutosDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const textoMinutos = (m: number) => (m === 0 ? "ahora" : `${m} min`);
const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const categoria = (a: Aparcamiento) =>
  a.clase === "parquimetro" ? "ora" : a.de_pago === true ? "pago" : a.de_pago === false ? "gratis" : "nd";
const comoLlegar = (lat: number, lon: number) =>
  `<a class="ficha-ir" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" rel="noopener">Cómo llegar</a>`;

/** Ficha HTML de un parking o parquímetro */
function fichaAparcamiento(a: Aparcamiento) {
  if (a.clase === "parquimetro") {
    const tarifas = enAlicante(a.lon, a.lat)
      ? `<div class="ficha-tarifas">${ORA_ALICANTE.tipos
          .map(
            (t) =>
              `<div><span style="background:${t.color}"></span><b>${t.nombre}</b><br><small>${t.precio} · ${t.maximo}<br>${t.horario}</small></div>`,
          )
          .join("")}</div><p>${ORA_ALICANTE.avisos}</p>`
      : `<p>Estacionamiento regulado. Consulta la tarifa y el horario en el propio parquímetro.</p>`;
    return (
      `<div class="ficha-cab"><span class="marca" style="background:${COLOR.ora}">€</span>` +
      `<div><strong>Parquímetro</strong><small>Zona de estacionamiento regulado (ORA)</small></div></div>` +
      tarifas +
      comoLlegar(a.lat, a.lon)
    );
  }
  const cat = categoria(a);
  const etiqueta =
    cat === "pago" ? `<span class="ficha-etiqueta" style="background:${COLOR.pago}">De pago</span>`
    : cat === "gratis" ? `<span class="ficha-etiqueta" style="background:${COLOR.gratis}">Gratis</span>`
    : `<span class="ficha-etiqueta" style="background:${COLOR.nd}">Precio sin confirmar</span>`;
  const filas = [
    a.tipo && TIPO_TEXTO[a.tipo] && `🅿️ ${TIPO_TEXTO[a.tipo]}`,
    a.plazas && `🚗 ${a.plazas} plazas${a.plazas_pmr ? ` · ♿ ${a.plazas_pmr}` : ""}`,
    a.horario && `🕒 ${escapar(a.horario.replace("24/7", "Abierto 24 h"))}`,
    a.precio && `💶 ${escapar(a.precio)}`,
    a.operador && `🏢 ${escapar(a.operador)}`,
    a.acceso === "clientes" && "🛒 Solo para clientes del establecimiento",
  ].filter(Boolean);
  return (
    `<div class="ficha-cab"><span class="marca" style="background:${COLOR[cat]}">P</span>` +
    `<div><strong>${escapar(a.nombre ? nombrePropio(a.nombre) : "Aparcamiento")}</strong>${etiqueta}</div></div>` +
    (filas.length ? filas.map((f) => `<p>${f}</p>`).join("") : `<p>Aún no tenemos más datos de este aparcamiento.</p>`) +
    comoLlegar(a.lat, a.lon)
  );
}

/** Carrusel de fotos (se desliza con el dedo; el contador se actualiza al desplazarse) */
function carrusel(fotos: string[], supabaseUrl: string) {
  if (!fotos.length) return "";
  const imgs = fotos.map((f, i) => `<img src="${urlFoto(supabaseUrl, f)}" alt="Foto ${i + 1}" loading="lazy">`).join("");
  const contador = fotos.length > 1 ? `<span class="ficha-contador">1/${fotos.length}</span>` : "";
  return `<div class="ficha-carrusel"><div class="ficha-fotos">${imgs}</div>${contador}</div>`;
}

/** Ficha HTML de un garaje de particular */
function fichaGaraje(g: Garaje, supabaseUrl: string) {
  const datos = [
    g.disponibilidad && `🗓️ ${escapar(g.disponibilidad)}`,
    g.altura_max && `↕️ Altura máx. ${String(g.altura_max).replace(".", ",")} m`,
    g.acceso && `🔑 ${ACCESOS[g.acceso]}`,
    g.enchufe && "⚡ Enchufe para coche eléctrico",
  ].filter(Boolean);
  return (
    carrusel(g.fotos?.length ? g.fotos : g.foto ? [g.foto] : [], supabaseUrl) +
    `<div class="ficha-cab"><span class="marca" style="background:${COLOR.garaje}">🏠</span>` +
    `<div><strong>${escapar(g.titulo)}</strong><small>${g.tipo === "cerrado" ? "Garaje cerrado" : "Plaza en garaje"} · de particular</small></div></div>` +
    `<div class="ficha-precio"><b>${escapar(textoPrecio(g))}</b></div>` +
    (g.descripcion ? `<p class="ficha-desc">${escapar(g.descripcion)}</p>` : "") +
    datos.map((d) => `<p>${d}</p>`).join("") +
    `<p><small>📍 Ubicación aproximada: la dirección exacta se comparte al aceptar la reserva.</small></p>` +
    `<button class="ficha-ir" type="button" data-solicitar="${g.id}">Solicitar reserva</button>`
  );
}

export default function BuscarPlaza(config: ConfigSupabase) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const plazasRef = useRef<Plaza[]>([]);
  const aparcRef = useRef<Map<string, Aparcamiento>>(new Map());
  const garajesRef = useRef<Map<string, Garaje>>(new Map());
  const geolocalizar = useRef<GeolocateControl | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const filtroRef = useRef<Filtro>("todo");
  const [vigentes, setVigentes] = useState(0);
  const [conteo, setConteo] = useState({ gratis: 0, pago: 0, nd: 0, ora: 0 });
  const [numGarajes, setNumGarajes] = useState(0);
  const [lejos, setLejos] = useState(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [error, setError] = useState("");

  /** Muestra u oculta capas según el filtro elegido */
  const aplicarFiltro = useCallback((f: Filtro) => {
    const m = mapaRef.current;
    if (!m?.getLayer("aparc-circulo")) return;
    const verPlazas = f === "todo" || f === "libres";
    for (const capa of ["plazas-circulo", "plazas-letra", "plazas-minutos"]) {
      m.setLayoutProperty(capa, "visibility", verPlazas ? "visible" : "none");
    }
    const filtroAparc: FilterSpecification | null =
      f === "todo" ? null : f === "libres" ? ["==", ["get", "cat"], "__ninguno__"] : ["==", ["get", "cat"], f];
    for (const capa of ["aparc-circulo", "aparc-letra"]) {
      m.setFilter(capa, f === "garajes" ? ["==", ["get", "cat"], "__ninguno__"] : filtroAparc);
    }
    for (const capa of ["garajes-zona", "garajes-punto", "garajes-icono"]) {
      m.setLayoutProperty(capa, "visibility", f === "todo" || f === "garajes" ? "visible" : "none");
    }
  }, []);

  /** Repinta las plazas (los minutos cambian aunque no haya datos nuevos) */
  const pintar = useCallback(() => {
    const fuente = mapaRef.current?.getSource("plazas") as GeoJSONSource | undefined;
    const ahora = Date.now();
    const activas = plazasRef.current.filter((p) => new Date(p.expira).getTime() > ahora);
    setVigentes(activas.length);
    fuente?.setData({
      type: "FeatureCollection",
      features: activas.map((p) => {
        const min = minutosDesde(p.creada);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: { id: p.id, minutos: min, etiqueta: textoMinutos(min) },
        };
      }),
    });
  }, []);

  /** Plazas libres de la zona visible (cada 15 s) */
  const cargarPlazas = useCallback(async () => {
    const m = mapaRef.current;
    if (!m || document.hidden) return;
    const b = m.getBounds();
    const { data, error } = await supabaseNavegador(config)
      .from("plazas")
      .select("id, lat, lon, creada, expira")
      .gte("lat", b.getSouth()).lte("lat", b.getNorth())
      .gte("lon", b.getWest()).lte("lon", b.getEast())
      .order("creada", { ascending: false })
      .limit(500);
    if (error) return setError("No se han podido cargar las plazas. Lo reintentamos en unos segundos.");
    setError("");
    plazasRef.current = data;
    setActualizado(new Date());
    pintar();
  }, [config, pintar]);

  /** Parkings y parquímetros de la zona visible (al mover el mapa) */
  const cargarAparcamientos = useCallback(async () => {
    const m = mapaRef.current;
    if (!m) return;
    const fuente = m.getSource("aparcamientos") as GeoJSONSource | undefined;
    if (m.getZoom() < ZOOM_MINIMO_PARKINGS) {
      setLejos(true);
      setConteo({ gratis: 0, pago: 0, nd: 0, ora: 0 });
      return fuente?.setData({ type: "FeatureCollection", features: [] });
    }
    setLejos(false);
    const b = m.getBounds();
    const { data, error } = await supabaseNavegador(config)
      .from("aparcamientos")
      .select("id, clase, nombre, tipo, acceso, de_pago, plazas, plazas_pmr, horario, operador, precio, lat, lon")
      .gte("lat", b.getSouth()).lte("lat", b.getNorth())
      .gte("lon", b.getWest()).lte("lon", b.getEast())
      .limit(3000);
    if (error) return setError("No se han podido cargar los aparcamientos.");
    const lista = data as Aparcamiento[];
    aparcRef.current = new Map(lista.map((a) => [a.id, a]));
    const c = { gratis: 0, pago: 0, nd: 0, ora: 0 };
    lista.forEach((a) => c[categoria(a)]++);
    setConteo(c);
    fuente?.setData({
      type: "FeatureCollection",
      features: lista.map((a) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.lon, a.lat] },
        properties: { id: a.id, cat: categoria(a), letra: a.clase === "parquimetro" ? "€" : "P" },
      })),
    });
  }, [config]);

  /** Garajes de particulares activos en la zona visible */
  const cargarGarajes = useCallback(async () => {
    const m = mapaRef.current;
    if (!m) return;
    const b = m.getBounds();
    const { data, error } = await supabaseNavegador(config)
      .from("garajes")
      .select("id, titulo, descripcion, tipo, precio_hora, precio_dia, precio_mes, disponibilidad, altura_max, acceso, enchufe, foto, fotos, lat_aprox, lon_aprox, activo, creado")
      .eq("activo", true)
      .gte("lat_aprox", b.getSouth()).lte("lat_aprox", b.getNorth())
      .gte("lon_aprox", b.getWest()).lte("lon_aprox", b.getEast())
      .limit(500);
    if (error) return;
    const lista = data as Garaje[];
    garajesRef.current = new Map(lista.map((g) => [g.id, g]));
    setNumGarajes(lista.length);
    (m.getSource("garajes") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: lista.map((g) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [g.lon_aprox, g.lat_aprox] },
        properties: { id: g.id },
      })),
    });
  }, [config]);

  useEffect(() => {
    let cancelado = false;
    let espera: ReturnType<typeof setTimeout>;
    const intervalo = setInterval(cargarPlazas, REFRESCO_MS);
    const repintar = setInterval(pintar, 30_000);
    const alVolver = () => !document.hidden && cargarPlazas();
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
        // --- Parkings y parquímetros (debajo) ---
        m.addSource("aparcamientos", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "aparc-circulo",
          type: "circle",
          source: "aparcamientos",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 15, 9, 18, 12],
            "circle-color": ["match", ["get", "cat"], "gratis", COLOR.gratis, "pago", COLOR.pago, "ora", COLOR.ora, COLOR.nd],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
            "circle-opacity": ["match", ["get", "cat"], "nd", 0.75, 1],
          },
        });
        m.addLayer({
          id: "aparc-letra",
          type: "symbol",
          source: "aparcamientos",
          minzoom: 14,
          layout: { "text-field": ["get", "letra"], "text-font": ["Open Sans Semibold"], "text-size": 11, "text-allow-overlap": true },
          paint: { "text-color": "#fff" },
        });

        // --- Garajes de particulares: zona aproximada (~100 m) + marcador ---
        m.addSource("garajes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "garajes-zona",
          type: "circle",
          source: "garajes",
          minzoom: 14,
          paint: {
            // ~100 m de radio en píxeles según el zoom (aprox. para latitudes de España)
            "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 9, 18, 140],
            "circle-color": COLOR.garaje,
            "circle-opacity": 0.12,
            "circle-stroke-color": COLOR.garaje,
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.4,
          },
        });
        m.addLayer({
          id: "garajes-punto",
          type: "circle",
          source: "garajes",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 9, 17, 14],
            "circle-color": COLOR.garaje,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });
        m.addLayer({
          id: "garajes-icono",
          type: "symbol",
          source: "garajes",
          layout: { "text-field": "G", "text-font": ["Open Sans Semibold"], "text-size": 13, "text-allow-overlap": true },
          paint: { "text-color": "#fff" },
        });

        // --- Plazas libres (encima, más grandes) ---
        m.addSource("plazas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "plazas-circulo",
          type: "circle",
          source: "plazas",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 17, 17],
            "circle-color": ["step", ["get", "minutos"], COLOR.libre, 4, "#d98e04", 8, "#9ca3af"],
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
            "text-offset": [0, 1.9],
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#1a1a1a", "text-halo-color": "#fff", "text-halo-width": 1.5 },
        });

        const abrirPlaza = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const min = Number(f.properties.minutos);
          new maplibregl.Popup({ offset: 14, className: "ficha" })
            .setLngLat([lon, lat])
            .setHTML(
              `<div class="ficha-cab"><span class="marca" style="background:${COLOR.libre}">P</span>` +
                `<div><strong>Plaza libre</strong><small>${min === 0 ? "Hace menos de 1 min" : `Hace ${min} min`}</small></div></div>` +
                `<p>Puede que ya la haya ocupado alguien: cuanto más reciente, mejor.</p>` +
                comoLlegar(lat, lon),
            )
            .addTo(m);
        };
        const abrirAparcamiento = (e: MapLayerMouseEvent) => {
          // Si en el mismo punto hay una plaza libre, manda la plaza
          if (m.queryRenderedFeatures(e.point, { layers: ["plazas-circulo"] }).length) return;
          const a = aparcRef.current.get(String(e.features?.[0]?.properties.id));
          if (!a) return;
          new maplibregl.Popup({ offset: 10, className: "ficha", maxWidth: "min(300px, 82vw)" })
            .setLngLat([a.lon, a.lat])
            .setHTML(fichaAparcamiento(a))
            .addTo(m);
        };
        const abrirGaraje = (e: MapLayerMouseEvent) => {
          if (m.queryRenderedFeatures(e.point, { layers: ["plazas-circulo"] }).length) return;
          const g = garajesRef.current.get(String(e.features?.[0]?.properties.id));
          if (!g) return;
          const popup = new maplibregl.Popup({ offset: 12, className: "ficha", maxWidth: "min(300px, 82vw)" })
            .setLngLat([g.lon_aprox, g.lat_aprox])
            .setHTML(fichaGaraje(g, config.url))
            .addTo(m);
          const tira = popup.getElement().querySelector<HTMLElement>(".ficha-fotos");
          const cont = popup.getElement().querySelector<HTMLElement>(".ficha-contador");
          tira?.addEventListener("scroll", () => {
            const i = Math.round(tira.scrollLeft / tira.clientWidth) + 1;
            if (cont) cont.textContent = `${i}/${tira.children.length}`;
          });
          popup.getElement().querySelector("[data-solicitar]")?.addEventListener("click", () => {
            alert("Muy pronto podrás solicitar la reserva desde aquí.");
          });
        };
        for (const [capas, accion] of [
          [["plazas-circulo", "plazas-letra"], abrirPlaza],
          [["aparc-circulo", "aparc-letra"], abrirAparcamiento],
          [["garajes-punto", "garajes-icono"], abrirGaraje],
        ] as const) {
          for (const capa of capas) {
            m.on("click", capa, accion);
            m.on("mouseenter", capa, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", capa, () => (m.getCanvas().style.cursor = ""));
          }
        }

        aplicarFiltro(filtroRef.current);
        cargarPlazas();
        cargarAparcamientos();
        cargarGarajes();
      });
      m.on("moveend", () => {
        clearTimeout(espera);
        espera = setTimeout(() => {
          cargarPlazas();
          cargarAparcamientos();
          cargarGarajes();
        }, 300);
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
  }, [cargarPlazas, cargarAparcamientos, cargarGarajes, pintar, aplicarFiltro, config.url]);

  function elegir(f: Filtro) {
    setFiltro(f);
    filtroRef.current = f;
    aplicarFiltro(f);
  }

  // Texto del contador flotante según el filtro
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const resumen =
    filtro === "libres" ? (vigentes ? plural(vigentes, "plaza libre", "plazas libres") : "Sin plazas libres aquí ahora")
    : lejos ? "Acércate para ver parkings"
    : filtro === "gratis" ? plural(conteo.gratis, "parking gratis", "parkings gratis")
    : filtro === "pago" ? plural(conteo.pago, "parking de pago", "parkings de pago")
    : filtro === "ora" ? plural(conteo.ora, "parquímetro", "parquímetros")
    : filtro === "garajes" ? (numGarajes ? plural(numGarajes, "garaje en alquiler", "garajes en alquiler") : "Sin garajes en esta zona")
    : `${plural(vigentes, "plaza libre", "plazas libres")} · ${conteo.gratis + conteo.pago + conteo.nd} parkings`;

  return (
    <>
      <nav className={styles.chips} aria-label="Qué mostrar">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => elegir(f.id)}
            className={filtro === f.id ? styles.chipActivo : styles.chip}
            aria-pressed={filtro === f.id}
          >
            {f.color && <span className={styles.punto} style={{ background: f.color, marginRight: 6 }} />}
            {f.texto}
          </button>
        ))}
      </nav>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.mapaMarco}>
        <div ref={contenedor} className={styles.mapaGrande} />

        <div className={`${styles.flotante} ${styles.flotanteArriba}`} aria-live="polite">
          <span className={`${styles.punto} ${styles.puntoVivo}`} />
          {resumen}
          {actualizado && (
            <span className={styles.sub}>
              · {actualizado.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        <button
          type="button"
          className={`${styles.boton} ${styles.botonMapa}`}
          onClick={() => geolocalizar.current?.trigger()}
        >
          <IconoUbicacion tam={18} /> Cerca de mí
        </button>
      </div>

      <div className={styles.leyendaParking}>
        <span><i style={{ background: COLOR.libre }} />Plaza libre (usuarios)</span>
        <span><i style={{ background: COLOR.gratis }} />Parking gratis</span>
        <span><i style={{ background: COLOR.pago }} />Parking de pago</span>
        <span><i style={{ background: COLOR.nd }} />Parking sin dato de precio</span>
        <span><i style={{ background: COLOR.ora }} />Parquímetro (ORA)</span>
        <span><i style={{ background: COLOR.garaje }} />Garaje de particular</span>
      </div>

      <div className={`${styles.tarjeta} ${styles.proximo}`}>
        <IconoInfo tam={18} />
        <span>
          Parkings y parquímetros: © colaboradores de OpenStreetMap. Muy pronto: <b>precios de los parkings</b>,{" "}
          <b>calles de zona azul y naranja</b> y <b>garajes de particulares</b> por horas o días.
        </span>
      </div>
    </>
  );
}
