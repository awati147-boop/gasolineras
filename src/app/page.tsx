import { Suspense } from "react";
import { connection } from "next/server";
import { supabasePublico } from "@/lib/supabase";
import styles from "./page.module.css";
import Explorador from "./Explorador";

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** Fecha del último dato guardado (si la API del Ministerio falla, seguimos mostrando este). Se lee en cada visita. */
async function FechaDatos() {
  await connection();
  const { data: ultima } = await supabasePublico()
    .from("importaciones")
    .select("fecha_api")
    .order("fecha_api", { ascending: false })
    .limit(1)
    .maybeSingle();
  return <>{ultima ? `Precios oficiales · ${formatoFecha.format(new Date(ultima.fecha_api))}` : "Sin datos todavía"}</>;
}

export default function Inicio() {
  return (
    <main className={styles.main}>
      <h1 className={styles.titulo}>Llena el depósito por menos</h1>
      <p className={styles.fecha}>
        <Suspense fallback="Cargando precios…">
          <FechaDatos />
        </Suspense>
      </p>
      <Explorador />
    </main>
  );
}
