-- =====================================================================
-- 0008 · Caja: apertura con fondo inicial, retiros/ingresos, arqueo y cierre
-- Una sola caja para la tienda. El efectivo esperado lo calcula la base:
--   fondo + ventas en efectivo + ingresos − retiros − gastos pagados con la caja
-- Quien no ve todas las ventas (vendedor) cuenta "a ciegas": no ve el esperado
-- ni la diferencia. Correr una vez, después de 0007.
-- =====================================================================

create table if not exists public.cash_sessions (
  id          uuid primary key default gen_random_uuid(),
  day         date not null default (now() at time zone 'America/Managua')::date,
  opened_by   uuid not null references public.profiles(id) default auth.uid(),
  opened_at   timestamptz not null default now(),
  opening     numeric(12,2) not null check (opening >= 0),
  closed_by   uuid references public.profiles(id),
  closed_at   timestamptz,
  expected    numeric(12,2),
  counted     numeric(12,2),
  difference  numeric(12,2),
  breakdown   jsonb,
  note        text,
  status      text not null default 'abierta' check (status in ('abierta', 'cerrada'))
);
-- Solo puede haber una caja abierta a la vez
create unique index if not exists cash_sessions_one_open on public.cash_sessions ((true)) where status = 'abierta';
create index if not exists cash_sessions_day on public.cash_sessions (day desc);

