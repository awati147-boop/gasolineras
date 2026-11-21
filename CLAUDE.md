# Proyecto: app de conducción en ciudad (gasolina barata + aparcar + dejar plaza)
Objetivo: web instalable en móvil (PWA) con mapa: gasolineras más baratas, dónde aparcar (plazas libres,
parkings, parquímetros) y avisar cuando dejas tu plaza. Sin registro ni datos personales.

Stack (todo en plan gratuito):
- Next.js (App Router, TypeScript) + Supabase (PostgreSQL, usuarios anónimos, pg_cron).
- Mapas: MapLibre con teselas de OpenStreetMap.
- Hosting: Cloudflare Workers con @opennextjs/cloudflare (no usar servicios propios de Vercel).
  `cacheComponents` desactivado en next.config.ts: cuelga las páginas en Workers.
- Tareas automáticas con GitHub Actions: precios cada 2 h (`npm run importar`),
  aparcamientos de OSM cada lunes (`npm run importar-aparcamientos`).
- Ramas: `main` = web publicada (solo gasolineras). `parking` = pestañas Aparcar / Me voy (en desarrollo).

Datos:
- Carburantes: API REST gratuita del Ministerio para la Transición Ecológica (coma decimal; `scripts/importar.mts`).
  La web nunca llama al Ministerio: lee de Supabase vía `/api/gasolineras` (zona visible) y `/api/buscar`.
- Parkings y parquímetros: OpenStreetMap vía Overpass (`scripts/importar-aparcamientos.mts`, provincia de Alicante;
  ampliar a toda España por provincias). Citar "© colaboradores de OpenStreetMap" (ODbL).
- Tarifas ORA de Alicante: `src/lib/ora.ts` (fuente oragruaalicante.es). Las calles de la ORA no están publicadas.
- Precios de parkings: solo de webs oficiales de operadores, siempre con fuente y fecha. No copiar webs de reservas.
- Esquemas SQL en `supabase/` (idempotentes: se pueden volver a ejecutar enteros).

Reglas:
- Un paso cada vez. Antes de programar, explícame el plan en pocas líneas.
- No guardes datos personales ni ubicación de usuarios (la ubicación solo se usa en el navegador).
- Si la API falla, mostrar el último dato guardado con su fecha.
- Idioma de la interfaz: español.
- No usar logos oficiales de marcas: distintivos con iniciales y color (`src/lib/marcas.ts`).
- Nunca vender el orden de los resultados: lo patrocinado va aparte y marcado como "Patrocinado".

Una sola app con pestañas que comparten el mapa: ⛽ Gasolina (`/`) · 🚗 Me voy (`/me-voy`, central) · 🅿️ Aparcar (`/aparcar`).

Fases de producto (en este orden, un paso cada vez):
1. ⛽ Gasolineras: hecho y publicado.
2. Navegación con pestañas: hecho (rama parking).
3. 🚗 Me voy: hecho (rama parking). Usuario anónimo, la plaza caduca a los 10 min, límite 1 cada 2 min,
   nadie puede leer quién la dejó (`supabase/plazas.sql`).
4. 🅿️ Aparcar: plazas libres (consulta cada 15 s), parkings y parquímetros de OSM con filtros: hecho (rama parking).
   Pendiente: precios de parkings con fuente/fecha, "dinos cuánto pagaste", calles ORA, avisos push, toda España.
   Lanzar primero solo en Alicante (hacen falta muchos usuarios en la misma zona).
5. 🏠 Garajes, fase A: anuncios de alquiler por horas/días SIN pagos en la app (contacto directo). Requiere cuentas.
6. 🏠 Garajes, fase B: reservas con pago (Stripe Connect, comisión). Requiere asesoría legal/fiscal (DAC7, RGPD).
Fuera por ahora: app nativa (si hace falta ubicación en segundo plano, envolver la PWA con Capacitor).

Monetización (por fases, según usuarios):
1. Ahora: crecer en Alicante, sin ingresos.
2. ~1.000 usuarios: afiliación (reservas de parking en fichas de parkings de pago; seguros, ITV, talleres, recarga).
3. ~5.000 usuarios: Premium 1,99–2,99 €/mes (alertas de precio, avisos prioritarios de plaza, sin anuncios)
   y negocios locales destacados (siempre "Patrocinado").
4. Con comunidad: comisión del 10–15 % en alquiler de garajes (fase 6). Posible negocio principal.
5. Largo plazo: datos agregados y anónimos para operadores/ayuntamientos; acuerdos con operadores por aforo.
No usar publicidad tipo AdSense. Antes de ingresar: alta de autónomo/sociedad, aviso legal, privacidad y cookies (LSSI/RGPD).
