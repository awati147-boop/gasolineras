-- Reservas de garajes y chat entre conductor y dueño (fase A: sin pagos).
-- Requiere haber ejecutado antes supabase/garajes.sql.
-- Pegar en Supabase > SQL Editor. Idempotente: se puede ejecutar varias veces.

-- ---------- Reservas ----------
create table if not exists reservas (
  id          uuid primary key default gen_random_uuid(),
  garaje_id   uuid not null references garajes(id) on delete cascade,
  conductor   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  propietario uuid not null references auth.users(id) on delete cascade,  -- copiado del garaje por el trigger
  modalidad   text not null check (modalidad in ('horas', 'dias', 'mes')),
  inicio      timestamptz not null,
  fin         timestamptz not null,
  precio      numeric(8,2) not null,                                       -- calculado por el servidor
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  cancelada_por text check (cancelada_por in ('conductor', 'propietario')),
  creada      timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  check (fin > inicio),
  check (fin - inicio <= interval '93 days')
);
create index if not exists reservas_conductor on reservas (conductor, creada desc);
create index if not exists reservas_propietario on reservas (propietario, creada desc);
create index if not exists reservas_garaje on reservas (garaje_id, estado);

-- Valida y completa cada reserva. El móvil solo puede elegir garaje, modalidad y fechas (al crear)
-- y el estado (al actualizar); todo lo demás lo decide el servidor.
create or replace function reservas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g garajes%rowtype;
  unidades numeric;
  soy text;
begin
  -- Cambios del administrador (SQL Editor / service_role): sin comprobaciones
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    new.actualizada := now();
    return new;
  end if;
  if not tiene_cuenta() then
    raise exception 'Necesitas una cuenta para reservar';
  end if;

  if tg_op = 'INSERT' then
    select * into g from garajes where id = new.garaje_id;
    if not found or not g.activo then
      raise exception 'Este garaje no está disponible';
    end if;
    if g.propietario = auth.uid() then
      raise exception 'No puedes reservar tu propio garaje';
    end if;
    if new.inicio < now() - interval '15 minutes' then
      raise exception 'La reserva no puede empezar en el pasado';
    end if;
    if new.inicio > now() + interval '1 year' then
      raise exception 'Solo se puede reservar con un año de antelación como máximo';
    end if;
    if (select count(*) from reservas where conductor = auth.uid() and estado = 'pendiente') >= 5 then
      raise exception 'Tienes demasiadas solicitudes pendientes. Espera a que te respondan';
    end if;

    -- Precio según la modalidad (redondeando hacia arriba)
    if new.modalidad = 'horas' then
      if g.precio_hora is null then raise exception 'Este garaje no se alquila por horas'; end if;
      unidades := ceil(extract(epoch from (new.fin - new.inicio)) / 3600);
      new.precio := unidades * g.precio_hora;
    elsif new.modalidad = 'dias' then
      if g.precio_dia is null then raise exception 'Este garaje no se alquila por días'; end if;
      unidades := ceil(extract(epoch from (new.fin - new.inicio)) / 86400);
      new.precio := unidades * g.precio_dia;
    else
      if g.precio_mes is null then raise exception 'Este garaje no se alquila por meses'; end if;
      unidades := ceil(extract(epoch from (new.fin - new.inicio)) / (86400 * 30));
      new.precio := unidades * g.precio_mes;
    end if;

    new.conductor := auth.uid();
    new.propietario := g.propietario;
    new.estado := 'pendiente';
    new.cancelada_por := null;
    new.creada := now();
    new.actualizada := now();
    return new;
  end if;

  -- UPDATE: solo cambia el estado, y solo por los caminos permitidos
  soy := case when auth.uid() = old.propietario then 'propietario'
              when auth.uid() = old.conductor then 'conductor' end;
  if soy is null then
    raise exception 'Esta reserva no es tuya';
  end if;
  if (new.garaje_id, new.conductor, new.propietario, new.modalidad, new.inicio, new.fin, new.precio, new.creada)
     is distinct from
     (old.garaje_id, old.conductor, old.propietario, old.modalidad, old.inicio, old.fin, old.precio, old.creada) then
    raise exception 'Solo se puede cambiar el estado de la reserva';
  end if;

  if new.estado is distinct from old.estado then
    if old.estado = 'pendiente' and new.estado in ('aceptada', 'rechazada') and soy = 'propietario' then
      if new.estado = 'aceptada' and exists (
        select 1 from reservas r
        where r.garaje_id = old.garaje_id and r.estado = 'aceptada' and r.id <> old.id
          and tstzrange(r.inicio, r.fin) && tstzrange(old.inicio, old.fin)
      ) then
        raise exception 'Ya tienes otra reserva aceptada en esas fechas';
      end if;
    elsif old.estado in ('pendiente', 'aceptada') and new.estado = 'cancelada' then
      new.cancelada_por := soy;
    else
      raise exception 'Ese cambio de estado no está permitido';
    end if;
  end if;
  new.actualizada := now();
  return new;
