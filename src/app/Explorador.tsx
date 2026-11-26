"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapaML, GeoJSONSource, MapLayerMouseEvent, GeolocateControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./page.module.css";
import { distintivo } from "@/lib/marcas";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { nombrePropio } from "@/lib/texto";
import { IconoBuscar, IconoPin, IconoSurtidor, IconoUbicacion } from "./Iconos";
import { MAX_FAVORITAS, alternarFavorita, esFavorita } from "@/lib/favoritas";
import MisGasolineras from "./MisGasolineras";

const CARBURANTES = [
  { id: "Gasolina 95 E5", nombre: "Gasolina 95" },
  { id: "Gasolina 98 E5", nombre: "Gasolina 98" },
  { id: "Gasoleo A", nombre: "Diésel" },
  { id: "Gasoleo Premium", nombre: "Diésel Premium" },
  { id: "Gases licuados del petróleo", nombre: "GLP" },
];

type Gasolinera = {
  id: number; rotulo: string; direccion: string; localidad: string; horario: string;
  lat: number; lon: number; precio: number;
};

const LITROS = 50;
const ZONA_INICIAL: [number, number, number, number] = [-1.1, 37.85, 0.25, 38.95]; // provincia de Alicante
const COLORES = { verde: "#16a34a", amarillo: "#d98e04", rojo: "#d23b2f" };

