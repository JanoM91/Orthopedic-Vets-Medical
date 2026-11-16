# Farmacia 6b: planes de compra (cada entrega o anual prepagado)

> Va **encima de la 6a** (`feat/farmacia-6a-recompra`): mezcla ese PR primero.

## Qué cambia

- **Planes de compra** para tutores con cuenta vinculada. El intervalo sale de la «duración por omisión» del producto: presentaciones por entrega × factor × duración.
  - **Cada entrega:** suscripción en la pasarela (Mercado Pago: preapproval). Cada cobro aprobado crea un pedido pagado para recoger.
  - **Anual prepagado:** un pago por varias entregas (12 por omisión) con descuento configurable. El cron crea cada entrega unos días antes como pedido «cubierto por el plan».
- **Antes de cada entrega** se revisa la mascota (especie, peso, edad, alergias) y la receta si es Grupo II. Si no cuadra, el plan se **pausa**, se pausa la suscripción y se avisa al tutor y al equipo. **Nunca** se cambia de producto por el peso.
- **Tienda:** en la ficha, «Recíbelo cada N días» con las dos opciones. Página `/tienda/plan/:id?t=` para pagar o autorizar, ver entregas y cancelar.
- **Portal → Mis pedidos:** «Mis planes».
- **Panel → Farmacia → Más → Planes de compra:** lista por estado, anticipos (cobrado, entregado, por entregar), reanudar, cancelar con motivo y registrar el anticipo en Finanzas.
- **Pedidos:** la pastilla del plan; en el anual, «Entregar (cubierto por el plan)» sin cobro.
- **Finanzas:**
  - Recurrente: cada entrega entra como venta pagada en línea.
  - Anual: el pago completo entra **una vez** como anticipo (con la fecha del pago, liquidado en la cuenta del método en línea). Las ventas de cada entrega no llevan pagos ni otro ingreso. Así no se cuenta dos veces.
- **Recompra:** lo que ya está en un plan no manda «¿Ya toca?».
- **Configuración → Tienda en línea:** planes (apagados por omisión), descuento anual, entregas, días antes y categoría de anticipos.

## Por qué

Jano pidió el 15-nov-2026 hacer la 6 completa (recompra y planes) y la 7 (reportes), en ramas separadas. Esta es la 6b.

## Cómo probarlo (vista previa de Vercel, con pago de prueba)

1. Configuración → Tienda en línea: enciende «Planes de compra» (por ejemplo, 10 % y 3 entregas).
2. Un producto de venta libre publicado con «Duración por omisión» = 30.
3. Entra al portal como tutor vinculado, elige tu mascota en la tienda y abre el producto: aparece «Recíbelo cada 30 días».
4. Elige el anual y «Pagar el plan»; en la pasarela simulada, «Aprobar pago».
   - El plan queda activo y la entrega 1 aparece en Farmacia → Pedidos, ya pagada.
5. Entrégala: no pide cobro. En Planes de compra ves «entregado» y «por entregar».
6. Para ver la siguiente entrega sin esperar, corre el cron a mano en la Terminal (`CRON_SECRET` de Vercel; no lo pegues en el chat): `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/farmacia/cron/diario`. La entrega sale `diasAntes` días antes de la fecha.

**Mercado Pago:** solo con credenciales **de prueba** que agregues tú en Vercel como Sensitive. No lo enciendas con clientes reales hasta probar una suscripción completa.

## Base de datos y variables

- Migración `20261115_041426_farmacia_planes`, que Payload aplica sola:
  - tablas `far_planes` y `far_planes_historial`, con RLS;
  - `plan_id` en ventas, pedidos y eventos de pago;
  - forma de pago «plan»;
  - grupo `planes` en la configuración.
- Sin variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores (y sin avisos en lo nuevo).
- Pruebas sobre Postgres local vacío:
  - `test:finanzas` 44/44.
  - `test:clinica` 175/175.
  - `test:farmacia` **486/486** (433 + 53 nuevas), que cubren:
    - oferta y precios;
    - pago anual con aviso firmado e idempotente;
    - primera entrega inmediata;
    - entrega sin cobro y anticipo en Finanzas una sola vez;
    - cron que genera las entregas y termina el plan;
    - recurrente con receta, que se pausa sin surtidos y se reanuda con receta nueva;
    - pausa por peso sin cambiar de producto;
    - permisos y API genérica;
    - suscripción de Mercado Pago contra un simulador (alta, autorización, cobro, duplicado y cancelación).
- Capturas de la oferta en la ficha y de la página del plan a 360 y 1280 px, sin desbordes.

## Riesgos y pendientes

- **Política de cancelación del plan anual** (Dr. Joni): hoy el tutor no lo cancela solo una vez pagado. El encargado lo cancela y el reembolso se hace fuera del sistema.
- **Mercado Pago:** las suscripciones siguen los campos del SDK oficial, pero los nombres de los avisos (`subscription_preapproval`, `subscription_authorized_payment`) no están confirmados en la documentación pública. Hay que probarlas con credenciales de prueba reales.
- v1 solo para **recoger** en la farmacia.
- El anticipo entra a Finanzas como efectivo al pagarse; no hay devengo mensual (lo por entregar se ve en Planes y en los reportes).

## Documentación actualizada

- `CLAUDE.md`.
- `docs/FARMACIA.md` §18.
- `docs/MANUAL-EQUIPO.md` (planes de compra).
- `docs/MANUAL-TUTOR.md` (planes).
- Este archivo.
