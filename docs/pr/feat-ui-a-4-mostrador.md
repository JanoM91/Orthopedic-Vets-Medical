# Versión A, fase 4: Mostrador en dos columnas y ajustes de Farmacia

## Qué cambia

- **Mostrador** (`components/admin/farmacia/Vender.tsx`, `app/(payload)/farmacia.css`):
  - Desde 1000 px: **ticket a la izquierda y cobro fijo a la derecha** (total grande, método, recibido, billetes sugeridos y «Exacto», cambio, **«Cobrar $…»**, «Vaciar»). Una venta en efectivo se cobra sin desplazar la pantalla.
  - Mascota, recetas ligadas y alergias como **chips dentro del ticket**; renglones compactos (producto · − cantidad + · importe · quitar); el descuento por renglón se abre con «descuento».
  - Billetes sugeridos = el total redondeado hacia arriba a 50, 100, 200, 500 y 1,000 (antes solo aparecían billetes mayores al total y, con totales de más de $1,000, ninguno).
  - Con un solo pago el monto sigue al total y no se muestra; «Pago mixto» agrega métodos y muestra el monto de cada uno.
  - En teléfono y tableta se conserva la barra fija de abajo («Cobrar»).
  - Subtítulo con ventas del día y botón «Cierre del día» (si el rol y la configuración lo permiten).
- **Farmacia → Inicio** (`Inicio.tsx`): «Vender» pasa a ser el botón principal.
- **Modo solo (sin panel)** (`AppFarmacia.tsx`, `components/admin/MenuMas.tsx`): barra inferior con 4 opciones + **«Más»** (abre hacia arriba) en vez de cortar a 5; Productos, Inventario, Compras y Ajustes vuelven a ser alcanzables. `MenuMas` acepta `arriba` e `icono`.
- **Inventario** (`Inventario.tsx`): si no hay lotes con existencia, arranca en «Todos los productos».

## Por qué

Plan de la Versión A «Orden y Hoy» (decisión de Jano del 10-nov-2026), fase 4. Diagnóstico del 9-nov: en computadora había que bajar para cobrar, «Vender» era un botón chico y en el modo solo la barra cortaba secciones.

## Cómo probarlo (vista previa de Vercel)

1. En computadora (≥ 1000 px): Trabajo → Mostrador. Escanea o busca 3–4 productos de venta libre.
2. Toca un billete sugerido: aparece el cambio. Toca «Cobrar $…» **sin desplazar** → «Cobrado · VTA-…».
3. Agrega un producto Grupo II: aparece «Ligar receta»; al ligarla, sale el chip «Receta R-… · producto».
4. «+ Mascota» → elige una con alergias → chip de la mascota y chip rojo de alergias; ✕ la quita.
5. «Pago mixto» → dos métodos con monto cada uno; «Faltan/Sobran» si no cuadra.
6. En el celular: misma venta; el cobro queda abajo como antes.
7. Con un usuario de solo farmacia (sin panel) en el celular: barra con Inicio, Mostrador, Ventas, Recetas y «Más» (Alertas, Productos, Inventario, Compras, Ajustes).

## Base de datos y variables

- Migraciones: ninguna.
- Variables de entorno: ninguna.
- No toca `lib/farmacia/*` ni la API: la validación (FEFO, recetas, autorizaciones, clave de reintento) sigue en el servidor.

## Verificación hecha

- `npx tsc --noEmit` sin errores; `npm run lint` 0 errores; `npm run build` limpio.
- `test:finanzas` 44/44 · `test:clinica` 175/175 · `test:farmacia` 299/299 sobre Postgres local vacío.
- Playwright a 1280 × 800: 4 renglones, billete $1,400 → cambio $20, «Cobrar $1,380.00» visible sin desplazar, cobro hecho (VTA-00012). A 390 px: una columna con barra inferior.
- Modo solo a 390 px (vendedor y encargado de las pruebas): barra con «Más» y menú hacia arriba.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px: 219 páginas, 0 hallazgos.

## Riesgos y pendientes

- La maqueta tenía «Dejar pendiente», «Enviar ticket por WhatsApp» y «+ Promoción»: no existen en la API de ventas; fuera de alcance (no se tocó `lib/farmacia/ventas.ts`).
- Entre 1000 y ~1100 px con el menú lateral abierto, el ticket queda angosto (los nombres largos se parten en dos líneas).
- No probado en un lector de código de barras físico (el buscador no cambió).

## Documentación actualizada

- CLAUDE.md (regla «Mostrador»), docs/FARMACIA.md §13, docs/MANUAL-EQUIPO.md (Mostrador), docs/pr/feat-ui-a-4-mostrador.md.
