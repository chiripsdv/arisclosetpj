-- =====================================================================
-- 0002 · Seguridad: permisos por rol con Row Level Security (RLS)
-- La base de datos decide qué ve cada usuario. Aunque alguien manipule
-- la app, no puede leer costos, utilidad ni ventas ajenas si su rol no lo permite.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de ayuda (leen el rol del usuario que hace la consulta)
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'propietaria', false)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null
$$;

-- perm('see_all_sales'), perm('can_see_cost'), etc.
create or replace function public.perm(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_name
      when 'see_all_sales'    then r.see_all_sales
      when 'can_see_cost'     then r.can_see_cost
      when 'can_see_profit'   then r.can_see_profit
      when 'can_stock_in'     then r.can_stock_in
      when 'can_expense'      then r.can_expense
      when 'can_edit_catalog' then r.can_edit_catalog
      else false end
    from public.profiles p join public.roles r on r.key = p.role
    where p.id = auth.uid() and p.active
  ), false)
$$;

create or replace function public.has_view(p_view text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p_view = any (r.views)
    from public.profiles p join public.roles r on r.key = p.role
    where p.id = auth.uid() and p.active
  ), false)
$$;

-- La propietaria siempre tiene todos los permisos, aunque alguien intente quitárselos
create or replace function public.roles_guard() returns trigger
language plpgsql as $$
begin
  if new.key = 'propietaria' then
    new.max_disc := 100;
    new.views := array['panel','venta','inventario','gastos','reportes','catalogos','usuarios'];
    new.see_all_sales := true; new.can_see_cost := true; new.can_see_profit := true;
    new.can_stock_in := true; new.can_expense := true; new.can_edit_catalog := true;
  end if;
  -- ver utilidad implica ver costos
  if new.can_see_profit then new.can_see_cost := true; end if;
  if array_length(new.views, 1) is null then
    raise exception 'Cada rol necesita al menos una pantalla';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger roles_guard before insert or update on public.roles
  for each row execute function public.roles_guard();

-- Nadie puede quitarle el rol ni desactivar a la última propietaria
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'propietaria' and (new.role <> 'propietaria' or not new.active) then
    if (select count(*) from public.profiles where role = 'propietaria' and active and id <> old.id) = 0 then
      raise exception 'Debe quedar al menos una propietaria activa';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- Usuario nuevo en Supabase Auth → su perfil en la app.
-- El PRIMER usuario es la propietaria. Los siguientes entran como
-- vendedor INACTIVO hasta que la propietaria los active desde la app.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when first_user then 'propietaria' else 'vendedor' end,
    first_user
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------
alter table public.roles              enable row level security;
alter table public.profiles           enable row level security;
alter table public.user_pins          enable row level security;
alter table public.settings           enable row level security;
alter table public.partners           enable row level security;
alter table public.categories         enable row level security;
alter table public.brands             enable row level security;
alter table public.payment_methods    enable row level security;
alter table public.expense_categories enable row level security;
alter table public.discount_codes     enable row level security;
alter table public.products           enable row level security;
alter table public.product_costs      enable row level security;
alter table public.variants           enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.sale_item_costs    enable row level security;
alter table public.stock_moves        enable row level security;
alter table public.expenses           enable row level security;

-- Los visitantes sin sesión no ven nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------
-- Roles: todos los usuarios activos los leen; solo la propietaria los cambia
create policy roles_read   on public.roles for select to authenticated using (public.is_active_user());
create policy roles_update on public.roles for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Perfiles: cada usuario activo ve los nombres del equipo (y el suyo aunque esté inactivo)
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_active_user() or id = auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- PIN: sin políticas = nadie lo lee ni lo escribe directo (solo funciones)

-- Ajustes y catálogos: todos leen; edita quien tiene "editar catálogos"
create policy settings_read  on public.settings for select to authenticated using (public.is_active_user());
create policy settings_write on public.settings for update to authenticated using (public.perm('can_edit_catalog')) with check (public.perm('can_edit_catalog'));

do $$
declare t text;
begin
  foreach t in array array['partners','categories','brands','payment_methods','expense_categories','discount_codes','products'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_active_user())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.perm(''can_edit_catalog''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.perm(''can_edit_catalog'')) with check (public.perm(''can_edit_catalog''))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;

-- Costos de productos: solo quien puede ver costos
create policy product_costs_read  on public.product_costs for select to authenticated using (public.perm('can_see_cost'));
create policy product_costs_write on public.product_costs for insert to authenticated with check (public.perm('can_see_cost') and public.perm('can_edit_catalog'));
create policy product_costs_upd   on public.product_costs for update to authenticated using (public.perm('can_see_cost') and public.perm('can_edit_catalog')) with check (public.perm('can_see_cost'));

-- Variantes: todos leen el stock; se crean con stock 0 y el stock
-- solo cambia por ventas o entradas (así todo queda en el kárdex)
create policy variants_read   on public.variants for select to authenticated using (public.is_active_user());
create policy variants_insert on public.variants for insert to authenticated with check (public.perm('can_edit_catalog') and stock = 0);
create policy variants_update on public.variants for update to authenticated using (public.perm('can_edit_catalog')) with check (public.perm('can_edit_catalog'));
create policy variants_delete on public.variants for delete to authenticated using (public.is_owner() and stock = 0);
revoke update on public.variants from authenticated;
grant update (size, color, barcode, active) on public.variants to authenticated;

-- Ventas: quien ve todas, ve todas; los demás solo las suyas.
-- No hay políticas de insertar/editar: las ventas solo entran por register_sale().
create policy sales_read on public.sales for select to authenticated
  using (public.perm('see_all_sales') or (seller_id = auth.uid() and public.is_active_user()));
create policy sale_items_read on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_item_costs_read on public.sale_item_costs for select to authenticated
  using (public.perm('can_see_cost'));

-- Kárdex: para quien ve todas las ventas o registra entradas
create policy stock_moves_read on public.stock_moves for select to authenticated
  using (public.perm('see_all_sales') or public.perm('can_stock_in'));

-- Gastos: los ve quien tiene la pantalla Gastos y ve toda la tienda; registra quien puede
create policy expenses_read on public.expenses for select to authenticated
  using (public.perm('can_expense') or (public.has_view('gastos') and public.perm('see_all_sales')));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.perm('can_expense') and user_id = auth.uid());
create policy expenses_update on public.expenses for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------
-- Tiempo real: el panel recibe cada venta al instante (respeta RLS)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sales, public.sale_items, public.variants, public.expenses;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Archivos: fotos de productos (públicas) y comprobantes de gastos (privados)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

create policy photos_read   on storage.objects for select using (bucket_id = 'product-photos');
create policy photos_write  on storage.objects for insert to authenticated with check (bucket_id = 'product-photos' and public.perm('can_edit_catalog'));
create policy photos_update on storage.objects for update to authenticated using (bucket_id = 'product-photos' and public.perm('can_edit_catalog'));
create policy photos_delete on storage.objects for delete to authenticated using (bucket_id = 'product-photos' and public.perm('can_edit_catalog'));
create policy receipts_read  on storage.objects for select to authenticated using (bucket_id = 'receipts' and (public.perm('can_expense') or public.is_owner()));
create policy receipts_write on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and public.perm('can_expense'));
