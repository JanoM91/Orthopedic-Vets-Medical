# Sitio: banner movible de fotos en la portada

> Va **encima de** `feat/sitio-reserva-primera-vez`: sube y mezcla esa rama primero.

## Qué cambia

- Las «Fotos de la portada» (Sitio público, hasta 4) ya no forman un mosaico fijo: son un **banner que se mueve solo**.
  - Cambia de foto cada 5 segundos.
  - En el teléfono se desliza con el dedo; en la computadora tiene flechas al pasar el cursor, y siempre puntos para elegir foto.
  - Se detiene al pasar el cursor, al tocarlo o al enfocarlo con el teclado, cuando la pestaña no se ve y cuando la persona tiene activado «reducir movimiento».
  - Las fotos van en formato 4:3 y la primera carga de inmediato.
- Con una sola foto se ve fija; sin fotos sigue la tarjeta «Hoy», como antes.
- Sin librerías nuevas: usa el deslizamiento nativo del navegador (`scroll-snap`).

## Por qué

Pedido de Jano (19-nov-2026), al lanzar el sitio con las fotos de la clínica que mandó el Dr. Joni.

## Cómo probarlo (vista previa de Vercel)

1. Clínica → Fotos del sitio: sube 2 o 3 fotos y elígelas en Sitio público → «Fotos de la portada».
2. Abre la portada: las fotos cambian solas y los puntos marcan cuál se ve.
3. En el teléfono, desliza con el dedo; en la computadora, pasa el cursor (se detiene y aparecen las flechas).

## Base de datos y variables

Ninguna.

## Verificación hecha

- `npx tsc --noEmit` y `npm run lint` con 0 errores; `npm run build` sin errores.
- Prueba en Chromium con 3 fotos, en una base local con el contenido real de OVM, a 1366 y 390 px:
  - el banner avanzó solo a los 5 s;
  - no hubo desbordes ni errores de consola.

## Riesgos y pendientes

- Las reglas `.st-mosaico` quedan en `sitio.css` sin uso.

## Documentación actualizada

- `CLAUDE.md` (Home versión B).
- Este archivo.
