// Tarifas ORIENTATIVAS de la zona azul / regulada por ciudad, sacadas a mano de fuentes oficiales
// (ordenanza fiscal, boletín oficial o web municipal del servicio). Se muestran siempre como «Precio orientativo»:
// cambian con cada ordenanza, dependen a veces de la etiqueta ambiental y la señal de la calle manda.
// Para añadir una ciudad: copiar una entrada, poner su rectángulo aproximado, la fuente y la fecha de consulta.
// Revisar cada enero (las ordenanzas fiscales suelen cambiar con el año).

/** Tipos de tramo de la tabla zonas_reguladas a los que se aplica una tarifa */
export type TipoZona = "rotacion" | "mixta" | "residentes" | "larga" | "libre";

export type TarifaTipo = {
  nombre: string;
  color: string;
  precio: string;
  maximo?: string;
  /** Tipos de tramo (zonas_reguladas.tipo) a los que corresponde, para la ficha de una calle */
  para?: TipoZona[];
};

export type TarifaCiudad = {
  ciudad: string;
  servicio: string;
  /** Rectángulo aproximado del casco urbano [oeste, sur, este, norte] (para los parquímetros) */
  zona: [number, number, number, number];
  tipos: TarifaTipo[];
  notas?: string;
  fuente: string;
  fuenteNombre: string;
  fecha: string; // AAAA-MM-DD en que se consultó la fuente
};

const AZUL = "#2563eb", AZUL_CLARO = "#0ea5e9", VERDE = "#15803d", NARANJA = "#ea580c", ROJO = "#dc2626";