create table if not exists public.cash_moves (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.cash_sessions(id),
  type        text not null check (type in ('retiro', 'ingreso')),
  amount      numeric(12,2) not null check (amount > 0),
  note        text not null default '',
  user_id     uuid not null references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.expenses
  add column if not exists paid_from_cash  boolean not null default false,
  add column if not exists cash_session_id uuid references public.cash_sessions(id);

-- Un gasto "pagado con la caja" queda ligado a la caja abierta
create or replace function public.expenses_cash_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paid_from_cash then
    select id into new.cash_session_id from public.cash_sessions where status = 'abierta' limit 1;
    if new.cash_session_id is null then raise exception 'No hay caja abierta: abrí la caja o desmarcá "Pagado con efectivo de la caja"'; end if;
  else
    new.cash_session_id := null;
  end if;
  return new;
end $$;
drop trigger if exists expenses_cash_link on public.expenses;
create trigger expenses_cash_link before insert on public.expenses for each row execute function public.expenses_cash_link();

alter table public.cash_sessions enable row level security;
alter table public.cash_moves    enable row level security;
revoke all on public.cash_sessions, public.cash_moves from anon, authenticated;
grant select on public.cash_sessions, public.cash_moves to authenticated;
-- Lectura directa solo para quien ve todas las ventas; el resto usa cash_status()
drop policy if exists cash_sessions_read on public.cash_sessions;
create policy cash_sessions_read on public.cash_sessions for select to authenticated using (public.perm('see_all_sales'));
drop policy if exists cash_moves_read on public.cash_moves;
create policy cash_moves_read on public.cash_moves for select to authenticated using (public.perm('see_all_sales'));

-- Cuentas de una caja (desde su apertura hasta su cierre o ahora)
create or replace function public._cash_calc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.cash_sessions; v_until timestamptz; v_cash numeric; v_n int; v_in numeric; v_out numeric; v_exp numeric; v_other jsonb;
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
  return jsonb_build_object('opening', s.opening, 'cash_sales', v_cash, 'cash_sales_n', v_n, 'ins', v_in, 'outs', v_out,
    'expenses', v_exp, 'expected', s.opening + v_cash + v_in - v_out - v_exp, 'other', v_other);
end $$;

-- Estado de la caja abierta. Las cifras solo para quien ve todas las ventas.
create or replace function public.cash_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.cash_sessions; v_last public.cash_sessions; r jsonb;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo'; end if;
  select * into s from public.cash_sessions where status = 'abierta' limit 1;
  select * into v_last from public.cash_sessions where status = 'cerrada' order by closed_at desc limit 1;
  if s.id is null then
    return jsonb_build_object('open', false, 'last_counted', case when public.perm('see_all_sales') then v_last.counted end,
      'last_closed_at', v_last.closed_at, 'last_closed_by', (select name from public.profiles where id = v_last.closed_by));
  end if;
  r := jsonb_build_object('open', true, 'id', s.id, 'day', s.day, 'opened_at', s.opened_at,
    'opened_by', (select name from public.profiles where id = s.opened_by), 'can_see', public.perm('see_all_sales'));
  if public.perm('see_all_sales') then
    r := r || public._cash_calc(s.id) || jsonb_build_object('moves', coalesce((select jsonb_agg(jsonb_build_object('type', m.type, 'amount', m.amount, 'note', m.note, 'at', m.created_at, 'by', p.name) order by m.created_at)
      from public.cash_moves m join public.profiles p on p.id = m.user_id where m.session_id = s.id), '[]'::jsonb));
  end if;
  return r;
end $$;

create or replace function public.cash_open(p_opening numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo'; end if;
  if coalesce(p_opening, -1) < 0 then raise exception 'El fondo inicial no puede ser negativo'; end if;
  if exists (select 1 from public.cash_sessions where status = 'abierta') then raise exception 'La caja ya está abierta'; end if;
  insert into public.cash_sessions (opening, opened_by) values (round(p_opening, 2), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cash_move(p_type text, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.perm('see_all_sales') then raise exception 'Solo la propietaria o la administradora registran retiros e ingresos'; end if;
  if p_type not in ('retiro', 'ingreso') then raise exception 'Tipo inválido'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  select id into v_id from public.cash_sessions where status = 'abierta' limit 1;
  if v_id is null then raise exception 'No hay caja abierta'; end if;
  insert into public.cash_moves (session_id, type, amount, note) values (v_id, p_type, round(p_amount, 2), coalesce(trim(p_note), ''));
end $$;

-- Arqueo y cierre: guarda lo contado y la diferencia. A quien cuenta a ciegas no se le devuelve.
create or replace function public.cash_close(p_counted numeric, p_breakdown jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.cash_sessions; c jsonb; v_diff numeric;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo'; end if;
  if coalesce(p_counted, -1) < 0 then raise exception 'El conteo no puede ser negativo'; end if;
  select * into s from public.cash_sessions where status = 'abierta' limit 1 for update;
  if s.id is null then raise exception 'No hay caja abierta'; end if;
  c := public._cash_calc(s.id);
  v_diff := round(p_counted - (c->>'expected')::numeric, 2);
  update public.cash_sessions set status = 'cerrada', closed_at = now(), closed_by = auth.uid(),
    expected = (c->>'expected')::numeric, counted = round(p_counted, 2), difference = v_diff, breakdown = p_breakdown, note = nullif(trim(coalesce(p_note, '')), '')
   where id = s.id;
  if public.perm('see_all_sales') then return c || jsonb_build_object('counted', round(p_counted, 2), 'difference', v_diff); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Historial de cierres con sus cifras (para reportes)
create or replace function public.cash_history(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.perm('see_all_sales') then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'day', s.day, 'status', s.status, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
      'opened_by', po.name, 'closed_by', pc.name, 'opening', s.opening, 'expected', s.expected, 'counted', s.counted, 'difference', s.difference,
      'breakdown', s.breakdown, 'note', s.note, 'calc', public._cash_calc(s.id),
      'moves', coalesce((select jsonb_agg(jsonb_build_object('type', m.type, 'amount', m.amount, 'note', m.note, 'at', m.created_at, 'by', pm.name) order by m.created_at)
        from public.cash_moves m join public.profiles pm on pm.id = m.user_id where m.session_id = s.id), '[]'::jsonb)) order by s.opened_at desc)
    from public.cash_sessions s left join public.profiles po on po.id = s.opened_by left join public.profiles pc on pc.id = s.closed_by
   where s.day between p_from and p_to), '[]'::jsonb);
end $$;

revoke all on function public._cash_calc(uuid) from public, anon, authenticated;
revoke all on function public.cash_status(), public.cash_open(numeric), public.cash_move(text, numeric, text), public.cash_close(numeric, jsonb, text), public.cash_history(date, date) from public, anon;
grant execute on function public.cash_status(), public.cash_open(numeric), public.cash_move(text, numeric, text), public.cash_close(numeric, jsonb, text), public.cash_history(date, date) to authenticated;

-- Avisos en vivo cuando se abre o cierra la caja
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cash_sessions, public.cash_moves; exception when duplicate_object then null; end;
  end if;
end $$;
