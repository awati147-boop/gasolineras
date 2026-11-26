import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../../../page.module.css";
import CalendarioGaraje from "./CalendarioGaraje";

export const metadata: Metadata = { title: "Calendario del garaje" };

export default async function Calendario({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // leer las variables en cada petición (no al compilar)
  const { id } = await params;
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <CalendarioGaraje garajeId={id} url={process.env.SUPABASE_URL ?? ""} clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""} />
    </main>
  );
}
