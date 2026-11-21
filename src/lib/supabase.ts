import { createClient } from "@supabase/supabase-js";

// Cliente de solo lectura (clave pública). Se usa en el servidor de Next.
export function supabasePublico() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY en .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}
