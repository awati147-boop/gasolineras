import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../page.module.css";
import DejarPlaza from "./DejarPlaza";
import MiCoche from "../MiCoche";

export const metadata: Metadata = { title: "Me voy" };

export default async function MeVoy() {
  await connection(); // leer las variables en cada petición (no al compilar)
  const url = process.env.SUPABASE_URL ?? "";
  const clave = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

  return (
    <main className={`${styles.main} ${styles.centrado}`}>
      <h1 className={styles.titulo}>¿Te vas? Regala tu plaza</h1>
      <p className={styles.zona}>Un toque y alguien que busca sitio cerca lo sabrá al momento.</p>
      <MiCoche enMeVoy />
      <DejarPlaza url={url} clave={clave} />
    </main>
  );
}
