# Farmacia 5b: domicilio con repartidor, Mercado Pago y búsqueda con IA

> Va **encima de la 5a** (`feat/farmacia-5a-tienda`): primero mezcla el PR de la 5a y después este.

## Qué cambia

- **Entrega a domicilio por zonas**: en Configuración → Tienda en línea se enciende el domicilio y se dan de alta zonas con sus códigos postales, el envío, el pedido mínimo y desde cuánto es gratis. En el carrito el cliente escribe su dirección y ve el envío al instante. A domicilio paga en línea o al recibir.
- **Enviar con repartidor** (Panel → Pedidos): eliges quién lo lleva y en ese momento se registra la venta (FEFO, receta, Finanzas). El envío entra al total de la venta. Si paga al recibir, el cobro queda «por confirmar» hasta que el repartidor entrega.
- **Mis entregas** (rol Repartidor, pensado para el celular): dirección con mapa, Llamar, WhatsApp, «Entregado» (quién recibió, «Cobré $…», foto opcional) y «No se pudo» (regresa a la farmacia; se reenvía sin vender otra vez). Al entregar, el cobro entra a Finanzas.
- **Mercado Pago real (Checkout Pro)**: preferencia con referencia del pedido, aviso con firma `x-signature` verificada y consulta del pago a Mercado Pago antes de marcar pagado. Reembolso total desde la ficha del pedido cancelado (encargado).
- **Búsqueda con IA** «¿Qué necesita tu mascota?»: sugiere solo productos de venta libre del catálogo, sin dosis; si suena a urgencia, recomienda pedir cita. Sin llave de Anthropic no aparece y la búsqueda normal sigue igual.
- Ficha del pedido en el panel con dirección, envío, repartidor, foto de la entrega y reembolso; lista con marca «A domicilio».

## Por qué

Fase 5 de Farmacia en dos ramas (decisión de Jano, 12-nov-2026). En la 5b, Jano pidió incluir las tres partes: domicilio y repartidor, búsqueda con IA y Mercado Pago real (13-nov-2026).

## Cómo probarlo (vista previa de Vercel)

1. Configuración → Tienda en línea: enciende «Entrega a domicilio», agrega una zona (p. ej. «Centro», CP 91000, envío $40, mínimo $100, gratis desde $500). En Métodos de pago agrega `contra_entrega` (tipo «otro», «por confirmar», cuenta = caja) y elígelo como «Método para lo que cobra el repartidor».
2. Usuarios: da de alta a una persona con el rol «Repartidor».
3. En el celular, `/tienda` → agrega productos → carrito → «A domicilio» → CP 91000 → ves el envío → «Pagar al recibir» → Hacer pedido.
4. Panel → Pedidos → el pedido → Empezar a preparar → Listo para salir → Enviar con repartidor.
5. Entra como el repartidor (celular) → Mis entregas → Entregado → marca «Cobré» → la venta queda pagada y en Finanzas.
6. Mercado Pago (con credenciales de **prueba**): agrega las dos variables, elige «Mercado Pago» en Configuración, haz un pedido «Pagar en línea» y paga con una tarjeta de prueba de Mercado Pago.

## Base de datos y variables

- Migración: `20261113_185522_farmacia_domicilio_mercadopago` (columnas nuevas en pedidos, ventas y configuración; tablas `far_evidencias` y zonas, con RLS). Payload la aplica sola.
- Variables nuevas (Sensitive, solo si se usa Mercado Pago): `MERCADOPAGO_ACCESS_TOKEN` (empieza con `TEST-` en pruebas) y `MERCADOPAGO_WEBHOOK_SECRET` (Tus integraciones → Webhooks; URL `https://<dominio>/api/tienda/webhook/mercadopago`, evento Pagos). La búsqueda con IA usa la `ANTHROPIC_API_KEY` que ya existe.
- Nada cambia en producción hasta encender la Tienda y el domicilio.

## Verificación hecha

- `npx tsc --noEmit` sin errores; `npm run lint` 0 errores (45 avisos, igual que `main`); `npm run build` limpio.
- `test:finanzas` 44/44 · `test:clinica` 175/175 · `test:farmacia` **416/416** (368 de la 5a + 48 nuevas), sobre Postgres local vacío. Incluye Mercado Pago contra un **simulador local**: preferencia, firma falsa, firma de otro pago, aviso válido, aviso repetido, aviso de otro tipo y reembolso.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px (incluye carrito, Pedidos y Mis entregas): 249 páginas, 0 hallazgos.
- Recorrido en el navegador: carrito a domicilio con envío → seguimiento → enviar con repartidor → Mis entregas del repartidor a 390 px.
- La regla de la firma de Mercado Pago se tomó del SDK oficial `mercadopago@3.6.2` (`utils/webhook`), porque la documentación pública no publica el manifiesto completo.

## Riesgos y pendientes

- **No se probó contra Mercado Pago real ni con la IA real** (sin llaves en este entorno). Primero con credenciales de prueba en Preview.
- La comisión de Mercado Pago no se registra sola en Finanzas (el cobro entra por el total).
- La venta de un pedido a domicilio se registra al salir. Si no se entrega y se cancela, primero hay que anular la venta en Ventas.
- Sin firma del cliente (solo nombre y foto) ni rutas para varias entregas.

## Documentación actualizada

- CLAUDE.md (reglas 5b y aviso sobre prettier), docs/FARMACIA.md §15, docs/ARRANQUE.md (variables y paso 7), docs/MANUAL-EQUIPO.md (domicilio, reembolsos, Mis entregas), docs/MANUAL-TUTOR.md (domicilio y asistente), este archivo.
