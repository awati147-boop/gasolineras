"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Map as MapaML, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_MAPA, URL_WORKER_MAPA } from "@/lib/estiloMapa";
import { supabaseNavegador, type ConfigSupabase } from "@/lib/supabaseNavegador";
import { ACCESOS, aproximar, reducirFoto, urlFoto, type Garaje } from "@/lib/garajes";
import styles from "../../page.module.css";
import { IconoUbicacion } from "../../Iconos";

type Punto = { lat: number; lon: number };
// Foto nueva (aún en el móvil) o ya subida (ruta en el almacenamiento)
type FotoLocal = { blob: Blob; vista: string; ruta?: undefined } | { ruta: string; vista: string; blob?: undefined };
const MAX_FOTOS = 6;
const CENTRO_INICIAL: Punto = { lat: 38.3452, lon: -0.481 }; // Alicante

/** Convierte "1,50" o "1.5" en número; vacío -> null */
const numero = (v: string) => {
  const n = Number(v.replace(",", ".").trim());
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export default function PublicarGaraje({ editarId, ...config }: ConfigSupabase & { editarId?: string }) {
  const db = supabaseNavegador(config); // mismo cliente siempre (no cambia entre renders)
  const router = useRouter();
  const [comprobando, setComprobando] = useState(true);
  const [punto, setPunto] = useState<Punto>(CENTRO_INICIAL);
  const [puntoElegido, setPuntoElegido] = useState(false);
  const [puntoMovido, setPuntoMovido] = useState(false);
  const [fotosOriginales, setFotosOriginales] = useState<string[]>([]);
  const [aproxOriginal, setAproxOriginal] = useState<{ lat_aprox: number; lon_aprox: number } | null>(null);
  const [f, setF] = useState({
    titulo: "", tipo: "plaza" as "plaza" | "cerrado", descripcion: "", direccion: "", indicaciones: "",
    hora: "", dia: "", mes: "", disponibilidad: "", altura: "", acceso: "mando", enchufe: false,
  });
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const cambiar = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [campo]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  // Solo usuarios con cuenta
  useEffect(() => {
    (async () => {
      const { data } = await db.auth.getUser();
      if (!data.user || data.user.is_anonymous) return router.replace("/cuenta");
      if (editarId) {
        const { data: mios } = await db.rpc("mis_garajes");
        const g = ((mios as Garaje[] | null) ?? []).find((x) => x.id === editarId);
        if (!g) return router.replace("/cuenta");
        const { data: priv } = await db.from("garajes_privado").select("lat, lon, direccion, indicaciones").eq("garaje_id", editarId).maybeSingle();
        const texto = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
        setF({
          titulo: g.titulo, tipo: g.tipo, descripcion: g.descripcion ?? "",
          direccion: priv?.direccion ?? "", indicaciones: priv?.indicaciones ?? "",
          hora: texto(g.precio_hora), dia: texto(g.precio_dia), mes: texto(g.precio_mes),
          disponibilidad: g.disponibilidad ?? "", altura: texto(g.altura_max), acceso: g.acceso ?? "mando", enchufe: g.enchufe,
        });
        const rutas = g.fotos?.length ? g.fotos : g.foto ? [g.foto] : [];
        setFotos(rutas.map((ruta) => ({ ruta, vista: urlFoto(config.url, ruta) })));
        setFotosOriginales(rutas);
        setAproxOriginal({ lat_aprox: g.lat_aprox, lon_aprox: g.lon_aprox });
        setPunto(priv ? { lat: priv.lat, lon: priv.lon } : { lat: g.lat_aprox, lon: g.lon_aprox });
        setPuntoElegido(true);
      }
      setComprobando(false);
    })();
  }, [db, router, editarId, config.url]);

  async function elegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir las mismas
    if (!archivos.length) return;
    setError("");
    const huecos = MAX_FOTOS - fotos.length;
    if (archivos.length > huecos) setError(`Puedes subir como máximo ${MAX_FOTOS} fotos.`);
    const nuevas: FotoLocal[] = [];
    for (const archivo of archivos.slice(0, Math.max(0, huecos))) {
      try {
        const blob = await reducirFoto(archivo);
        nuevas.push({ blob, vista: URL.createObjectURL(blob) });
      } catch {
        setError("Alguna foto no se ha podido leer. Prueba con otra.");
      }
    }
    setFotos((x) => [...x, ...nuevas]);
  }

  function quitarFoto(i: number) {
    setFotos((x) => {
      if (x[i].blob) URL.revokeObjectURL(x[i].vista);
      return x.filter((_, j) => j !== i);
    });
  }

  function hacerPortada(i: number) {
    setFotos((x) => [x[i], ...x.filter((_, j) => j !== i)]);
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const precio_hora = numero(f.hora), precio_dia = numero(f.dia), precio_mes = numero(f.mes);
    if (!puntoElegido) return setError("Marca en el mapa dónde está tu garaje.");
    if (f.titulo.trim().length < 5) return setError("Pon un título de al menos 5 letras.");
    if (!precio_hora && !precio_dia && !precio_mes) return setError("Indica al menos un precio (por hora, día o mes).");

    setEnviando(true);
    try {
      const { data: u } = await db.auth.getUser();
      if (!u.user) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");

      // 1) Fotos en la carpeta del usuario, en orden (la primera es la portada). Solo se suben las nuevas.
      const rutas: string[] = [];
      const subidasAhora: string[] = [];
      for (const [i, foto] of fotos.entries()) {
        if (!foto.blob) {
          rutas.push(foto.ruta);
          continue;
        }
        const ruta = `${u.user.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await db.storage.from("garajes").upload(ruta, foto.blob, { contentType: "image/jpeg" });
        if (error) {
          if (subidasAhora.length) await db.storage.from("garajes").remove(subidasAhora); // no dejar fotos sueltas
          throw new Error(`No se ha podido subir la foto ${i + 1}.`);
        }
        rutas.push(ruta);
        subidasAhora.push(ruta);
      }

      const datos = {
        titulo: f.titulo.trim(),
        tipo: f.tipo,
        descripcion: f.descripcion.trim() || null,
        precio_hora, precio_dia, precio_mes,
        disponibilidad: f.disponibilidad.trim() || null,
        altura_max: numero(f.altura),
        acceso: f.acceso,
        enchufe: f.enchufe,
        foto: rutas[0] ?? null,
        fotos: rutas,
      };

      if (editarId) {
        // ----- Guardar cambios -----
        // Solo se recalcula la zona aproximada si se ha movido el marcador
        const aprox = puntoMovido || !aproxOriginal ? aproximar(punto.lat, punto.lon) : aproxOriginal;
        const { error: e1 } = await db.from("garajes").update({ ...datos, ...aprox }).eq("id", editarId);
        if (e1) throw new Error("No se han podido guardar los cambios. Revisa los datos.");
        const { error: e2 } = await db.from("garajes_privado").upsert({
          garaje_id: editarId, lat: punto.lat, lon: punto.lon,
          direccion: f.direccion.trim() || null, indicaciones: f.indicaciones.trim() || null,
        }, { onConflict: "garaje_id" });
        if (e2) throw new Error("Se ha guardado el anuncio, pero no la dirección.");
        const quitadas = fotosOriginales.filter((r) => !rutas.includes(r));
        if (quitadas.length) await db.storage.from("garajes").remove(quitadas);
        return router.push("/cuenta?guardado=1");
      }

      // 2) Anuncio público (ubicación aproximada)
      const { data: g, error: e1 } = await db
        .from("garajes")
        .insert({ ...datos, ...aproximar(punto.lat, punto.lon) })
        .select("id")
        .single();
      if (e1) throw new Error(/máximo/.test(e1.message) ? e1.message : "No se ha podido publicar. Revisa los datos.");

      // 3) Datos privados (ubicación exacta, dirección)
      const { error: e2 } = await db.from("garajes_privado").insert({
        garaje_id: g.id,
        lat: punto.lat,
        lon: punto.lon,
        direccion: f.direccion.trim() || null,
        indicaciones: f.indicaciones.trim() || null,
      });
      if (e2) throw new Error("El anuncio se ha creado, pero no se ha guardado la dirección. Edítalo desde Mi cuenta.");

      router.push("/cuenta?publicado=1");
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  if (comprobando) return <div className={styles.esqueleto} style={{ height: 300 }} />;

  return (
    <form onSubmit={publicar} className={styles.formGaraje} noValidate>
      {/* ---------- 1. Ubicación ---------- */}
      <fieldset className={styles.seccion}>
        <legend><span>1</span> ¿Dónde está?</legend>
        <p className={styles.zona}>Mueve el mapa o arrastra el marcador hasta la entrada de tu garaje.</p>
        <MapaElegir punto={punto} onCambio={(p) => { setPunto(p); setPuntoElegido(true); setPuntoMovido(true); }} />
        <label className={styles.campo}>
          Dirección <small>(privada: solo la verá quien reserve)</small>
          <input value={f.direccion} onChange={cambiar("direccion")} maxLength={200} placeholder="C/ Mayor 12, Alicante" />
        </label>
        <label className={styles.campo}>
          Indicaciones <small>(privadas)</small>
          <input value={f.indicaciones} onChange={cambiar("indicaciones")} maxLength={400} placeholder="Plaza 23, segundo sótano" />
        </label>
        <p className={styles.notaPrivacidad}>🔒 En el mapa público solo mostramos una zona aproximada de unos 100 m.</p>
      </fieldset>

      {/* ---------- 2. Cómo es ---------- */}
      <fieldset className={styles.seccion}>
        <legend><span>2</span> ¿Cómo es?</legend>
        <label className={styles.campo}>
          Título del anuncio
          <input value={f.titulo} onChange={cambiar("titulo")} maxLength={80} required placeholder="Plaza amplia junto a la playa del Postiguet" />
        </label>
        <div className={styles.opcionesTipo} role="radiogroup" aria-label="Tipo">
          {([["plaza", "🅿️", "Plaza en garaje", "Comunitario, con más coches"], ["cerrado", "🏠", "Garaje cerrado", "Box o cochera independiente"]] as const).map(
            ([valor, icono, titulo, sub]) => (
              <label key={valor} className={f.tipo === valor ? styles.opcionActiva : styles.opcion}>
                <input type="radio" name="tipo" value={valor} checked={f.tipo === valor} onChange={cambiar("tipo")} />
                <span className={styles.opcionIcono}>{icono}</span>
                <b>{titulo}</b>
                <small>{sub}</small>
              </label>
            ),
          )}
        </div>
        <div className={styles.fila2}>
          <label className={styles.campo}>
            Acceso
            <select value={f.acceso} onChange={cambiar("acceso")}>
              {Object.entries(ACCESOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label className={styles.campo}>
            Altura máx. (m)
            <input value={f.altura} onChange={cambiar("altura")} inputMode="decimal" placeholder="2,10" />
          </label>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={f.enchufe} onChange={cambiar("enchufe")} />
          ⚡ Tiene enchufe para cargar coche eléctrico
        </label>
        <label className={styles.campo}>
          Descripción <small>(opcional)</small>
          <textarea value={f.descripcion} onChange={cambiar("descripcion")} maxLength={600} rows={3}
            placeholder="Plaza amplia, fácil de maniobrar, apta para SUV. A 5 min andando del centro." />
        </label>
      </fieldset>

      {/* ---------- 3. Precio ---------- */}
      <fieldset className={styles.seccion}>
        <legend><span>3</span> Precio y horario</legend>
        <p className={styles.zona}>Rellena al menos uno. Referencia en Alicante: parkings públicos 1,50–2,50 €/h y 15–30 €/día.</p>
        <div className={styles.fila3}>
          {([["hora", "Por hora", "1,50"], ["dia", "Por día", "10"], ["mes", "Por mes", "80"]] as const).map(([c, t, ph]) => (
            <label key={c} className={styles.campo}>
              {t}
              <span className={styles.conEuro}>
                <input value={f[c]} onChange={cambiar(c)} inputMode="decimal" placeholder={ph} />
                <i>€</i>
              </span>
            </label>
          ))}
        </div>
        <label className={styles.campo}>
          ¿Cuándo está disponible?
          <input value={f.disponibilidad} onChange={cambiar("disponibilidad")} maxLength={200} placeholder="Laborables de 9 a 19 h · fines de semana todo el día" />
        </label>
      </fieldset>

      {/* ---------- 4. Fotos ---------- */}
      <fieldset className={styles.seccion}>
        <legend><span>4</span> Fotos <small className={styles.contadorFotos}>{fotos.length}/{MAX_FOTOS}</small></legend>
        <p className={styles.zona}>Enseña la entrada, la plaza y el acceso. La primera es la portada.</p>
        <div className={styles.rejillaFotos}>
          {fotos.map((foto, i) => (
            <figure key={foto.vista} className={styles.fotoMini}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.vista} alt={`Foto ${i + 1}`} />
              {i === 0 ? (
                <span className={styles.etiquetaPortada}>Portada</span>
              ) : (
                <button type="button" className={styles.botonPortada} onClick={() => hacerPortada(i)}>★ Portada</button>
              )}
              <button type="button" className={styles.quitarFoto} onClick={() => quitarFoto(i)} aria-label={`Quitar foto ${i + 1}`}>×</button>
            </figure>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className={styles.subirFoto}>
              <span>📷<b>{fotos.length ? "Añadir más" : "Añadir fotos"}</b><small>Puedes elegir varias a la vez</small></span>
              <input type="file" accept="image/*" multiple onChange={elegirFotos} />
            </label>
          )}
        </div>
      </fieldset>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.acciones}>
        <Link href="/cuenta" className={styles.botonSec}>Cancelar</Link>
        <button type="submit" className={styles.boton} disabled={enviando}>
          {enviando ? (editarId ? "Guardando…" : "Publicando…") : editarId ? "Guardar cambios" : "Publicar garaje"}
        </button>
      </div>
      <p className={styles.notaPrivacidad} style={{ textAlign: "center" }}>
        Al publicar aceptas las <Link href="/condiciones">condiciones de uso</Link>: la app solo pone en contacto a las partes y el acuerdo es entre vosotros.
      </p>
    </form>
  );
}

/** Mapa para elegir la ubicación: marcador arrastrable y botón "usar mi ubicación" */
function MapaElegir({ punto, onCambio }: { punto: Punto; onCambio: (p: Punto) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const marcador = useRef<Marker | null>(null);
  const alCambiar = useRef(onCambio);
  useEffect(() => {
    alCambiar.current = onCambio;
  });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !contenedor.current) return;
      maplibregl.setWorkerUrl(URL_WORKER_MAPA);
      const m = new maplibregl.Map({ container: contenedor.current, style: ESTILO_MAPA, center: [punto.lon, punto.lat], zoom: 14 });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const mk = new maplibregl.Marker({ color: "#0a7d3b", draggable: true, scale: 1.2 }).setLngLat([punto.lon, punto.lat]).addTo(m);
      const avisar = () => {
        const { lat, lng } = mk.getLngLat();
        alCambiar.current({ lat, lon: lng });
      };
      mk.on("dragend", avisar);
      m.on("click", (e) => { mk.setLngLat(e.lngLat); avisar(); }); // tocar el mapa también mueve el marcador
      mapa.current = m;
      marcador.current = mk;
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // el mapa se crea una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function miUbicacion() {
    // La ubicación solo se usa aquí para colocar el marcador; no se envía hasta que publicas
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        marcador.current?.setLngLat([p.lon, p.lat]);
        mapa.current?.flyTo({ center: [p.lon, p.lat], zoom: 18 });
        alCambiar.current(p);
      },
      () => alert("No se ha podido obtener tu ubicación. Coloca el marcador a mano."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className={styles.mapaMarco}>
      <div ref={contenedor} className={styles.mapaPequeno} />
      <button type="button" className={`${styles.boton} ${styles.botonMapa}`} onClick={miUbicacion}>
        <IconoUbicacion tam={18} /> Estoy en el garaje
      </button>
    </div>
  );
}
