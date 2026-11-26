-- Valoraciones: al terminar una reserva aceptada, el conductor valora el garaje y el dueño al conductor.
-- Requiere garajes.sql y reservas.sql (y avisos.sql para recordar que se valore). Idempotente.
-- La nota media de cada garaje se guarda en garajes.nota / garajes.num_valoraciones (columnas de garajes.sql).
-- Los comentarios se muestran sin nombre. Una opinión denunciada por 2 personas se oculta sola (denuncias.sql).

create table if not exists valoraciones (
  id          uuid primary key default gen_random_uuid(),
  reserva_id  uuid not null references reservas(id) on delete cascade,
  autor       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rol         text not null check (rol in ('conductor', 'propietario')),   -- quién valora
  garaje_id   uuid not null references garajes(id) on delete cascade,
  valorado    uuid not null references auth.users(id) on delete cascade,   -- el dueño (si valora el conductor) o el conductor
  estrellas   smallint not null check (estrellas between 1 and 5),
  comentario  text check (char_length(comentario) <= 300),
  oculta      boolean not null default false,                               -- denunciada: ni se muestra ni cuenta
  creada      timestamptz not null default now(),
  unique (reserva_id, rol)                                                  -- una por reserva y lado
);
create index if not exists valoraciones_garaje on valoraciones (garaje_id, creada desc) where rol = 'conductor';
create index if not exists valoraciones_valorado on valoraciones (valorado) where rol = 'propietario';

-- Solo quien participó, cuando la reserva aceptada ya ha terminado y como mucho 30 días después.
-- Todo lo demás (autor, a quién, garaje) lo pone la base de datos.
create or replace function valoraciones_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  select * into r from reservas where id = new.reserva_id;
  if not found or auth.uid() is null or auth.uid() not in (r.conductor, r.propietario) then
    raise exception 'Solo puedes valorar tus propias reservas';
  end if;
  if r.estado <> 'aceptada' or r.fin > now() then
    raise exception 'Podrás valorarla cuando termine la reserva';
  end if;
  if r.fin < now() - interval '30 days' then
    raise exception 'Ya ha pasado el plazo para valorar esta reserva';
  end if;
  new.autor := auth.uid();
  new.rol := case when auth.uid() = r.conductor then 'conductor' else 'propietario' end;
  new.garaje_id := r.garaje_id;
  new.valorado := case when new.rol = 'conductor' then r.propietario else r.conductor end;
  new.comentario := nullif(btrim(coalesce(new.comentario, '')), '');
  new.oculta := false;
  new.creada := now();
  return new;
end $$;
drop trigger if exists valoraciones_antes on valoraciones;
create trigger valoraciones_antes before insert on valoraciones
  for each row execute function valoraciones_antes();

-- Nota media del garaje (solo lo que valoran los conductores y no está oculto)
create or replace function valoraciones_recalcular(id_garaje uuid) returns void
language sql security definer set search_path = public as $$
  update garajes g
  set nota = s.media, num_valoraciones = s.total
  from (
    select round(avg(estrellas)::numeric, 1) as media, count(*)::int as total
    from valoraciones where garaje_id = id_garaje and rol = 'conductor' and not oculta
  ) s
  where g.id = id_garaje
$$;
revoke all on function valoraciones_recalcular(uuid) from public, anon, authenticated;

create or replace function valoraciones_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform valoraciones_recalcular(case when tg_op = 'DELETE' then old.garaje_id else new.garaje_id end);
  return null;
end $$;
drop trigger if exists valoraciones_despues on valoraciones;
create trigger valoraciones_despues after insert or delete or update of oculta on valoraciones
  for each row execute function valoraciones_despues();

-- ---------- Seguridad ----------
alter table valoraciones enable row level security;
drop policy if exists "ver las mías" on valoraciones;
drop policy if exists "valorar" on valoraciones;
create policy "ver las mías" on valoraciones for select to authenticated using (auth.uid() in (autor, valorado));
create policy "valorar" on valoraciones for insert to authenticated with check (autor = auth.uid());
revoke all on valoraciones from anon, authenticated;
grant select on valoraciones to authenticated;
grant insert (reserva_id, estrellas, comentario) on valoraciones to authenticated;
grant all on valoraciones to service_role;

-- Opiniones públicas de un garaje (sin quién las escribió)
create or replace function valoraciones_garaje(id_garaje uuid)
returns table (id uuid, estrellas smallint, comentario text, creada timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.estrellas, v.comentario, v.creada
  from valoraciones v join garajes g on g.id = v.garaje_id and g.activo
  where v.garaje_id = id_garaje and v.rol = 'conductor' and not v.oculta
  order by v.creada desc
  limit 10
$$;
revoke all on function valoraciones_garaje(uuid) from public;
grant execute on function valoraciones_garaje(uuid) to anon, authenticated;

-- ---------- Recordatorio: "¿qué tal fue?" al terminar cada reserva (cada hora) ----------
create or replace function valoraciones_recordar() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if to_regprocedure('public.avisar(uuid,text,text,text,text)') is null then return; end if;
  for r in
    select x.id, x.conductor, x.propietario, g.titulo
    from reservas x join garajes g on g.id = x.garaje_id
    -- La hora en punto anterior entera: aunque la tarea se retrase unos segundos, cada reserva se avisa una vez
    where x.estado = 'aceptada' and x.fin <= date_trunc('hour', now()) and x.fin > date_trunc('hour', now()) - interval '1 hour'
  loop
    perform avisar(r.conductor, '⭐ ¿Qué tal en «' || r.titulo || '»?', 'Valóralo en un momento: ayudas a otros conductores',
                   '/cuenta/reservas/' || r.id, 'valorar-' || r.id);
    perform avisar(r.propietario, '⭐ ¿Qué tal el conductor?', 'Valora la reserva de «' || r.titulo || '»',
                   '/cuenta/reservas/' || r.id, 'valorar-' || r.id);
  end loop;
end $$;
revoke all on function valoraciones_recordar() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('valorar', '7 * * * *', $$select public.valoraciones_recordar()$$);
