-- Avisos push (Web Push) de reservas y chat.
-- Requiere garajes.sql y reservas.sql. Pegar en Supabase > SQL Editor. Idempotente.
-- DESPUÉS ejecutar supabase/avisos-config.local.sql (contiene la URL y la clave secreta; no se sube a git).
--
-- Flujo: un cambio en reservas/mensajes -> trigger -> pg_net hace POST a la web (/api/avisos)
--        con la clave secreta -> la web pide las suscripciones del destinatario (validando la clave)
--        y envía el aviso firmado con VAPID.

create extension if not exists pg_net with schema extensions;

-- ---------- Dispositivos que han activado los avisos ----------
create table if not exists push_suscripciones (
  id        bigint generated always as identity primary key,
  usuario   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint  text not null unique check (endpoint like 'https://%'),
  p256dh    text not null,
  auth      text not null,
  creada    timestamptz not null default now()
);
create index if not exists push_usuario on push_suscripciones (usuario);

alter table push_suscripciones enable row level security;
drop policy if exists "mis dispositivos" on push_suscripciones;
create policy "mis dispositivos" on push_suscripciones for all to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
revoke all on push_suscripciones from anon, authenticated;
grant select, delete on push_suscripciones to authenticated;
grant insert (endpoint, p256dh, auth) on push_suscripciones to authenticated;
grant all on push_suscripciones to service_role;

-- Si el mismo dispositivo (endpoint) se registra con otra cuenta, pasa a ser de la cuenta nueva
create or replace function registrar_dispositivo(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_cuenta() then raise exception 'Necesitas una cuenta para activar los avisos'; end if;
  insert into push_suscripciones (usuario, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set usuario = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, creada = now();
end $$;
revoke all on function registrar_dispositivo(text, text, text) from public, anon;
grant execute on function registrar_dispositivo(text, text, text) to authenticated;

-- ---------- Configuración privada (URL de la web y clave secreta) ----------
create table if not exists avisos_config (
  id      int primary key default 1 check (id = 1),
  url     text not null,      -- https://…/api/avisos
  secreto text not null
);
alter table avisos_config enable row level security;  -- sin políticas: nadie la lee desde la API
revoke all on avisos_config from anon, authenticated;

-- La web llama a estas dos funciones con la clave secreta (con la clave pública de Supabase)
create or replace function push_destino(p_secreto text, p_usuario uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from push_suscripciones s
  where s.usuario = p_usuario
    and exists (select 1 from avisos_config c where c.secreto = p_secreto)
$$;
create or replace function push_borrar(p_secreto text, p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_suscripciones
  where endpoint = p_endpoint and exists (select 1 from avisos_config c where c.secreto = p_secreto)
$$;
revoke all on function push_destino(text, uuid) from public;
revoke all on function push_borrar(text, text) from public;
grant execute on function push_destino(text, uuid) to anon, authenticated;
grant execute on function push_borrar(text, text) to anon, authenticated;

-- ---------- Enviar un aviso (lo usan los triggers) ----------
create or replace function avisar(p_usuario uuid, p_titulo text, p_cuerpo text, p_enlace text, p_etiqueta text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare c avisos_config%rowtype;
begin
  select * into c from avisos_config where id = 1;
  if not found then return; end if;                                         -- aún sin configurar
  if not exists (select 1 from push_suscripciones where usuario = p_usuario) then return; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object('secreto', c.secreto, 'usuario', p_usuario, 'titulo', p_titulo,
                               'cuerpo', p_cuerpo, 'enlace', p_enlace, 'etiqueta', p_etiqueta),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  null;  -- un fallo al avisar nunca debe impedir guardar la reserva o el mensaje
end $$;
revoke all on function avisar(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- Cuándo se avisa ----------
create or replace function avisos_reservas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text := (select titulo from garajes where id = new.garaje_id);
  enlace text := '/cuenta/reservas/' || new.id;
  cuando text := to_char(new.inicio at time zone 'Europe/Madrid', 'DD/MM HH24:MI');
begin
  if tg_op = 'INSERT' then
    perform avisar(new.propietario, '📩 Nueva solicitud', t || ' · ' || cuando || ' · ' || new.precio || ' €', enlace, 'reserva-' || new.id);
  elsif new.estado is distinct from old.estado then
    if new.estado = 'aceptada' then
      perform avisar(new.conductor, '✅ Reserva aceptada', 'Ya puedes ver la dirección de «' || t || '»', enlace, 'reserva-' || new.id);
    elsif new.estado = 'rechazada' then
      perform avisar(new.conductor, 'Reserva rechazada', 'El dueño de «' || t || '» no puede esta vez', enlace, 'reserva-' || new.id);
    elsif new.estado = 'cancelada' then
      perform avisar(case when new.cancelada_por = 'conductor' then new.propietario else new.conductor end,
                     '❌ Reserva cancelada', '«' || t || '» · ' || cuando, enlace, 'reserva-' || new.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists avisos_reservas on reservas;
create trigger avisos_reservas after insert or update on reservas
  for each row execute function avisos_reservas();

create or replace function avisos_mensajes() returns trigger
language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype;
begin
  select * into r from reservas where id = new.reserva_id;
  perform avisar(
    case when new.autor = r.conductor then r.propietario else r.conductor end,
    '💬 ' || (select titulo from garajes where id = r.garaje_id),
    left(new.texto, 140),
    '/cuenta/reservas/' || r.id,
    'chat-' || r.id
  );
  return null;
end $$;
drop trigger if exists avisos_mensajes on mensajes;
create trigger avisos_mensajes after insert on mensajes
  for each row execute function avisos_mensajes();
