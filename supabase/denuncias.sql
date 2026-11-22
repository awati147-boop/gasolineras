-- Denuncias de anuncios de garajes y de conversaciones (reservas).
-- Requiere garajes.sql y reservas.sql. Pegar en Supabase > SQL Editor. Idempotente.
-- Solo el administrador las ve (Table Editor de Supabase); los usuarios solo pueden crearlas.

create table if not exists denuncias (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('garaje', 'reserva')),
  objeto_id  uuid not null,                       -- id del garaje o de la reserva
  motivo     text not null check (motivo in ('estafa', 'inapropiado', 'datos_personales', 'spam', 'otro')),
  detalle    text check (char_length(detalle) <= 500),
  autor      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estado     text not null default 'abierta' check (estado in ('abierta', 'revisada', 'descartada')),
  creada     timestamptz not null default now(),
  unique (tipo, objeto_id, autor)                 -- una denuncia por persona y cosa
);
create index if not exists denuncias_abiertas on denuncias (estado, creada desc);

create or replace function denuncias_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  if auth.uid() is null then raise exception 'Hace falta sesión'; end if;
  if (select count(*) from denuncias where autor = auth.uid() and creada > now() - interval '1 day') >= 10 then
    raise exception 'Has enviado muchas denuncias hoy. Inténtalo mañana';
  end if;
  -- Solo se puede denunciar una conversación en la que participas
  if new.tipo = 'reserva' and not participo_en(new.objeto_id) then
    raise exception 'Solo puedes denunciar tus propias conversaciones';
  end if;
  if new.tipo = 'garaje' and not exists (select 1 from garajes where id = new.objeto_id) then
    raise exception 'Ese anuncio no existe';
  end if;
  new.autor := auth.uid();
  new.estado := 'abierta';
  new.creada := now();
  return new;
end $$;
drop trigger if exists denuncias_antes on denuncias;
create trigger denuncias_antes before insert on denuncias
  for each row execute function denuncias_antes();

-- Protección automática: un garaje con denuncias abiertas de 3 personas distintas se pausa solo
create or replace function denuncias_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'garaje' and (
    select count(distinct autor) from denuncias
    where tipo = 'garaje' and objeto_id = new.objeto_id and estado = 'abierta'
  ) >= 3 then
    update garajes set activo = false where id = new.objeto_id;
  end if;
  return null;
end $$;
drop trigger if exists denuncias_despues on denuncias;
create trigger denuncias_despues after insert on denuncias
  for each row execute function denuncias_despues();

alter table denuncias enable row level security;
drop policy if exists "crear denuncia" on denuncias;
create policy "crear denuncia" on denuncias for insert to anon, authenticated
  with check (autor = auth.uid());

revoke all on denuncias from anon, authenticated;
grant insert (tipo, objeto_id, motivo, detalle) on denuncias to anon, authenticated;
grant all on denuncias to service_role;
