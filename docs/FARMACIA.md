# Farmacia: catálogo, inventario por lote y kardex (fase 1)

> 25-oct-2026. Módulo de Farmacia sobre la plataforma (Finanzas + Clínica), según `docs/FARMACIA-PROMPT.md`. Este documento es la referencia técnica del módulo y crece con cada fase. Lo que hay hoy es la **fase 1 de 7**: base del catálogo e inventario, permisos, módulos activables e importación. Compras, ventas, recetas, alertas, tienda y planes llegan en las fases 2 a 7.

## 1. Qué hace (fase 1)

| Pieza | Para quién | Dónde |
|---|---|---|
| **Catálogo**: productos con línea, grupo NOM-064, registro SENASICA, especies, rango de peso, edad mínima, alérgenos, unidad base; presentaciones con factor, precio y código de barras | Roles con «Catálogo» | `/admin/farmacia/productos` (y colecciones del grupo «Farmacia» en el panel) |
| **Importación** del catálogo con la plantilla del sistema (una fila = una presentación), con revisión previa y reporte de filas con error | Roles con «Catálogo» | `/admin/farmacia/importar` |
| **Inventario por lote**: existencias vigentes y físicas, caducidad con estados (vigente, por vencer, urgente, vencido, bloqueado), entradas y ajustes con motivo, mermas, bloqueo de lotes | Todo rol de farmacia ve; ajusta quien tiene «Ajustes» | `/admin/farmacia/inventario`, ficha del producto |
| **Kardex** inmutable por lote y producto, con quién registró | Todo rol de farmacia | Ficha del producto → «Ver kardex»; Inventario → «Kardex general» |
| **Configuración**: días de aviso de caducidad por línea, horas de apartado, cierre del día, Grupo II a domicilio, aprendizaje del punto de reorden, política de devoluciones, ligas con Finanzas; proveedores y almacenes | Roles con «Configurar» (dueño, superadmin) | `/admin/farmacia/configuracion`; promociones por caducidad y pasarela en Farmacia → «Farmacia: parámetros» |
| **Módulos activables** de la instalación: Clínica, Farmacia, Tienda (Finanzas siempre) | Superadmin | Sistema → «Instalación: módulos» |

Es **marca blanca** como el resto: nada de la clínica vive en el código. Los 50 productos de la plantilla de ejemplo son inventados a propósito (`lib/farmacia/ejemplos.ts`).

## 2. Modelo de datos

```
far-productos (PRD-) ──< far-presentaciones   («Caja 30 tabletas» = factor 30)
      │                  far-proveedores ──┘ (proveedor preferente)
      └──< far-lotes (LOT-) ──< far-movimientos (kardex inmutable)
                 └── far-almacenes («Farmacia» por omisión)
globales: farmacia-configuracion · instalacion-configuracion (módulos)
```

- **Unidad base y factor.** El inventario se lleva SIEMPRE en la unidad base del producto (tableta, ml, g, pieza). Cada presentación dice cuántas unidades base contiene; así la venta fraccionada (fase 3) descuenta 1 del mismo lote que la caja descuenta 30.
- **Grupo NOM-064-ZOO-2000.** `I` controlado (receta cuantificada, libro de control), `II` con receta, `III` venta libre, `desregulado` (alimento, accesorio, higiene). Grupo I y II exigen registro SENASICA; alimento, accesorio e higiene no pueden ser I ni II. Lo revisa el servidor (`validarProducto`), no solo la pantalla.
- **Existencia de un lote = suma de sus movimientos.** `far-lotes.existencia` es una copia que `recalcularExistencia` rehace dentro de la misma transacción, con candado por lote (`pg_advisory_xact_lock`, rango 8 000 000+). Una salida nunca deja el lote en negativo. «Vigente» excluye lotes vencidos y bloqueados; «física» los incluye.
- **Kardex inmutable.** `far-movimientos` no se edita ni se borra por ninguna vía: hooks `beforeChange` y `beforeDelete` (corren aunque se escriba con `overrideAccess`) y acceso `create/update/delete: nadie` en la API genérica, incluso para el superadmin. Una corrección es un movimiento inverso con motivo.
- **Folios** virtuales desde el id: `PRD-00012`, `LOT-00034`.
- **Nada se borra**: productos, presentaciones, proveedores y almacenes se marcan inactivos.
- Fechas como texto `AAAA-MM-DD` en la zona del negocio; dinero en pesos con dos decimales (centavos enteros para calcular, `lib/finanzas/reglas.ts`); cantidades con hasta tres decimales (ml, g).
- Migración `20261025_221652_farmacia_base` (tablas nuevas con RLS; columnas `farmacia_*` en `roles`).

## 3. Permisos (Sistema → Roles → «Farmacia»)

