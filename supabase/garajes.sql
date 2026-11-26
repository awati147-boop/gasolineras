-- Garajes de particulares en alquiler (fase A: anuncios, sin pagos).
-- Pegar en Supabase > SQL Editor. Idempotente: se puede ejecutar varias veces.
-- Privacidad: la ubicación exacta y la dirección van en garajes_privado (solo el dueño las ve);
-- en garajes solo hay una ubicación aproximada (~100 m).

create extension if not exists pgcrypto;

-- ¿El usuario tiene cuenta de verdad (Google/email) y no es anónimo?
create or replace function tiene_cuenta() returns boolean
language sql stable as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ---------- Datos públicos del anuncio ----------
create table if not exists garajes (
  id            uuid primary key default gen_random_uuid(),
  propietario   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 5 and 80),
  descripcion   text check (char_length(descripcion) <= 600),
  tipo          text not null default 'plaza' check (tipo in ('plaza', 'cerrado')),  -- plaza abierta o garaje cerrado/box
  precio_hora   numeric(6,2) check (precio_hora > 0 and precio_hora < 100),
  precio_dia    numeric(7,2) check (precio_dia > 0 and precio_dia < 500),
  precio_mes    numeric(8,2) check (precio_mes > 0 and precio_mes < 2000),
  disponibilidad text check (char_length(disponibilidad) <= 200),                   -- "Laborables 9-19", "Fines de semana"...
  altura_max    numeric(3,2) check (altura_max between 1.5 and 4),                    -- metros
  acceso        text check (acceso in ('mando', 'llave', 'codigo', 'libre')),
  enchufe       boolean not null default false,                                       -- carga de coche eléctrico
  foto          text,                                                                 -- ruta en el bucket "garajes"
  lat_aprox     double precision not null check (lat_aprox between 27 and 44.5),
  lon_aprox     double precision not null check (lon_aprox between -19 and 5),
  activo        boolean not null default true,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now(),
  check (precio_hora is not null or precio_dia is not null or precio_mes is not null)
);
create index if not exists garajes_aprox on garajes (lat_aprox, lon_aprox) where activo;
create index if not exists garajes_propietario on garajes (propietario);

-- ---------- Datos privados (solo el dueño) ----------
create table if not exists garajes_privado (
  garaje_id  uuid primary key references garajes(id) on delete cascade,
  lat        double precision not null check (lat between 27 and 44.5),
  lon        double precision not null check (lon between -19 and 5),
  direccion  text check (char_length(direccion) <= 200),
  indicaciones text check (char_length(indicaciones) <= 400)  -- "Plaza 23, segundo sótano"...
);

-- Fija el propietario, la fecha y el límite de 5 garajes por persona
create or replace function garajes_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Cambios hechos por el administrador (SQL Editor, scripts con service_role) o por otro trigger
  -- de la base de datos (p. ej. pausar un garaje con muchas denuncias): sin comprobaciones
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then
    new.actualizado := now();
    return new;
  end if;
  if not tiene_cuenta() then
    raise exception 'Necesitas una cuenta para publicar un garaje';
  end if;
  if tg_op = 'INSERT' then
    new.propietario := auth.uid();
    new.creado := now();
    if (select count(*) from garajes where propietario = auth.uid()) >= 5 then
      raise exception 'Puedes publicar como máximo 5 garajes';
    end if;
  else
    new.propietario := old.propietario;  -- no se puede cambiar de dueño
    new.creado := old.creado;
  end if;
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists garajes_antes on garajes;
create trigger garajes_antes before insert or update on garajes
  for each row execute function garajes_antes();

-- ---------- Seguridad ----------
alter table garajes enable row level security;
alter table garajes_privado enable row level security;

drop policy if exists "ver activos o propios" on garajes;
drop policy if exists "crear propio" on garajes;
drop policy if exists "editar propio" on garajes;
drop policy if exists "borrar propio" on garajes;
create policy "ver activos o propios" on garajes for select using (activo or propietario = auth.uid());
create policy "crear propio"  on garajes for insert to authenticated with check (tiene_cuenta() and propietario = auth.uid());
create policy "editar propio" on garajes for update to authenticated using (propietario = auth.uid()) with check (propietario = auth.uid());
create policy "borrar propio" on garajes for delete to authenticated using (propietario = auth.uid());

-- ¿Es mío este garaje? (security definer: comprueba el dueño sin exponer la columna "propietario")
create or replace function es_mi_garaje(id_garaje uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garajes where id = id_garaje and propietario = auth.uid())
$$;
revoke all on function es_mi_garaje(uuid) from public, anon;
grant execute on function es_mi_garaje(uuid) to authenticated;

