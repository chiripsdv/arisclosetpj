# Base de datos de Ari's Closet (Supabase)

Ocho scripts SQL crean toda la base: tablas, seguridad por rol, funciones de venta y datos iniciales.
Se corren **una sola vez**, en orden, en un proyecto nuevo de Supabase.

| Script | Qué hace |
| --- | --- |
| `migrations/0001_tablas.sql` | 18 tablas: usuarios y roles, ajustes, socios, catálogos, productos (con costos aparte), variantes, ventas, líneas, kárdex, gastos, códigos de descuento |
| `migrations/0002_seguridad.sql` | Permisos por rol con Row Level Security, alta automática de usuarios, tiempo real y carpetas para fotos y comprobantes |
| `migrations/0003_funciones.sql` | `register_sale`, `stock_in`, `void_sale`, `save_product`, `set_pin`, `check_pin` |
| `migrations/0004_datos_iniciales.sql` | Roles, ajustes, socio principal, categorías, formas de pago y categorías de gasto |
| `migrations/0005_usuarios.sql` | Permite que la propietaria asigne contraseñas desde la app |
| `migrations/0006_login.sql` | Al escribir el usuario en el login, muestra su nombre y avisa si no existe |
| `migrations/0007_gastos_prorrateo.sql` | Gastos prorrateados: alquiler, salarios o equipo se reparten por día en los reportes |
| `migrations/0008_caja.sql` | Caja: apertura con fondo, retiros/ingresos, gastos pagados con la caja, arqueo a ciegas y cierre |

## Pasos de instalación

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo:
   - **Name:** `aris-closet`
   - **Database password:** una contraseña fuerte. Guardala en un lugar seguro; no hace falta compartirla con nadie.
   - **Region:** East US (la más cercana a Nicaragua).
2. Esperá a que el proyecto termine de crearse (1–2 minutos).
3. Menú izquierdo → **SQL Editor** → **New query**. Copiá todo el contenido de `0001_tablas.sql`, pegalo y tocá **Run**. Debe decir *Success*.
4. Repetí el paso 3 con `0002_seguridad.sql`, `0003_funciones.sql`, `0004_datos_iniciales.sql` `0005_usuarios.sql` `0006_login.sql` `0007_gastos_prorrateo.sql` y por último `0008_caja.sql`.
5. **Authentication → Sign In / Providers → Email:** dejá **activado** *Allow new users to sign up* y **desactivá** *Confirm email*. Así la propietaria crea usuarios desde la app sin correos de confirmación.
6. **Authentication → Users → Add user → Create new user:** creá a la **propietaria**. Como correo poné su usuario seguido de `@ariscloset.app` (ej. `mvaldivia@ariscloset.app`), una contraseña de al menos 6 caracteres y marcá *Auto Confirm User*. El primer usuario queda como propietaria automáticamente.
7. Entrá a la app con el usuario (`mvaldivia`) y la contraseña. En **Usuarios → Editar** poné su nombre completo, y con **Nuevo usuario** creá al resto (usuario, nombre, rol y contraseña).
8. **Project Settings → API Keys:** copiá la **Project URL** y la clave **pública** (`anon` o `publishable`). Esas dos se ponen en la app.

> ⚠️ Nunca compartas ni pongas en la app la clave **secret / service_role** ni la contraseña de la base de datos.
> La clave pública sí puede ir en la app: la seguridad por rol (RLS) es la que protege los datos.

## Usuarios

- Se entra con un **usuario corto** (ej. `mvaldivia`). Por dentro Supabase lo guarda como `mvaldivia@ariscloset.app`; ese correo no existe y no se usa para nada más.
- La propietaria crea usuarios en **Usuarios → Nuevo usuario** y cambia nombres o contraseñas en **Usuarios → Editar**.
- Si alguien olvida su contraseña, la propietaria le asigna una nueva desde **Editar**.
- **PIN de autorización:** Usuarios → columna PIN → **Definir**.
- Alguien que se registre por su cuenta queda **inactivo** y no ve nada hasta que la propietaria lo active.

Para abrir la app con los datos de ejemplo (sin tocar la base real): `https://chiripsdv.github.io/arisclosetpj/?demo`

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
