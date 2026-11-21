-- Esquema inicial: gasolineras y precios (pegar en Supabase > SQL Editor)

create table if not exists gasolineras (
  id          integer primary key,          -- IDEESS del Ministerio
  rotulo      text,
  direccion   text,
  localidad   text,
  municipio   text,
  provincia   text,
  id_provincia text,
  cp          text,
  horario     text,
  lat         double precision,
  lon         double precision,
  actualizado timestamptz not null default now()
);

-- Texto para el buscador: "localidad municipio" en minúsculas y sin tildes (lo rellena el importador)
alter table gasolineras add column if not exists busqueda text;
create index if not exists gasolineras_cp on gasolineras (cp);

-- Precio actual de cada carburante en cada gasolinera
create table if not exists precios (
  gasolinera_id integer not null references gasolineras(id) on delete cascade,
  carburante    text not null,               -- p.ej. 'Gasolina 95 E5', 'Gasoleo A'
  precio        numeric(6,3) not null,       -- €/litro
  fecha         timestamptz not null,        -- fecha que da la API
  primary key (gasolinera_id, carburante)
);

create index if not exists precios_carburante_precio on precios (carburante, precio);

-- Registro de cada descarga (para mostrar "último dato del ...")
create table if not exists importaciones (
  id          bigint generated always as identity primary key,
  fecha_api   timestamptz not null,
  provincia   text,
  gasolineras integer not null,
  precios     integer not null,
  creado      timestamptz not null default now()
);

-- Lectura pública (datos abiertos), escritura solo con service_role
alter table gasolineras   enable row level security;
alter table precios       enable row level security;
alter table importaciones enable row level security;
drop policy if exists "lectura publica" on gasolineras;
drop policy if exists "lectura publica" on precios;
drop policy if exists "lectura publica" on importaciones;
create policy "lectura publica" on gasolineras   for select using (true);
create policy "lectura publica" on precios       for select using (true);
create policy "lectura publica" on importaciones for select using (true);

-- Permisos para la API (los proyectos nuevos de Supabase no los dan por defecto)
grant select on gasolineras, precios, importaciones to anon, authenticated;
grant all    on gasolineras, precios, importaciones to service_role;
