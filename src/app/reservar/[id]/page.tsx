import type { Metadata } from "next";
import { connection } from "next/server";
import { pagosActivos } from "@/lib/pagosApi";
import { supabasePublico } from "@/lib/supabase";
import { textoNota, textoPrecio, urlFoto, type Garaje } from "@/lib/garajes";
import styles from "../../page.module.css";
import SolicitarReserva from "./SolicitarReserva";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id");
    const { data } = await supabasePublico()
      .from("garajes")
      .select("titulo, tipo, precio_hora, precio_dia, precio_mes, foto, nota, num_valoraciones")
      .eq("id", id)
      .eq("activo", true)
      .maybeSingle();
    const g = data as (Pick<Garaje, "titulo" | "tipo" | "precio_hora" | "precio_dia" | "precio_mes" | "foto" | "nota" | "num_valoraciones">) | null;
    if (!g) throw new Error("sin garaje");
    const descripcion = [textoPrecio(g), g.tipo === "cerrado" ? "Garaje cerrado" : "Plaza en garaje", textoNota(g.nota, g.num_valoraciones), "Reserva en un momento"]
      .filter(Boolean).join(" · ");
    const imagen = g.foto ? urlFoto(process.env.SUPABASE_URL ?? "", g.foto) : undefined;
    return {
      title: g.titulo,
      description: descripcion,
      openGraph: { title: g.titulo, description: descripcion, images: imagen ? [imagen] : undefined },
    };
  } catch {
    return { title: "Reservar garaje" };
  }
}

export default async function Reservar({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // leer las variables en cada petición (no al compilar)
  const { id } = await params;
  return (
    <main className={`${styles.main} ${styles.formulario}`}>
      <SolicitarReserva
        garajeId={id}
        url={process.env.SUPABASE_URL ?? ""}
        clave={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
        pagos={pagosActivos()}
      />
    </main>
  );
}
