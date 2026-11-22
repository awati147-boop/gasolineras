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