| Casilla | Permite |
|---|---|
| Vender | Venta de mostrador y preparar pedidos (fases 3 y 5); hoy ve catálogo e inventario |
| Ver costos y márgenes | Sin ella, **ninguna respuesta de la API** trae costos: acceso de campo en `costoUnidad` (lotes y movimientos) + el servicio omite costos y valor del inventario |
| Aplicar o autorizar descuentos | Fase 3 |
| Catálogo | Productos, presentaciones, precios, publicación en tienda, importación |
| Recibir compras | Fase 2 |
| Ajustes, mermas y conteo | Entradas y ajustes con motivo, mermas, bloqueo de lotes |
| Validar recetas y despachar I y II | Fase 3 |
| Aprobar promociones y puntos de reorden | Fase 4 |
| Asignar repartidor · Ver y cerrar mis entregas | Fase 5 |
| Registrar cierre del día | Fase 3 |
| Reportes y libro de control | Fase 7 |
| Configuración de la farmacia | Parámetros, proveedores, almacenes (zonas en fase 5) |

Roles sugeridos (`lib/farmacia/roles.ts`): **Encargado de farmacia** (todo menos configurar y entregas; registra en Finanzas), **Vendedor de mostrador** (vender y cierre del día; sin costos ni descuentos), **Repartidor** (solo entregas). **Dueño** y **Administración** llevan la farmacia completa. Se crean con Finanzas → Configuración → «Crear los sugeridos» (instalación nueva) o con Farmacia → Inicio → «Crear los roles sugeridos» (instalación que ya tenía roles: crea los que falten y enciende la farmacia a Dueño y Administración si no tenían ninguna casilla; un rol ya tocado no se cambia). El superadministrador puede todo.

Quien no entra al panel completo ni usa Finanzas pero sí la farmacia (vendedor, repartidor) entra directo a `/admin/farmacia`, con encabezado y barra inferior, igual que Finanzas y Clínica.

## 4. Módulos activables

Global `instalacion-configuracion` (solo superadmin): casillas Clínica, Farmacia y Tienda (Finanzas siempre activo; Tienda se guarda para la fase 5). `lib/modulos.ts` lo lee una vez por petición. Apagar un módulo:

- envuelve las reglas de acceso de sus colecciones y globales (`lib/modulosAcceso.ts` para la clínica; `collections/farmacia/acceso.ts` ya lo revisa) → responden «no» a todo, Payload las esconde del menú y la API genérica da 403 incluso al superadmin;
- su API (`/api/clinica`, `/api/farmacia`) responde 404; sus vistas (`/admin/clinica`, `/admin/farmacia`) avisan; sus enlaces del menú desaparecen.

No borra datos. Las cuentas del portal (`tutores`) no se apagan con la clínica: en la fase 5 también entran a la tienda. Por omisión: Clínica y Farmacia encendidas, Tienda apagada.

## 5. Importación del catálogo

1. `/admin/farmacia/importar` → «Plantilla .xlsx» (3 ejemplos) o «Plantilla con 50 ejemplos» (para probar). Hoja «Productos» + hoja «Instrucciones». También sirve un CSV con los mismos encabezados.
2. **Una fila = una presentación.** Para otra presentación del mismo producto se repite el nombre comercial y cambian `presentacion`, `factor`, `precio`, `codigo_barras`, `fraccionada`. Obligatorias: `nombre`, `linea`, `presentacion`, `precio`.
3. «Revisar qué pasaría» (no toca la base) → «Importar». Todo en una transacción. **Las filas con error se reportan y no se importan; las demás sí.**
4. Interpretación: línea por palabra (antipulgas → antiparasitario, croqueta → alimento…), grupo `I/II/III/desregulado` (vacío = III para medicamentos, desregulado para lo demás), especies por palabra, Sí/No, números con `$` y comas.
5. Duplicados: producto existente por nombre (sin mayúsculas ni acentos) se reutiliza sin cambiarle datos; presentación existente por nombre dentro del producto; código de barras ya usado por otra presentación es error de fila. Proveedores nuevos se crean con 3 días de entrega. Límite: 5 000 filas.

Lotes, caducidades y existencias no van en la plantilla: entran por compras (fase 2) o por «Entrada o ajuste» con motivo.

## 6. API (`/api/farmacia`, sesión del equipo)

```
GET  catalogo                             permisos, módulos, almacenes, proveedores, configuración, totales
GET  productos?q=&linea=&grupo=&inactivos=&bajoMinimo=
POST productos · POST productos/:id · GET productos/:id
POST productos/:id/presentaciones · POST presentaciones/:id
GET  productos/plantilla?ejemplo=3|50     .xlsx
POST productos/importar                   multipart: archivo, aplicar=true|false
GET  inventario?q=&solo=con_existencia|todos|por_vencer|vencidos|bajo_minimo
GET  kardex?producto=&lote=&limite=
POST ajustes                              { productoId, loteId | lote:{numeroLote, caducidad, costoUnidad?, almacenId?}, tipo: ajuste|merma, cantidad (con signo), motivo, referencia? }
POST lotes/:id/bloqueo                    { bloqueado }
POST proveedores · proveedores/:id · almacenes · almacenes/:id · configuracion
POST arranque                             { que: 'almacen' | 'roles' }
```

