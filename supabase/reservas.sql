-- Reservas de garajes y chat entre conductor y dueño.
-- Requiere haber ejecutado antes supabase/garajes.sql (entero: usa su función garaje_disponible).
-- Los pagos en la app van aparte (supabase/pagos.sql).
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
  cancelada_por text,                                                      -- conductor, propietario o sistema
  creada      timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  check (fin > inicio),
  check (fin - inicio <= interval '93 days')
);
-- Matrícula (opcional): solo la ven el dueño y el conductor; se borra sola al día siguiente de terminar
alter table reservas add column if not exists matricula text
  check (matricula is null or matricula ~ '^[A-Z0-9]{2,10}$');

-- Quién la canceló: "sistema" = automáticamente (no se pagó o el dueño no respondió a tiempo)
alter table reservas drop constraint if exists reservas_cancelada_por_check;
alter table reservas add constraint reservas_cancelada_por_check
  check (cancelada_por in ('conductor', 'propietario', 'sistema'));

-- ¿Se paga en la app? Lo decide la base de datos al crearla (supabase/pagos.sql); el móvil no puede elegirlo
alter table reservas add column if not exists con_pago boolean not null default false;

-- ¿Se aceptó sola (reserva instantánea del garaje)? Lo decide la base de datos
alter table reservas add column if not exists instantanea boolean not null default false;

-- Nunca dos reservas aceptadas del mismo garaje que se solapen (aunque el dueño acepte dos a la vez)
create extension if not exists btree_gist with schema extensions;
do $$ begin
  alter table reservas add constraint reservas_sin_solape
    exclude using gist (garaje_id with =, tstzrange(inicio, fin) with &&) where (estado = 'aceptada');
exception
  when duplicate_object or duplicate_table then null;
  when exclusion_violation then
    raise exception 'Hay reservas aceptadas del mismo garaje que se solapan. Cancela una de ellas y vuelve a ejecutar este archivo';
end $$;

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
  -- Cambios del administrador (SQL Editor / service_role) o automáticos de los pagos: sin comprobaciones
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or current_setting('app.sistema', true) = 'si' then
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
    if exists (
      select 1 from reservas r
      where r.garaje_id = new.garaje_id and r.estado = 'aceptada'
        and tstzrange(r.inicio, r.fin) && tstzrange(new.inicio, new.fin)
    ) then
      raise exception 'Esas horas ya están reservadas. Elige otras';
    end if;
    -- Horario del dueño y días bloqueados (supabase/garajes.sql)
    if not garaje_disponible(new.garaje_id, new.inicio, new.fin) then
      raise exception 'El garaje no está disponible en ese horario. Elige otro en el calendario';
    end if;
    -- Matrícula: mayúsculas, sin espacios ni guiones; vacía = sin matrícula
    new.matricula := nullif(upper(regexp_replace(coalesce(new.matricula, ''), '[^A-Za-z0-9]', '', 'g')), '');

    -- Precio según la modalidad (redondeando hacia arriba). En días y meses se descuenta 1 hora de margen:
    -- el día del cambio de hora de octubre dura 25 h y no debe cobrarse como 2 días.
    if new.modalidad = 'horas' then
      if g.precio_hora is null then raise exception 'Este garaje no se alquila por horas'; end if;
      unidades := ceil(extract(epoch from (new.fin - new.inicio)) / 3600);
      new.precio := unidades * g.precio_hora;
    elsif new.modalidad = 'dias' then
      if g.precio_dia is null then raise exception 'Este garaje no se alquila por días'; end if;
      unidades := greatest(1, ceil((extract(epoch from (new.fin - new.inicio)) - 3600) / 86400));
      new.precio := unidades * g.precio_dia;
    else
      if g.precio_mes is null then raise exception 'Este garaje no se alquila por meses'; end if;
      unidades := greatest(1, ceil((extract(epoch from (new.fin - new.inicio)) - 3600) / (86400 * 30)));
      new.precio := unidades * g.precio_mes;
    end if;

    new.conductor := auth.uid();
    new.propietario := g.propietario;
    new.con_pago := false;  -- si el dueño cobra en la app, lo activa el trigger de supabase/pagos.sql
    new.instantanea := false;  -- lo decide reservas_reserva_instantanea (más abajo)
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
  if (new.garaje_id, new.conductor, new.propietario, new.modalidad, new.inicio, new.fin, new.precio, new.creada, new.matricula, new.con_pago, new.instantanea)
     is distinct from
     (old.garaje_id, old.conductor, old.propietario, old.modalidad, old.inicio, old.fin, old.precio, old.creada, old.matricula, old.con_pago, old.instantanea) then
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

