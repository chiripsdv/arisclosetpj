-- =====================================================================
-- 0005 · Usuarios con nombre de usuario (sin correo real)
-- La propietaria asigna o cambia la contraseña de cualquier usuario
-- desde la app (Usuarios → Editar). Correr una vez, después de 0004.
-- =====================================================================

create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_owner() then raise exception 'Solo la propietaria puede cambiar contraseñas'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
