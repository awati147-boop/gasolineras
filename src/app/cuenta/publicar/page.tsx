import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../../page.module.css";
import PublicarGaraje from "./PublicarGaraje";

export const metadata: Metadata = { title: "Publicar garaje" };

export default async function Publicar({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await connection(); // leer las variables en cada petición (no al compilar)
  const { editar } = await searchParams;
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <h1 className={styles.titulo}>{editar ? "Editar garaje" : "Alquila tu garaje"}</h1>
      <p className={styles.zona}>
        {editar ? "Cambia lo que necesites y guarda." : "Gana dinero con tu plaza cuando no la usas. Publicarlo es gratis."}
      </p>
      <PublicarGaraje
        editarId={editar}
        url={process.env.SUPABASE_URL ?? ""}
        clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
      />
    </main>
  );
}
