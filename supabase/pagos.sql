-- Pagos en la app (EN PRUEBAS): el conductor paga con tarjeta al reservar y el dueño cobra por la app.
-- Requiere garajes.sql, reservas.sql y avisos.sql. Pegar en Supabase > SQL Editor. Idempotente.
-- DESPUÉS ejecutar supabase/pagos-config.local.sql (clave secreta y modo; no se sube a git).
--
-- Cómo funciona
--  · Solo cobran en la app los dueños que lo activan y verifican su cuenta de cobro (la identidad y el IBAN los
--    guarda el proveedor de pagos, no nosotros). Los demás garajes siguen con el pago directo de siempre.
--  · Al pedir la reserva, el conductor paga con tarjeta, pero solo se RETIENE el importe.
--  · Si el dueño acepta, se cobra. Si rechaza, no responde en 48 h o se cancela antes, se libera (no se cobra).
--  · Cancelación (condiciones de uso): hasta 24 h antes del inicio se devuelve todo; después, no.
--    Si cancela el dueño (o se borra la reserva o el garaje), se devuelve todo.
--  · El dueño recibe su precio menos el 3 % 24 h después del inicio (margen para reclamaciones).
--  · La base de datos decide QUÉ toca hacer y la web (con la clave secreta) lo hace en el proveedor de pagos
--    y lo apunta aquí. Nadie puede leer estas tablas desde la API pública.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------- Configuración privada (modo y clave secreta compartida con la web) ----------
create table if not exists pagos_config (
  id      int primary key default 1 check (id = 1),
  modo    text not null default 'apagado' check (modo in ('apagado', 'prueba', 'real')),
  secreto text not null check (char_length(secreto) >= 32),
  url     text check (url is null or url like 'https://%/api/pagos/tareas')  -- para que la base de datos avise a la web
);
alter table pagos_config enable row level security;  -- sin políticas: nadie la lee desde la API
revoke all on pagos_config from anon, authenticated;

-- La web demuestra que es ella con la clave secreta (igual que en los avisos)
create or replace function pagos_comprobar(p_secreto text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secreto is null or not exists (select 1 from pagos_config where id = 1 and secreto = p_secreto) then
    raise exception 'Clave de pagos incorrecta';
  end if;
end $$;
revoke all on function pagos_comprobar(text) from public, anon, authenticated;

-- ---------- Cuentas de cobro de los dueños ----------
create table if not exists cuentas_cobro (
  usuario     uuid primary key references auth.users(id) on delete cascade,
  cuenta      text not null unique,             -- id de la cuenta en el proveedor de pagos (acct_…)
  es_real     boolean not null,                 -- false = cuenta de prueba
  activa      boolean not null default false,   -- verificada y lista para recibir transferencias
  actualizada timestamptz not null default now()
);
alter table cuentas_cobro enable row level security;
revoke all on cuentas_cobro from anon, authenticated;
grant all on cuentas_cobro to service_role;

-- ¿Cobra este dueño en la app? (pagos encendidos y cuenta verificada del mismo modo: prueba o real)
create or replace function cobra_en_app(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cuentas_cobro c join pagos_config k on k.id = 1
    where c.usuario = p_usuario and c.activa and k.modo <> 'apagado' and c.es_real = (k.modo = 'real')
  )
$$;
revoke all on function cobra_en_app(uuid) from public, anon, authenticated;

-- Para la pantalla de reservar: ¿este garaje se paga en la app?
create or replace function garaje_cobra_en_app(id_garaje uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select cobra_en_app(g.propietario) from garajes g where g.id = id_garaje and g.activo), false)
$$;
revoke all on function garaje_cobra_en_app(uuid) from public;
grant execute on function garaje_cobra_en_app(uuid) to anon, authenticated;

