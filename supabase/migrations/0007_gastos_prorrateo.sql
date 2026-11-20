-- =====================================================================
-- 0007 · Gastos prorrateados (alquiler, salarios, equipo…)
-- Un gasto se puede repartir en días, meses o años: los reportes cargan
-- a cada día solo la parte que le toca. Correr una vez, después de 0006.
-- =====================================================================

alter table public.expenses
  add column if not exists spread_qty  int  check (spread_qty is null or spread_qty between 1 and 3650),
  add column if not exists spread_unit text check (spread_unit is null or spread_unit in ('dias', 'meses', 'anios')),
  add column if not exists spread_from date;

alter table public.expenses drop constraint if exists expenses_spread_check;
alter table public.expenses add constraint expenses_spread_check
  check ((spread_qty is null and spread_unit is null) or (spread_qty is not null and spread_unit is not null));

create index if not exists expenses_spread_idx on public.expenses (spread_from) where spread_qty is not null;
