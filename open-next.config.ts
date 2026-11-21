import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuración mínima: sin caché incremental (la web lee siempre de Supabase)
export default defineCloudflareConfig({});
