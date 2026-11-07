-- Nuestras Finanzas · base de datos en Supabase
-- Pegar entero en Supabase → SQL Editor → Run.
-- Regla central: lo de la CASA lo ven los dos; lo PERSONAL solo su dueño.
-- La privacidad la impone la base (RLS), no la app: aunque alguien toque el
-- código, la base no le devuelve los movimientos personales del otro.

-- ── Quién es quién (máximo dos personas) ────────────────────────────────────
create table if not exists public.miembros (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  quien   text not null unique check (quien in ('facu', 'marti')),
  creado  timestamptz not null default now()
);

create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where user_id = auth.uid());
$$;

-- ── Movimientos ─────────────────────────────────────────────────────────────
create table if not exists public.movimientos (
  id         uuid primary key default gen_random_uuid(),
  dueno      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  autor      text check (autor in ('facu', 'marti')),
  tipo       text not null check (tipo in ('gasto', 'ingreso', 'ahorro', 'saldo')),
  ambito     text not null check (ambito in ('casa', 'personal')),
  categoria  text not null,
  monto      numeric(14,2) not null,
  moneda     text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  pago       text check (pago in ('facu', 'marti')),
  reparto    text check (reparto in ('mitad', 'facu', 'marti')),
  fecha      date not null default current_date,
  nota       text default '',
  origen     text default 'manual' check (origen in ('manual', 'audio', 'captura')),
  creado     timestamptz not null default now()
);
create index if not exists movimientos_fecha on public.movimientos (fecha);

-- ── Vencimientos (día del mes) ──────────────────────────────────────────────
create table if not exists public.vencimientos (
  id        uuid primary key default gen_random_uuid(),
  categoria text not null,
  dia       int  not null check (dia between 1 and 31),
  ambito    text not null check (ambito in ('casa', 'personal')),
  dueno     uuid default auth.uid() references auth.users(id) on delete cascade
);

-- ── Metas de ahorro ─────────────────────────────────────────────────────────
create table if not exists public.metas (
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null,
  objetivo numeric(14,2) not null,
  moneda   text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  ambito   text not null check (ambito in ('casa', 'personal')),
  dueno    uuid default auth.uid() references auth.users(id) on delete cascade
);

-- ── Reglas de acceso ────────────────────────────────────────────────────────
alter table public.miembros     enable row level security;
alter table public.movimientos  enable row level security;
alter table public.vencimientos enable row level security;
alter table public.metas        enable row level security;

drop policy if exists "ver miembros" on public.miembros;
create policy "ver miembros" on public.miembros for select to authenticated using (true);
drop policy if exists "anotarme" on public.miembros;
create policy "anotarme" on public.miembros for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.miembros) < 2);

do $$
declare t text;
begin
  foreach t in array array['movimientos', 'vencimientos', 'metas'] loop
    execute format('drop policy if exists "ver" on public.%I', t);
    execute format('drop policy if exists "crear" on public.%I', t);
    execute format('drop policy if exists "cambiar" on public.%I', t);
    execute format('drop policy if exists "borrar" on public.%I', t);
    -- Ver: lo de la casa (si sos miembro) o lo tuyo.
    execute format($p$create policy "ver" on public.%I for select to authenticated
      using (public.es_miembro() and (ambito = 'casa' or dueno = auth.uid()))$p$, t);
    -- Crear: siempre a tu nombre.
    execute format($p$create policy "crear" on public.%I for insert to authenticated
      with check (public.es_miembro() and (dueno = auth.uid() or (ambito = 'casa' and dueno is null)))$p$, t);
    -- Cambiar / borrar: lo de la casa lo puede corregir cualquiera de los dos; lo personal, solo su dueño.
    execute format($p$create policy "cambiar" on public.%I for update to authenticated
      using (public.es_miembro() and (ambito = 'casa' or dueno = auth.uid()))
      with check (ambito = 'casa' or dueno = auth.uid())$p$, t);
    execute format($p$create policy "borrar" on public.%I for delete to authenticated
      using (public.es_miembro() and (ambito = 'casa' or dueno = auth.uid()))$p$, t);
  end loop;
end $$;

-- Un movimiento personal nunca puede quedar a nombre de otro.
create or replace function public.forzar_dueno() returns trigger language plpgsql as $$
begin
  if new.ambito = 'personal' then new.dueno := auth.uid(); end if;
  if tg_table_name = 'movimientos' and new.dueno is null then new.dueno := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists forzar_dueno on public.movimientos;
create trigger forzar_dueno before insert on public.movimientos for each row execute function public.forzar_dueno();
drop trigger if exists forzar_dueno on public.vencimientos;
create trigger forzar_dueno before insert on public.vencimientos for each row execute function public.forzar_dueno();
drop trigger if exists forzar_dueno on public.metas;
create trigger forzar_dueno before insert on public.metas for each row execute function public.forzar_dueno();

-- Para que el otro celular se actualice al instante.
do $$ begin
  alter publication supabase_realtime add table public.movimientos, public.vencimientos, public.metas;
exception when duplicate_object then null; end $$;
