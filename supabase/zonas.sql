-- Zonas de aparcamiento regulado en la calle (zona azul, verde, naranja...) de los datos abiertos
-- de los ayuntamientos. Las rellena scripts/importar-zonas.mts.
-- Pegar en Supabase > SQL Editor. Idempotente: se puede ejecutar varias veces.
--
-- Fuentes (hay que citarlas en la app):
--   Madrid:    datos.madrid.es · "SER. Calles y número de plazas" (Ayuntamiento de Madrid)
--   Barcelona: opendata-ajuntament.barcelona.cat · "Trams aparcament superfície" (B:SM, CC BY 4.0)
--   Valencia:  geoportal.valencia.es · "Aparcamientos ORA" (Ajuntament de València, CC BY 4.0)

create table if not exists zonas_reguladas (
  id          text primary key,            -- "mad:123", "bcn:456", "vlc:789"
  ciudad      text not null,               -- Madrid, Barcelona, Valencia
  tipo        text not null check (tipo in ('rotacion', 'mixta', 'residentes', 'larga', 'libre')),
  color       text not null,               -- color de la calle en esa ciudad: azul, verde, naranja, blanca...
  calle       text,
  plazas      integer,
  lat         double precision not null,   -- punto (o inicio del tramo)
  lon         double precision not null,
  lat2        double precision,            -- fin del tramo (si es una línea)
  lon2        double precision,
  fuente      text not null,
  actualizado timestamptz not null default now()
);
create index if not exists zonas_lat_lon on zonas_reguladas (lat, lon);
create index if not exists zonas_ciudad on zonas_reguladas (ciudad, actualizado);

alter table zonas_reguladas enable row level security;
drop policy if exists "lectura publica" on zonas_reguladas;
create policy "lectura publica" on zonas_reguladas for select using (true);
revoke all on zonas_reguladas from anon, authenticated;
grant select on zonas_reguladas to anon, authenticated;
grant all on zonas_reguladas to service_role;
