-- =====================================================================
-- 0006 · Login: al escribir el usuario, la app muestra su nombre
-- Solo devuelve nombre, rol y si está activo (nunca correos ni datos de venta).
-- Correr una vez, después de 0005.
-- =====================================================================

create or replace function public.login_lookup(p_email text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('found', true, 'name', p.name, 'role', r.label, 'active', p.active)
       from public.profiles p join public.roles r on r.key = p.role
      where lower(p.email) = lower(trim(p_email))
      limit 1),
    jsonb_build_object('found', false))
$$;

revoke all on function public.login_lookup(text) from public;
grant execute on function public.login_lookup(text) to anon, authenticated;