drop policy if exists "solo el dueño" on garajes_privado;
create policy "solo el dueño" on garajes_privado for all to authenticated
  using (es_mi_garaje(garaje_id))
  with check (es_mi_garaje(garaje_id));

-- Nadie (ni anónimos) puede leer quién es el dueño desde la API pública
revoke all on garajes, garajes_privado from anon, authenticated;
grant select (id, titulo, descripcion, tipo, precio_hora, precio_dia, precio_mes, disponibilidad,
              altura_max, acceso, enchufe, foto, lat_aprox, lon_aprox, activo, creado, actualizado)
  on garajes to anon, authenticated;
grant insert (titulo, descripcion, tipo, precio_hora, precio_dia, precio_mes, disponibilidad,
              altura_max, acceso, enchufe, foto, lat_aprox, lon_aprox, activo)
  on garajes to authenticated;
grant update (titulo, descripcion, tipo, precio_hora, precio_dia, precio_mes, disponibilidad,
              altura_max, acceso, enchufe, foto, lat_aprox, lon_aprox, activo)
  on garajes to authenticated;
grant delete on garajes to authenticated;
grant select, insert, update, delete on garajes_privado to authenticated;
grant all on garajes, garajes_privado to service_role;

-- "Mis garajes": el dueño ve los suyos (incluida la columna propietario) mediante esta función
create or replace function mis_garajes() returns setof garajes
language sql stable security definer set search_path = public as $$
  select * from garajes where propietario = auth.uid() order by creado desc
$$;
revoke all on function mis_garajes() from public, anon;
grant execute on function mis_garajes() to authenticated;

-- ---------- Fotos (Supabase Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garajes', 'garajes', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/webp'];

