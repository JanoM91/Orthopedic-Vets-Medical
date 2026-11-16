# Farmacia 6a: recompra («¿Ya toca?» y «Volver a pedir»)

> Va **encima del sitio** (`feat/ux-cliente-4-sitio`): mezcla ese PR primero.

## Qué cambia

- **Fecha en que se acaba:** al vender un producto con «duración por omisión» se calcula cuándo se termina: fecha de la venta + unidades base × duración.
  - Ejemplos de duración: pipeta = 30 días; tableta mensual = 30 días; bolsa de alimento = los días que suele durar.
  - No se usa la receta ni se interpretan dosis.
- **Colección `far-recompras`:** una fila por cliente (o correo del invitado de la tienda) + mascota + producto. La compra más reciente manda.
  - Solo la escribe `lib/farmacia/recompra.ts`.
- **Cron diario:** recalcula y, 5 días antes (configurable de 1 a 30), manda un correo **«¿Ya toca?»**.
  - Trae **Volver a pedir** (liga con token, sin sesión) y **No me avises más**.
  - Un aviso por fecha. Si vuelve a comprar, avisa con la nueva fecha.
  - No avisa de lo que se acabó hace más de 7 días, de productos dados de baja ni de mascotas fallecidas.
  - Lo con receta pide surtirlo con su receta.
- **`/tienda/recompra/:id?t=`:** muestra lo que compró la última vez, la cantidad y **«Agregar y pagar»**. Lo pone en el carrito con la mascota elegida.
- **Portal:** en el inicio, Pendientes muestra lo que se acaba en 7 días con «Volver a pedir».
- **Panel** → Farmacia → Configuración → Tienda en línea: encender o apagar el aviso y fijar los días de anticipación.

## Por qué

Jano pidió el 15-nov-2026 hacer de una vez la 6 (recompra y planes) y la 7 (reportes), en ramas separadas. Esta es la 6a: lo que no depende de la pasarela ni de la política de cancelación.

## Cómo probarlo (vista previa de Vercel)

1. Farmacia → Productos: a una pipeta de venta libre ponle «Duración por omisión» = 1 y márcala publicada en la tienda.
2. Mostrador: véndele 2 a una mascota con ficha y correo.
3. Corre el cron a mano (en la Terminal; `CRON_SECRET` es la de Vercel, no la pegues en el chat): `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/farmacia/cron/diario`.
   - La respuesta trae `recompras` y `avisosRecompra`.
4. Al tutor le llega «¿Ya toca?». «Volver a pedir» abre la tienda con el producto listo para el carrito.
5. En el portal del tutor, Pendientes muestra «Volver a pedir».

## Base de datos y variables

- Migración `20261115_035641_farmacia_recompra`: tabla `far_recompras` con RLS, y `tienda_recompra_activa` y `tienda_recompra_dias_antes` en la configuración. Payload la aplica sola.
- Sin variables nuevas: usa `RESEND_API_KEY` y `CRON_SECRET`, que ya existen.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío:
  - `test:clinica` 175/175.
  - `test:farmacia` **433/433** (416 + 17 nuevas): fecha estimada, aviso del cron sin repetir, liga sin sesión y con token falso, sin costos ni token en la API genérica, 403 a crear, «Volver a pedir» en el inicio del portal, nueva compra con nuevo aviso, baja, configuración y rango de días.
- Captura de «Volver a pedir» a 390 px.

## Riesgos y pendientes

- Solo funciona con productos que tengan «Duración por omisión». Hay que llenarla en el catálogo real.
- Las ventas de mostrador sin mascota ni cliente no generan aviso: no hay a quién escribir.
- **Sin `RESEND_API_KEY`:** el aviso queda marcado como enviado aunque no salga correo; así funciona hoy el adaptador.
- Los planes (suscripción y anual prepagado) van en la 6b.

## Documentación actualizada

- `CLAUDE.md`.
- `docs/FARMACIA.md` §17.
- `docs/MANUAL-EQUIPO.md` (aviso de recompra).
- `docs/MANUAL-TUTOR.md` («¿Ya toca?»).
- Este archivo.
