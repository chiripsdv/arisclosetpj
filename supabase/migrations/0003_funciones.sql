-- =====================================================================
-- 0003 · Funciones (operaciones que la app llama con supabase.rpc)
-- Todo lo delicado pasa aquí, dentro de la base de datos y en una sola
-- transacción: si algo falla, no se guarda nada a medias.
-- =====================================================================

-- ---------------------------------------------------------------------
-- register_sale: registra una venta completa
--   p_items    [{"variant_id": "...", "qty": 2}, ...]
--   p_payment  'Efectivo' | 'Tarjeta' | 'Transferencia' | ...
--   p_discount null | {"type":"manual","pct":10}
--                   | {"type":"codigo","code":"ARI15"}
--                   | {"type":"pin","pct":20,"pin":"1234"}
--   p_phone    teléfono de la clienta (opcional, para WhatsApp)
-- Los precios y costos se toman de la base, nunca de la app.
-- ---------------------------------------------------------------------
create or replace function public.register_sale(
  p_items jsonb, p_payment text, p_discount jsonb default null, p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_role public.roles;
  v_set public.settings;
  v_item jsonb;
  v_var record;
  v_subtotal numeric(12,2) := 0;
  v_pct numeric(5,2) := 0;
  v_type text := null;
  v_code text := null;
  v_auth uuid := null;
  v_amount numeric(12,2) := 0;
  v_total numeric(12,2);
  v_factor numeric;
  v_sale public.sales;
  v_sale_item_id uuid;
  v_net numeric(12,2);
  v_net_sum numeric(12,2) := 0;
  v_n int; v_i int := 0;
  v_dc public.discount_codes;
begin
  select r.* into v_role from public.profiles p join public.roles r on r.key = p.role where p.id = v_uid and p.active;
  if v_role.key is null then raise exception 'Usuario no autorizado'; end if;
  if not ('venta' = any (v_role.views)) then raise exception 'Tu rol no puede registrar ventas'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene artículos';
  end if;
  if not exists (select 1 from public.payment_methods where name = p_payment and active) then
    raise exception 'Forma de pago no válida: %', p_payment;
  end if;
  select * into v_set from public.settings where id = 1;

  -- Bloquea las variantes y valida stock
  drop table if exists _lines;
  create temporary table _lines (variant_id uuid, product_id uuid, partner_id uuid, name text, size text, color text,
                                 qty int, price numeric(12,2), cost numeric(12,2)) on commit drop;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item ->> 'qty')::int, 0) <= 0 then raise exception 'Cantidad no válida'; end if;
    select v.id, v.stock, v.size, v.color, v.active, p.id as product_id, p.partner_id, p.name, p.price, p.active as p_active,
           coalesce(c.cost, 0) as cost
      into v_var
      from public.variants v
      join public.products p on p.id = v.product_id
      left join public.product_costs c on c.product_id = p.id
     where v.id = (v_item ->> 'variant_id')::uuid
     for update of v;
    if v_var.id is null then raise exception 'Producto no encontrado'; end if;
    if not v_var.active or not v_var.p_active then raise exception '% (% %) no está disponible', v_var.name, v_var.size, v_var.color; end if;
    insert into _lines values (v_var.id, v_var.product_id, v_var.partner_id, v_var.name, v_var.size, v_var.color,
                               (v_item ->> 'qty')::int, v_var.price, v_var.cost);
  end loop;
  -- stock suficiente (sumando si la misma variante viene repetida)
  perform 1 from (
    select l.variant_id, sum(l.qty) q, max(v.stock) s, max(l.name) n, max(l.size) sz, max(l.color) co
      from _lines l join public.variants v on v.id = l.variant_id group by l.variant_id
  ) x where x.q > x.s;
  if found then
    raise exception 'No hay stock suficiente de %', (select l.name || ' ' || l.size || ' ' || l.color from _lines l join public.variants v on v.id = l.variant_id
      group by l.variant_id, l.name, l.size, l.color having sum(l.qty) > max(v.stock) limit 1);
  end if;

  select sum(qty * price) into v_subtotal from _lines;

  -- Descuento
  if p_discount is not null and p_discount ->> 'type' is not null then
    v_type := p_discount ->> 'type';
    if v_type = 'manual' then
      v_pct := coalesce((p_discount ->> 'pct')::numeric, 0);
      if v_pct > v_role.max_disc then raise exception 'Tu límite de descuento es % %%. Pedí autorización con PIN.', v_role.max_disc; end if;
    elsif v_type = 'codigo' then
      v_code := upper(trim(p_discount ->> 'code'));
      select * into v_dc from public.discount_codes where code = v_code for update;
      if v_dc.code is null or not v_dc.active then raise exception 'Código no válido'; end if;
      if v_dc.uses >= v_dc.max_uses then raise exception 'El código ya alcanzó su máximo de usos'; end if;
      if (v_dc.valid_from is not null and current_date < v_dc.valid_from) or (v_dc.valid_to is not null and current_date > v_dc.valid_to) then
        raise exception 'El código no está vigente';
      end if;
      v_pct := v_dc.pct;
      update public.discount_codes set uses = uses + 1 where code = v_code;
    elsif v_type = 'pin' then
      v_pct := coalesce((p_discount ->> 'pct')::numeric, 0);
      select p.id into v_auth
        from public.user_pins up join public.profiles p on p.id = up.user_id join public.roles r on r.key = p.role
       where p.active and up.pin_hash = crypt(coalesce(p_discount ->> 'pin', ''), up.pin_hash) and r.max_disc >= v_pct
       limit 1;
      if v_auth is null then raise exception 'PIN incorrecto o sin permiso para ese descuento'; end if;
    else
      raise exception 'Tipo de descuento no válido';
    end if;
    if v_pct <= 0 or v_pct > 90 then raise exception 'Porcentaje de descuento no válido'; end if;
  end if;

  v_amount := round(v_subtotal * v_pct / 100, 2);
  v_total := v_subtotal - v_amount;
  v_factor := case when v_subtotal > 0 then v_total / v_subtotal else 1 end;

  -- Precio mínimo: ninguna prenda por debajo del costo + margen mínimo
  if v_pct > 0 then
    perform 1 from _lines where cost > 0 and price * v_factor < cost * (1 + v_set.min_margin / 100);
    if found then
      raise exception 'El descuento deja "%" por debajo del precio mínimo',
        (select name from _lines where cost > 0 and price * v_factor < cost * (1 + v_set.min_margin / 100) limit 1);
    end if;
  end if;

  insert into public.sales (seller_id, subtotal, discount_type, discount_pct, discount_amount, discount_code, authorized_by,
                            total, payment_method, customer_phone)
  values (v_uid, v_subtotal, v_type, v_pct, v_amount, v_code, v_auth, v_total, p_payment, nullif(trim(p_phone), ''))
  returning * into v_sale;

  select count(*) into v_n from _lines;
  for v_var in select * from _lines loop
    v_i := v_i + 1;
    -- el descuento se reparte entre las líneas; la última absorbe el redondeo
    v_net := case when v_i = v_n then v_total - v_net_sum else round(v_var.qty * v_var.price * v_factor, 2) end;
    v_net_sum := v_net_sum + v_net;
    insert into public.sale_items (sale_id, variant_id, product_id, partner_id, name, size, color, qty, price, line_total, net_total)
    values (v_sale.id, v_var.variant_id, v_var.product_id, v_var.partner_id, v_var.name, v_var.size, v_var.color,
            v_var.qty, v_var.price, v_var.qty * v_var.price, v_net)
    returning id into v_sale_item_id;
    insert into public.sale_item_costs (sale_item_id, unit_cost) values (v_sale_item_id, v_var.cost);
    update public.variants set stock = stock - v_var.qty where id = v_var.variant_id;
    insert into public.stock_moves (variant_id, partner_id, type, qty, user_id, sale_id)
    values (v_var.variant_id, v_var.partner_id, 'venta', -v_var.qty, v_uid, v_sale.id);
  end loop;

  return jsonb_build_object('id', v_sale.id, 'number', v_sale.number, 'subtotal', v_subtotal,
                            'discount', v_amount, 'total', v_total, 'created_at', v_sale.created_at);
