-- =====================================================================
-- Ari's Closet · Base de datos (Supabase / PostgreSQL)
-- 0001 · Tablas
-- Ejecutar en orden: 0001 → 0002 → 0003 → 0004 (SQL Editor de Supabase)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Roles y permisos (editables por la propietaria desde la app)
-- ---------------------------------------------------------------------
create table public.roles (
  key               text primary key check (key in ('propietaria', 'admin', 'vendedor')),
  label             text not null,
  max_disc          int  not null default 0 check (max_disc between 0 and 100),
  views             text[] not null default array['venta'],
  see_all_sales     boolean not null default false,
  can_see_cost      boolean not null default false,
  can_see_profit    boolean not null default false,
  can_stock_in      boolean not null default false,
  can_expense       boolean not null default false,
  can_edit_catalog  boolean not null default false,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Usuarios de la app (uno por cada usuario de Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text,
  role        text not null default 'vendedor' references public.roles (key),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- PIN de autorización de descuentos, guardado cifrado y aparte
-- (nadie puede leerlo desde la app; solo lo comparan las funciones).
create table public.user_pins (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  pin_hash  text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ajustes generales (una sola fila)
-- ---------------------------------------------------------------------
create table public.settings (
  id          int primary key default 1 check (id = 1),
  store       text not null default 'Ari''s Closet',
  currency    text not null default 'C$',
  low_stock   int  not null default 2 check (low_stock >= 0),
  min_margin  numeric(5,2) not null default 5 check (min_margin >= 0),
  wa_country  text not null default '505',
  paper       text not null default '80' check (paper in ('80', '58')),
  rc_logo     boolean not null default true,
  rc_address  text not null default '',
  rc_phone    text not null default '',
  rc_ruc      text not null default '',
  rc_footer   text not null default '¡Gracias por tu compra!',
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Socios
-- ---------------------------------------------------------------------
create table public.partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  share       numeric(5,2) not null default 0 check (share between 0 and 100),  -- % de gastos compartidos
  color       text not null default '#111111',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catálogos simples
-- ---------------------------------------------------------------------
create table public.categories (
  id serial primary key, name text not null unique, sort int not null default 0, active boolean not null default true
);
create table public.brands (
  id serial primary key, name text not null unique, sort int not null default 0, active boolean not null default true
);
create table public.payment_methods (
  id serial primary key, name text not null unique, sort int not null default 0, active boolean not null default true
);
create table public.expense_categories (
  id serial primary key, name text not null unique, sort int not null default 0, active boolean not null default true
);

create table public.discount_codes (
  code        text primary key check (code = upper(code) and length(code) between 3 and 30),
  pct         numeric(5,2) not null check (pct > 0 and pct <= 90),
  max_uses    int not null default 100 check (max_uses > 0),
  uses        int not null default 0 check (uses >= 0),
  valid_from  date,
  valid_to    date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Productos, costos (separados por seguridad) y variantes (talla/color)
-- ---------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category_id  int  references public.categories (id),
  brand_id     int  references public.brands (id),
  partner_id   uuid not null references public.partners (id),
  price        numeric(12,2) not null check (price >= 0),
  photo_path   text,                                   -- ruta en Storage (bucket product-photos)
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- El costo vive aparte: solo lo leen los roles con "ver costos".
create table public.product_costs (
  product_id  uuid primary key references public.products (id) on delete cascade,
  cost        numeric(12,2) not null default 0 check (cost >= 0),
  updated_at  timestamptz not null default now()
);

create table public.variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  size        text not null,
  color       text not null,
  barcode     text not null unique,
  stock       int  not null default 0 check (stock >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (product_id, size, color)
);
create index variants_product_idx on public.variants (product_id);

-- Números de código de barras automáticos (empiezan en 2000001)
create sequence public.barcode_seq start 2000001;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated always as identity (start with 1000) unique,
  created_at       timestamptz not null default now(),
  day              date not null default (now() at time zone 'America/Managua')::date,
  seller_id        uuid not null references public.profiles (id),
  subtotal         numeric(12,2) not null check (subtotal >= 0),
  discount_type    text check (discount_type in ('manual', 'codigo', 'pin')),
  discount_pct     numeric(5,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_code    text references public.discount_codes (code),
  authorized_by    uuid references public.profiles (id),
  total            numeric(12,2) not null check (total >= 0),
  payment_method   text not null,
  customer_phone   text,
  status           text not null default 'cerrada' check (status in ('cerrada', 'anulada')),
  voided_at        timestamptz,
  voided_by        uuid references public.profiles (id)
);
create index sales_day_idx on public.sales (day);
create index sales_seller_idx on public.sales (seller_id, day);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales (id) on delete cascade,
  variant_id  uuid not null references public.variants (id),
  product_id  uuid not null references public.products (id),
  partner_id  uuid not null references public.partners (id),    -- dueño de la prenda al momento de vender
  name        text not null,
  size        text not null,
  color       text not null,
  qty         int  not null check (qty > 0),
  price       numeric(12,2) not null check (price >= 0),
  line_total  numeric(12,2) not null,                            -- precio × cantidad (antes del descuento del ticket)
  net_total   numeric(12,2) not null                             -- con el descuento del ticket prorrateado
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_partner_idx on public.sale_items (partner_id);

-- Costo de cada línea vendida, aparte (para utilidad y márgenes)
create table public.sale_item_costs (
  sale_item_id  uuid primary key references public.sale_items (id) on delete cascade,
  unit_cost     numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- Movimientos de inventario (kárdex)
-- ---------------------------------------------------------------------
create table public.stock_moves (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  variant_id  uuid not null references public.variants (id),
  partner_id  uuid not null references public.partners (id),
  type        text not null check (type in ('venta', 'compra', 'ajuste', 'devolucion', 'anulacion', 'inicial')),
  qty         int not null check (qty <> 0),
  user_id     uuid references public.profiles (id),
  sale_id     uuid references public.sales (id),
  note        text
);
create index stock_moves_variant_idx on public.stock_moves (variant_id, created_at);

-- ---------------------------------------------------------------------
-- Gastos (partner_id nulo = gasto compartido, se reparte según % del socio)
-- ---------------------------------------------------------------------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  day           date not null default (now() at time zone 'America/Managua')::date,
  category_id   int not null references public.expense_categories (id),
  amount        numeric(12,2) not null check (amount > 0),
  note          text not null default '',
  partner_id    uuid references public.partners (id),
  receipt_path  text,                                    -- ruta en Storage (bucket receipts)
  user_id       uuid not null references public.profiles (id) default auth.uid()
);
create index expenses_day_idx on public.expenses (day);
