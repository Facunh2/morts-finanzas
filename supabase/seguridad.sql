-- Mort’s Finanzas · cierre de acceso
-- 1) La lista de miembros ya no es visible para cualquiera con cuenta: cada uno ve solo su fila.
-- 2) El registro de cuentas nuevas se cierra solo cuando Facu y Marti ya ocuparon sus lugares
--    (y se vuelve a abrir si un lugar queda libre, para no dejar a nadie afuera).

-- ¿Queda algún lugar libre? (función propia porque la regla de "anotarme" ya no puede
-- contar las filas ajenas: la base se las oculta)
create or replace function public.hay_lugar() returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.miembros) < 2;
$$;
revoke all on function public.hay_lugar() from public, anon;
grant execute on function public.hay_lugar() to authenticated;

drop policy if exists "ver miembros" on public.miembros;
create policy "ver miembros" on public.miembros for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "anotarme" on public.miembros;
create policy "anotarme" on public.miembros for insert to authenticated
  with check (user_id = auth.uid() and public.hay_lugar());

-- Registro cerrado cuando los dos lugares están ocupados.
create or replace function public.cerrar_registro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.miembros) >= 2 then
    raise exception 'Registro cerrado' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.cerrar_registro() from public, anon, authenticated;

drop trigger if exists cerrar_registro on auth.users;
create trigger cerrar_registro before insert on auth.users
  for each row execute function public.cerrar_registro();