-- ---------- Tarifas (las mismas que en src/lib/pagos.ts) ----------
-- Tarifa de servicio del conductor: 10 %, mínimo 0,50 €. Comisión del dueño: 3 %.
create or replace function tarifa_servicio(p_precio numeric) returns numeric
language sql immutable as $$ select greatest(round(p_precio * 0.10, 2), 0.50) $$;
create or replace function comision_dueno(p_precio numeric) returns numeric
language sql immutable as $$ select round(p_precio * 0.03, 2) $$;

-- ---------- Pagos (uno por reserva con pago) ----------
-- Sin clave ajena a reservas: si se borra la reserva (o el garaje), el pago queda para devolver el dinero
-- y para la contabilidad.
create table if not exists pagos (
  reserva_id    uuid primary key,
  estado        text not null default 'por_pagar' check (estado in
                ('por_pagar', 'autorizado', 'cobrado', 'transferido', 'devuelto', 'anulado', 'fallido')),
  es_real       boolean not null,
  cuenta        text not null,                   -- cuenta de cobro del dueño al reservar
  precio        numeric(8,2) not null,           -- lo que cobra el dueño (su precio)
  tarifa        numeric(8,2) not null,           -- tarifa de servicio que paga el conductor
  comision      numeric(8,2) not null,           -- 3 % que se descuenta al dueño
  total         numeric(8,2) not null,           -- lo que paga el conductor = precio + tarifa
  para_dueno    numeric(8,2) not null,           -- precio − comisión
  devuelto      numeric(8,2) not null default 0,
  cancelada     timestamptz,                     -- cuándo se canceló la reserva (para la política de 24 h)
  retener       boolean not null default false,  -- el administrador puede frenar la transferencia (reclamación)
  por_revisar   boolean not null default false,  -- hay algo que hacer en el proveedor de pagos
  version       int not null default 0,          -- para que dos procesos no pisen el mismo cambio
  sesion        text,                            -- página de pago (cs_…)
  pago          text,                            -- pago (pi_…)
  cargo         text,                            -- cargo en la tarjeta (ch_…)
  transferencia text,                            -- transferencia al dueño (tr_…)
  error         text,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);
alter table pagos add column if not exists aceptada timestamptz;  -- cuándo aceptó el dueño
create index if not exists pagos_revisar on pagos (actualizado) where por_revisar;
create index if not exists pagos_cobrados on pagos (estado) where estado in ('por_pagar', 'autorizado', 'cobrado');
alter table pagos enable row level security;
revoke all on pagos from anon, authenticated;
grant all on pagos to service_role;

-- Cuánto hay que devolver al conductor según la política de cancelación
create or replace function pago_a_devolver(p pagos, r reservas) returns numeric
language sql stable as $$
  select case
    when p.estado not in ('cobrado', 'transferido') then 0            -- no se llegó a cobrar: se libera, nada que devolver
    when r.id is null then p.total                                    -- se borró la reserva o el garaje
    when r.estado = 'rechazada' then p.total
    when r.estado <> 'cancelada' then 0
    when r.cancelada_por in ('propietario', 'sistema') then p.total
    when p.aceptada is null then p.total                              -- nunca se llegó a aceptar
    when r.inicio - coalesce(p.cancelada, now()) >= interval '24 hours' then p.total  -- cancelación gratuita
    else 0                                                            -- menos de 24 h: el dueño cobra
  end
$$;

-- El conductor canceló una reserva ya aceptada con menos de 24 h: aunque el cobro aún no se hubiera hecho
-- (se acababa de aceptar), se cobra igualmente para cumplir la política de cancelación
create or replace function pago_cobrar_cancelada(p pagos, r reservas) returns boolean
language sql stable as $$
  select r.id is not null and r.estado = 'cancelada' and r.cancelada_por = 'conductor' and p.aceptada is not null
     and r.inicio - coalesce(p.cancelada, now()) < interval '24 hours'
$$;
revoke all on function pago_cobrar_cancelada(pagos, reservas) from public, anon, authenticated;
revoke all on function pago_a_devolver(pagos, reservas) from public, anon, authenticated;

