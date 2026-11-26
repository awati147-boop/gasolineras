# Proyecto: Mevoy, app de conducción en ciudad (gasolina barata + aparcar + dejar plaza)
Objetivo: web instalable en móvil (PWA) con mapa: gasolineras más baratas, dónde aparcar (plazas libres,
parkings, parquímetros) y avisar cuando dejas tu plaza. Sin registro ni datos personales.

Stack (todo en plan gratuito):
- Next.js (App Router, TypeScript) + Supabase (PostgreSQL, usuarios anónimos, pg_cron).
- Mapas: MapLibre con teselas de OpenStreetMap.
- Hosting: Cloudflare Workers con @opennextjs/cloudflare (no usar servicios propios de Vercel).
  `cacheComponents` desactivado en next.config.ts: cuelga las páginas en Workers.
  Desplegar SIEMPRE con `npm run deploy` (scripts/desplegar.mjs): el adaptador copia los .env* dentro del código del
  Worker; el script aparta .env.local al compilar y no sube nada si se cuela una clave. Variables y secretos de la web
  publicada: en Cloudflare (Worker → Settings → Variables and Secrets), los secretos como "Secret".
- Tareas automáticas con GitHub Actions: precios cada 2 h (`npm run importar`),
  aparcamientos de OSM cada lunes (`npm run importar-aparcamientos`), zonas reguladas cada martes (`importar-zonas`:
  Madrid, Barcelona, Valencia y Alicante), cargadores cada día.
- Ramas: `main` = web publicada con todo. Cloudflare compila y publica SOLO cada push a `main` (Workers Builds):
  no subir a `main` nada a medias. `garajes` = rama de trabajo (mantenerla igual que `main`).

Datos:
- Carburantes: API REST gratuita del Ministerio para la Transición Ecológica (coma decimal; `scripts/importar.mts`).
  La web nunca llama al Ministerio: lee de Supabase vía `/api/gasolineras` (zona visible) y `/api/buscar`.
- Parkings y parquímetros: OpenStreetMap vía Overpass (`scripts/importar-aparcamientos.mts`, provincia de Alicante;
  ampliar a toda España por provincias). Citar "© colaboradores de OpenStreetMap" (ODbL).
- Puntos de recarga eléctrica: datos oficiales MITECO vía DGT (NAP, DATEX II, `scripts/importar-cargadores.mts`, cada día;
  tabla `cargadores` en `supabase/cargadores.sql`). Sin precios (el Ministerio aún no los publica en abierto).
  En la pestaña Gasolina, chip "⚡ Eléctrico" (`/api/cargadores`, `src/lib/cargadores.ts`).
- Tarifas de la zona azul por ciudad (PRECIO ORIENTATIVO, con fuente oficial y fecha): `src/lib/tarifasZonaAzul.ts`
  (23 ciudades: Alicante, Madrid, Barcelona, Valencia, Sevilla, Zaragoza, Málaga, Murcia, Bilbao, Valladolid, Palma,
  Córdoba, Vitoria, Gijón, Granada, Oviedo, Pamplona, Salamanca, Burgos, Santander, Palencia, Lorca, Manresa).
  Buscadas sin fuente oficial con importes (la web remite a la ordenanza pero no publica precios): Las Palmas, Vigo,
  A Coruña, Elche, Donostia, Logroño, León, Castellón, Santa Cruz, Benidorm, Torrevieja, Orihuela, Alcoy, Dénia,
  San Vicente, Cádiz, Huelva, Almería, Badajoz, Albacete, Toledo, Tarragona, Lleida, Girona, Cartagena, Santiago, Lugo,
  Pontevedra, Jerez, Marbella, Algeciras, Sabadell, Terrassa, Badalona, L'Hospitalet, Getafe, Alcalá, Móstoles, Leganés.
  Ávila: solo ordenanza de 2011 (demasiado vieja). Revisar cada enero.
- Calles de la ORA de Alicante: no hay mapa oficial; salen de los
  decretos del BOP (sector Mercado 1B 2018, sector 7 Carolinas 2021) y de la relación de calles del centro (2006), en
  `scripts/datos/ora-alicante.json`. `importar-zonas` (código `ali`) las dibuja sobre las calles de OSM (name:es/old_name).
  Revisar cuando arranque el nuevo contrato de la ORA (licitado en 2026: más zona naranja en Benalúa, Alipark, Princesa Mercedes).
- Precios de parkings: solo de webs oficiales de operadores, siempre con fuente y fecha. No copiar webs de reservas.
- Esquemas SQL en `supabase/` (idempotentes: se pueden volver a ejecutar enteros). Orden: schema, plazas, aparcamientos,
  zonas, garajes, reservas, avisos, pagos, denuncias, valoraciones, cargadores (+ los `*.local.sql` con claves, que no se suben).

