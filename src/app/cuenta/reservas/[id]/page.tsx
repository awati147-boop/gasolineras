import type { Metadata } from "next";
import { connection } from "next/server";
import { pagosActivos } from "@/lib/pagosApi";
import styles from "../../../page.module.css";
import DetalleReserva from "./DetalleReserva";

export const metadata: Metadata = { title: "Reserva" };

export default async function Reserva({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // leer las variables en cada petición (no al compilar)
  const { id } = await params;
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <DetalleReserva
        reservaId={id}
        url={process.env.SUPABASE_URL ?? ""}
        clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
        pagos={pagosActivos()}
      />
    </main>
  );
}