-- Avisar a la web de que hay algo que hacer (si está configurada su dirección). Nunca impide guardar.
create or replace function pagos_avisar_web(p_reserva uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k pagos_config%rowtype;
begin
  select * into k from pagos_config where id = 1;
  if not found or k.url is null or k.modo = 'apagado' then return; end if;
  perform net.http_post(
    url := k.url,
    body := jsonb_build_object('secreto', k.secreto, 'reserva', p_reserva),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  null;
end $$;
revoke all on function pagos_avisar_web(uuid) from public, anon, authenticated;

-- ---------- Reglas en las reservas ----------
-- Se ejecuta después de reservas_antes (los triggers van por orden alfabético)
create or replace function reservas_pago_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare usuario boolean := coalesce(auth.role(), '') in ('authenticated', 'anon')
                           and current_setting('app.sistema', true) is distinct from 'si';
begin
  if tg_op = 'INSERT' then
    if usuario then
      new.con_pago := cobra_en_app(new.propietario);
      if new.con_pago and new.inicio > now() + interval '90 days' then
        raise exception 'Con pago en la app se puede reservar con 90 días de antelación como máximo';
      end if;
    end if;
    return new;
  end if;
  -- El dueño solo puede aceptar cuando el pago está retenido (la web lo cobra justo después)
  if usuario and new.con_pago and new.estado = 'aceptada' and old.estado = 'pendiente'
     and coalesce((select p.estado from pagos p where p.reserva_id = new.id), '') <> 'autorizado' then
    raise exception 'Aún no puedes aceptarla: falta que el conductor complete el pago';
  end if;
  return new;
end $$;
drop trigger if exists reservas_pago_antes on reservas;
create trigger reservas_pago_antes before insert or update on reservas
  for each row execute function reservas_pago_antes();

create or replace function reservas_pago_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c cuentas_cobro%rowtype;
  t numeric;
  k numeric;
begin
  if tg_op = 'DELETE' then
    if old.con_pago then
      update pagos set por_revisar = true, version = version + 1, actualizado = now() where reserva_id = old.id;
      perform pagos_avisar_web(old.id);
    end if;
    return null;
  end if;
  if not new.con_pago then return null; end if;

  if tg_op = 'INSERT' then
    -- Se guardan los importes y la cuenta del dueño en el momento de reservar
    select * into c from cuentas_cobro where usuario = new.propietario;
    t := tarifa_servicio(new.precio);
    k := comision_dueno(new.precio);
    insert into pagos (reserva_id, es_real, cuenta, precio, tarifa, comision, total, para_dueno)
    values (new.id, c.es_real, c.cuenta, new.precio, t, k, new.precio + t, new.precio - k)
    on conflict (reserva_id) do nothing;
    return null;
  end if;

  if new.estado is not distinct from old.estado then return null; end if;
  -- Aceptada (hay que cobrar), rechazada o cancelada (hay que liberar o devolver)
  update pagos
  set por_revisar = true, version = version + 1, actualizado = now(),
      aceptada = case when new.estado = 'aceptada' then now() else aceptada end,
      cancelada = case when new.estado in ('cancelada', 'rechazada') then now() else cancelada end
  where reserva_id = new.id;
  perform pagos_avisar_web(new.id);
  return null;
end $$;
drop trigger if exists reservas_pago_despues on reservas;
create trigger reservas_pago_despues after insert or update or delete on reservas
  for each row execute function reservas_pago_despues();

-- Cuando cambia un pago: refrescar las pantallas abiertas (tiempo real escucha reservas) y avisar
create or replace function pagos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  t text;
  enlace text;
  antes text;
  euros text;
  sola boolean := false;  -- aceptada sola (reserva instantánea)
begin
  if new.estado is not distinct from old.estado then return null; end if;
  select * into r from reservas where id = new.reserva_id;
  if not found then return null; end if;

  antes := current_setting('app.sistema', true);
  perform set_config('app.sistema', 'si', true);
  update reservas set actualizada = now() where id = r.id;
  perform set_config('app.sistema', coalesce(antes, ''), true);

  -- Reserva instantánea: con el pago ya retenido, la reserva se acepta sola (y la web la cobra después)
  if new.estado = 'autorizado' and r.estado = 'pendiente' and r.inicio >= now() + antelacion_instantanea()
     and coalesce((select g.instantanea from garajes g where g.id = r.garaje_id), false) then
    begin
      perform set_config('app.sistema', 'si', true);
      update reservas set estado = 'aceptada', instantanea = true where id = r.id and estado = 'pendiente';
      sola := found;  -- antes del perform siguiente, que también cambia "found"
      perform set_config('app.sistema', coalesce(antes, ''), true);
    exception when others then
      -- p. ej. otra reserva aceptada a la vez en esas horas: se queda como solicitud y decide el dueño
      perform set_config('app.sistema', coalesce(antes, ''), true);
    end;
  end if;

  if to_regprocedure('public.avisar(uuid,text,text,text,text)') is null then return null; end if;
  t := (select titulo from garajes where id = r.garaje_id);
  enlace := '/cuenta/reservas/' || r.id;
  if sola then
    perform avisar(r.propietario, '📅 Nueva reserva confirmada',
      t || ' · ' || to_char(r.inicio at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || ' · pagada · ⚡ instantánea',
      enlace, 'reserva-' || r.id);
  elsif new.estado = 'autorizado' and r.estado = 'pendiente' then
    perform avisar(r.propietario, '📩 Nueva solicitud (pagada)',
      t || ' · ' || to_char(r.inicio at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || ' · Responde antes de 48 h',
      enlace, 'reserva-' || r.id);
  elsif new.estado = 'transferido' then
    euros := replace(to_char(new.para_dueno, 'FM999990.00'), '.', ',');
    perform avisar(r.propietario, '💶 Cobro enviado', euros || ' € por «' || t || '»', enlace, 'pago-' || r.id);
  elsif new.estado = 'devuelto' then
    euros := replace(to_char(new.devuelto, 'FM999990.00'), '.', ',');
    perform avisar(r.conductor, '💶 Te hemos devuelto el dinero', euros || ' € de «' || t || '»', enlace, 'pago-' || r.id);
  end if;
  return null;
end $$;
drop trigger if exists pagos_despues on pagos;
create trigger pagos_despues after update on pagos
  for each row execute function pagos_despues();

-- ---------- Lo que usa la web (con la clave secreta) ----------
-- Pago + datos de la reserva. Si se llama con la sesión de un usuario, tiene que ser el conductor o el dueño.
create or replace function pago_leer(p_secreto text, p_reserva uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p pagos%rowtype;
  r reservas%rowtype;
  soy text;
begin
  perform pagos_comprobar(p_secreto);
  select * into p from pagos where reserva_id = p_reserva;
  if not found then return null; end if;
  select * into r from reservas where id = p_reserva;
  if auth.uid() is not null then
    soy := case when r.propietario = auth.uid() then 'propietario' when r.conductor = auth.uid() then 'conductor' end;
    if soy is null then raise exception 'Esta reserva no es tuya'; end if;
  end if;
  return to_jsonb(p) || jsonb_build_object(
    'a_devolver', pago_a_devolver(p, r),
    'cobrar_cancelada', pago_cobrar_cancelada(p, r),
    'soy', soy,
    'reserva', case when r.id is null then null else jsonb_build_object(
      'estado', r.estado, 'cancelada_por', r.cancelada_por, 'inicio', r.inicio, 'fin', r.fin,
      'modalidad', r.modalidad, 'creada', r.creada,
      'titulo', (select g.titulo from garajes g where g.id = r.garaje_id)) end);
end $$;

-- Apunta un cambio solo si nadie lo ha cambiado desde que se leyó (misma versión). Devuelve si se guardó.
create or replace function pago_cambiar(p_secreto text, p_reserva uuid, p_version int, p_cambios jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  p pagos%rowtype;
  nuevo text;
begin
  perform pagos_comprobar(p_secreto);
  select * into p from pagos where reserva_id = p_reserva for update;
  if not found or p.version <> p_version then return false; end if;
  nuevo := coalesce(p_cambios ->> 'estado', p.estado);
  if nuevo <> p.estado and not (
       (p.estado = 'por_pagar'   and nuevo in ('autorizado', 'cobrado', 'anulado'))
    or (p.estado = 'autorizado'  and nuevo in ('cobrado', 'anulado', 'fallido'))
    or (p.estado = 'cobrado'     and nuevo in ('transferido', 'devuelto'))
    or (p.estado = 'transferido' and nuevo = 'devuelto')) then
    raise exception 'Cambio de pago no permitido: % -> %', p.estado, nuevo;
  end if;
  update pagos set
    estado        = nuevo,
    sesion        = coalesce(p_cambios ->> 'sesion', sesion),
    pago          = coalesce(p_cambios ->> 'pago', pago),
    cargo         = coalesce(p_cambios ->> 'cargo', cargo),
    transferencia = coalesce(p_cambios ->> 'transferencia', transferencia),
    devuelto      = coalesce((p_cambios ->> 'devuelto')::numeric, devuelto),
    error         = case when p_cambios ? 'error' then p_cambios ->> 'error' else error end,
    por_revisar   = coalesce((p_cambios ->> 'por_revisar')::boolean, true),
    version       = version + 1,
    actualizado   = now()
  where reserva_id = p_reserva;
  return true;
end $$;

-- Cancelar automáticamente (no se pudo cobrar, el pago caducó…)
create or replace function reserva_cancelar_sistema(p_secreto text, p_reserva uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pagos_comprobar(p_secreto);
  perform set_config('app.sistema', 'si', true);
  update reservas set estado = 'cancelada', cancelada_por = 'sistema'
  where id = p_reserva and estado in ('pendiente', 'aceptada');
  get diagnostics n = row_count;
  perform set_config('app.sistema', '', true);
  return n > 0;
end $$;

-- Pagos con algo pendiente (los revisa la web cada 10 minutos)
create or replace function pagos_por_revisar(p_secreto text, p_limite int default 8) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  perform pagos_comprobar(p_secreto);
  return query
    select p.reserva_id from pagos p
      join pagos_config k on k.id = 1
      left join reservas r on r.id = p.reserva_id
    where p.es_real = (k.modo = 'real')  -- los de prueba no estorban cuando se pase a modo real (y al revés)
      and (p.por_revisar
       or (p.estado = 'por_pagar' and p.sesion is not null and p.actualizado < now() - interval '5 minutes')
       or (p.estado = 'autorizado' and (r.id is null or r.estado <> 'pendiente'))  -- cobro o liberación pendiente
       or (p.estado = 'cobrado' and not p.retener and (r.id is null or r.inicio + interval '24 hours' <= now()))
       or (r.id is null and p.estado = 'por_pagar'))
    order by p.actualizado
    limit least(greatest(p_limite, 1), 20);
end $$;

-- Cuenta de cobro del usuario que llama ({usuario} si aún no tiene)
create or replace function cuenta_cobro_leer(p_secreto text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform pagos_comprobar(p_secreto);
  if not tiene_cuenta() then raise exception 'Necesitas una cuenta'; end if;
  return jsonb_build_object('usuario', auth.uid())
      || coalesce((select to_jsonb(c) from cuentas_cobro c where c.usuario = auth.uid()), '{}'::jsonb);
end $$;

-- Guardar la cuenta de cobro. Sin usuario (aviso del proveedor de pagos): solo cambia si está activa.
create or replace function cuenta_cobro_guardar(p_secreto text, p_cuenta text, p_es_real boolean, p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pagos_comprobar(p_secreto);
  if auth.uid() is null then
    update cuentas_cobro set activa = p_activa, actualizada = now() where cuenta = p_cuenta;
    return;
  end if;
  if not tiene_cuenta() then raise exception 'Necesitas una cuenta'; end if;
  insert into cuentas_cobro (usuario, cuenta, es_real, activa)
  values (auth.uid(), p_cuenta, p_es_real, p_activa)
  on conflict (usuario) do update
    set cuenta = excluded.cuenta, es_real = excluded.es_real, activa = excluded.activa, actualizada = now();
end $$;

revoke all on function pago_leer(text, uuid) from public;
revoke all on function pago_cambiar(text, uuid, int, jsonb) from public;
revoke all on function reserva_cancelar_sistema(text, uuid) from public;
revoke all on function pagos_por_revisar(text, int) from public;
revoke all on function cuenta_cobro_leer(text) from public;
revoke all on function cuenta_cobro_guardar(text, text, boolean, boolean) from public;
grant execute on function pago_leer(text, uuid) to anon, authenticated;
grant execute on function pago_cambiar(text, uuid, int, jsonb) to anon, authenticated;
grant execute on function reserva_cancelar_sistema(text, uuid) to anon, authenticated;
grant execute on function pagos_por_revisar(text, int) to anon, authenticated;
grant execute on function cuenta_cobro_leer(text) to anon, authenticated;
grant execute on function cuenta_cobro_guardar(text, text, boolean, boolean) to anon, authenticated;

-- ---------- Lo que ven el conductor y el dueño ----------
-- El dueño ve además su comisión y lo que va a recibir
create or replace function mi_pago(id_reserva uuid)
returns table (estado text, precio numeric, tarifa numeric, total numeric, comision numeric, para_dueno numeric,
               devuelto numeric, retener boolean, es_real boolean)
language sql stable security definer set search_path = public as $$
  select p.estado, p.precio, p.tarifa, p.total,
         case when r.propietario = auth.uid() then p.comision end,
         case when r.propietario = auth.uid() then p.para_dueno end,
         p.devuelto, p.retener, p.es_real
  from pagos p join reservas r on r.id = p.reserva_id
  where p.reserva_id = id_reserva and auth.uid() in (r.conductor, r.propietario)
$$;
revoke all on function mi_pago(uuid) from public, anon;
grant execute on function mi_pago(uuid) to authenticated;

-- ---------- Tareas automáticas (cada 10 minutos) ----------
create or replace function pagos_tareas() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k pagos_config%rowtype;
begin
  perform set_config('app.sistema', 'si', true);
  -- Solicitudes con el pago a medias: se cancelan a la hora
  update reservas r set estado = 'cancelada', cancelada_por = 'sistema'
  from pagos p
  where p.reserva_id = r.id and r.con_pago and r.estado = 'pendiente' and p.estado = 'por_pagar'
    and r.creada < now() - interval '1 hour';
  -- Pagadas pero sin respuesta del dueño en 48 h (o ya ha empezado): se cancelan y se libera el dinero
  update reservas r set estado = 'cancelada', cancelada_por = 'sistema'
  from pagos p
  where p.reserva_id = r.id and r.con_pago and r.estado = 'pendiente' and p.estado = 'autorizado'
    and (r.creada < now() - interval '48 hours' or r.inicio < now());
  perform set_config('app.sistema', '', true);

  -- Que la web haga lo pendiente en el proveedor de pagos (transferencias, devoluciones…)
  select * into k from pagos_config where id = 1;
  if found and k.url is not null and k.modo <> 'apagado' then
    perform net.http_post(
      url := k.url,
      body := jsonb_build_object('secreto', k.secreto),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end $$;
revoke all on function pagos_tareas() from public, anon, authenticated;

select cron.schedule('pagos', '*/10 * * * *', $$select public.pagos_tareas()$$);