Reglas:
- Un paso cada vez. Antes de programar, explícame el plan en pocas líneas.
- No guardes datos personales ni ubicación de usuarios (la ubicación solo se usa en el navegador).
- Si la API falla, mostrar el último dato guardado con su fecha.
- Idioma de la interfaz: español.
- No usar logos oficiales de marcas: distintivos con iniciales y color (`src/lib/marcas.ts`).
- Nunca vender el orden de los resultados: lo patrocinado va aparte y marcado como "Patrocinado".

Una sola app con pestañas que comparten el mapa: ⛽ Gasolina (`/`) · 🚗 Me voy (`/me-voy`, central) · 🅿️ Aparcar (`/aparcar`).
Nombre y logo: Mevoy (`src/lib/app.ts`: NOMBRE_APP y LOGO, chincheta con líneas de movimiento; mismo logo en cabecera e
icono de la app). Dominio mevoy.es aún sin comprar. El Worker de Cloudflare sigue llamándose "gasolineras" (cambiarlo cambia la URL).

Fases de producto (en este orden, un paso cada vez):
1. ⛽ Gasolineras: hecho y publicado.
2. Navegación con pestañas: hecho (rama parking).
3. 🚗 Me voy: hecho (rama parking). Usuario anónimo, la plaza caduca a los 10 min, límite 1 cada 2 min,
   nadie puede leer quién la dejó (`supabase/plazas.sql`).
4. 🅿️ Aparcar: plazas libres (consulta cada 15 s), parkings y parquímetros de OSM con filtros: hecho (rama parking).
   Parkings de toda España: hecho (importador semanal, 52 provincias). Precios de parkings: a mano en
   `src/lib/preciosParkings.ts` (id de OSM + tramos + fuente oficial + fecha); hoy Interparking Puerto y Poniente.
   Saba y Aena no publican tarifas en sus fichas; Telpark y Vectalia bloquean la lectura automática.
   Pendiente: más precios, "dinos cuánto pagaste", avisos push.
   Lanzar primero solo en Alicante (hacen falta muchos usuarios en la misma zona).
5. 🏠 Garajes, fase A: anuncios de alquiler por horas/días SIN pagos en la app (contacto directo). Requiere cuentas.
6. 🏠 Garajes, fase B: reservas con pago (Stripe Connect; 3 % al dueño + tarifa al conductor 10 %, mín. 0,50 €).
   HECHO EN MODO PRUEBA (rama garajes): `supabase/pagos.sql`, `src/lib/pagosServidor.ts`, rutas `/api/pagos/*`.
   Retención al pedir, cobro al aceptar, libera si rechaza/48 h sin respuesta, devolución según la política de 24 h,
   transferencia al dueño 24 h tras el inicio. Se activa solo con STRIPE_SECRET_KEY + PAGOS_SECRETO (servidor) y
   pagos_config.modo en la base de datos. Pasar a modo real requiere alta de autónomo/sociedad y asesoría legal/fiscal
   (DAC7, RGPD, IVA de la comisión).
7. Mejoras de gestión (rama garajes): calendario del garaje (horario semanal + días bloqueados; misma regla en
   `src/lib/disponibilidad.ts` y `garaje_disponible` en SQL, con la hora del garaje: península o Canarias), reserva
   instantánea (se acepta sola si empieza en 2 h o más; con pago, al retenerse), valoraciones (`supabase/valoraciones.sql`,
   opiniones sin nombre, denunciables), panel en Mi cuenta, página `/alquila-tu-garaje` con calculadora y compartir anuncio.
   «He aparcado aquí» + ticket de la ORA y gasolineras favoritas: SOLO en el móvil (localStorage), nunca en el servidor.
   Pendiente: alertas de precio por push (Premium), avisos del ticket con la web cerrada (hoy: alarma de calendario .ics).
Fuera por ahora: app nativa (si hace falta ubicación en segundo plano, envolver la PWA con Capacitor).

Monetización (por fases, según usuarios):
1. Ahora: crecer en Alicante, sin ingresos.
2. ~1.000 usuarios: afiliación (reservas de parking en fichas de parkings de pago; seguros, ITV, talleres, recarga).
3. ~5.000 usuarios: Premium 1,99–2,99 €/mes (alertas de precio, avisos prioritarios de plaza, sin anuncios)
   y negocios locales destacados (siempre "Patrocinado").
4. Con comunidad: alquiler de garajes (fase 6), modelo tipo JustPark: al dueño solo un 3 % por reserva
   (reclamo para conseguir plazas) + tarifa de servicio al conductor (~10–15 %, mínimo ~0,50 €), siempre
   mostrada aparte antes de pagar. Nichos en Alicante: aeropuerto, playas en verano, eventos, hospitales.
   Más adelante: seguro opcional por reserva con correduría (comisión). Posible negocio principal.
5. Largo plazo: datos agregados y anónimos para operadores/ayuntamientos; acuerdos con operadores por aforo.
No usar publicidad tipo AdSense. Antes de ingresar: alta de autónomo/sociedad, aviso legal, privacidad y cookies (LSSI/RGPD).