end $$;

drop trigger if exists reservas_antes on reservas;
create trigger reservas_antes before insert or update on reservas
  for each row execute function reservas_antes();

alter table reservas enable row level security;
drop policy if exists "ver mis reservas" on reservas;
drop policy if exists "crear reserva" on reservas;
drop policy if exists "cambiar estado" on reservas;
create policy "ver mis reservas" on reservas for select to authenticated
  using (auth.uid() in (conductor, propietario));
create policy "crear reserva" on reservas for insert to authenticated
  with check (tiene_cuenta() and conductor = auth.uid());
create policy "cambiar estado" on reservas for update to authenticated
  using (auth.uid() in (conductor, propietario))
  with check (auth.uid() in (conductor, propietario));

revoke all on reservas from anon, authenticated;
grant select on reservas to authenticated;
grant insert (garaje_id, modalidad, inicio, fin) on reservas to authenticated;
grant update (estado) on reservas to authenticated;
grant all on reservas to service_role;

-- ---------- Mensajes (chat de cada reserva) ----------
create table if not exists mensajes (
  id         bigint generated always as identity primary key,
  reserva_id uuid not null references reservas(id) on delete cascade,
  autor      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto      text not null check (char_length(btrim(texto)) between 1 and 1000),
  creado     timestamptz not null default now()
);
create index if not exists mensajes_reserva on mensajes (reserva_id, creado);

-- ¿Participo en esta reserva? (security definer para usarlo en las políticas sin recursión)
create or replace function participo_en(id_reserva uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reservas where id = id_reserva and auth.uid() in (conductor, propietario))
$$;
revoke all on function participo_en(uuid) from public, anon;
grant execute on function participo_en(uuid) to authenticated;

create or replace function mensajes_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  if not participo_en(new.reserva_id) then
    raise exception 'No participas en esta reserva';
  end if;
  -- Antiabuso: como máximo 30 mensajes por minuto y persona
  if (select count(*) from mensajes where autor = auth.uid() and creado > now() - interval '1 minute') >= 30 then
    raise exception 'Estás enviando mensajes demasiado rápido';
  end if;
  new.autor := auth.uid();
  new.creado := now();
  new.texto := btrim(new.texto);
  return new;
end $$;
drop trigger if exists mensajes_antes on mensajes;
create trigger mensajes_antes before insert on mensajes
  for each row execute function mensajes_antes();

alter table mensajes enable row level security;
drop policy if exists "leer mensajes de mis reservas" on mensajes;
drop policy if exists "escribir en mis reservas" on mensajes;
create policy "leer mensajes de mis reservas" on mensajes for select to authenticated
  using (participo_en(reserva_id));
create policy "escribir en mis reservas" on mensajes for insert to authenticated
  with check (participo_en(reserva_id) and autor = auth.uid());

revoke all on mensajes from anon, authenticated;
grant select on mensajes to authenticated;
grant insert (reserva_id, texto) on mensajes to authenticated;
grant all on mensajes to service_role;

-- Chat en tiempo real (Supabase Realtime respeta las políticas de lectura)
do $$ begin
  alter publication supabase_realtime add table mensajes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table reservas;
exception when duplicate_object then null; end $$;

-- ---------- Vistas para las pantallas ----------
-- Mis reservas (como conductor y como dueño) con los datos del garaje, aunque esté pausado
create or replace function mis_reservas()
returns table (
  id uuid, garaje_id uuid, titulo text, foto text, rol text, modalidad text,
  inicio timestamptz, fin timestamptz, precio numeric, estado text, cancelada_por text,
  creada timestamptz, ultimo_mensaje timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.garaje_id, g.titulo, g.foto,
         case when r.conductor = auth.uid() then 'conductor' else 'propietario' end,
         r.modalidad, r.inicio, r.fin, r.precio, r.estado, r.cancelada_por, r.creada,
         (select max(m.creado) from mensajes m where m.reserva_id = r.id)
  from reservas r join garajes g on g.id = r.garaje_id
  where auth.uid() in (r.conductor, r.propietario)
  order by coalesce((select max(m.creado) from mensajes m where m.reserva_id = r.id), r.creada) desc
$$;
revoke all on function mis_reservas() from public, anon;
grant execute on function mis_reservas() to authenticated;

-- Dirección exacta: solo para el dueño, o para el conductor si la reserva está aceptada
create or replace function direccion_reserva(id_reserva uuid)
returns table (lat double precision, lon double precision, direccion text, indicaciones text)
language sql stable security definer set search_path = public as $$
  select p.lat, p.lon, p.direccion, p.indicaciones
  from reservas r join garajes_privado p on p.garaje_id = r.garaje_id
  where r.id = id_reserva
    and (r.propietario = auth.uid() or (r.conductor = auth.uid() and r.estado = 'aceptada'))
$$;
revoke all on function direccion_reserva(uuid) from public, anon;
grant execute on function direccion_reserva(uuid) to authenticated;