export const TARIFAS_ZONA_AZUL: TarifaCiudad[] = [
  {
    ciudad: "Alicante",
    servicio: "ORA",
    zona: [-0.62, 38.28, -0.38, 38.45],
    tipos: [
      { nombre: "Zona azul", color: AZUL, precio: "0,30 € / 30 min", maximo: "Máx. 2 h (1,80 €) · L–V 9–14 y 16–20 · S 9–14", para: ["rotacion"] },
      { nombre: "Azul media estancia", color: AZUL_CLARO, precio: "0,15 € / 30 min", maximo: "Máx. 5 h (1,50 €) · L–S 9–14 y 16–20", para: ["larga"] },
      { nombre: "Zona naranja (visitantes)", color: NARANJA, precio: "0,70 € / 30 min", maximo: "Máx. 1 h (1,40 €) · Residentes: 0,30 €/día (sábados 0,15 €)", para: ["mixta"] },
    ],
    notas: "Domingos y festivos, gratis.",
    fuente: "https://www.oragruaalicante.es/ora/zona-azul/",
    fuenteNombre: "web oficial de la ORA de Alicante",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Madrid",
    servicio: "SER",
    zona: [-3.84, 40.31, -3.52, 40.56],
    tipos: [
      { nombre: "Plazas azules", color: AZUL, precio: "1,10 € 1 h · 2,75 € 2 h", maximo: "Máx. 4 h (8,20 €)", para: ["rotacion"] },
      { nombre: "Plazas verdes (visitantes)", color: VERDE, precio: "2,05 € 1 h", maximo: "Máx. 2 h (4,10 €)", para: ["mixta", "residentes"] },
      { nombre: "Alta rotación", color: ROJO, precio: "2,05 € / 45 min", maximo: "Máx. 45 min" },
    ],
    notas: "Tarifa base: con etiqueta ECO −75 %, C −10 %, B +20 %. Puede subir en episodios de contaminación.",
    fuente: "https://transparencia.madrid.es/FWProjects/transparencia/InformacionJuridica/HuellaNormativa/Fiscales/2022/SER/Ficheros/TextoInformacionPublica.pdf",
    fuenteNombre: "Ordenanza fiscal del SER, Ayuntamiento de Madrid",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Barcelona",
    servicio: "Àrea (BSM)",
    zona: [2.07, 41.34, 2.23, 41.47],
    tipos: [
      { nombre: "Àrea Blava (azul)", color: AZUL, precio: "2,25–3,75 € / h", maximo: "Según zona y etiqueta ambiental", para: ["rotacion"] },
      { nombre: "Àrea Verda (no residentes)", color: VERDE, precio: "2,75–4,25 € / h", maximo: "Según zona y etiqueta ambiental", para: ["mixta"] },
      { nombre: "Residentes", color: VERDE, precio: "0,20 € / día", para: ["residentes"] },
    ],
    notas: "Con etiqueta Eco, 2,25–2,50 €/h en azul; cero emisiones, 1,15–1,25 €/h. En episodio de contaminación, +2 €/h.",
    fuente: "https://ajuntament.barcelona.cat/hisenda/sites/default/files/normativa/2025-05/3.12-tasas-estacionamiento-regulado-vehculos.pdf",
    fuenteNombre: "Ordenanza fiscal 3.12, Ayuntamiento de Barcelona",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Valencia",
    servicio: "ORA",
    zona: [-0.43, 39.42, -0.31, 39.51],
    tipos: [
      { nombre: "Zona azul centro y ensanche", color: AZUL, precio: "1,00 € 1 h", maximo: "Máx. 2 h (1,70 €)", para: ["rotacion"] },
      { nombre: "Zona azul resto de la ciudad", color: AZUL_CLARO, precio: "0,80 € 1 h", maximo: "Máx. 2 h (1,50 €)", para: ["rotacion"] },
      { nombre: "Zona naranja (no residentes)", color: NARANJA, precio: "2,10 € 1 h", maximo: "Máx. 2 h (3,30 €)", para: ["mixta"] },
    ],
    notas: "Centro: Ciutat Vella, L'Eixample y Extramurs.",
    fuente: "https://sede.valencia.es/sede/descarga/doc/DOCUMENT_1_ORD0043_C",
    fuenteNombre: "Ordenanza fiscal de la tasa por estacionamiento, Ayuntamiento de València",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Sevilla",
    servicio: "Zona azul",
    zona: [-6.03, 37.33, -5.91, 37.43],
    tipos: [
      { nombre: "Muy alta rotación", color: ROJO, precio: "1,25 € 1 h", maximo: "Máx. 1 h" },
      { nombre: "Alta rotación", color: AZUL, precio: "0,75 € 1 h", maximo: "Máx. 2 h (1,70 €)" },
      { nombre: "Media / baja rotación", color: AZUL_CLARO, precio: "0,65 € 1 h", maximo: "Máx. 3 h (2,00 €)" },
    ],
    fuente: "https://sevilla.org/servicios/agencia-tributaria-de-sevilla/ordenanzas-fiscales/2023/tasa_estacionamiento_de_vehxculosxzona_azul-aussax.pdf",
    fuenteNombre: "Ordenanza fiscal de estacionamiento regulado, Ayuntamiento de Sevilla (texto de 2023)",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Zaragoza",
    servicio: "ESRO / ESRE",
    zona: [-0.98, 41.6, -0.82, 41.7],
    tipos: [
      { nombre: "Zona azul (ESRO)", color: AZUL, precio: "0,70 € 1 h · 2,15 € 2 h" },
      { nombre: "Zona naranja (visitantes)", color: NARANJA, precio: "1,15 € 1 h", maximo: "Máx. 1 h · Residentes: 0,70 €/día" },
    ],
    fuente: "https://www.zaragoza.es/contenidos/normativa/ordenanzas-fiscales/2027/Propuesta_46402_2026_OF25_11_Estacionamiento_Regulado.pdf",
    fuenteNombre: "Ordenanza fiscal 25.11, Ayuntamiento de Zaragoza (texto vigente citado en 2026)",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Málaga",
    servicio: "SARE",
    zona: [-4.55, 36.68, -4.36, 36.76],
    tipos: [
      { nombre: "Zona azul", color: AZUL, precio: "1,00 € 1 h (mín. 0,50 € / 30 min)", maximo: "Máx. 2 h 30 min (2,50 €) · Residentes: 0,20 €/día" },
    ],
    fuente: "https://www.malaga.eu/visorcontenido/NRMDocumentDisplayer/795/DocumentoNormativa795",
    fuenteNombre: "Ordenanza fiscal del SARE, BOP de Málaga del 31/12/2025",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Murcia",
    servicio: "S.E.R.",
    zona: [-1.18, 37.95, -1.09, 38.02],
    tipos: [
      { nombre: "Zona azul centro (sector A)", color: AZUL, precio: "1,15 € 1 h", maximo: "Máx. 1 h 30 min (1,90 €)" },
      { nombre: "Zona azul sector B", color: AZUL, precio: "0,70 € 1 h", maximo: "Máx. 2 h 30 min (2,70 €)" },
      { nombre: "Zona azul sector C", color: AZUL_CLARO, precio: "0,40 € 1 h", maximo: "Máx. 5 h (3,00 €)" },
      { nombre: "Zona naranja centro (visitantes)", color: NARANJA, precio: "1,40 € 1 h", maximo: "Máx. 1 h 30 min (2,30 €)" },
    ],
    notas: "Precios con IVA.",
    fuente: "https://www.borm.es/services/anuncio/ano/2025/numero/2828/pdf",
    fuenteNombre: "Ordenanza del S.E.R., BORM del 16/06/2025",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Bilbao",
    servicio: "OTA",
    zona: [-2.99, 43.23, -2.88, 43.29],
    tipos: [
      { nombre: "Zona azul", color: AZUL, precio: "1,30 € 1 h · 3,35 € 2 h", maximo: "Máx. 3 h (6,35 €)" },
      { nombre: "Zona verde", color: VERDE, precio: "1,30 € 1 h · 3,35 € 2 h", maximo: "Máx. 5 h (13,60 €)" },
    ],
    fuente: "https://www.bilbao.eus/cs/Satellite?c=Page&cid=1279229423436&language=es&pageid=1279229423436&pagename=Bilbaonet%2FPage%2FBIO_contenidoFinal",
    fuenteNombre: "web del Ayuntamiento de Bilbao (tarifas OTA 2026)",
    fecha: "2026-11-26",
  },
  {
    ciudad: "Valladolid",
    servicio: "ORA",
    zona: [-4.79, 41.6, -4.68, 41.69],
    tipos: [
      { nombre: "Zona azul", color: AZUL, precio: "0,70 € 1 h", maximo: "Máx. 2 h (2,35 €)" },
      { nombre: "Zona naranja (alta rotación)", color: NARANJA, precio: "1,40 € 1 h", maximo: "Máx. 1 h" },
    ],
    fuente: "https://www.valladolid.es/en/ayuntamiento/ordenanzas-fiscales/ordenanzas-fiscales-2019/ordenanza-fiscal-tasas-aprovechamientos-privativos-utilizac.files/514134-O.%20F.%20REG.%20DE%20LAS%20TASAS%20POR%20UTILIZACIONES%20PRIVATIVAS%20Y%20APROVECHAMIENTOS%20ESPECIALES%20DEL%20DOM.%20P..pdf",
    fuenteNombre: "Ordenanza fiscal de Valladolid (texto de 2019)",
    fecha: "2026-11-26",
  },
];

/** Tarifa de la ciudad cuyo rectángulo contiene el punto (para un parquímetro) */
export const tarifaCiudadEn = (lon: number, lat: number) =>
  TARIFAS_ZONA_AZUL.find(({ zona: [o, s, e, n] }) => lon >= o && lon <= e && lat >= s && lat <= n) ?? null;

/** Tarifa por nombre de ciudad (para un tramo de zonas_reguladas) */
export const tarifaCiudad = (ciudad: string) => TARIFAS_ZONA_AZUL.find((t) => t.ciudad === ciudad) ?? null;

/** "26 nov 2026" */
export const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
