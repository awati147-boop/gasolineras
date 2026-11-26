-- Puntos de recarga para coche eléctrico (datos oficiales del MITECO que publica la DGT en el Punto de Acceso
-- Nacional, formato DATEX II). Los carga scripts/importar-cargadores.mts cada día (GitHub Actions).
-- Lectura pública; solo el importador (service_role) escribe. Idempotente: se puede ejecutar varias veces.

create table if not exists cargadores (
  id          text primary key,                       -- id del sitio en el NAP
  nombre      text,
  operador    text,
  direccion   text,
  municipio   text,
  provincia   text,
  cp          text,
  horario     text,
  lat         double precision not null check (lat between 27 and 44.5),
  lon         double precision not null check (lon between -19 and 5),
  puntos      int not null default 0,                 -- coches que pueden cargar a la vez
  potencia_kw numeric(6,1) not null default 0,        -- la mayor potencia del sitio
  conectores  jsonb not null default '[]',            -- [{"t": "ccs", "kw": 150, "n": 2}, …]
  tipos       text[] not null default '{}',           -- ccs, tipo2, chademo, schuko, tipo1, otros
  pago        text[] not null default '{}',           -- rfid, apps, tarjeta, nfc
  actualizado timestamptz,                            -- última actualización del dato en el NAP
  visto       timestamptz not null default now()      -- última importación en la que apareció
);
create index if not exists cargadores_lat_lon on cargadores (lat, lon);
create index if not exists cargadores_potencia on cargadores (potencia_kw desc);

-- Fecha de cada importación (para mostrar "datos del …")
create table if not exists cargadores_importaciones (
  id          bigint generated always as identity primary key,
  fecha_datos timestamptz not null,                   -- fecha de publicación del archivo oficial
  total       int not null,
  creado      timestamptz not null default now()
);

alter table cargadores enable row level security;
alter table cargadores_importaciones enable row level security;
drop policy if exists "leer cargadores" on cargadores;
drop policy if exists "leer importaciones de cargadores" on cargadores_importaciones;
create policy "leer cargadores" on cargadores for select using (true);
create policy "leer importaciones de cargadores" on cargadores_importaciones for select using (true);
revoke all on cargadores, cargadores_importaciones from anon, authenticated;
grant select on cargadores, cargadores_importaciones to anon, authenticated;
grant all on cargadores, cargadores_importaciones to service_role;
