// Tarifas de parkings sacadas A MANO de fuentes oficiales: web del operador o acuerdo municipal
// que aprueba la tarifa de una concesión (nunca de webs de reservas).
// Cada entrada lleva su fuente y la fecha en que se consultó; revisar cada pocos meses.
// `osm`: ids de la tabla `aparcamientos` (OpenStreetMap) a los que se aplica.
//
// Para añadir un parking: comprobar el precio en la web del operador (o el cartel de la entrada),
// buscar su id en el mapa (ficha → id de OSM) y añadir una entrada con la fecha de hoy.

export type TarifaParking = {
  osm: string[];
  nombre: string;
  operador: string;
  /** Tramos tal como los publica el operador: [duración, precio] */
  tramos: [string, string][];
  /** Precio de 1 hora y máximo de 24 h en euros (para las listas) */
  hora: number;
  dia: number | null;
  nota?: string;
  fuente: string;
  /** Texto del enlace a la fuente: "web oficial de Interparking", "acuerdo del Ayuntamiento de Alicante"… */
  fuenteNombre: string;
  /** Fecha en que se consultó la web (o en que se aprobó la tarifa oficial) */
  fecha: string; // AAAA-MM-DD
  tipoFecha: "consultada" | "aprobada";
};

export const TARIFAS_PARKINGS: TarifaParking[] = [
  {
    osm: ["osm:way/22905053"],
    nombre: "Parking Plaza del Puerto",
    operador: "Interparking",
    tramos: [["1 hora", "2,55 €"], ["5 horas", "12,75 €"], ["12 horas", "29,95 €"], ["24 horas", "29,95 €"]],
    hora: 2.55,
    dia: 29.95,
    nota: "Con la app del operador, un 10 % menos en estancias cortas.",
    fuente: "https://www.interparking.es/en/parkings/alicante/puerto-alicante",
    fuenteNombre: "web oficial de Interparking",
    fecha: "2026-11-26",
    tipoFecha: "consultada",
  },
  {
    osm: ["osm:way/33205944"],
    nombre: "Parking Puerto Alicante - Poniente",
    operador: "Interparking",
    tramos: [["1 hora", "1,85 €"], ["5 horas", "7,95 €"], ["12 horas", "7,95 €"], ["24 horas", "7,95 €"]],
    hora: 1.85,
    dia: 7.95,
    nota: "Con la app del operador, un 10 % menos.",
    fuente: "https://www.interparking.es/en/parkings/alicante/puertoalicante-poniente",
    fuenteNombre: "web oficial de Interparking",
    fecha: "2026-11-26",
    tipoFecha: "consultada",
  },
  {
    osm: ["osm:way/53275691"],
    nombre: "Parking Alfonso el Sabio",
    operador: "Parking Alfonso el Sabio, S.L. (concesión municipal)",
    tramos: [["Por minuto", "0,024 €"], ["1 hora", "1,45 €"], ["Máximo 24 horas", "14,51 €"], ["Abono mensual 24 h", "238,04 €"]],
    hora: 1.45,
    dia: 14.51,
    nota: "Tarifas máximas aprobadas por el Ayuntamiento, con IVA. Se cobra por minuto.",
    fuente: "https://w3.alicante.es/ayuntamiento/juntas-gobierno-local/descarga-documento.php?tipo=2&fecha=27%2F05%2F2025&sesion=1",
    fuenteNombre: "Junta de Gobierno del Ayuntamiento de Alicante (punto 15)",
    fecha: "2025-05-27",
    tipoFecha: "aprobada",
  },
];

const POR_ID = new Map(TARIFAS_PARKINGS.flatMap((t) => t.osm.map((id) => [id, t] as const)));
export const tarifaDe = (id: string) => POR_ID.get(id) ?? null;

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
/** "2,55 €/h · máx. 29,95 €/día" */
export const resumenTarifa = (t: TarifaParking) =>
  `${euros(t.hora)}/h` + (t.dia != null ? ` · máx. ${euros(t.dia)}/día` : "");

/** "26 nov 2026" */
export const fechaTarifa = (t: TarifaParking) =>
  new Date(`${t.fecha}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
