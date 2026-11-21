import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../page.module.css";
import BuscarPlaza from "./BuscarPlaza";

export const metadata: Metadata = { title: "Aparcar" };

export default async function Aparcar() {
  await connection(); // leer las variables en cada petición (no al compilar)
  return (
    <main className={styles.main}>
      <h1 className={styles.titulo}>Plazas libres cerca</h1>
      <p className={styles.fecha}>Plazas que otros conductores acaban de dejar. Se borran a los 10 minutos.</p>
      <BuscarPlaza url={process.env.SUPABASE_URL ?? ""} clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""} />
    </main>
  );
}