end $$;

-- ---------------------------------------------------------------------
-- stock_in: entrada (compra), ajuste (+/-) o devolución de clienta
-- ---------------------------------------------------------------------
create or replace function public.stock_in(p_variant uuid, p_qty int, p_type text default 'compra', p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_stock int; v_partner uuid;
begin
  if not public.perm('can_stock_in') then raise exception 'Tu rol no puede registrar entradas'; end if;
  if p_type not in ('compra', 'ajuste', 'devolucion') then raise exception 'Tipo de movimiento no válido'; end if;
  if p_qty = 0 or (p_qty < 0 and p_type <> 'ajuste') then raise exception 'Cantidad no válida'; end if;
  select v.stock, p.partner_id into v_stock, v_partner
    from public.variants v join public.products p on p.id = v.product_id where v.id = p_variant for update of v;
  if v_partner is null then raise exception 'Variante no encontrada'; end if;
  if v_stock + p_qty < 0 then raise exception 'El ajuste dejaría el stock en negativo'; end if;
  update public.variants set stock = stock + p_qty where id = p_variant returning stock into v_stock;
  insert into public.stock_moves (variant_id, partner_id, type, qty, user_id, note)
  values (p_variant, v_partner, p_type, p_qty, auth.uid(), p_note);
  return v_stock;
end $$;

-- ---------------------------------------------------------------------
-- void_sale: anula una venta y devuelve las prendas al stock
-- (propietaria o administradora)
-- ---------------------------------------------------------------------
create or replace function public.void_sale(p_sale uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_sale public.sales; v_it record;
begin
  if public.my_role() not in ('propietaria', 'admin') then raise exception 'Solo la propietaria o la administradora pueden anular ventas'; end if;
  select * into v_sale from public.sales where id = p_sale for update;
  if v_sale.id is null then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'anulada' then raise exception 'La venta ya estaba anulada'; end if;
  for v_it in select * from public.sale_items where sale_id = p_sale loop
    update public.variants set stock = stock + v_it.qty where id = v_it.variant_id;
    insert into public.stock_moves (variant_id, partner_id, type, qty, user_id, sale_id, note)
    values (v_it.variant_id, v_it.partner_id, 'anulacion', v_it.qty, auth.uid(), p_sale, p_reason);
  end loop;
  if v_sale.discount_code is not null then
    update public.discount_codes set uses = greatest(uses - 1, 0) where code = v_sale.discount_code;
  end if;
  update public.sales set status = 'anulada', voided_at = now(), voided_by = auth.uid() where id = p_sale;
end $$;

-- ---------------------------------------------------------------------
-- save_product: crea o edita un producto con su costo y variantes
--   p = {"id": null|uuid, "name", "category_id", "brand_id", "partner_id", "price", "cost",
--        "photo_path", "variants": [{"id": null|uuid, "size", "color", "barcode", "initial_stock"}]}
-- El costo solo se guarda si el usuario puede ver costos.
-- Las variantes que no vengan se desactivan (o se borran si nunca se usaron).
-- ---------------------------------------------------------------------
create or replace function public.save_product(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v jsonb; v_vid uuid; v_keep uuid[] := '{}'; v_code text; v_init int;
begin
  if not public.perm('can_edit_catalog') then raise exception 'Tu rol no puede editar productos'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'El producto necesita un nombre'; end if;
  if jsonb_array_length(coalesce(p -> 'variants', '[]')) = 0 then raise exception 'El producto necesita al menos una talla/color'; end if;

  if v_id is null then
    insert into public.products (name, category_id, brand_id, partner_id, price, photo_path)
    values (trim(p ->> 'name'), (p ->> 'category_id')::int, (p ->> 'brand_id')::int, (p ->> 'partner_id')::uuid,
            (p ->> 'price')::numeric, p ->> 'photo_path')
    returning id into v_id;
    insert into public.product_costs (product_id, cost)
    values (v_id, case when public.perm('can_see_cost') then coalesce((p ->> 'cost')::numeric, 0) else 0 end);
  else
    update public.products set name = trim(p ->> 'name'), category_id = (p ->> 'category_id')::int, brand_id = (p ->> 'brand_id')::int,
           partner_id = (p ->> 'partner_id')::uuid, price = (p ->> 'price')::numeric,
           photo_path = coalesce(p ->> 'photo_path', photo_path), updated_at = now()
     where id = v_id;
    if not found then raise exception 'Producto no encontrado'; end if;
    if public.perm('can_see_cost') and p ? 'cost' then
      insert into public.product_costs (product_id, cost) values (v_id, (p ->> 'cost')::numeric)
      on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
    end if;
  end if;

  for v in select * from jsonb_array_elements(p -> 'variants') loop
    v_code := nullif(trim(v ->> 'barcode'), '');
    v_vid := nullif(v ->> 'id', '')::uuid;
    if v_vid is null then
      insert into public.variants (product_id, size, color, barcode, stock)
      values (v_id, trim(v ->> 'size'), trim(v ->> 'color'), coalesce(v_code, nextval('public.barcode_seq')::text), 0)
      returning id into v_vid;
      v_init := coalesce((v ->> 'initial_stock')::int, 0);
      if v_init > 0 then
        if not public.perm('can_stock_in') then raise exception 'Tu rol no puede cargar stock inicial'; end if;
        update public.variants set stock = v_init where id = v_vid;
        insert into public.stock_moves (variant_id, partner_id, type, qty, user_id, note)
        values (v_vid, (p ->> 'partner_id')::uuid, 'inicial', v_init, auth.uid(), 'Stock inicial');
      end if;
    else
      update public.variants set size = trim(v ->> 'size'), color = trim(v ->> 'color'),
             barcode = coalesce(v_code, barcode), active = true
       where id = v_vid and product_id = v_id;
    end if;
    v_keep := v_keep || v_vid;
  end loop;

  -- variantes quitadas: se borran si nunca se usaron; si no, se desactivan
  delete from public.variants x where x.product_id = v_id and not (x.id = any (v_keep)) and x.stock = 0
     and not exists (select 1 from public.sale_items s where s.variant_id = x.id)
     and not exists (select 1 from public.stock_moves m where m.variant_id = x.id);
  update public.variants set active = false where product_id = v_id and not (id = any (v_keep));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- PIN de autorización de descuentos
-- ---------------------------------------------------------------------
create or replace function public.set_pin(p_user uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.is_owner() or p_user = auth.uid()) then raise exception 'No autorizado'; end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'El PIN debe tener de 4 a 6 números'; end if;
  insert into public.user_pins (user_id, pin_hash) values (p_user, crypt(p_pin, gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

-- Valida un PIN sin registrar venta (para que la app muestre "autorizado por …")
create or replace function public.check_pin(p_pin text, p_pct numeric)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v record;
begin
  if not public.is_active_user() then raise exception 'No autorizado'; end if;
  select p.id, p.name, r.max_disc into v
    from public.user_pins up join public.profiles p on p.id = up.user_id join public.roles r on r.key = p.role
   where p.active and up.pin_hash = crypt(coalesce(p_pin, ''), up.pin_hash)
   order by r.max_disc desc limit 1;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto'); end if;
  if v.max_disc < p_pct then return jsonb_build_object('ok', false, 'error', format('El límite de %s es %s %%', v.name, v.max_disc)); end if;
  return jsonb_build_object('ok', true, 'id', v.id, 'name', v.name);
end $$;

-- ---------------------------------------------------------------------
-- Quién puede ejecutar cada función
-- ---------------------------------------------------------------------
revoke all on function public.register_sale(jsonb, text, jsonb, text) from public, anon;
revoke all on function public.stock_in(uuid, int, text, text)        from public, anon;
revoke all on function public.void_sale(uuid, text)                  from public, anon;
revoke all on function public.save_product(jsonb)                    from public, anon;
revoke all on function public.set_pin(uuid, text)                    from public, anon;
revoke all on function public.check_pin(text, numeric)               from public, anon;
grant execute on function public.register_sale(jsonb, text, jsonb, text) to authenticated;
grant execute on function public.stock_in(uuid, int, text, text)        to authenticated;
grant execute on function public.void_sale(uuid, text)                  to authenticated;
grant execute on function public.save_product(jsonb)                    to authenticated;
grant execute on function public.set_pin(uuid, text)                    to authenticated;
grant execute on function public.check_pin(text, numeric)               to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