const euros = (p: number, dec = 3) => p.toFixed(dec).replace(".", ",");
const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Distancia en línea recta (fórmula del haversine) */
function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const formatoKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`);

/** Rectángulo redondeado estirable que sirve de fondo a la etiqueta de precio */
function fondoEtiqueta(color: string) {
  const t = 24, r = 6;
  const c = document.createElement("canvas");
  c.width = c.height = t;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, t - 2, t - 2, r);
  ctx.fill();
  ctx.stroke();
  return ctx.getImageData(0, 0, t, t);
}

export default function Explorador() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const peticion = useRef<AbortController | null>(null);
  const [carburante, setCarburante] = useState(CARBURANTES[0].id);
  const carburanteRef = useRef(carburante);
  const [lista, setLista] = useState<Gasolinera[]>([]);
  const [recortado, setRecortado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [avisoBusqueda, setAvisoBusqueda] = useState("");
  // Ubicación del usuario: solo vive en memoria del navegador, nunca se envía ni se guarda
  const [yo, setYo] = useState<{ lat: number; lon: number } | null>(null);
  const [orden, setOrden] = useState<"precio" | "distancia">("precio");
  const geolocalizar = useRef<GeolocateControl | null>(null);

  /** Carga las gasolineras del rectángulo visible y las pinta */
  const cargar = useCallback(async () => {
    const m = mapaRef.current;
    if (!m) return;
    const b = m.getBounds();
    peticion.current?.abort();
    const ctrl = new AbortController();
    peticion.current = ctrl;
    setCargando(true);
    try {
      const url =
        `/api/gasolineras?c=${encodeURIComponent(carburanteRef.current)}` +
        `&w=${b.getWest()}&s=${b.getSouth()}&e=${b.getEast()}&n=${b.getNorth()}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { gasolineras: Gasolinera[]; recortado: boolean };
      const gs = json.gasolineras;

      // Colores relativos a lo que se ve: el tercio más barato verde, el más caro rojo
      const p1 = gs[Math.floor(gs.length / 3)]?.precio ?? 0;
      const p2 = gs[Math.floor((gs.length * 2) / 3)]?.precio ?? 0;
      const nivel = (p: number) => (p <= p1 ? "verde" : p <= p2 ? "amarillo" : "rojo");

      (m.getSource("gasolineras") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: gs.map((g) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [g.lon, g.lat] },
          properties: { ...g, etiqueta: euros(g.precio), nivel: nivel(g.precio) },
        })),
      });
      setLista(gs);
      setRecortado(json.recortado);
      setError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No se han podido cargar los precios. Inténtalo más tarde.");
    } finally {
      if (peticion.current === ctrl) setCargando(false);
    }
  }, []);

  // Crear el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    let espera: ReturnType<typeof setTimeout>;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !contenedor.current) return;
      maplibregl.setWorkerUrl(URL_WORKER_MAPA);

      const m = new maplibregl.Map({ container: contenedor.current, style: ESTILO_MAPA, bounds: ZONA_INICIAL });
      mapaRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.FullscreenControl(), "top-right");
      // La ubicación solo se usa en el navegador para mover el mapa; no se envía ni se guarda.
      const geo = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        fitBoundsOptions: { maxZoom: 13 },
      });
      geo.on("geolocate", (pos) => {
        setYo({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setOrden("distancia");
      });
      geo.on("error", () => setAvisoBusqueda("No se ha podido obtener tu ubicación. Revisa los permisos del navegador."));
      geolocalizar.current = geo;
      m.addControl(geo, "top-right");

      m.on("load", () => {
        for (const [nombre, color] of Object.entries(COLORES)) {
          m.addImage(`eti-${nombre}`, fondoEtiqueta(color), {
            stretchX: [[7, 17]], stretchY: [[7, 17]], content: [5, 5, 19, 19],
          });
        }
        m.addSource("gasolineras", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

        // Punto pequeño para todas
        m.addLayer({
          id: "puntos",
          type: "circle",
          source: "gasolineras",
          paint: {
            "circle-radius": 4,
            "circle-color": ["match", ["get", "nivel"], "verde", COLORES.verde, "amarillo", COLORES.amarillo, COLORES.rojo],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });
        // Etiqueta con el precio; si se solapan, se ven primero las más baratas
        m.addLayer({
          id: "etiquetas",
          type: "symbol",
          source: "gasolineras",
          layout: {
            "text-field": ["get", "etiqueta"],
            "text-font": ["Open Sans Semibold"],
            "text-size": 13,
            "icon-image": ["concat", "eti-", ["get", "nivel"]],
            "icon-text-fit": "both",
            "icon-text-fit-padding": [1, 4, 1, 4],
            "text-anchor": "bottom",
            "text-offset": [0, -0.7],
            "icon-anchor": "bottom",
            "symbol-sort-key": ["get", "precio"],
            "text-allow-overlap": false,
            "icon-allow-overlap": false,
            "text-padding": 1,
          },
          paint: { "text-color": "#fff" },
        });

        const abrirFicha = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const g = f.properties as unknown as Gasolinera;
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const d = distintivo(g.rotulo);
          const nombreCarb = CARBURANTES.find((x) => x.id === carburanteRef.current)?.nombre ?? "";
          const id = Number(g.id);
          const textoFav = () => (esFavorita(id) ? "★ Guardada" : "☆ Guardar");
          const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px", className: "ficha" })
            .setLngLat([lon, lat])
            .setHTML(
              `<div class="ficha-cab">
                 <span class="marca" style="background:${d.color}">${escapar(d.texto)}</span>
                 <div><strong>${escapar(g.rotulo)}</strong><small>${escapar(nombrePropio(g.localidad))}</small></div>
               </div>
               <div class="ficha-precio"><b>${euros(Number(g.precio))} €</b><span>/l · ${escapar(nombreCarb)}</span></div>
               <p>📍 ${escapar(nombrePropio(g.direccion))}</p>
               <p>🕒 ${escapar(g.horario)}</p>
               <div class="ficha-botones">
                 <button type="button" class="ficha-fav" aria-pressed="${esFavorita(id)}">${textoFav()}</button>
                 <a class="ficha-ir" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" rel="noopener">Cómo llegar</a>
               </div>`,
            )
            .addTo(m);
          // ☆ Guardar: en "Mis gasolineras" (solo en este móvil)
          const boton = popup.getElement().querySelector<HTMLButtonElement>(".ficha-fav");
          boton?.addEventListener("click", () => {
            const guardada = alternarFavorita({ id, rotulo: g.rotulo, localidad: g.localidad });
            boton.textContent = !guardada && !esFavorita(id) && boton.getAttribute("aria-pressed") === "false"
              ? `Máximo ${MAX_FAVORITAS} guardadas`
              : textoFav();
            boton.setAttribute("aria-pressed", String(esFavorita(id)));
          });
        };
        for (const capa of ["etiquetas", "puntos"]) {
          m.on("click", capa, abrirFicha);
          m.on("mouseenter", capa, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", capa, () => (m.getCanvas().style.cursor = ""));
        }

        cargar();
      });

      // Al mover el mapa, recargar (esperando a que pare 300 ms)
      m.on("moveend", () => {
        clearTimeout(espera);
        espera = setTimeout(cargar, 300);
      });
    })();

    return () => {
      cancelado = true;
      clearTimeout(espera);
      peticion.current?.abort();
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [cargar]);

  // Cambiar de carburante
  useEffect(() => {
    carburanteRef.current = carburante;
    if (mapaRef.current?.getSource("gasolineras")) cargar();
  }, [carburante, cargar]);

  /** El buscador solo mueve el mapa; los datos se recargan al terminar el movimiento */
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = texto.trim();
    if (!q) return;
    setAvisoBusqueda("");
    try {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
      const { zona } = (await res.json()) as { zona: [number, number, number, number] | null };
      if (!zona) return setAvisoBusqueda(`No encontramos gasolineras en «${q}».`);
      mapaRef.current?.fitBounds(zona, { padding: 40, maxZoom: 13 });
    } catch {
      setAvisoBusqueda("No se ha podido buscar. Inténtalo más tarde.");
    }
  }

  const conDistancia = lista.map((g) => ({ ...g, km: yo ? distanciaKm(yo, g) : null }));
  const ordenada =
    orden === "distancia" && yo ? [...conDistancia].sort((a, b) => a.km! - b.km!) : conDistancia;

  const masBarata = lista[0];
  const masCara = lista[lista.length - 1];
  const ahorro = masBarata && masCara && !recortado ? (masCara.precio - masBarata.precio) * LITROS : 0;

  // Mismos tercios de precio que el mapa: verde / ámbar / rojo
  const corte1 = lista[Math.floor(lista.length / 3)]?.precio ?? 0;
  const corte2 = lista[Math.floor((lista.length * 2) / 3)]?.precio ?? 0;
  const tono = (p: number) => (p <= corte1 ? styles.verde : p <= corte2 ? styles.amarillo : styles.rojo);
  const medallas = [styles.oro, styles.plata, styles.bronce];

  return (
    <>
      <form className={styles.buscador} onSubmit={buscar} role="search">
        <label className={styles.cajaIcono}>
          <IconoBuscar tam={20} />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ciudad o código postal"
            aria-label="Ciudad o código postal"
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
      {avisoBusqueda && <p className={styles.error}>{avisoBusqueda}</p>}

      <nav className={styles.chips} aria-label="Carburante">
        {CARBURANTES.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setCarburante(x.id)}
            className={x.id === carburante ? styles.chipActivo : styles.chip}
            aria-pressed={x.id === carburante}
          >
            {x.nombre}
          </button>
        ))}
      </nav>

      <MisGasolineras
        carburante={carburante}
        nombreCarburante={CARBURANTES.find((x) => x.id === carburante)?.nombre ?? ""}
        onVer={(p) => {
          mapaRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
          contenedor.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />

      {error && <p className={styles.error}>{error}</p>}

      {masBarata && ahorro > 0 && (
        <section className={styles.hero} aria-label="Ahorro en esta zona">
          <div>
            <span className={styles.heroEtiqueta}>Ahorro en esta zona</span>
            <strong className={styles.heroCifra}>{euros(ahorro, 2)} €</strong>
            <span className={styles.heroTexto}>
              llenando {LITROS} L en <b>{masBarata.rotulo}</b>, {nombrePropio(masBarata.localidad)} frente a la más cara
            </span>
          </div>
          <div className={styles.heroPrecio}>
            <b>{euros(masBarata.precio)}</b>
            <small>€/litro</small>
          </div>
        </section>
      )}

      <div className={styles.rejilla}>
        <div ref={contenedor} className={styles.mapa} />

        <section className={styles.panel}>
          <h2 className={styles.subtitulo}>
            {cargando && lista.length === 0
              ? "Buscando gasolineras…"
              : `${lista.length}${recortado ? "+" : ""} gasolineras en el mapa`}
          </h2>
          {recortado && <p className={styles.zona}>Hay muchas en esta zona: acércate para verlas todas.</p>}
          {yo && (
            <div className={styles.orden} role="group" aria-label="Ordenar por">
              Ordenar por
              {(["precio", "distancia"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrden(o)}
                  className={orden === o ? styles.chipActivo : styles.chip}
                  aria-pressed={orden === o}
                >
                  {o === "precio" ? "Precio" : "Distancia"}
                </button>
              ))}
            </div>
          )}

          {cargando && lista.length === 0 ? (
            <div className={styles.lista} aria-hidden>
              {Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.esqueleto} />)}
            </div>
          ) : (
            <ol className={styles.lista}>
              {ordenada.slice(0, 20).map((g, i) => (
                <li
                  key={g.id}
                  className={styles.item}
                  onClick={() => mapaRef.current?.flyTo({ center: [g.lon, g.lat], zoom: 15 })}
                >
                  {orden === "precio" && i < 3 ? (
                    <span className={`${styles.medalla} ${medallas[i]}`} aria-label={`Puesto ${i + 1}`}>{i + 1}</span>
                  ) : (
                    <span className={styles.pos}>{i + 1}</span>
                  )}
                  <span className="marca" style={{ background: distintivo(g.rotulo).color }}>
                    {distintivo(g.rotulo).texto}
                  </span>
                  <div className={styles.info}>
                    <strong>{g.rotulo}</strong>
                    <span className={styles.sub}>{nombrePropio(g.direccion)}</span>
                    <span className={styles.sub}>{nombrePropio(g.localidad)} · {g.horario}</span>
                  </div>
                  <span className={styles.derecha}>
                    <span className={`${styles.precio} ${tono(g.precio)}`}>{euros(g.precio)} €</span>
                    {g.km !== null && (
                      <span className={styles.distancia}><IconoPin tam={13} />{formatoKm(g.km)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {!cargando && lista.length === 0 && !error && (
            <div className={styles.vacio}>
              <IconoSurtidor tam={34} />
              <p>No hay gasolineras con este carburante en la zona visible.<br />Prueba a alejar el mapa o a cambiar de carburante.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
