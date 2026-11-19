\set ON_ERROR_STOP 0
\pset footer off
-- Usuarios (como si se crearan en Supabase Auth)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','ariana@test.com','{"name":"Ariana"}'),
 ('00000000-0000-0000-0000-000000000002','karla@test.com','{"name":"Karla"}'),
 ('00000000-0000-0000-0000-000000000003','jose@test.com','{"name":"José"}');
\echo '--- perfiles creados por el disparador (Ariana propietaria activa; demás inactivos)'
select name, role, active from public.profiles order by name;

-- Funciones de ayuda para "ser" un usuario
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;

-- === Como propietaria ===
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.profiles set active = true, role = 'admin' where name = 'Karla';
update public.profiles set active = true where name = 'José';
select public.set_pin('00000000-0000-0000-0000-000000000001', '1234');
insert into public.partners (name, share, color) values ('María (socia)', 40, '#B07A4A');
update public.partners set share = 60 where name = 'Ari''s Closet';
insert into public.discount_codes (code, pct, max_uses) values ('ARI15', 15, 2);
select public.save_product(jsonb_build_object('name','Blusa floral','category_id',1,'brand_id',null,
  'partner_id',(select id from public.partners where name='Ari''s Closet'),'price',520,'cost',280,
  'variants', jsonb_build_array(jsonb_build_object('size','S','color','Rosa','initial_stock',3),
                                jsonb_build_object('size','M','color','Rosa','initial_stock',5)))) is not null as "propietaria crea producto";
select public.save_product(jsonb_build_object('name','Bolso tote','category_id',8,
  'partner_id',(select id from public.partners where name='María (socia)'),'price',890,'cost',480,
  'variants', jsonb_build_array(jsonb_build_object('size','Única','color','Camel','initial_stock',2,'barcode','7501234567890')))) is not null as "bolso de la socia";
\echo '--- productos, costo visible para la propietaria'
select p.name, p.price, c.cost, v.size, v.color, v.barcode, v.stock from public.products p left join public.product_costs c on c.product_id=p.id join public.variants v on v.product_id=p.id order by 1,4;
\echo '--- la propietaria intenta quitarse permisos: el disparador los restaura'
update public.roles set can_see_profit = false, max_disc = 5 where key = 'propietaria';
select key, max_disc, can_see_profit from public.roles where key='propietaria';
reset role;

-- === Como vendedor (José) ===
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
\echo '--- José: costos visibles? (debe ser 0 filas)'
select count(*) as costos_que_ve_jose from public.product_costs;
\echo '--- José vende 2 blusas M con 10 % (su límite)'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',2)), 'Efectivo', '{"type":"manual","pct":10}') ->> 'total' as total_venta_jose;
\echo '--- José intenta 15 % manual (debe fallar)'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',1)), 'Efectivo', '{"type":"manual","pct":15}');
\echo '--- José con PIN de Ariana, 20 % blusa + bolso de la socia'
select public.register_sale(jsonb_build_array(
   jsonb_build_object('variant_id',(select id from public.variants where size='S'),'qty',1),
   jsonb_build_object('variant_id',(select id from public.variants where barcode='7501234567890'),'qty',1)),
   'Tarjeta', '{"type":"pin","pct":20,"pin":"1234"}', '8888 1234') ->> 'total' as total_con_pin;
\echo '--- PIN incorrecto (debe fallar)'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='S'),'qty',1)), 'Efectivo', '{"type":"pin","pct":20,"pin":"9999"}');
\echo '--- Descuento que deja la blusa bajo costo (60 % con PIN, debe fallar por precio mínimo)'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='S'),'qty',1)), 'Efectivo', '{"type":"pin","pct":60,"pin":"1234"}');
\echo '--- Más stock del que hay (debe fallar)'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',50)), 'Efectivo');
\echo '--- Código ARI15 (máx 2 usos): dos veces bien, la tercera falla'
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',1)), 'Efectivo', '{"type":"codigo","code":"ari15"}') ->> 'total' as con_codigo_1;
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='S'),'qty',1)), 'Efectivo', '{"type":"codigo","code":"ARI15"}') ->> 'total' as con_codigo_2;
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',1)), 'Efectivo', '{"type":"codigo","code":"ARI15"}');
\echo '--- José intenta insertar una venta directo / cambiar stock / ver costos de ventas (todo debe fallar o dar 0)'
insert into public.sales (seller_id, subtotal, total, payment_method) values (auth.uid(), 1, 1, 'Efectivo');
update public.variants set stock = 999 where size = 'S';
select count(*) as costos_de_ventas_que_ve_jose from public.sale_item_costs;
select count(*) as kardex_que_ve_jose from public.stock_moves;
\echo '--- José intenta anular una venta (debe fallar)'
select public.void_sale((select id from public.sales limit 1));
reset role;

-- === Como administradora (Karla): vende una y revisa qué ve ===
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select public.register_sale(jsonb_build_array(jsonb_build_object('variant_id',(select id from public.variants where size='M'),'qty',1)), 'Transferencia') ->> 'number' as ticket_karla;
select count(*) as ventas_que_ve_karla, (select count(*) from public.product_costs) as costos_que_ve_karla from public.sales;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select count(*) as ventas_que_ve_jose from public.sales;
reset role;

-- === Propietaria: resultados ===
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
\echo '--- ventas registradas'
select s.number, pr.name as vendio, s.subtotal, s.discount_type, s.discount_pct, s.discount_amount, s.total, s.payment_method,
       (select name from public.profiles where id = s.authorized_by) as autorizo
  from public.sales s join public.profiles pr on pr.id = s.seller_id order by s.number;
\echo '--- reparto por socio (neto) y utilidad bruta'
select pa.name as socio, sum(i.qty) as piezas, sum(i.net_total) as venta_neta, sum(i.net_total - c.unit_cost * i.qty) as utilidad_bruta
  from public.sale_items i join public.sale_item_costs c on c.sale_item_id = i.id join public.partners pa on pa.id = i.partner_id
  join public.sales s on s.id = i.sale_id where s.status='cerrada' group by pa.name order by 1;
\echo '--- comprobación: suma de líneas = total de cada venta'
select s.number, s.total, sum(i.net_total) as suma_lineas, s.total = sum(i.net_total) as cuadra from public.sales s join public.sale_items i on i.sale_id=s.id group by s.id order by s.number;
\echo '--- anular la primera venta: el stock vuelve'
select stock as stock_M_antes from public.variants where size='M';
select public.void_sale((select id from public.sales order by number limit 1), 'Prueba');
select stock as stock_M_despues from public.variants where size='M';
\echo '--- kárdex'
select m.type, v.size, v.color, m.qty from public.stock_moves m join public.variants v on v.id = m.variant_id order by m.id;
reset role;
\echo '--- visitante sin sesión (anon) no ve nada'
set role anon;
select count(*) from public.products;
reset role;
