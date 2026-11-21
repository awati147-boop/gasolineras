import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../page.module.css";
import DejarPlaza from "./DejarPlaza";

export const metadata: Metadata = { title: "Me voy" };

export default async function MeVoy() {
  await connection(); // leer las variables en cada petición (no al compilar)
  const url = process.env.SUPABASE_URL ?? "";
  const clave = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

  return (
    <main className={`${styles.main} ${styles.centrado}`}>
      <div className={styles.proxIcono} aria-hidden>🚗</div>
      <h1 className={styles.titulo}>¿Te vas? Deja tu plaza</h1>
      <p className={styles.fecha}>Avisaremos a quien busca aparcamiento cerca. Sin registro.</p>
      <DejarPlaza url={url} clave={clave} />
    </main>
  );
}