drop policy if exists "garajes: subir en mi carpeta" on storage.objects;
drop policy if exists "garajes: cambiar en mi carpeta" on storage.objects;
drop policy if exists "garajes: borrar en mi carpeta" on storage.objects;
create policy "garajes: subir en mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'garajes' and tiene_cuenta() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "garajes: cambiar en mi carpeta" on storage.objects for update to authenticated
  using (bucket_id = 'garajes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "garajes: borrar en mi carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'garajes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Varias fotos por garaje (hasta 6; la primera es la portada) ----------
alter table garajes add column if not exists fotos text[] not null default '{}';
alter table garajes drop constraint if exists garajes_max_fotos;
alter table garajes add constraint garajes_max_fotos check (cardinality(fotos) <= 6);
-- Los garajes antiguos con una sola foto pasan a tenerla como primera de la lista
update garajes set fotos = array[foto] where foto is not null and cardinality(fotos) = 0;
grant select (fotos) on garajes to anon, authenticated;
grant insert (fotos), update (fotos) on garajes to authenticated;
-- mis_garajes() devuelve "setof garajes": se recrea para incluir la columna nueva
create or replace function mis_garajes() returns setof garajes
language sql stable security definer set search_path = public as $$
  select * from garajes where propietario = auth.uid() order by creado desc
$$;

-- ---------- Calendario: horario semanal y días bloqueados ----------
-- horario: 7 elementos (de lunes a domingo); cada uno null (ese día no se alquila) o [desde, hasta] en
-- minutos desde las 00:00, en múltiplos de 15 (hasta = 1440 es medianoche). horario null = disponible siempre.
-- bloqueados: días sueltos en los que no se alquila (vacaciones, lo usa el dueño...).
-- Las mismas reglas están en src/lib/disponibilidad.ts para la pantalla.
create or replace function horario_valido(h jsonb) returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
  hay_alguno boolean := false;
begin
  if h is null then return true; end if;
  if jsonb_typeof(h) <> 'array' or jsonb_array_length(h) <> 7 then return false; end if;
  for e in select value from jsonb_array_elements(h) loop
    continue when jsonb_typeof(e) = 'null';
    if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
       or jsonb_typeof(e -> 0) <> 'number' or jsonb_typeof(e -> 1) <> 'number' then
      return false;
    end if;
    if (e ->> 0)::numeric < 0 or (e ->> 1)::numeric > 1440 or (e ->> 0)::numeric >= (e ->> 1)::numeric
       or (e ->> 0)::numeric % 15 <> 0 or (e ->> 1)::numeric % 15 <> 0 then
      return false;
    end if;
    hay_alguno := true;
  end loop;
  return hay_alguno;  -- al menos un día disponible
end $$;

alter table garajes add column if not exists horario jsonb;
alter table garajes add column if not exists bloqueados date[] not null default '{}';
alter table garajes drop constraint if exists garajes_horario_valido;
alter table garajes add constraint garajes_horario_valido check (horario_valido(horario));
alter table garajes drop constraint if exists garajes_max_bloqueados;
alter table garajes add constraint garajes_max_bloqueados check (cardinality(bloqueados) <= 400);
grant select (horario, bloqueados) on garajes to anon, authenticated;
grant insert (horario, bloqueados), update (horario, bloqueados) on garajes to authenticated;

-- Los días bloqueados se guardan ordenados, sin repetir y sin los que ya han pasado
create or replace function garajes_ordenar_bloqueados() returns trigger
language plpgsql as $$
begin
  new.bloqueados := array(select distinct b from unnest(coalesce(new.bloqueados, '{}')) b
                          where b >= current_date - 1 order by b);
  return new;
end $$;
drop trigger if exists garajes_ordenar_bloqueados on garajes;
create trigger garajes_ordenar_bloqueados before insert or update of bloqueados on garajes
  for each row execute function garajes_ordenar_bloqueados();

-- Zona horaria del garaje: Canarias va una hora por detrás de la península
create or replace function zona_garaje(lon double precision) returns text
language sql immutable as $$
  select case when lon < -12 then 'Atlantic/Canary' else 'Europe/Madrid' end
$$;

-- ¿Está el garaje disponible durante todo [p_inicio, p_fin)? (horario semanal y días bloqueados)
-- La usa supabase/reservas.sql al crear cada solicitud.
create or replace function garaje_disponible(id_garaje uuid, p_inicio timestamptz, p_fin timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  g garajes%rowtype;
  zona text;
  t timestamptz := p_inicio;
  siguiente timestamptz;
  local_ts timestamp;
  dia date;
  tramo jsonb;
  minuto numeric;
  vueltas int := 0;
begin
  select * into g from garajes where id = id_garaje;
  if not found or p_fin <= p_inicio then return false; end if;
  zona := zona_garaje(g.lon_aprox);
  if exists (
    select 1 from unnest(g.bloqueados) b
    where b between (p_inicio at time zone zona)::date and ((p_fin - interval '1 second') at time zone zona)::date
  ) then
    return false;
  end if;
  if g.horario is null then return true; end if;
  -- Avanza tramo a tramo: cada momento de la reserva tiene que caer dentro del horario de su día
  while t < p_fin loop
    vueltas := vueltas + 1;
    if vueltas > 400 then return false; end if;
    local_ts := t at time zone zona;
    dia := local_ts::date;
    tramo := g.horario -> (extract(isodow from dia)::int - 1);
    if tramo is null or jsonb_typeof(tramo) <> 'array' then return false; end if;
    minuto := extract(epoch from (local_ts - dia::timestamp)) / 60;
    if minuto < (tramo ->> 0)::numeric or minuto >= (tramo ->> 1)::numeric then return false; end if;
    siguiente := (dia::timestamp + make_interval(mins => (tramo ->> 1)::int)) at time zone zona;
    if siguiente <= t then return false; end if;
    t := siguiente;
  end loop;
  return true;
end $$;
revoke all on function garaje_disponible(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------- Reserva instantánea ----------
-- Si el dueño la activa, las solicitudes dentro de su horario quedan aceptadas solas (supabase/reservas.sql;
-- con pago en la app, al retenerse el pago: supabase/pagos.sql). Las que empiezan muy pronto siguen siendo solicitud.
alter table garajes add column if not exists instantanea boolean not null default false;
grant select (instantanea) on garajes to anon, authenticated;
grant insert (instantanea), update (instantanea) on garajes to authenticated;

-- ---------- Nota media (la mantiene supabase/valoraciones.sql; nadie puede cambiarla a mano) ----------
alter table garajes add column if not exists nota numeric(2,1);
alter table garajes add column if not exists num_valoraciones int not null default 0;
grant select (nota, num_valoraciones) on garajes to anon, authenticated;

-- Antelación mínima para aceptar sola una reserva (el dueño necesita tiempo para dar el mando o la llave)
create or replace function antelacion_instantanea() returns interval
language sql immutable as $$ select interval '2 hours' $$;

-- Se recrea para incluir las columnas nuevas
create or replace function mis_garajes() returns setof garajes
language sql stable security definer set search_path = public as $$
  select * from garajes where propietario = auth.uid() order by creado desc
$$;
