import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../../page.module.css";
import SolicitarReserva from "./SolicitarReserva";

export const metadata: Metadata = { title: "Solicitar reserva" };

export default async function Reservar({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // leer las variables en cada petición (no al compilar)
  const { id } = await params;
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <SolicitarReserva
        garajeId={id}
        url={process.env.SUPABASE_URL ?? ""}
        clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
      />
    </main>
  );
}
