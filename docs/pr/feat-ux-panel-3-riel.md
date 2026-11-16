# UX del panel 3: menú compacto (riel de iconos)

> Va **encima de la UX del panel 2** (`feat/ux-panel-2-puesta-a-punto`): mezcla ese PR primero.

## Qué cambia

- En la computadora (1025 px o más), el menú cerrado ya **no desaparece**: queda un **riel de 72 px** con el isotipo, los iconos de «Trabajo» y Salir.
  - El número de alertas de Farmacia pasa a ser una bolita sobre el icono.
  - Al **pasar el cursor** (o al llegar con el teclado) el menú se despliega completo **encima** del contenido, sin moverlo, con los catálogos plegados.
  - El botón ☰ lo **fija abierto** como antes.
- En laptops de 1025 a 1440 px el panel arranca con el riel y gana ~200 px de ancho. Si la persona fija el menú abierto, se respeta en esa pestaña.
- Cada icono lleva su nombre para lectores de pantalla («Farmacia, 7 alertas abiertas»).
- Teléfono y tableta (≤ 1024 px): sin cambios.

## Por qué

Etapa de UX/UI, fase 3, que eligió Jano el 16-nov-2026. Estaba pendiente desde el tema «Clínico» (opción C, 26-oct). En laptops, el menú abierto se comía 275 px, y cerrado obligaba a dos clics para cambiar de módulo.

## Cómo probarlo (vista previa de Vercel)

1. En una laptop de 1280 o 1366 px abre `/admin`: a la izquierda ves el riel de iconos.
2. Pasa el cursor sobre el riel: se despliega encima; quita el cursor y vuelve a ser riel.
3. Toca ☰ arriba a la izquierda: el menú se queda abierto y empuja el contenido. Recarga: sigue abierto. Toca ☰ otra vez: regresa al riel.
4. En el teléfono, el menú sigue abriéndose con ☰ como antes.

## Base de datos y variables

Ninguna.

## Verificación hecha

- `npx tsc --noEmit`, `npm run build` y `npm run lint` sin errores.
- Playwright a 1280 y 1600 px: riel de 72 px, menú desplegado de 275 px al pasar el cursor, sin desplazamiento horizontal de la página y el «fijo» se conserva al recargar.
- A 390 y 1024 px el menú cerrado sigue oculto e `inert`, como antes.
- Ciclo limpio con las tres ramas: `test:clinica` 175/175, `test:estetica` 90/90 y `test:farmacia` 510/510; build con Postgres detenido sin errores.
- `auditoria-front.mjs` (ahora incluye Estética y Puesta a punto) en 10 tamaños: 100 páginas, 0 hallazgos.

## Riesgos y pendientes

- Depende de clases internas del menú de Payload (`.nav`, `.template-default--nav-open`, el atributo `inert`). Al actualizar Payload hay que revisar el riel.
- Un usuario sin ningún enlace en «Trabajo» no tiene `MenuTrabajoEnlaces`, y su riel queda `inert`. Se puede abrir con ☰, pero no se despliega con el cursor. Hoy no existe un rol así con acceso al panel.

## Documentación actualizada

- `CLAUDE.md` (Diseño y Menú y tablero).
- `docs/MANUAL-EQUIPO.md`.
- Este archivo.
