# Ari's Closet · Demo de app de ventas (PWA)

Demo funcional para que la cliente pruebe la app desde computadora y teléfono.
Todo corre en el navegador y los datos se guardan localmente en cada dispositivo
(en la versión final esto se reemplaza por Supabase, con la misma interfaz).

## Publicar con GitHub Pages (5 minutos)

1. Creá un repositorio nuevo en GitHub, por ejemplo `aris-closet-demo` (público).
2. Subí **todos** los archivos de esta carpeta a la raíz del repo
   (`index.html`, `app.js`, `data.js`, `styles.css`, `manifest.json`, `sw.js`, carpeta `icons/`).
   Desde la terminal:
   ```bash
   cd aris-closet-demo
   git init
   git add .
   git commit -m "Demo Ari's Closet"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/aris-closet-demo.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos la app queda en `https://TU_USUARIO.github.io/aris-closet-demo/`.
   Ese es el link que le mandás a la cliente.

## Cómo probarla (para enviar a la cliente)

- Contraseña de todos los usuarios: **1234**.
- **Ariana** (propietaria): ve todo, incluida la utilidad. Su PIN de autorización es **1234**.
- **Karla** (administradora): todo menos usuarios y utilidad; límite de descuento 15 %.
- **José** (vendedor): solo vender e inventario; límite de descuento 10 %. Si intenta más, pide PIN.
- Códigos promocionales de prueba: `ARI15` (15 %) y `BIENVENIDA` (10 %).
- En el teléfono: abrir el link en Chrome o Safari → menú → **"Agregar a pantalla de inicio"**. Queda instalada como app.
- En el **Panel**, el interruptor *"Simular ventas de otros dispositivos"* genera ventas cada pocos segundos para mostrar cómo se actualiza en vivo.
- Si abrís la app en dos pestañas del mismo navegador, una venta en una se refleja en la otra al instante.
- **Catálogos → Reiniciar demo** vuelve a los datos de ejemplo.

## Qué incluye el demo

Inventario por talla y color con alertas de stock bajo · punto de venta con búsqueda, carrito,
descuentos con límite por rol, autorización con PIN, códigos promocionales y precio mínimo ·
ticket imprimible y por WhatsApp · gastos por categoría · reportes (día / 7 / 30 días) con
exportación a CSV · catálogos editables · usuarios y roles · modo offline (PWA).

## Siguiente paso (versión final)

Conectar la misma interfaz a Supabase: autenticación, Postgres con permisos por rol (RLS),
Realtime para el panel en vivo y Storage para fotos. Los datos de `data.js` pasan a ser las
tablas iniciales.
