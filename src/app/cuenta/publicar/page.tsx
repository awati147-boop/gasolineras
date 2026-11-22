import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../../page.module.css";
import PublicarGaraje from "./PublicarGaraje";

export const metadata: Metadata = { title: "Publicar garaje" };

export default async function Publicar() {
  await connection(); // leer las variables en cada petición (no al compilar)
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <h1 className={styles.titulo}>Alquila tu garaje</h1>
      <p className={styles.zona}>Gana dinero con tu plaza cuando no la usas. Publicarlo es gratis.</p>
      <PublicarGaraje url={process.env.SUPABASE_URL ?? ""} clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""} />
    </main>
  );
}
