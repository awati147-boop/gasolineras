"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reserva } from "@/lib/reservas";

/** Mis reservas (como dueño y como conductor), siempre al día: se recargan solas cuando cambia alguna */
export function useMisReservas(db: SupabaseClient, activo: boolean) {
  const [reservas, setReservas] = useState<Reserva[] | null>(null);

  useEffect(() => {
    if (!activo) return; // sin cuenta no hay reservas (y la base de datos lo denegaría)
    let vivo = true;
    const cargar = () =>
      db.rpc("mis_reservas").then(({ data }) => {
        if (vivo) setReservas((data as Reserva[] | null) ?? []);
      });
    cargar();
    // Si llega una solicitud nueva, cambia un estado o se paga, se actualiza sola
    const canal = db
      .channel("mis-reservas")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, cargar)
      .subscribe();
    return () => {
      vivo = false;
      db.removeChannel(canal);
    };
  }, [db, activo]);

  return reservas;
}
