# Proyecto: web de gasolineras (MVP)
Objetivo: web instalable en móvil (PWA) con las gasolineras más baratas, con mapa. Sin registro ni datos personales.

Stack (todo en plan gratuito):
- Next.js (App Router, TypeScript) + Supabase (PostgreSQL).
- Mapas: MapLibre con teselas de OpenStreetMap.
- Hosting: Cloudflare Workers con @opennextjs/cloudflare (no usar servicios propios de Vercel).
- Importación automática de precios: GitHub Actions (cron) ejecutando `npm run importar`.

Datos: API REST gratuita del Ministerio para la Transición Ecológica (precios de carburantes).
- Viene con coma decimal; el importador (`scripts/importar.mts`) la convierte y hace upsert en Supabase.
- Esquema en `supabase/schema.sql` (idempotente: se puede volver a ejecutar entero).
- La web nunca llama al Ministerio: lee de Supabase vía `/api/gasolineras` (zona visible) y `/api/buscar`.

Reglas:
- Un paso cada vez. Antes de programar, explícame el plan en pocas líneas.
- No guardes datos personales ni ubicación de usuarios (la ubicación solo se usa en el navegador).
- Si la API falla, mostrar el último dato guardado con su fecha.
- Idioma de la interfaz: español.
- No usar logos oficiales de marcas: distintivos con iniciales y color (`src/lib/marcas.ts`).

Fases:
1. Gasolineras (MVP, en curso).
2. Parking: parkings públicos/de pago y zonas de parquímetro, en pestaña aparte.
3. Dejar plaza y avisar: requiere cuentas y revisar la regla de datos personales (RGPD).
Fuera del MVP: pagos, app nativa (si hace falta, envolver la PWA con Capacitor).
