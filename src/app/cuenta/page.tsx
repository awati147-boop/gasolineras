import type { Metadata } from "next";
import { connection } from "next/server";
import styles from "../page.module.css";
import MiCuenta from "./MiCuenta";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function Cuenta() {
  await connection(); // leer las variables en cada petición (no al compilar)
  return (
    <main className={`${styles.main} ${styles.centrado}`}>
      <MiCuenta
        url={process.env.SUPABASE_URL ?? ""}
        clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
        vapid={process.env.VAPID_PUBLIC_KEY ?? ""}
      />
    </main>
  );
}
