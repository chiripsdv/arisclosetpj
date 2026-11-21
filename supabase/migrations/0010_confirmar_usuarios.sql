-- =====================================================================
-- 0010 · Usuarios creados desde la app quedan confirmados al instante
-- Los usuarios usan un correo interno (usuario@ariscloset.app) que no existe,
-- así que no pueden confirmar nada por correo: la propietaria los confirma
-- automáticamente al crearlos. Correr una vez, después de 0009.
-- =====================================================================

create or replace function public.admin_confirm_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then raise exception 'Solo la propietaria puede confirmar usuarios'; end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

revoke all on function public.admin_confirm_user(uuid) from public, anon;
grant execute on function public.admin_confirm_user(uuid) to authenticated;
