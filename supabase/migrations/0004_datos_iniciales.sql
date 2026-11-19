-- =====================================================================
-- 0004 · Datos iniciales: roles, ajustes y catálogos básicos
-- (sin productos ni ventas: esos los carga la tienda)
-- =====================================================================

insert into public.roles (key, label, max_disc, views, see_all_sales, can_see_cost, can_see_profit, can_stock_in, can_expense, can_edit_catalog) values
  ('propietaria', 'Propietaria',    100, array['panel','venta','inventario','gastos','reportes','catalogos','usuarios'], true,  true,  true,  true,  true,  true),
  ('admin',       'Administradora', 15,  array['panel','venta','inventario','gastos','reportes','catalogos'],            true,  false, false, true,  true,  true),
  ('vendedor',    'Vendedor',       10,  array['panel','venta','inventario'],                                           false, false, false, false, false, false)
on conflict (key) do nothing;

insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.partners (name, share, color) values ('Ari''s Closet', 100, '#111111');

insert into public.categories (name, sort) values
  ('Blusas', 1), ('Pantalones', 2), ('Vestidos', 3), ('Faldas', 4), ('Sandalias', 5),
  ('Tacones', 6), ('Tenis', 7), ('Bolsos', 8), ('Carteras', 9), ('Accesorios', 10)
on conflict (name) do nothing;

insert into public.payment_methods (name, sort) values ('Efectivo', 1), ('Tarjeta', 2), ('Transferencia', 3)
on conflict (name) do nothing;

insert into public.expense_categories (name, sort) values
  ('Alquiler', 1), ('Servicios', 2), ('Mercadería', 3), ('Salarios', 4), ('Transporte', 5), ('Otros', 6)
on conflict (name) do nothing;
