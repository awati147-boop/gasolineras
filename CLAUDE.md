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

Una sola app con pestañas que comparten el mapa: ⛽ Gasolina (`/`) · 🅿️ Aparcar (`/aparcar`) · 🚗 Me voy (`/me-voy`).

Fases (en este orden, un paso cada vez):
1. ⛽ Gasolineras: hecho y publicado.
2. Navegación con pestañas.
3. 🚗 Me voy: "dejo mi plaza aquí". Usuario anónimo de Supabase (sin email), la plaza caduca a los 10 min,
   se guarda solo el punto de la plaza (nunca se sigue la ubicación del usuario).
4. 🅿️ Aparcar: plazas libres en tiempo real (Supabase Realtime), avisos push, parkings públicos (OSM) y zonas ORA.
   Lanzar primero solo en Alicante (hacen falta muchos usuarios en la misma zona).
5. 🏠 Garajes, fase A: anuncios de alquiler por horas/días SIN pagos en la app (contacto directo). Requiere cuentas.
6. 🏠 Garajes, fase B: reservas con pago (Stripe Connect, comisión). Requiere asesoría legal/fiscal (DAC7, RGPD).
Fuera por ahora: pagos (hasta fase 6), app nativa (si hace falta ubicación en segundo plano, envolver la PWA con Capacitor).
