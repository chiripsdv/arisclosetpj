# Base de datos de Ari's Closet (Supabase)

Cuatro scripts SQL crean toda la base: tablas, seguridad por rol, funciones de venta y datos iniciales.
Se corren **una sola vez**, en orden, en un proyecto nuevo de Supabase.

| Script | Qué hace |
| --- | --- |
| `migrations/0001_tablas.sql` | 18 tablas: usuarios y roles, ajustes, socios, catálogos, productos (con costos aparte), variantes, ventas, líneas, kárdex, gastos, códigos de descuento |
| `migrations/0002_seguridad.sql` | Permisos por rol con Row Level Security, alta automática de usuarios, tiempo real y carpetas para fotos y comprobantes |
| `migrations/0003_funciones.sql` | `register_sale`, `stock_in`, `void_sale`, `save_product`, `set_pin`, `check_pin` |
| `migrations/0004_datos_iniciales.sql` | Roles, ajustes, socio principal, categorías, formas de pago y categorías de gasto |

## Pasos de instalación

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo:
   - **Name:** `aris-closet`
   - **Database password:** una contraseña fuerte. Guardala en un lugar seguro; no hace falta compartirla con nadie.
   - **Region:** East US (la más cercana a Nicaragua).
2. Esperá a que el proyecto termine de crearse (1–2 minutos).
3. Menú izquierdo → **SQL Editor** → **New query**. Copiá todo el contenido de `0001_tablas.sql`, pegalo y tocá **Run**. Debe decir *Success*.
4. Repetí el paso 3 con `0002_seguridad.sql`, después `0003_funciones.sql` y por último `0004_datos_iniciales.sql`.
5. **Authentication → Sign In / Providers → Email:** desactivá **Allow new users to sign up** (nadie puede registrarse solo; los usuarios los crea la tienda).
6. **Authentication → Users → Add user → Create new user:** creá primero a la **propietaria** con su correo y contraseña, marcando *Auto Confirm User*. El primer usuario queda como propietaria automáticamente.
7. Creá los demás usuarios igual. Entran como **vendedor inactivo**; la propietaria los activa y les asigna el rol desde la app (Usuarios).
8. **Project Settings → API Keys:** copiá la **Project URL** y la clave **pública** (`anon` o `publishable`). Esas dos se ponen en la app.

> ⚠️ Nunca compartas ni pongas en la app la clave **secret / service_role** ni la contraseña de la base de datos.
> La clave pública sí puede ir en la app: la seguridad por rol (RLS) es la que protege los datos.

## Conectar la app

La app ya trae la dirección del proyecto y la clave pública en `config.js`. Falta configurar dos cosas en Supabase:

1. **Authentication → URL Configuration:**
   - **Site URL:** `https://chiripsdv.github.io/arisclosetpj/`
   - **Redirect URLs:** agregá la misma dirección. Así funciona “Olvidé mi contraseña”.
2. **Usuarios:**
   - La propietaria se crea en **Authentication → Users → Add user** (con *Auto Confirm User*). Es el primer usuario y queda como propietaria.
   - Las demás personas se crean igual desde Supabase. Después la propietaria las **activa** y les elige el **rol** en la app (pantalla Usuarios).
   - Si dejaste activado *Allow new users to sign up*, la propietaria también puede crear usuarios desde la app (botón **Nuevo usuario**). En ese caso conviene desactivar *Confirm email* para que puedan entrar sin confirmar el correo.
3. **PIN de autorización:** en la app, Usuarios → columna PIN → **Definir**. Con ese PIN la propietaria o la administradora autorizan descuentos mayores al límite de quien vende.

Para abrir la app con los datos de ejemplo (sin tocar la base real) usá `?demo` al final de la dirección:
`https://chiripsdv.github.io/arisclosetpj/?demo`

## Cómo funciona la seguridad

- **El primer usuario es la propietaria**; los siguientes quedan inactivos hasta que ella los active.
- Los **costos** están en tablas separadas (`product_costs`, `sale_item_costs`) que solo leen los roles con "ver costos".
- Cada usuario ve **solo sus ventas**, salvo que su rol tenga "ver las ventas de todos".
- Las ventas **solo entran por `register_sale`**: la base toma precios y costos de sus propias tablas, valida stock, límite de descuento por rol, PIN de autorización, códigos promocionales y precio mínimo, descuenta el stock y registra el kárdex, todo en una transacción.
- El **stock** no se puede editar a mano: solo cambia por ventas, entradas (`stock_in`) o anulaciones (`void_sale`), y cada cambio queda en `stock_moves`.
- Los **PIN** se guardan cifrados (bcrypt) en una tabla que nadie puede leer.
- La propietaria **no puede perder sus permisos** ni quedar desactivada si es la única.

## Pruebas

`tests/` contiene una simulación mínima de Supabase y las pruebas que se corrieron contra PostgreSQL 16
(ventas con y sin descuento, PIN, códigos, precio mínimo, stock, permisos de cada rol y anulación):

```bash
psql -d prueba -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -d prueba -f "$f"; done
psql -d prueba -f tests/10_pruebas.sql
```
