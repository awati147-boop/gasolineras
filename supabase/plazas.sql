-- "Me voy": plazas de aparcamiento que los usuarios dejan libres.
-- Pegar en Supabase > SQL Editor. Idempotente: se puede ejecutar varias veces.
-- Privacidad: solo se guarda el punto de la plaza; caduca a los 10 minutos y se borra.

create table if not exists plazas (
  id       bigint generated always as identity primary key,
  usuario  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lat      double precision not null check (lat between 27 and 44.5),   -- España
  lon      double precision not null check (lon between -19 and 5),
  creada   timestamptz not null default now(),
  expira   timestamptz not null default now() + interval '10 minutes'
);
create index if not exists plazas_expira on plazas (expira);
create index if not exists plazas_lat_lon on plazas (lat, lon);

-- El servidor fija usuario, hora y caducidad (el móvil no puede falsearlos)
-- y limita a 1 plaza cada 2 minutos por usuario.
create or replace function plazas_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta sesión';
  end if;
  if exists (select 1 from plazas where usuario = auth.uid() and creada > now() - interval '2 minutes') then
    raise exception 'Espera un par de minutos antes de dejar otra plaza';
  end if;
  new.usuario := auth.uid();
  new.creada  := now();
  new.expira  := now() + interval '10 minutes';
  return new;
end $$;

drop trigger if exists plazas_antes_de_insertar on plazas;
create trigger plazas_antes_de_insertar before insert on plazas
  for each row execute function plazas_antes_de_insertar();

-- Seguridad por filas
alter table plazas enable row level security;
drop policy if exists "ver plazas vigentes" on plazas;
drop policy if exists "crear plaza propia" on plazas;
drop policy if exists "borrar plaza propia" on plazas;
create policy "ver plazas vigentes" on plazas for select using (expira > now());
create policy "crear plaza propia"  on plazas for insert to authenticated with check (usuario = auth.uid());
create policy "borrar plaza propia" on plazas for delete to authenticated using (usuario = auth.uid());

-- Permisos por columna: nadie puede leer quién dejó la plaza (columna "usuario")
revoke all on plazas from anon, authenticated;
grant select (id, lat, lon, creada, expira) on plazas to anon, authenticated;
grant insert (lat, lon) on plazas to authenticated;
grant delete on plazas to authenticated;
grant all on plazas to service_role;

-- Borrar plazas caducadas cada 5 minutos (pg_cron viene incluido en Supabase)
create extension if not exists pg_cron;
select cron.schedule('borrar-plazas-caducadas', '*/5 * * * *', $$delete from public.plazas where expira < now()$$);