-- Reserva instantánea: si el garaje la tiene activada, la solicitud nace aceptada.
-- Va después de reservas_antes y de reservas_pago_antes (los triggers van por orden alfabético): con pago
-- en la app no se acepta aquí, sino al retenerse el pago (supabase/pagos.sql).
create or replace function reservas_reserva_instantanea() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or current_setting('app.sistema', true) = 'si' then
    return new;
  end if;
  if new.estado = 'pendiente' and not new.con_pago
     and new.inicio >= now() + antelacion_instantanea()
     and (select g.instantanea from garajes g where g.id = new.garaje_id) then
    new.estado := 'aceptada';
    new.instantanea := true;
  end if;
  return new;
end $$;
drop trigger if exists reservas_reserva_instantanea on reservas;
create trigger reservas_reserva_instantanea before insert on reservas
  for each row execute function reservas_reserva_instantanea();

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
grant insert (garaje_id, modalidad, inicio, fin, matricula) on reservas to authenticated;
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
-- Estado del pago de una reserva (null si no se paga en la app o si aún no se ha ejecutado pagos.sql)
create or replace function estado_pago(id_reserva uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.pagos') is null then return null; end if;
  return (select p.estado from pagos p where p.reserva_id = id_reserva);
end $$;
revoke all on function estado_pago(uuid) from public, anon, authenticated;

-- Valoraciones de una reserva para quien la mira (null si aún no se ha ejecutado valoraciones.sql):
-- "mia" = las estrellas que puse yo; al dueño, además, la nota del conductor en otras reservas
create or replace function valoracion_de(id_reserva uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r reservas%rowtype;
  mia smallint;
  nota numeric;
  num int;
begin
  if to_regclass('public.valoraciones') is null then return null; end if;
  select * into r from reservas where id = id_reserva;
  if not found or auth.uid() is null or auth.uid() not in (r.conductor, r.propietario) then return null; end if;
  select v.estrellas into mia from valoraciones v where v.reserva_id = id_reserva and v.autor = auth.uid();
  if auth.uid() = r.propietario then
    select round(avg(v.estrellas)::numeric, 1), count(*) into nota, num
    from valoraciones v where v.valorado = r.conductor and v.rol = 'propietario' and not v.oculta;
  end if;
  return jsonb_build_object('mia', mia, 'nota_conductor', nota, 'num_conductor', coalesce(num, 0));
end $$;
revoke all on function valoracion_de(uuid) from public, anon, authenticated;

-- Mis reservas (como conductor y como dueño) con los datos del garaje, aunque esté pausado
drop function if exists mis_reservas(); -- se borra antes porque cambian las columnas que devuelve
create function mis_reservas()
returns table (
  id uuid, garaje_id uuid, titulo text, foto text, rol text, modalidad text,
  inicio timestamptz, fin timestamptz, precio numeric, estado text, cancelada_por text,
  creada timestamptz, ultimo_mensaje timestamptz, matricula text, con_pago boolean, pago text, instantanea boolean,
  valoracion jsonb
)
language sql stable security definer set search_path = public as $$
  select r.id, r.garaje_id, g.titulo, g.foto,
         case when r.conductor = auth.uid() then 'conductor' else 'propietario' end,
         r.modalidad, r.inicio, r.fin, r.precio, r.estado, r.cancelada_por, r.creada,
         (select max(m.creado) from mensajes m where m.reserva_id = r.id),
         r.matricula, r.con_pago, case when r.con_pago then estado_pago(r.id) end, r.instantanea,
         valoracion_de(r.id)
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

-- Horas ya reservadas de un garaje (solo inicio y fin, sin saber quién), para mostrarlas en gris al reservar
create or replace function horas_ocupadas(id_garaje uuid)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = public as $$
  select r.inicio, r.fin
  from reservas r join garajes g on g.id = r.garaje_id and g.activo
  where r.garaje_id = id_garaje and r.estado = 'aceptada'
    and r.fin > now() and r.inicio < now() + interval '13 months'
  order by r.inicio
  limit 300
$$;
revoke all on function horas_ocupadas(uuid) from public;
grant execute on function horas_ocupadas(uuid) to anon, authenticated;

-- Borrar las matrículas al día siguiente de terminar cada reserva (todas las noches)
create extension if not exists pg_cron;
select cron.schedule('borrar-matriculas', '17 4 * * *',
  $$update public.reservas set matricula = null where matricula is not null and fin < now() - interval '1 day'$$);
