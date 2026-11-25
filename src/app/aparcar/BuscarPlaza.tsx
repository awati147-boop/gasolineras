"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Map as MapaML, Marker, GeoJSONSource, MapLayerMouseEvent, GeolocateControl, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { ORA_ALICANTE, enAlicante } from "@/lib/ora";
import { nombrePropio } from "@/lib/texto";
import styles from "../page.module.css";
import { IconoBuscar, IconoInfo, IconoUbicacion } from "../Iconos";
import Denunciar from "../Denunciar";
import { ACCESOS, textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";

type Plaza = { id: number; lat: number; lon: number; creada: string; expira: string };
type Aparcamiento = {
  id: string; clase: "parking" | "parquimetro"; nombre: string | null; tipo: string | null; acceso: string | null;
  de_pago: boolean | null; plazas: number | null; plazas_pmr: number | null; horario: string | null;
  operador: string | null; precio: string | null; lat: number; lon: number;
};
type Zona = {
  id: string; ciudad: string; tipo: "rotacion" | "mixta" | "residentes" | "larga" | "libre"; color: string;
  calle: string | null; plazas: number | null; lat: number; lon: number; lat2: number | null; lon2: number | null; fuente: string;
};
type Lugar = { nombre: string; detalle: string; lat: number; lon: number };
type Filtro = "todo" | "libres" | "garajes" | "gratis" | "pago" | "ora";

const ZONA_INICIAL: [number, number, number, number] = [-0.515, 38.335, -0.47, 38.36]; // centro de Alicante
const REFRESCO_MS = 15_000;
const ZOOM_MINIMO_PARKINGS = 12;
const ZOOM_MINIMO_ZONAS = 14;

// Zonas reguladas de la calle (datos abiertos de los ayuntamientos): color de la pintura de la calle
const COLOR_CALLE: Record<string, string> = {
  azul: "#1d4ed8", verde: "#15803d", naranja: "#ea7a0c", roja: "#dc2626", blanca: "#94a3b8",
};
const TIPO_ZONA: Record<Zona["tipo"], { nombre: string; texto: string }> = {
  rotacion: { nombre: "Rotación", texto: "De pago y con tiempo máximo, para cualquier conductor." },
  mixta: { nombre: "Mixta", texto: "Preferente para residentes. Los visitantes pueden aparcar pagando, con un tiempo máximo más corto." },
  residentes: { nombre: "Solo residentes", texto: "Solo para vecinos con distintivo. Los visitantes no pueden aparcar." },
  larga: { nombre: "Larga estancia", texto: "De pago, pensada para estancias largas." },
  libre: { nombre: "Libre", texto: "Aparcamiento gratuito y sin límite de tiempo." },
};

// Colores por categoría (mismos en mapa, filtros y leyenda)
const COLOR = { libre: "#16a34a", gratis: "#0d9488", pago: "#2563eb", nd: "#64748b", ora: "#7c3aed", garaje: "#ea580c" };

const FILTROS: { id: Filtro; texto: string; color?: string }[] = [
  { id: "todo", texto: "Todo" },
  { id: "libres", texto: "Plazas libres", color: COLOR.libre },
  { id: "gratis", texto: "Gratis", color: COLOR.gratis },
  { id: "pago", texto: "De pago", color: COLOR.pago },
  { id: "garajes", texto: "Garajes", color: COLOR.garaje },
  { id: "ora", texto: "Zona azul / ORA", color: COLOR.ora },
];

const TIPO_TEXTO: Record<string, string> = {
  superficie: "Al aire libre",
  subterraneo: "Subterráneo",
  varias_plantas: "Edificio de varias plantas",
  azotea: "En azotea",
  calle: "En la calle",
};

const RADIO_DESTINO_M = 800;
type Cerca = {
  parkings: { a: Aparcamiento; m: number }[];
  libres: number;
  zona: Zona | null;
  parquimetros: number;
};

/** Distancia en metros entre dos puntos */
function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
/** Minutos andando (las calles no van en línea recta: +30 %, a 80 m/min) */
const minAndando = (m: number) => Math.max(1, Math.round((m * 1.3) / 80));
const urlRuta = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

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

/** Ficha HTML de un tramo de zona regulada */
function fichaZona(z: Zona) {
  const t = TIPO_ZONA[z.tipo];
  const color = COLOR_CALLE[z.color] ?? COLOR.ora;
  const titulo = z.tipo === "libre" ? "Zona libre (gratis)" : `Zona ${z.color} · ${t.nombre}`;
  return (
    `<div class="ficha-cab"><span class="marca" style="background:${color}">${z.tipo === "libre" ? "✓" : "€"}</span>` +
    `<div><strong>${escapar(titulo)}</strong><small>${escapar(z.calle ?? z.ciudad)}</small></div></div>` +
    `<p>${t.texto}</p>` +
    (z.plazas && z.plazas > 1 ? `<p>🚗 ${z.plazas} plazas en este tramo</p>` : "") +
    (z.tipo !== "libre" ? `<p>💶 Consulta la tarifa y el horario en el parquímetro o en la app de pago de ${escapar(z.ciudad)}.</p>` : "") +
    `<p><small>Fuente: ${escapar(z.fuente)}. Las señales de la calle mandan sobre este mapa.</small></p>` +
    comoLlegar(z.lat, z.lon)
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
  const zonasRef = useRef<Map<string, Zona>>(new Map());
  const [numZonas, setNumZonas] = useState(0);
  const geolocalizar = useRef<GeolocateControl | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const filtroRef = useRef<Filtro>("todo");
  const [vigentes, setVigentes] = useState(0);
  const [conteo, setConteo] = useState({ gratis: 0, pago: 0, nd: 0, ora: 0 });
  const [numGarajes, setNumGarajes] = useState(0);
  const [lejos, setLejos] = useState(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [error, setError] = useState("");
  // Ficha abierta en la hoja inferior (HTML ya escapado) y aviso dentro de ella
  const [hoja, setHoja] = useState<string | null>(null);
  const [hojaGaraje, setHojaGaraje] = useState<string | null>(null); // id del garaje mostrado (para denunciar)
  const [aviso, setAviso] = useState("");
  const [texto, setTexto] = useState("");
  const [avisoBusqueda, setAvisoBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<Lugar[]>([]);
  const [destino, setDestino] = useState<Lugar | null>(null);
  const marcadorRef = useRef<Marker | null>(null);
  const destinoRef = useRef<Lugar | null>(null);
  const [cerca, setCerca] = useState<Cerca | null>(null);
  const router = useRouter();

  /** Clics dentro de la ficha: botón "Solicitar reserva" */
  async function alPulsarFicha(e: React.MouseEvent<HTMLDivElement>) {
    const boton = (e.target as HTMLElement).closest("[data-solicitar]");
    if (!boton) return;
    const { data } = await supabaseNavegador(config).auth.getUser();
    if (!data.user || data.user.is_anonymous) {
      setAviso("cuenta");
    } else {
      router.push(`/reservar/${boton.getAttribute("data-solicitar")}`);
    }
  }

  /** Contador "2/4" del carrusel de fotos al deslizar */
  function alDeslizar(e: React.UIEvent<HTMLDivElement>) {
    const tira = e.target as HTMLElement;
    if (!tira.classList?.contains("ficha-fotos")) return;
    const cont = tira.parentElement?.querySelector(".ficha-contador");
    if (cont) cont.textContent = `${Math.round(tira.scrollLeft / tira.clientWidth) + 1}/${tira.children.length}`;
  }

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
    for (const capa of ["zonas-linea", "zonas-punto"]) {
      m.setLayoutProperty(capa, "visibility", f === "todo" || f === "ora" ? "visible" : "none");
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

  /** Lo que hay cerca del destino buscado: parkings, plazas libres y zona de la calle (tras cada carga) */
  const calcularCerca = useCallback(() => {
    const d = destinoRef.current;
    if (!d) return setCerca(null);
    const parkings = [...aparcRef.current.values()]
      .filter((a) => a.clase === "parking" && a.acceso !== "clientes")
      .map((a) => ({ a, m: metros(d, a) }))
      .filter((x) => x.m <= RADIO_DESTINO_M)
      .sort((x, y) => x.m - y.m)
      .slice(0, 5);
    const ahora = Date.now();
    const libres = plazasRef.current.filter((p) => new Date(p.expira).getTime() > ahora && metros(d, p) <= 500).length;
    let zona: Zona | null = null;
    let zonaM = 80;
    for (const z of zonasRef.current.values()) {
      const puntos = z.lat2 != null && z.lon2 != null
        ? [{ lat: z.lat, lon: z.lon }, { lat: z.lat2, lon: z.lon2 }, { lat: (z.lat + z.lat2) / 2, lon: (z.lon + z.lon2) / 2 }]
        : [z];
      const m = Math.min(...puntos.map((p) => metros(d, p)));
      if (m < zonaM) {
        zona = z;
        zonaM = m;
      }
    }
    const parquimetros = [...aparcRef.current.values()].filter((a) => a.clase === "parquimetro" && metros(d, a) <= 150).length;
    setCerca({ parkings, libres, zona, parquimetros });
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
    calcularCerca();
  }, [config, pintar, calcularCerca]);

  /** Parkings y parquímetros de la zona visible (al mover el mapa) */
  const cargarAparcamientos = useCallback(async () => {
    const m = mapaRef.current;
    if (!m) return;
    const fuente = m.getSource("aparcamientos") as GeoJSONSource | undefined;
    if (m.getZoom() < ZOOM_MINIMO_PARKINGS) {
      setLejos(true);
      setConteo({ gratis: 0, pago: 0, nd: 0, ora: 0 });
      aparcRef.current = new Map();
      calcularCerca();
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
    calcularCerca();
    fuente?.setData({
      type: "FeatureCollection",
      features: lista.map((a) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.lon, a.lat] },
        properties: { id: a.id, cat: categoria(a), letra: a.clase === "parquimetro" ? "€" : "P" },
      })),
    });
  }, [config, calcularCerca]);

  /** Zonas reguladas de la calle en la zona visible (solo con zoom cercano: son muchas) */
  const cargarZonas = useCallback(async () => {
    const m = mapaRef.current;
    if (!m) return;
    const fuente = m.getSource("zonas") as GeoJSONSource | undefined;
    if (m.getZoom() < ZOOM_MINIMO_ZONAS) {
      setNumZonas(0);
      zonasRef.current = new Map();
      calcularCerca();
      return fuente?.setData({ type: "FeatureCollection", features: [] });
    }
    const b = m.getBounds();
    const { data, error } = await supabaseNavegador(config)
      .from("zonas_reguladas")
      .select("id, ciudad, tipo, color, calle, plazas, lat, lon, lat2, lon2, fuente")
      .gte("lat", b.getSouth()).lte("lat", b.getNorth())
      .gte("lon", b.getWest()).lte("lon", b.getEast())
      .limit(5000);
    if (error) return; // si la tabla aún no existe, el resto del mapa sigue funcionando
    const lista = data as Zona[];
    zonasRef.current = new Map(lista.map((z) => [z.id, z]));
    setNumZonas(lista.filter((z) => z.tipo !== "libre").length);
    calcularCerca();
    fuente?.setData({
      type: "FeatureCollection",
      features: lista.map((z) => ({
        type: "Feature",
        geometry: z.lat2 != null && z.lon2 != null
          ? { type: "LineString", coordinates: [[z.lon, z.lat], [z.lon2, z.lat2]] }
          : { type: "Point", coordinates: [z.lon, z.lat] },
        properties: { id: z.id, color: COLOR_CALLE[z.color] ?? COLOR.ora },
      })),
    });
  }, [config, calcularCerca]);

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
        // --- Zonas reguladas de la calle (lo más abajo) ---
        m.addSource("zonas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "zonas-linea",
          type: "line",
          source: "zonas",
          filter: ["==", ["geometry-type"], "LineString"],
          layout: { "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 9],
            "line-opacity": 0.75,
          },
        });
        m.addLayer({
          id: "zonas-punto",
          type: "circle",
          source: "zonas",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 18, 7],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.75,
          },
        });

        // --- Parkings y parquímetros ---
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
          abrirHoja(
            `<div class="ficha-cab"><span class="marca" style="background:${COLOR.libre}">P</span>` +
              `<div><strong>Plaza libre</strong><small>${min === 0 ? "Hace menos de 1 min" : `Hace ${min} min`}</small></div></div>` +
              `<p>Puede que ya la haya ocupado alguien: cuanto más reciente, mejor.</p>` +
              comoLlegar(lat, lon),
            [lon, lat],
          );
        };
        const abrirAparcamiento = (e: MapLayerMouseEvent) => {
          // Si en el mismo punto hay una plaza libre, manda la plaza
          if (m.queryRenderedFeatures(e.point, { layers: ["plazas-circulo"] }).length) return;
          const a = aparcRef.current.get(String(e.features?.[0]?.properties.id));
          if (!a) return;
          abrirHoja(fichaAparcamiento(a), [a.lon, a.lat]);
        };
        const abrirGaraje = (e: MapLayerMouseEvent) => {
          if (m.queryRenderedFeatures(e.point, { layers: ["plazas-circulo"] }).length) return;
          const g = garajesRef.current.get(String(e.features?.[0]?.properties.id));
          if (!g) return;
          abrirHoja(fichaGaraje(g, config.url), [g.lon_aprox, g.lat_aprox], g.id);
        };
        const abrirZona = (e: MapLayerMouseEvent) => {
          const encima = ["plazas-circulo", "aparc-circulo", "garajes-punto"];
          if (m.queryRenderedFeatures(e.point, { layers: encima }).length) return;
          const z = zonasRef.current.get(String(e.features?.[0]?.properties.id));
          if (!z) return;
          abrirHoja(fichaZona(z), [z.lon, z.lat]);
        };
        /** Muestra la ficha en la hoja inferior y centra el punto en la parte de arriba del mapa */
        const abrirHoja = (html: string, centro: [number, number], garajeId: string | null = null) => {
          setAviso("");
          setHoja(html);
          setHojaGaraje(garajeId);
          const alto = m.getContainer().clientHeight;
          m.easeTo({ center: centro, offset: [0, -alto * 0.22], duration: 400 });
        };
        m.on("click", (e) => {
          // Tocar el mapa fuera de un punto cierra la hoja
          const capas = ["plazas-circulo", "aparc-circulo", "garajes-punto", "zonas-linea", "zonas-punto"].filter((c) => m.getLayer(c));
          if (!m.queryRenderedFeatures(e.point, { layers: capas }).length) setHoja(null);
        });
        for (const [capas, accion] of [
          [["plazas-circulo", "plazas-letra"], abrirPlaza],
          [["aparc-circulo", "aparc-letra"], abrirAparcamiento],
          [["garajes-punto", "garajes-icono"], abrirGaraje],
          [["zonas-linea", "zonas-punto"], abrirZona],
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
        cargarZonas();
      });
      m.on("moveend", () => {
        clearTimeout(espera);
        espera = setTimeout(() => {
          cargarPlazas();
          cargarAparcamientos();
          cargarGarajes();
          cargarZonas();
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
  }, [cargarPlazas, cargarAparcamientos, cargarGarajes, cargarZonas, pintar, aplicarFiltro, config.url]);

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
    : filtro === "ora" ? (numZonas ? plural(numZonas, "tramo de zona regulada", "tramos de zona regulada") : plural(conteo.ora, "parquímetro", "parquímetros"))
    : filtro === "garajes" ? (numGarajes ? plural(numGarajes, "garaje en alquiler", "garajes en alquiler") : "Sin garajes en esta zona")
    : `${plural(vigentes, "plaza libre", "plazas libres")} · ${conteo.gratis + conteo.pago + conteo.nd} parkings`;

  // Sugerencias mientras se escribe (con una pequeña espera para no buscar en cada letra)
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 3 || q === destino?.nombre) return;
    const control = new AbortController();
    const espera = setTimeout(async () => {
      const c = mapaRef.current?.getCenter();
      const cerca = c ? `&lat=${c.lat.toFixed(1)}&lon=${c.lng.toFixed(1)}` : "";
      try {
        const res = await fetch(`/api/lugares?q=${encodeURIComponent(q)}${cerca}`, { signal: control.signal });
        const { lugares } = (await res.json()) as { lugares?: Lugar[] };
        setSugerencias(lugares ?? []);
      } catch {
        /* sin sugerencias: Enter sigue buscando la ciudad */
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [texto, destino]);

  /** Marca el destino en el mapa y se acerca (los datos se recargan al terminar el movimiento) */
  async function elegirLugar(l: Lugar) {
    destinoRef.current = l;
    setDestino(l);
    setTexto(l.nombre);
    setSugerencias([]);
    setAvisoBusqueda("");
    setHoja(null);
    const m = mapaRef.current;
    if (!m) return;
    const maplibregl = await import("maplibre-gl");
    marcadorRef.current?.remove();
    marcadorRef.current = new maplibregl.Marker({ color: "#dc2626" }).setLngLat([l.lon, l.lat]).addTo(m);
    m.flyTo({ center: [l.lon, l.lat], zoom: 16 });
  }

  /** Abre la ficha de un parking de la lista del destino */
  function verParking(a: Aparcamiento) {
    setHoja(fichaAparcamiento(a));
    setHojaGaraje(null);
    mapaRef.current?.easeTo({ center: [a.lon, a.lat], duration: 400 });
  }

  function quitarDestino() {
    marcadorRef.current?.remove();
    marcadorRef.current = null;
    destinoRef.current = null;
    setDestino(null);
    setCerca(null);
    setTexto("");
  }

  /** Enter: el primer lugar sugerido; si no hay, la ciudad o código postal */
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = texto.trim();
    if (!q) return;
    if (sugerencias[0] && q.length >= 3 && q !== destino?.nombre) return elegirLugar(sugerencias[0]);
    setAvisoBusqueda("");
    try {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
      const { zona } = (await res.json()) as { zona: [number, number, number, number] | null };
      if (!zona) return setAvisoBusqueda(`No encontramos «${q}».`);
      mapaRef.current?.fitBounds(zona, { padding: 40, maxZoom: 15 });
    } catch {
      setAvisoBusqueda("No se ha podido buscar. Inténtalo más tarde.");
    }
  }

  return (
    <>
      <form className={styles.buscador} onSubmit={buscar} role="search">
        <label className={styles.cajaIcono}>
          <IconoBuscar tam={20} />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="¿A dónde vas? Dirección, lugar o ciudad"
            aria-label="¿A dónde vas?"
            autoComplete="off"
            className={styles.caja}
            enterKeyHint="search"
          />
        </label>
        <button
          type="button"
          className={styles.botonSec}
          onClick={() => geolocalizar.current?.trigger()}
          title="Cerca de mí"
          aria-label="Cerca de mí"
        >
          <IconoUbicacion tam={20} />
          <span className={styles.ocultarMovil}>Cerca de mí</span>
        </button>
      </form>
      {sugerencias.length > 0 && texto.trim().length >= 3 && texto !== destino?.nombre && (
        <ul className={styles.sugerencias} aria-label="Sugerencias">
          {sugerencias.map((l) => (
            <li key={`${l.lat},${l.lon}`}>
              <button type="button" onClick={() => elegirLugar(l)}>
                <b>{l.nombre}</b>
                {l.detalle && <small>{l.detalle}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {avisoBusqueda && <p className={styles.error}>{avisoBusqueda}</p>}

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
      </div>

      {hoja && (
        <div className="ficha hoja" role="dialog" aria-label="Detalles" onClick={alPulsarFicha} onScrollCapture={alDeslizar}>
          <button type="button" className="hoja-cerrar" onClick={() => setHoja(null)} aria-label="Cerrar">×</button>
          <div className="hoja-asa" aria-hidden />
          <div dangerouslySetInnerHTML={{ __html: hoja }} />
          {hojaGaraje && <Denunciar key={hojaGaraje} tipo="garaje" objetoId={hojaGaraje} {...config} />}
          {aviso === "cuenta" && (
            <p className="hoja-aviso">
              Para pedir una reserva necesitas una cuenta. <Link href="/cuenta">Entrar con Google o email →</Link>
            </p>
          )}
        </div>
      )}

      {destino && cerca && (
    <section className={`${styles.tarjeta} ${styles.destino}`} aria-label="Aparcar cerca de tu destino">
      <header>
        <div>
          <strong>📍 {destino.nombre}</strong>
          {destino.detalle && <small>{destino.detalle}</small>}
        </div>
        <button type="button" onClick={quitarDestino} aria-label="Quitar destino">×</button>
      </header>

      {cerca.zona ? (
        <p className={styles.destinoZona}>
          <span style={{ background: COLOR_CALLE[cerca.zona.color] ?? COLOR.ora }} />
          {cerca.zona.tipo === "libre"
            ? "Tu destino está en zona libre: aparcar en la calle es gratis."
            : `Tu destino está en zona ${cerca.zona.color} (${TIPO_ZONA[cerca.zona.tipo].nombre.toLowerCase()}). ${TIPO_ZONA[cerca.zona.tipo].texto}`}
        </p>
      ) : cerca.parquimetros > 0 ? (
        <p className={styles.destinoZona}>
          <span style={{ background: COLOR.ora }} />
          Hay parquímetros junto a tu destino: la calle es de pago (zona regulada).
        </p>
      ) : null}

      {cerca.libres > 0 && (
        <p className={styles.destinoZona}>
          <span style={{ background: COLOR.libre }} />
          {cerca.libres === 1 ? "1 plaza libre" : `${cerca.libres} plazas libres`} a menos de 500 m (avisos de otros conductores).
        </p>
      )}

      {lejos ? (
        <p className={styles.sub}>Acerca el mapa para ver los parkings.</p>
      ) : cerca.parkings.length ? (
        <ul>
          {cerca.parkings.map(({ a, m }) => {
            const cat = categoria(a);
            return (
              <li key={a.id}>
                <button type="button" className={styles.destinoItem} onClick={() => verParking(a)}>
                  <span className={styles.destinoMarca} style={{ background: COLOR[cat] }}>P</span>
                  <span>
                    <b>{a.nombre ? nombrePropio(a.nombre) : "Aparcamiento"}</b>
                    <small>
                      🚶 {minAndando(m)} min ·{" "}
                      {cat === "pago" ? "De pago" : cat === "gratis" ? "Gratis" : "Precio sin confirmar"}
                      {a.plazas ? ` · ${a.plazas} plazas` : ""}
                    </small>
                  </span>
                </button>
                <a className={styles.destinoIr} href={urlRuta(a.lat, a.lon)} target="_blank" rel="noopener">
                  Llévame
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.sub}>
          No conocemos parkings a menos de {RADIO_DESTINO_M} m. Mira en el mapa si hay plazas libres o zona regulada.
        </p>
      )}
    </section>
      )}

      <div className={styles.leyendaParking}>
        <span><i style={{ background: COLOR.libre }} />Plaza libre (usuarios)</span>
        <span><i style={{ background: COLOR.gratis }} />Parking gratis</span>
        <span><i style={{ background: COLOR.pago }} />Parking de pago</span>
        <span><i style={{ background: COLOR.nd }} />Parking sin dato de precio</span>
        <span><i style={{ background: COLOR.ora }} />Parquímetro (ORA)</span>
        <span><i style={{ background: COLOR.garaje }} />Garaje de particular</span>
        <span><i style={{ background: COLOR_CALLE.azul, borderRadius: 2 }} />Calle de zona azul</span>
        <span><i style={{ background: COLOR_CALLE.verde, borderRadius: 2 }} />Calle de zona verde</span>
        <span><i style={{ background: COLOR_CALLE.naranja, borderRadius: 2 }} />Calle de zona naranja</span>
      </div>

      <div className={`${styles.tarjeta} ${styles.proximo}`}>
        <IconoInfo tam={18} />
        <span>
          Parkings y parquímetros: © colaboradores de OpenStreetMap. Calles de zona regulada: datos abiertos de los
          ayuntamientos de Madrid, Barcelona (B:SM) y València (CC BY 4.0). Muy pronto: <b>precios de los parkings</b> y{" "}
          <b>más ciudades</b>.
        </span>
      </div>
    </>
  );
}
