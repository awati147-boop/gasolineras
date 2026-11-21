"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ConfigSupabase = { url: string; clave: string };

let cliente: SupabaseClient | null = null;

/** Cliente de Supabase en el navegador (clave pública). Guarda la sesión anónima en este dispositivo. */
export function supabaseNavegador({ url, clave }: ConfigSupabase) {
  cliente ??= createClient(url, clave, { auth: { persistSession: true, autoRefreshToken: true } });
  return cliente;
}

/** Devuelve la sesión actual o crea un usuario anónimo (sin email ni nombre). */
export async function asegurarSesion(db: SupabaseClient) {
  const { data } = await db.auth.getSession();
  if (data.session) return data.session;
  const { data: nueva, error } = await db.auth.signInAnonymously();
  if (error || !nueva.session) throw new Error("No se ha podido iniciar la sesión anónima.");
  return nueva.session;
}
