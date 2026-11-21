-- Aparcamientos (parkings) y parquímetros importados de OpenStreetMap.
-- Pegar en Supabase > SQL Editor. Idempotente: se puede ejecutar varias veces.
-- Datos © colaboradores de OpenStreetMap (licencia ODbL): hay que citarlo en la app.

create table if not exists aparcamientos (
  id          text primary key,            -- "osm:node/123", "osm:way/456"
  clase       text not null check (clase in ('parking', 'parquimetro')),
  nombre      text,
  tipo        text,                         -- superficie, subterraneo, varias_plantas, calle...
  acceso      text,                         -- publico, clientes
  de_pago     boolean,                      -- null = no se sabe
  plazas      integer,
  plazas_pmr  integer,                      -- plazas para personas con movilidad reducida
  horario     text,
  operador    text,
  precio      text,                         -- texto libre (OSM "charge" o metido a mano)
  lat         double precision not null,
  lon         double precision not null,
  fuente      text not null default 'osm',
  actualizado timestamptz not null default now()
);
create index if not exists aparcamientos_lat_lon on aparcamientos (lat, lon);
create index if not exists aparcamientos_clase on aparcamientos (clase);

alter table aparcamientos enable row level security;
drop policy if exists "lectura publica" on aparcamientos;
create policy "lectura publica" on aparcamientos for select using (true);
grant select on aparcamientos to anon, authenticated;
grant all on aparcamientos to service_role;
