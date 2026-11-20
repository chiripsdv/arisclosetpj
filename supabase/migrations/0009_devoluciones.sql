-- =====================================================================
-- 0009 · Devoluciones desde la factura
-- Se devuelven piezas de una venta: vuelven al inventario, la factura baja
-- su total y, si se reembolsa en efectivo, sale de la caja abierta.
-- Correr una vez, después de 0008.
-- =====================================================================

alter table public.sale_items add column if not exists returned_qty int not null default 0;
alter table public.sale_items drop constraint if exists sale_items_returned_check;
alter table public.sale_items add constraint sale_items_returned_check check (returned_qty between 0 and qty);

create table if not exists public.sale_returns (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales (id),
  user_id        uuid not null references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  day            date not null default (now() at time zone 'America/Managua')::date,
  reason         text not null default '',
  refund_method  text not null check (refund_method in ('efectivo', 'cambio', 'otro')),
  amount         numeric(12,2) not null check (amount >= 0),
  items          jsonb not null              -- [{sale_item_id, variant_id, qty, amount}]
);
create index if not exists sale_returns_sale on public.sale_returns (sale_id);

alter table public.sale_returns enable row level security;
revoke all on public.sale_returns from anon, authenticated;
grant select on public.sale_returns to authenticated;
drop policy if exists sale_returns_read on public.sale_returns;
create policy sale_returns_read on public.sale_returns for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and (public.perm('see_all_sales') or s.seller_id = auth.uid())));

-- p_items: [{"item_id": "<sale_item uuid>", "qty": 1}, ...]
create or replace function public.return_items(p_sale uuid, p_items jsonb, p_reason text, p_refund text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sale public.sales; v_it public.sale_items; e jsonb; q int; v_amount numeric := 0; v_line numeric; v_out jsonb := '[]'::jsonb; v_id uuid;
begin
  if public.my_role() not in ('propietaria', 'admin') then raise exception 'Solo la propietaria o la administradora registran devoluciones'; end if;
  if p_refund not in ('efectivo', 'cambio', 'otro') then raise exception 'Forma de reembolso no válida'; end if;
  select * into v_sale from public.sales where id = p_sale for update;
  if v_sale.id is null then raise exception 'Venta no encontrada'; end if;
  if v_sale.status <> 'cerrada' then raise exception 'La venta está anulada'; end if;
  if p_refund = 'efectivo' and not exists (select 1 from public.cash_sessions where status = 'abierta') then
    raise exception 'Para reembolsar en efectivo tiene que haber una caja abierta';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    q := coalesce((e->>'qty')::int, 0);
    continue when q <= 0;
    select * into v_it from public.sale_items where id = (e->>'item_id')::uuid and sale_id = p_sale for update;
    if v_it.id is null then raise exception 'Artículo no encontrado en la factura'; end if;
    if q > v_it.qty - v_it.returned_qty then raise exception 'De "%" solo quedan % por devolver', v_it.name, v_it.qty - v_it.returned_qty; end if;
    -- lo que se pagó por esas piezas (con el descuento de la factura prorrateado)
    v_line := case when v_it.returned_qty + q = v_it.qty
      then v_it.net_total - round(v_it.net_total * v_it.returned_qty / v_it.qty, 2)
      else round(v_it.net_total * q / v_it.qty, 2) end;
    update public.sale_items set returned_qty = returned_qty + q where id = v_it.id;
    update public.variants set stock = stock + q where id = v_it.variant_id;
    insert into public.stock_moves (variant_id, partner_id, type, qty, user_id, sale_id, note)
    values (v_it.variant_id, v_it.partner_id, 'devolucion', q, auth.uid(), p_sale, nullif(trim(coalesce(p_reason, '')), ''));
    v_amount := v_amount + v_line;
    v_out := v_out || jsonb_build_object('sale_item_id', v_it.id, 'variant_id', v_it.variant_id, 'qty', q, 'amount', v_line);
  end loop;
  if jsonb_array_length(v_out) = 0 then raise exception 'Elegí al menos una pieza para devolver'; end if;
  insert into public.sale_returns (sale_id, reason, refund_method, amount, items)
  values (p_sale, coalesce(trim(p_reason), ''), p_refund, v_amount, v_out) returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $$;
revoke all on function public.return_items(uuid, jsonb, text, text) from public, anon;
grant execute on function public.return_items(uuid, jsonb, text, text) to authenticated;

-- Anular una venta con devoluciones: solo vuelve al inventario lo que no se devolvió
create or replace function public.void_sale(p_sale uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_sale public.sales; v_it record;
begin
  if public.my_role() not in ('propietaria', 'admin') then raise exception 'Solo la propietaria o la administradora pueden anular ventas'; end if;
  select * into v_sale from public.sales where id = p_sale for update;
  if v_sale.id is null then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'anulada' then raise exception 'La venta ya estaba anulada'; end if;
  if exists (select 1 from public.sale_returns where sale_id = p_sale) then raise exception 'Esta venta tiene devoluciones: devolvé las piezas que faltan en lugar de anularla'; end if;
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

-- La caja descuenta los reembolsos en efectivo hechos mientras estuvo abierta
create or replace function public._cash_calc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.cash_sessions; v_until timestamptz; v_cash numeric; v_n int; v_in numeric; v_out numeric; v_exp numeric; v_ref numeric; v_other jsonb;
begin
  select * into s from public.cash_sessions where id = p_id;
  v_until := coalesce(s.closed_at, now());
  select coalesce(sum(total), 0), count(*) into v_cash, v_n from public.sales
   where status = 'cerrada' and payment_method ilike 'efectivo%' and created_at >= s.opened_at and created_at <= v_until;
  select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'total', t, 'n', n) order by t desc), '[]'::jsonb) into v_other
    from (select payment_method, sum(total) t, count(*) n from public.sales
           where status = 'cerrada' and payment_method not ilike 'efectivo%' and created_at >= s.opened_at and created_at <= v_until
           group by payment_method) x;
  select coalesce(sum(amount) filter (where type = 'ingreso'), 0), coalesce(sum(amount) filter (where type = 'retiro'), 0)
    into v_in, v_out from public.cash_moves where session_id = s.id;
  select coalesce(sum(amount), 0) into v_exp from public.expenses where cash_session_id = s.id;
  select coalesce(sum(amount), 0) into v_ref from public.sale_returns
   where refund_method = 'efectivo' and created_at >= s.opened_at and created_at <= v_until;
  return jsonb_build_object('opening', s.opening, 'cash_sales', v_cash, 'cash_sales_n', v_n, 'ins', v_in, 'outs', v_out,
    'expenses', v_exp, 'refunds', v_ref, 'expected', s.opening + v_cash + v_in - v_out - v_exp - v_ref, 'other', v_other);
end $$;
revoke all on function public._cash_calc(uuid) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.sale_returns; exception when duplicate_object then null; end;
  end if;
end $$;