Con el módulo apagado todo responde 404. `registrarMovimiento` (en `lib/farmacia/servicio.ts`) es la única puerta de escritura del kardex: compras, ventas y devoluciones de las siguientes fases pasan por ahí.

## 7. Código

| Qué | Dónde |
|---|---|
| Colecciones y globales | `collections/farmacia/{acceso,catalogo,inventario,configuracion}.ts`, `collections/Instalacion.ts` |
| Permisos | `lib/permisosBase.ts` (`farmacia`, `usaFarmacia`), `lib/permisos.ts` (`esColeccionFarmacia`), `lib/farmacia/roles.ts` |
| Módulos | `lib/modulos.ts`, `lib/modulosAcceso.ts` |
| Servicio y API | `lib/farmacia/{servicio,importacion,ejemplos,tipos}.ts` → `app/api/farmacia/[...ruta]/route.ts` |
| Panel | `components/admin/farmacia/*` (vista `/admin/farmacia` registrada en `payload.config.ts`), `components/admin/EnlaceFarmacia.tsx`, `app/(payload)/farmacia.css` |
| Migración | `migrations/20261025_221652_farmacia_base.ts` |
| Pruebas | `npm run test:farmacia` (102 comprobaciones) contra `npm run start` con Postgres local vacío: roles, importación de 50 ejemplos y CSV con errores, validaciones, lotes y kardex (existencia = suma; inmutable), costos ocultos, configuración, módulos activables, vistas del panel |

## 8. Verificación de la fase 1 (25-oct-2026)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores (lint: solo avisos preexistentes) |
| Arranque en modo producción contra Postgres local vacío | Aplicó las 6 migraciones solo |
| `npm run test:clinica` → `npm run test:farmacia` → `npm run test:finanzas` | 121/121 · 102/102 · 44/44 |
| Recorrido en Chromium a 390 px y 1280 px (inicio, productos, inventario, importar, configuración, alta, ficha, ajuste por modal, importación por interfaz, vendedor sin panel) | Sin errores de JavaScript ni desbordamiento horizontal |

Criterios de aceptación de la fase 1 (`docs/FARMACIA-PROMPT.md`):

- [x] Importar la plantilla con 50 productos de ejemplo crea productos y presentaciones con folio `PRD-`, y reporta filas con error sin cortar la importación.
- [x] La existencia de un lote es siempre la suma de sus movimientos; editar o borrar un movimiento es imposible por API.
- [x] Un usuario sin «Ver costos» no recibe campos de costo en ninguna respuesta.
- [x] Con Clínica apagada, el panel no muestra expediente ni agenda y las pruebas de Farmacia pasan.

## 9. Decisiones y pendientes de la fase 1

- **Confirmado por Jano (25-oct):** módulos activables por instalación.
- **Propuestas construidas con valor por omisión, pendientes de confirmar:** cierre del día activado por omisión (casilla en Configuración) y Grupo I fuera del catálogo público (aplica en la fase 5; el campo «publicado en la tienda» ya lo ignora para Grupo I por diseño).
- **Entradas sin compra:** mientras no exista Compras (fase 2), el inventario inicial entra como ajuste positivo con lote, caducidad, costo opcional y motivo. Un ajuste positivo suma a «cantidad recibida» del lote.
- **Mismo número de lote** del mismo producto en el mismo almacén se reutiliza (otra entrada al mismo lote); con otra caducidad se rechaza.
- **Lote con caducidad pasada** entra bloqueado; un lote vencido no se desbloquea (se retira con merma).
- **Imagen del producto:** por ahora una URL (`imagenUrl`); en la fase 5 se sube al almacén de la instalación.
- **Portal del tutor con Clínica apagada:** la API del portal responde 404 (es parte de la clínica); el «perfil ligero» de mascota para farmacias sin clínica se diseña en la fase 5.
- **No incluido en esta fase (por diseño):** `far-proveedor-claves` (fase 2, con el XML), conteo físico (fase 2), alertas por correo y cron (fase 4), zonas de entrega (fase 5).
- **Nota sobre el repo:** `main` no trae el cron de Vercel (`vercel.json`), los correos de citas ni `docs/ARRANQUE.md` / `docs/MANUAL-*.md` que el prompt maestro da por existentes; están en el parche `0002-0003-correos-manuales-whatsapp.patch` de la etapa de clínica, pendiente de aplicar y mezclar. La fase 4 (resumen diario por correo) los necesita.
