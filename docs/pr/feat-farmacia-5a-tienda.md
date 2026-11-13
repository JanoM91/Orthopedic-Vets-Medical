# Farmacia 5a: tienda en línea (pedidos para recoger, apartado y pago de prueba)

## Qué cambia

- **Tienda pública `/tienda`**: catálogo por necesidad (Pulgas y parásitos, Alimento, Medicamentos…), buscador, ficha de producto y carrito. «¿Para quién compras?» usa la mascota del tutor o un perfil rápido de invitado (especie y peso) y marca cada producto como «Le queda», «No es para…» o «Confirma su peso».
- **Pedidos para recoger** (`far-pedidos`, folio `PED-`): pagar al recoger o en línea; correo al cliente y a la farmacia; liga de seguimiento con token para el invitado; el cliente cancela mientras no esté pagado.
- **Apartado sin mover el kardex**: lo pedido se aparta; sin pago vence a las `horasApartado` (se libera solo al leer; el cron diario lo marca «expirado»). **El mostrador ya descuenta lo apartado** al buscar y al cobrar.
- **Reglas de medicamentos**: el **Grupo I nunca** aparece en la tienda. El **Grupo II** solo lo pide un tutor vinculado con receta interna vigente de esa mascota y surtidos libres (un pedido en curso con esa receta cuenta como surtido). A domicilio sigue apagado.
- **Pago en línea simulado** (pasarela «prueba», `lib/farmacia/pagos.ts`): el pedido pasa a «pagado» **solo** por un aviso firmado (HMAC) en `/api/tienda/webhook/:proveedor`, idempotente (`far-pagos-eventos`). Mercado Pago queda con el adaptador listo y «no disponible» hasta la 5b.
- **Panel → Farmacia → Pedidos**: Nuevos / Preparando / Listos / Cerrados, ficha con contacto y WhatsApp, Preparar → Listo (avisa) → **Entregar**, que crea la venta con canal «tienda» por `registrarVenta()` (FEFO, receta, autorización, Finanzas). Cancelar con motivo; si ya se pagó, «reembolso pendiente». Contador en el menú de Farmacia y en Inicio.
- **Portal → Farmacia** (pestaña nueva en la barra cuando la tienda está encendida): pedidos y recetas vigentes con «Surtir» (abre la tienda con esa mascota).
- **Configuración de Farmacia**: tarjeta «Tienda en línea» (pago en línea, método de pago de lo cobrado en línea, correos de pedidos, pagar al recoger).
- Sitio público: enlace «Tienda» en cabecera y pie con el módulo encendido.

## Por qué

Fase 5 del plan de Farmacia (`docs/FARMACIA-PROMPT.md`). Jano eligió (12-nov-2026) hacerla en dos ramas (5a recoger y pago simulado; 5b domicilio, repartidor, búsqueda con IA y Mercado Pago real) y usar pago simulado mientras no haya credenciales.

## Cómo probarlo (vista previa de Vercel)

1. En Vercel (Preview), agrega `PAGOS_PRUEBA_SECRETO` como Sensitive (`openssl rand -hex 24`) y vuelve a desplegar la vista previa.
2. Panel → Instalación: enciende «Tienda». Farmacia → Configuración → Tienda en línea: «Pago de prueba»; agrega un método de pago con clave `en_linea` y su cuenta de Finanzas; guarda.
3. En dos o tres productos (Grupo III o desregulados), marca «Publicado en la tienda».
4. Abre `/tienda` en el celular sin sesión → elige «Perro · 15 kg» → agrega → carrito → «Pagar en línea» → «Aprobar pago» → el seguimiento queda «Pagado».
5. Panel → Farmacia → Pedidos → el pedido → Empezar a preparar → Listo → Entregar → se crea la venta (Farmacia → Ventas, canal tienda) y la entrada en Finanzas.
6. Haz otro pedido «pagar al recoger» y, antes de entregarlo, intenta venderlo en Mostrador: dice que está apartado.

## Base de datos y variables

- Migración: `20261113_053734_farmacia_tienda_pedidos` (tablas `far_pedidos`, `far_pedidos_renglones`, `far_pedidos_historial`, `far_pagos_eventos`; valor `prueba` en el enum de pasarela; columnas `tienda_*` en la configuración; RLS en las 4 tablas). Payload la aplica sola al desplegar.
- Variable nueva **opcional**: `PAGOS_PRUEBA_SECRETO` (Sensitive). **Solo en Preview o mientras se ensaya; quitarla antes de abrir la tienda a clientes reales.**
- El módulo «Tienda» sigue apagado por omisión: en producción no cambia nada hasta encenderlo.

## Verificación hecha

- `npx tsc --noEmit` sin errores; `npm run lint` 0 errores (45 avisos, igual que `main`); `npm run build` limpio.
- `test:finanzas` 44/44 · `test:clinica` 175/175 · `test:farmacia` **368/368** (299 de antes + 69 de la tienda) sobre Postgres local vacío.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px con las rutas nuevas (tienda, carrito, portal → farmacia, panel → pedidos): 243 páginas, 0 hallazgos.
- Recorrido real en el navegador a 390 px: invitado → perfil → ficha → carrito → pago de prueba → seguimiento «Pagado» → ficha del pedido en el panel a 1280 px.

## Riesgos y pendientes

- **Pago de prueba con clientes reales**: cualquiera con la liga de su pedido podría marcarlo pagado. Por eso exige la variable; no definirla en producción abierta.
- Precio de la tienda = precio de la presentación; las promociones por caducidad aún no se aplican en línea.
- Recetas externas subidas por el cliente: no (solo recetas internas). Reembolso desde el panel: 5b.
- El límite es de 30 pedidos por hora por IP (en memoria por instancia).
- No se probó contra Supabase ni en un celular real.

## Documentación actualizada

- CLAUDE.md (reglas de la tienda), docs/FARMACIA.md §14, docs/ARRANQUE.md (variable y paso 6), docs/MANUAL-EQUIPO.md (Pedidos), docs/MANUAL-TUTOR.md (Farmacia en línea), este archivo.
