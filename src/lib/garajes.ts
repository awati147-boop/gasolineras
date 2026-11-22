// Utilidades compartidas de garajes (navegador)

export type Garaje = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: "plaza" | "cerrado";
  precio_hora: number | null;
  precio_dia: number | null;
  precio_mes: number | null;
  disponibilidad: string | null;
  altura_max: number | null;
  acceso: "mando" | "llave" | "codigo" | "libre" | null;
  enchufe: boolean;
  foto: string | null; // portada (= fotos[0])
  fotos: string[];
  lat_aprox: number;
  lon_aprox: number;
  activo: boolean;
  creado: string;
};

export const ACCESOS: Record<string, string> = {
  mando: "Mando a distancia",
  llave: "Llave",
  codigo: "Código / app",
  libre: "Acceso libre",
};

/** URL pública de una foto del bucket "garajes" */
export const urlFoto = (supabaseUrl: string, ruta: string) =>
  `${supabaseUrl}/storage/v1/object/public/garajes/${ruta}`;

const euro = (n: number) => `${Number(n).toFixed(2).replace(".", ",").replace(",00", "")} €`;

/** "1,50 €/h · 10 €/día" */
export function textoPrecio(g: Pick<Garaje, "precio_hora" | "precio_dia" | "precio_mes">) {
  return [
    g.precio_hora && `${euro(g.precio_hora)}/h`,
    g.precio_dia && `${euro(g.precio_dia)}/día`,
    g.precio_mes && `${euro(g.precio_mes)}/mes`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Ubicación aproximada para mostrar en público: desplaza el punto al azar entre 40 y 110 m.
 * Así no se puede deducir el portal exacto del dueño.
 */
export function aproximar(lat: number, lon: number) {
  const distancia = 40 + Math.random() * 70; // metros
  const angulo = Math.random() * 2 * Math.PI;
  const dLat = (distancia * Math.cos(angulo)) / 111_320;
  const dLon = (distancia * Math.sin(angulo)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat_aprox: lat + dLat, lon_aprox: lon + dLon };
}

/** Reduce una foto en el navegador (máx. 1280 px, JPEG) para que ocupe poco al subirla */
export async function reducirFoto(archivo: File, ladoMax = 1280, calidad = 0.8): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, ladoMax / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  for (const q of [calidad, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size < 1_000_000) return blob;
  }
  throw new Error("La foto es demasiado grande. Prueba con otra.");
}
