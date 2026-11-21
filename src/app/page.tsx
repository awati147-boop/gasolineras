import Link from "next/link";
import { supabasePublico } from "@/lib/supabase";
import styles from "./page.module.css";

const CARBURANTES = [
  { id: "Gasolina 95 E5", nombre: "Gasolina 95" },
  { id: "Gasolina 98 E5", nombre: "Gasolina 98" },
  { id: "Gasoleo A", nombre: "Diésel" },
  { id: "Gasoleo Premium", nombre: "Diésel Premium" },
  { id: "Gases licuados del petróleo", nombre: "GLP" },
];

type Fila = {
  precio: number;
  gasolineras: { id: number; rotulo: string; direccion: string; localidad: string; horario: string } | null;
};

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export default async function Inicio({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const carburante = CARBURANTES.find((x) => x.id === c) ?? CARBURANTES[0];
  const db = supabasePublico();

  const [{ data: filas, error }, { data: ultima }] = await Promise.all([
    db
      .from("precios")
      .select("precio, gasolineras(id, rotulo, direccion, localidad, horario)")
      .eq("carburante", carburante.id)
      .order("precio", { ascending: true })
      .limit(20)
      .returns<Fila[]>(),
    db.from("importaciones").select("fecha_api").order("fecha_api", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <main className={styles.main}>
      <h1 className={styles.titulo}>Gasolineras más baratas</h1>
      <p className={styles.fecha}>
        {ultima ? `Datos del ${formatoFecha.format(new Date(ultima.fecha_api))}` : "Sin datos todavía"}
      </p>

      <nav className={styles.chips} aria-label="Carburante">
        {CARBURANTES.map((x) => (
          <Link
            key={x.id}
            href={`/?c=${encodeURIComponent(x.id)}`}
            className={x.id === carburante.id ? styles.chipActivo : styles.chip}
          >
            {x.nombre}
          </Link>
        ))}
      </nav>

      {error && <p className={styles.error}>No se han podido cargar los precios. Inténtalo más tarde.</p>}

      <ol className={styles.lista}>
        {filas?.map((f, i) =>
          f.gasolineras ? (
            <li key={f.gasolineras.id} className={styles.item}>
              <span className={styles.pos}>{i + 1}</span>
              <div className={styles.info}>
                <strong>{f.gasolineras.rotulo}</strong>
                <span>{f.gasolineras.direccion}</span>
                <span className={styles.sub}>
                  {f.gasolineras.localidad} · {f.gasolineras.horario}
                </span>
              </div>
              <span className={styles.precio}>{Number(f.precio).toFixed(3).replace(".", ",")} €</span>
            </li>
          ) : null,
        )}
      </ol>
      {filas?.length === 0 && <p>No hay precios para este carburante.</p>}
    </main>
  );
}
