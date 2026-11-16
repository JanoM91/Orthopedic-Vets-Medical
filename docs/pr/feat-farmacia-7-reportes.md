# Farmacia 7: reportes con CSV y manual de la farmacia

> Va **encima de la 6b** (`feat/farmacia-6b-planes`): mezcla ese PR primero.

## Qué cambia

- **Farmacia → Más → Reportes** (encargado y dueño), con periodo y **Descargar CSV**. Lo que se ve es lo que baja.
  - **Ventas:** total por día, mostrador contra tienda, descuentos, envíos, ticket promedio, cobrado por método y entregas de planes anuales.
  - **Productos y margen:** unidades e importe; con «Ver costos», costo, margen y margen %.
  - **Rotación:** vendidas, promedio diario, existencia hoy y días de cobertura.
  - **Caducidades:** lotes que caducan hasta una fecha (90 días por omisión), incluidos los vencidos; con «Ver costos», valor en riesgo.
  - **Valor del inventario:** solo con «Ver costos». Cuadra con el valor del catálogo.
  - **Libro de control** del Grupo I.
  - **Planes anuales:** cobrado por adelantado, entregado y por entregar.
- **Permisos:** todos piden «Reportes». Sin «Ver costos» no aparece ninguna llave de costo ni margen, tampoco en el CSV.
- **CSV:** UTF-8 con BOM, para que Excel lea bien los acentos. El texto que empieza con `=`, `+`, `-` o `@` se protege para que la hoja no lo ejecute como fórmula.
- **`docs/MANUAL-FARMACIA.md`:** manual del equipo de farmacia organizado por día, semana y mes, con roles, reportes y dudas frecuentes.
- **Arranque:** pasos 8 (recompra y planes) y 9 (reportes) en `docs/ARRANQUE.md`.
- **Plan de la farmacia:** se marcan los criterios de las fases 6 y 7 en `docs/FARMACIA-PROMPT.md`. El criterio «el peso cambia la presentación» queda sin marcar, con la decisión escrita.

## Por qué

Es la fase 7 del plan de la farmacia, la última. Jano pidió el 15-nov-2026 hacer la 6 y la 7 de una vez, en ramas separadas.

## Cómo probarlo (vista previa de Vercel)

1. Entra como encargado o dueño → Farmacia → Más → **Reportes**.
2. **Ventas:** del 1 del mes a hoy; la suma de los días es el total.
3. **Productos y margen:** con el dueño ves costo y margen. Con un rol sin «Ver costos», no aparecen.
4. **Descargar CSV** y ábrelo en Excel: los acentos se ven bien.
5. **Valor del inventario:** es el mismo número del inicio de Farmacia.

## Base de datos y variables

Ninguna.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores (y sin avisos en lo nuevo).
- Pruebas sobre Postgres local vacío:
  - `test:finanzas` 44/44.
  - `test:clinica` 175/175.
  - `test:farmacia` **510/510** (486 + 24 nuevas), que cubren:
    - permisos;
    - periodo por omisión y fechas al revés;
    - suma de días igual al total;
    - margen de un producto conocido;
    - un rol con reportes y sin costos (sin costo ni margen en pantalla ni en CSV, 403 al valor del inventario);
    - valor del inventario igual al del catálogo;
    - caducidades, rotación, libro y planes anuales;
    - CSV con BOM y encabezados;
    - **instalación sin Clínica:** venta con Finanzas, todos los reportes y la tienda.
- `scripts/auditoria-front.mjs` sobre Planes, Reportes, Mis pedidos y la tienda, a 320, 390, 768, 1280 y 1440 px: **0 hallazgos**. Se agregaron Planes y Reportes a la lista de pantallas de la auditoría.

## Riesgos y pendientes

- Los reportes leen las ventas del rango (máximo 400 días). Para una farmacia alcanza; si el volumen crece, conviene pasarlos a consultas agregadas en SQL.
- La «instalación solo con Farmacia, Tienda y Finanzas» se prueba apagando Clínica dentro de la misma prueba, no desde una base donde Clínica nunca se encendió.
- Siguen pendientes con el Dr. Joni:
  - la política de cancelación de planes;
  - el descuento de los planes anuales;
  - la cuenta de Mercado Pago a nombre de la clínica.

## Documentación actualizada

- `CLAUDE.md`.
- `docs/FARMACIA.md` §19.
- `docs/MANUAL-FARMACIA.md` (nuevo).
- `docs/ARRANQUE.md`.
- `docs/MANUAL-EQUIPO.md`.
- `docs/FARMACIA-PROMPT.md`.
- Este archivo.
