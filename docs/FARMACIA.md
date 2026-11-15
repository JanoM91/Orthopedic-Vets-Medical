# Farmacia: catálogo, inventario, compras, venta de mostrador, recetas y alertas (fases 1 a 4)

> 25-oct-2026. Módulo de Farmacia sobre la plataforma (Finanzas + Clínica), según `docs/FARMACIA-PROMPT.md`. Este documento es la referencia técnica del módulo y crece con cada fase. Lo que hay hoy son las **fases 1 y 2 de 7**: base del catálogo e inventario, permisos, módulos activables e importación (fase 1, 25-oct); compras desde el XML CFDI o a mano, recepción con lote y caducidad, gasto en Finanzas, anulación y conteo físico (fase 2, 26-oct; sección 10); venta de mostrador, recetas, libro de control del Grupo I y cierre del día (fase 3, 27-oct; sección 11); alertas, punto de reorden que aprende, reabasto y promociones por caducidad con cron diario (fase 4, 27-oct; sección 12). Tienda, planes y reportes llegan en las fases 5 a 7.

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
| Panel | `components/admin/farmacia/*` (vista `/admin/farmacia` registrada en `payload.config.ts`), `components/admin/MenuTrabajo.tsx` (enlaces «Mostrador» y «Farmacia» del bloque Trabajo), `app/(payload)/farmacia.css` |
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
- **No incluido en esta fase (por diseño):** `far-proveedor-claves` y conteo físico (hechos en la fase 2, sección 10), alertas por correo y cron (fase 4), zonas de entrega (fase 5).
- **Nota sobre el repo:** `main` no trae los correos de citas, el recordatorio diario, WhatsApp ni `docs/ARRANQUE.md` / `docs/MANUAL-*.md` de la etapa de clínica del 22-oct (el parche se perdió). La fase 4 agregó su propio cron y `vercel.json`; esas piezas de la clínica se reconstruyen aparte (sección 12, pendientes).

## 10. Fase 2 · Compras e inventario operativo (26-oct-2026)

### Qué hace

- **Compras** (`/admin/farmacia/compras`, permiso «Recibir compras»): una compra nace en **borrador** desde el **XML CFDI 4.0** de la factura o por **captura manual**. Del XML se leen emisor (RFC y nombre), serie, folio, fecha, conceptos (clave del proveedor `NoIdentificacion`, descripción, cantidad, valor unitario, importe), IVA trasladado (impuesto 002) y el **UUID** del timbre. El proveedor se busca por RFC y, si no existe, se crea solo.
- **Claves del proveedor** (`far-proveedor-claves`): la primera vez, cada renglón se liga a mano a una presentación del catálogo (buscador por nombre, principio activo o código de barras). Al recibir, el sistema aprende la relación; la **siguiente factura del mismo proveedor llega ligada sola**.
- **Recepción:** cada renglón exige presentación, **lote y caducidad capturados a mano** (el XML no los trae) y cantidad > 0; contado exige la cuenta o caja de Finanzas con la que se pagó. «Recibir» en una sola transacción: crea o reutiliza el lote (mismo número y caducidad), registra el movimiento `compra` en el kardex con costo por unidad base = valor unitario ÷ factor y referencia `COM-…`, aprende las claves y marca la compra como recibida con firma y hora.
- **Gasto en Finanzas:** al recibir se registra por `registrar()` con clave idempotente `compra-<id>`: contado → realizado con la cuenta elegida; crédito → por pagar con vencimiento. Va a la categoría y área configuradas en Farmacia → Configuración (o queda «pendiente de clasificar»). Si la factura es anterior a la fecha de corte de Finanzas, el gasto entra con la fecha de hoy. Si Finanzas falla, el inventario ya quedó y la compra muestra **«Reintentar gasto»** (idempotente). Sin importe (todo en cero) no genera gasto.
- **Importes:** en una compra del XML mandan los de la factura (subtotal, IVA, total, valor unitario por renglón): no se editan. Quitar un renglón lo deja fuera del inventario, pero el gasto es el total del XML; un renglón agregado a una compra del XML entra **sin costo** (bonificación). En una compra manual los totales se recalculan; el IVA se puede escribir (botones 16 % y 0 %) y, si se omite, es 16 % del subtotal.
- **Anulación** con motivo (mínimo 5 caracteres): un borrador se anula sin más; una compra recibida solo si **ningún lote suyo tuvo salidas** — genera movimientos inversos tipo `devolucion` y anula el gasto en Finanzas. Si ya hubo salidas, se rechaza (corresponde devolución al proveedor o merma).
- **UUID único:** el mismo XML no se registra dos veces (aviso con el folio `COM-` existente). El XML original se guarda en la compra y se descarga desde la ficha.
- **Conteo físico** (`/admin/farmacia/conteo`, permiso «Ajustes»): lista los lotes con existencia (filtro por producto, lote y almacén); el encargado escribe lo contado, ve la diferencia en vivo y al aplicar cada diferencia se registra como ajuste en el kardex con el motivo del conteo. Los lotes iguales no generan movimiento. «Dar por correctos los vacíos» rellena con la existencia del sistema.
- **Costos:** el vendedor no ve compras; quien recibe sin «Ver costos» no recibe valor unitario, importes ni totales (acceso de campo + el servicio los omite).

### Modelo y código

| Pieza | Archivo |
|---|---|
| Colecciones `far-compras` (folio `COM-`, renglones, totales con `leeCostos`, condición, cuenta, gasto, firmas) y `far-proveedor-claves` | `collections/farmacia/compras.ts` |
| Migración (+ RLS) | `migrations/20261026_152714_farmacia_compras.ts` |
| Lectura del CFDI, compras, recepción, gasto, anulación, conteo | `lib/farmacia/compras.ts` |
| Rutas `compras*`, `presentaciones?q=`, `conteo` | `app/api/farmacia/[...ruta]/route.ts` |
| Pantallas Compras, Nueva compra, Ficha/recepción, Conteo | `components/admin/farmacia/Compras.tsx`, `Conteo.tsx` |

`far-compras` solo se lee por la API genérica (con «Recibir compras»); crear, editar y borrar responden 403 incluso al superadmin: toda escritura pasa por `lib/farmacia/compras.ts`.

**Dependencia nueva:** `fast-xml-parser` (sin dependencias, ~50 KB). Node no trae analizador de XML y leer el CFDI a mano es frágil (prefijos `cfdi:`/`tfd:`, comillas simples, atributos opcionales).

### Verificación (26-oct-2026)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores (lint: solo avisos preexistentes) |
| Arranque en producción contra Postgres local vacío | Aplicó las 7 migraciones solo |
| `npm run test:clinica` → `npm run test:farmacia` → `npm run test:finanzas` | 121/121 · **157/157** (55 nuevas de compras y conteo) · 44/44 |
| Recorrido en Chromium a 390 px y 1280 px (inicio, compras, nueva compra, ficha, conteo con diferencia) | Sin errores de JavaScript ni desbordamiento horizontal |

Las pruebas encontraron y se corrigieron dos defectos antes de entregar: el valor unitario de una compra del XML se podía sobrescribir desde la API (alteraba el costo del lote) y la compra manual dejaba el IVA en cero.

Criterios de aceptación de la fase 2:

- [x] Un XML CFDI 4.0 de ejemplo llena la compra; el mismo UUID se rechaza la segunda vez.
- [x] No se puede recibir sin lote y caducidad; recibir crea lotes, movimientos y un gasto en Finanzas (contado o por pagar).
- [x] La segunda compra del mismo proveedor reconoce sola las claves ya relacionadas.
- [x] Conteo físico genera ajustes con motivo; una merma sin motivo se rechaza.

### Decisiones y pendientes de la fase 2

- **El XML se guarda como texto** en la compra (unos KB), no en el almacén de archivos: no depende de Vercel Blob y se descarga desde la ficha.
- **No se valida el RFC del receptor** contra el de la clínica: la instalación aún no guarda su RFC. Propuesta: agregarlo a Configuración y avisar (no bloquear) si la factura viene a otro RFC.
- **No se valida el CFDI ante el SAT** (estatus vigente/cancelado); queda como mejora futura si Jano lo pide.
- **Facturas con varios almacenes:** la compra entra al almacén por omisión; el campo existe para elegir otro cuando haya sucursales.
- **Devolución al proveedor** (parcial, después de vender parte del lote) no está construida: hoy se resuelve con merma o ajuste con motivo. Se puede agregar en una fase posterior.

## 11. Fase 3 · Venta de mostrador y recetas (27-oct-2026)

### Qué hace

- **Mostrador** (`/admin/farmacia/vender`; antes se llamaba «Vender», permiso «Vender»): escaneo con lector USB (escribe el código + Enter) o con la **cámara** del teléfono (API `BarcodeDetector`; si el navegador no la tiene, el botón no aparece y queda la captura manual), búsqueda por nombre, principio activo o laboratorio con existencia vendible, carrito con cantidad y descuento por renglón, mascota opcional, receta para Grupo I/II, **pagos mixtos** (efectivo con «recibido» y cambio, billetes rápidos, terminal, transferencia) y ticket. Con un solo método el monto sigue al total: escanear → Cobrar.
- **Inventario por FEFO** dentro de una transacción con candado por lote: sale primero el lote no vencido ni bloqueado que caduca antes. **Un lote vencido nunca se vende.** Venta fraccionada solo si la presentación lo permite (cantidad entera si no).
- **Idempotencia:** cada intento de cobro lleva una clave; un doble clic o un reintento por mala señal devuelve la misma venta (`duplicado: true`) y no descuenta dos veces.
- **Finanzas:** entrada pendiente por el total (clave `venta-<id>`, área y categoría de ventas de la configuración) y un cobro por cada pago confirmado en la cuenta de su método (clave `venta-<id>-pago-<n>`). La **transferencia queda «por confirmar»** y entra a Finanzas cuando el encargado la confirma. Si Finanzas falla, la venta ya quedó y se usa «Reintentar Finanzas».
- **Descuentos:** solo con «Aplicar descuentos». Si vende alguien sin la casilla, el servidor responde `codigo: autorizacion` y la pantalla pide **correo y contraseña de un encargado** en ese momento; se verifican con el mismo algoritmo de Payload (pbkdf2) sin abrir sesión, con límite de 8 intentos por vendedor cada 10 minutos, y la venta guarda quién autorizó. Nada de la contraseña se guarda.
- **Validación por mascota** (si la venta lleva mascota): especie, rango de peso, edad mínima y alergias (sin acentos ni plurales: «Penicilina» choca con «penicilinas»). Choque → bloqueo con mensaje claro; el encargado puede autorizar con motivo (queda en el renglón). Peso de más de 90 días en productos por rango → pide confirmar el peso de hoy. **El sistema nunca calcula ni sugiere dosis.**
- **Grupo II:** exige receta válida y vigente que cubra el producto (por producto o por principio activo) con surtidos disponibles; cada venta consume un surtido. Si la receta es de otra mascota, no surte. Despachar Grupo I y II exige «Validar recetas y despachar» (o la contraseña del encargado).
- **Grupo I:** además, folio de receta cuantificada y «original recibido». Cada salida crea un asiento automático e **inmutable** en el **libro de control** (laboratorio, producto, número de registro, lote, fecha de compra, folio de receta, MVZ, fecha de salida, cantidad y animal de destino), exportable en CSV.
- **Recetas** (`/admin/farmacia/recetas`): bandeja «por validar», «originales pendientes», historial y libro de control. La **receta externa** la captura el mostrador (datos + foto o PDF al almacén privado) y la valida o rechaza el encargado con motivo (al rechazar se avisa al tutor por correo si hay llave de Resend). La **receta interna** la emite el médico veterinario desde el expediente (pestaña «Recetas»), con el peso vigente precargado y la dosis escrita por él; al firmar queda válida e **inmutable** (solo cambian sus surtidos y la marca del original) y firmar exige su **cédula profesional** (campo nuevo en Usuarios). Grupo I exige el folio cuantificado para firmar.
- **Ticket** imprimible o PDF desde el navegador (sin costos) y envío por correo.
- **Anular** una venta del día (permiso «Ajustes»), con motivo: el inventario regresa a sus lotes (`devolucion`), los surtidos de receta se devuelven, el libro de control recibe un asiento de **cancelación** (el original no se edita) y la entrada de Finanzas se anula. Ventas de días anteriores: devolución según la política (pendiente).
- **Cierre del día** (activado por omisión, permiso «Cierre del día»): efectivo esperado = saldo de la caja del método «Efectivo» en Finanzas al terminar el día, contra lo contado. Con diferencia exige nota; uno por caja y día.
- **Métodos de pago** en Farmacia → Configuración: nombre, tipo, cuenta de Finanzas, «por confirmar» y activo. Solo un efectivo activo.
- **Inicio:** ventas del día, transferencias por confirmar, recetas por validar, originales pendientes y estado del cierre.

### Modelo y código

| Pieza | Archivo |
|---|---|
| `far-ventas` (VTA-), `far-recetas` (REC-), `far-libro-control`, `far-cierres-dia` | `collections/farmacia/ventas.ts` |
| Métodos de pago y «exigir original en Grupo II» | `collections/farmacia/configuracion.ts` |
| Cédula profesional del MVZ | `collections/Users.ts` |
| Migración (+ RLS) | `migrations/20261027_053609_farmacia_ventas.ts` |
| Venta, Finanzas, autorización, ticket, anulación, libro, cierre, búsqueda del mostrador | `lib/farmacia/ventas.ts` |
| Recetas internas y externas, paciente para la venta | `lib/farmacia/recetas.ts` |
| Validación contra la mascota y utilidades | `lib/farmacia/util.ts` |
| Pantallas | `components/admin/farmacia/Vender.tsx`, `Ventas.tsx`, `Recetas.tsx`, `Cierre.tsx`, `RecetasMascota.tsx` (expediente) |

Las cuatro colecciones nuevas solo se leen por la API genérica; crear, editar y borrar responden 403 incluso al superadmin. El libro de control además rechaza ediciones y borrados en hooks. Sin dependencias nuevas.

### Verificación (27-oct-2026)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores (lint: solo avisos) |
| Arranque en producción contra Postgres local vacío | Aplicó las 8 migraciones solo |
| `npm run test:clinica` → `npm run test:farmacia` → `npm run test:finanzas` | 121/121 · **251/251** (94 nuevas de la fase 3) · 44/44 |
| Recorrido en Chromium a 390 px y 1280 px: venta real por la interfaz (escaneo → cobro con cambio), ventas, ficha, recetas, receta externa, ficha de receta, libro, cierre, configuración, expediente con «Emitir receta» | Sin errores de JavaScript ni desbordamiento horizontal |

Criterios de aceptación de la fase 3:

- [x] Venta con escaneo, pago mixto (efectivo + terminal) y cambio; crea entrada en Finanzas y descuenta por FEFO.
- [x] Un lote vencido no se puede vender.
- [x] Un vendedor no puede aplicar descuento sin la contraseña de un encargado.
- [x] Grupo II sin receta válida se rechaza; Grupo I sin folio ni «original recibido» se rechaza y, con ellos, crea asiento en el libro de control.
- [x] Receta interna emitida desde el expediente queda inmutable al firmar; receta externa pasa por validación con motivo de rechazo.
- [x] Validación por mascota bloquea especie, peso, edad o alergia incompatibles.
- [x] Cierre del día registra la diferencia entre esperado y contado.

### Decisiones y pendientes de la fase 3

- **Propuestas construidas con valor por omisión (confirmar con Jano o el Dr. Joni):** confirmar transferencias con la casilla «Aprobar»; anular ventas solo del mismo día con «Ajustes»; el original físico de una receta externa de Grupo II **no** se exige por omisión (casilla en Configuración); el vendedor puede capturar recetas externas pero no validarlas ni despachar Grupo I/II sin el encargado.
- **Esperado del cierre:** es el saldo de la caja en Finanzas, no solo las ventas del día. Si se saca efectivo para un gasto, hay que registrarlo en Finanzas antes de cerrar.
- **Sin clínica:** la venta va sin mascota (el perfil ligero llega con la tienda, fase 5) y las recetas internas no existen; las externas aceptan el nombre del paciente en texto.
- **Devoluciones** de días anteriores, **CFDI al cliente** y la impresora térmica dedicada quedan fuera (política pendiente / módulo posterior). El ticket se imprime desde el navegador.
- **Correo:** el ticket y el aviso de receta rechazada salen por Resend; sin `RESEND_API_KEY` no se manda nada y nada falla (aviso en el log).

## 12. Fase 4 · Alertas, reabasto y promociones (27-oct-2026)

### Qué hace

- **Alertas** (`/admin/farmacia/alertas`, todo el equipo las ve; atender o descartar: «Aprobar», «Ajustes» o «Recetas»): caducidad por lote con días de aviso por línea (aviso, **urgente** ≤ 30 días, **crítica** = vencido: retirar), **desabasto** (disponible ≤ punto de reorden aceptado o mínimo; los lotes vencidos o bloqueados no cuentan), **punto de reorden sugerido**, **sin rotación** (sin ventas en 90 días configurables, con existencia), **recetas por validar** y **originales pendientes**. **Una sola alerta abierta por objeto y tipo** (índice único en la base): recalcular dos veces no duplica; si cambia la severidad se actualiza la misma; lo que ya no aplica (llegó mercancía, se retiró el lote) se **cierra solo**. Descartar = «ya lo vi»: no vuelve mientras no cambie la severidad (o el punto propuesto). Un producto que **nunca ha tenido lote** no levanta desabasto (al importar el catálogo no hay ruido), pero sí sale en el reabasto.
- **Punto de reorden que aprende**: con al menos 8 semanas de ventas del producto, `R = d̄·L + 1.65·σ·√L` (d̄ y σ = media y desviación estándar muestral de la demanda diaria de las últimas 8 semanas, días sin venta en cero, ventas menos devoluciones por anulación; L = días de entrega del proveedor preferente o el valor por omisión), redondeado hacia arriba a unidad entera. Se propone si difiere más de 20 % del vigente. **Aceptarlo** (o corregirlo) cambia el punto de reorden aceptado, que desde ese momento manda en desabasto y reabasto; **ignorarlo** no cambia nada.
- **Reabasto sugerido** (`/admin/farmacia/reabasto`, «Recibir compras», «Aprobar» o «Reportes»): productos en o bajo su punto de reorden; cantidad = R + d̄ × días de cobertura (30) − disponible, redondeada a la presentación de compra (la de mayor factor, no fraccionada). **Agrupada por proveedor preferente**, con botón «Copiar pedido», **WhatsApp** al teléfono del proveedor y **CSV**.
- **Promociones por caducidad** (`/admin/farmacia/promociones`): solo **Grupo III y desregulados**, lote con existencia, no vencido ni bloqueado. Escalones configurables (por omisión 90 días → 15 %, 45 días → 30 %); se toma el mayor que alcanza al lote. Nace **propuesta**; el encargado la **aprueba** (puede ajustar el %) o la **rechaza** (no se vuelve a proponer con el mismo descuento). Vence un día antes de caducar o al agotarse el lote. **Grupo I y II nunca** (también bloqueado al aprobar). Se aplicarán en la tienda (fase 5), solo al lote afectado.
- **Cron diario** `GET /api/farmacia/cron/diario` a las **08:00 de México** (`vercel.json`: `0 14 * * *` UTC): recalcula alertas y promociones y manda **un solo correo resumen** a quien tiene «Reportes» (y superadmin) más los correos extra de Configuración. Una segunda corrida el mismo día recalcula pero no repite el correo (`ultimoResumen`). Sin novedades, no manda nada. Exige `Authorization: Bearer $CRON_SECRET`; sin `CRON_SECRET` responde 503 y no hace nada. Sin `RESEND_API_KEY` no se manda el correo y nada falla.
- **Inicio y menú**: contador de alertas abiertas (rojo si hay críticas), puntos de reorden por revisar y promociones por aprobar.

### Modelo y código

| Pieza | Archivo |
|---|---|
| `far-alertas` (con `claveAbierta` única), `far-promociones` | `collections/farmacia/alertas.ts` |
| Días sin rotación, correos extra del resumen, último resumen | `collections/farmacia/configuracion.ts` |
| Migración (+ RLS) | `migrations/20261027_144827_farmacia_alertas.ts` |
| Recalcular, fórmula, reabasto, promociones, cron y correo | `lib/farmacia/alertas.ts` |
| Ruta del cron (Bearer `CRON_SECRET`) | `app/api/farmacia/cron/diario/route.ts`, `vercel.json` |
| Pantallas | `components/admin/farmacia/Alertas.tsx` (Alertas, Reabasto, Promociones) |

`far-alertas` y `far-promociones` solo se leen por la API genérica (crear, editar y borrar: 403 incluso al superadmin). La demanda diaria se agrega en SQL (una consulta por corrida). Sin dependencias nuevas.

### Verificación (27-oct-2026)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores (lint: solo avisos) |
| Arranque en producción contra Postgres local vacío | Aplicó las 9 migraciones solo |
| `npm run test:clinica` → `npm run test:farmacia` → `npm run test:finanzas` | 121/121 · **299/299** (48 nuevas de la fase 4) · 44/44 |
| Recorrido en Chromium a 390 px y 1280 px (superadmin con panel y encargado sin panel): inicio, alertas, reorden, reabasto, promociones, configuración, «Recalcular ahora» | Sin errores de JavaScript ni desbordamiento horizontal |

Las 8 semanas de ventas se **siembran en la prueba** insertando movimientos con fechas pasadas directo en la base local (la app no tiene ninguna puerta para eso; el script se niega a correr si `DATABASE_URL` no es local) y el punto esperado se calcula en la prueba con la misma fórmula.

Criterios de aceptación de la fase 4:

- [x] Con datos sembrados, aparecen alertas de caducidad (aviso, urgente, vencido) y desabasto, sin duplicados.
- [x] Con 8 semanas de ventas simuladas, el sistema propone un punto de reorden que coincide con la fórmula; aceptarlo cambia el mínimo, ignorarlo no.
- [x] La lista de reabasto agrupa por proveedor y se copia como texto.
- [x] El cron genera un solo correo resumen; sin llave de Resend no falla.
- [x] Un lote de Grupo III cerca de caducar genera promoción «propuesta»; Grupo I o II nunca.

### Decisiones y pendientes de la fase 4

- **Propuestas construidas (confirmar):** descartar silencia la alerta hasta que cambie su severidad; productos nunca surtidos no levantan desabasto; el punto se redondea a unidad entera; la presentación de compra es la de mayor factor; el resumen solo sale si hay alertas o promociones pendientes.
- **Variables en Vercel:** `CRON_SECRET` (nueva, Sensitive) para que corra el cron; `RESEND_API_KEY` y `LEADS_FROM_EMAIL` para que salga el correo.
- «Avísame cuando llegue» y la aplicación de promociones en la tienda: fase 5. «Plan por renovar»: fase 6.
- **Clínica (22-oct, por reconstruir):** correos de citas, recordatorio diario (se sumará como segundo cron en `vercel.json`), cartilla imprimible, botones de WhatsApp y manuales.

## 13. Versión A, fase 4 · Mostrador en dos columnas (12-nov-2026)

Solo pantalla: no cambia `lib/farmacia/*`, la API ni el modelo de datos.

- **Mostrador** (`components/admin/farmacia/Vender.tsx`): desde 1000 px, ticket a la izquierda y cobro fijo a la derecha (`.fa-vender__der`, `position: sticky`): total grande, método, recibido con billetes sugeridos (monto redondeado a 50, 100, 200, 500 o 1,000) y «Exacto», cambio, «Cobrar $…» y «Vaciar». Con un solo pago, el monto sigue al total y no se muestra; «Pago mixto» agrega métodos y entonces sí aparece el monto de cada uno. En teléfono y tableta se conserva la barra fija `.fa-cobrar`.
- Ticket: mascota como chip (cambiar o quitar), recetas ligadas y alergias como chips; renglones compactos (producto, − cantidad +, importe, quitar). El descuento por renglón se abre con «descuento». Clases `fa-tk*` y `fa-chip*` en `farmacia.css` (no confundir con `fa-renglon*` de compras y recetas).
- Farmacia → Inicio: «Vender» es el botón principal (navy); «Nuevo producto» pasa a secundario.
- Modo solo (sin panel): barra inferior con 4 opciones fijas + «Más» (`MenuMas` con `arriba` e `icono`) en vez de cortar a 5; las secciones que no cabían (Productos, Inventario, Compras, Ajustes) ya son alcanzables.
- Inventario: si no hay lotes con existencia (instalación nueva), arranca en «Todos los productos».
- Verificado a 1280 × 800: una venta en efectivo de 4 renglones se cobra sin desplazar (VTA cobrada, cambio $20). `test:farmacia` 299/299.

## 14. Fase 5a · Tienda en línea: pedidos para recoger (13-nov-2026)

Primera de dos ramas de la fase 5 (decisión de Jano, 12-nov). La 5b trae entrega a domicilio y repartidor, búsqueda con IA y Mercado Pago real.

### Qué hace

- **Tienda pública** en `/tienda` (dentro del grupo del portal, misma marca y app instalable). Con Farmacia o Tienda apagadas, todo `/tienda` y `/api/tienda` responden 404. El sitio y el portal muestran «Tienda»/«Farmacia» solo con el módulo encendido.
- **«¿Para quién compras?»**: una mascota del tutor (usa especie, peso, edad y alergias de la ficha) o un perfil rápido de invitado (especie y peso). Cada producto dice «Le queda a…», «No es para…», «Confirma su peso» o «Falta su peso» con `revisarContraMascota()`, la misma regla del mostrador. Lo no apto se ordena al final y no se puede pedir.
- **Catálogo**: productos activos con «Publicado en la tienda», **nunca Grupo I**. Secciones por necesidad (Pulgas y parásitos, Alimento, Medicamentos, Dietas especiales, Vitaminas, Baño e higiene, Accesorios), buscador, ficha con presentaciones, disponibilidad («Quedan pocas» < 3 piezas) y sin costos.
- **Grupo II** (receta normal del veterinario): solo un tutor con sesión, cuenta vinculada y una **receta interna vigente de esa mascota** que cubra el producto y tenga surtidos. Un pedido en curso con esa receta ya cuenta como surtido. El invitado no lo puede pedir. A domicilio queda apagado (`recetaGrupoIIDomicilio`, fase 5b).
- **Carrito** en el navegador (`components/tienda/estado.ts`, localStorage con respaldo en memoria). El servidor vuelve a revisar todo al crear el pedido.
- **Pedido** (`far-pedidos`, folio `PED-`): recoger en farmacia; pagar al recoger (si `tienda.pagarAlRecoger`) o en línea. Idempotente por `clave`; candado por producto; correo al cliente y a `tienda.correosPedidos`; liga de seguimiento con token (`/tienda/pedido/PED-…?t=…`) que sirve al invitado y al tutor.
- **Apartado**: un pedido vigente aparta unidades por producto **sin mover el kardex**. Sin pago vence a las `horasApartado`; pagado no vence. La vigencia se evalúa al leer, así que lo vencido se libera solo; el cron diario solo deja el estado en «expirado». **El mostrador también descuenta lo apartado** (búsqueda y venta).
- **Pago en línea** con el adaptador `ProveedorPago` (`lib/farmacia/pagos.ts`). Hoy existe la pasarela **«prueba»** (simulada); Mercado Pago responde «no disponible» hasta la 5b. El pedido pasa a «pagado» **solo por un aviso firmado** (`POST /api/tienda/webhook/:proveedor`), idempotente por `far-pagos-eventos` (clave `proveedor:idEvento`); referencia o monto distintos se registran y no pagan.
- **Panel → Farmacia → Pedidos** (rol con «Vender» o «Asignar repartidor»): Nuevos / Preparando / Listos / Cerrados con conteos; ficha con contacto (WhatsApp), historial y acciones: Empezar a preparar → Listo para recoger (avisa por correo) → **Entregar**. Entregar llama a `registrarVenta(ctx, …, { canal: 'tienda', pedidoId })`: FEFO, receta, autorización del encargado, Finanzas, todo igual que el mostrador. Pagado en línea entra con el método `tienda.metodoPagoEnLinea`; al recoger se cobra en un diálogo. Cancelar pide motivo; si ya se pagó queda «reembolso pendiente» (el reembolso se hace en la pasarela).
- **Portal → Farmacia** (`/portal/farmacia`; desde nov-2026 se llega por «Mis pedidos» en la cabecera de la tienda, y la pestaña «Tienda» de la barra lleva a `/tienda`): pedidos en curso y anteriores, recetas vigentes con surtidos y «Surtir» (abre la tienda con esa mascota elegida, `?para=`). Lo que no se surte en línea (Grupo I o no publicado) dice «en mostrador». Desde la UX del cliente (fase 2) la página se titula «Mis pedidos», las recetas surtibles también aparecen en los Pendientes del inicio y cada mascota tiene la pestaña **Compras** (sus recetas y pedidos; `components/portal/Compras.tsx`).

### Modelo y código

- Colecciones `far-pedidos` y `far-pagos-eventos` (`collections/farmacia/pedidos.ts`; API genérica: leer solo el equipo con permiso; crear, editar y borrar 403). Configuración: `pasarelaActiva` admite `prueba`; grupo `tienda` (`pagarAlRecoger`, `metodoPagoEnLinea`, `correosPedidos`). Migración `20261113_053734_farmacia_tienda_pedidos` (con RLS).
- `lib/farmacia/tienda.ts` (servicio), `apartados.ts` (apartado compartido con `ventas.ts`, sin ciclos), `pagos.ts` (adaptador), `tiposTienda.ts` (tipos puros y `LINEAS_TIENDA`).
- `registrarVenta()` recibe `opciones = { canal, pedidoId }`; ventas y tienda toman `pg_advisory_xact_lock(9 000 000 + producto)` antes de los candados por lote (8 000 000 + lote), en orden de id.
- API pública `app/api/tienda/[...ruta]/route.ts` (catalogo, producto, sesion, mis-pedidos, pedidos, cancelar, pagar, webhook, pago-prueba); límite de 30 pedidos por hora por IP. Panel: `GET pedidos`, `GET pedidos/:id`, `POST pedidos/:id/estado`, `POST pedidos/:id/entregar` en `/api/farmacia`.
- Pantallas: `app/(portal)/tienda/*`, `components/tienda/{Tienda,Cabecera,estado}`, `components/admin/farmacia/Pedidos.tsx`, `app/(portal)/portal/farmacia/page.tsx`.

### Pago de prueba (sin cuenta de pasarela)

- Variable **`PAGOS_PRUEBA_SECRETO`** (Sensitive, 16+ caracteres) y en Farmacia → Configuración la pasarela «Pago de prueba». Sin la variable, la opción no se ofrece.
- «Ir a pagar» abre `/tienda/pago-prueba/PED-…` con la banda «MODO PRUEBA». «Aprobar» firma el aviso con el secreto y lo pasa por el mismo camino que un aviso real.
- **Nunca con clientes reales**: cualquiera con la liga de su pedido podría marcarlo pagado. Quitar la variable antes de abrir la tienda al público; la 5b conecta Mercado Pago.

### Verificación (13-nov-2026)

- `test:farmacia` 368/368 (69 nuevas): catálogo sin Grupo I ni no publicados y sin costos; apto/no apto por perfil; apartado que bloquea al mostrador y a otro pedido; vencido que se libera sin cron y el cron que lo marca; Grupo II rechazado al invitado, a otra mascota y sin surtidos; pedido en curso con la receta; firma inválida (401), aviso de otro cobro, aviso repetido; entrega con venta canal «tienda», FEFO, Finanzas y receta descontada; autorización del encargado; cancelación con reembolso pendiente; páginas.
- `test:finanzas` 44/44, `test:clinica` 175/175, `auditoria-front` a 320/390/1280 (243 páginas, 0 hallazgos), recorrido en navegador (invitado → carrito → pago de prueba → seguimiento pagado → panel).

### Decisiones y pendientes de la fase 5a

- Precio de la tienda = precio de la presentación (sin precio en línea distinto). Las promociones por caducidad todavía no se aplican en la tienda.
- La receta se valida al pedir y otra vez al entregar; no hay estado «receta por validar» (solo recetas internas). Recetas externas subidas por el cliente: pendiente.
- Imágenes: `imagenUrl` (texto); sin imagen se dibuja el icono de la sección.
- 5b: domicilio (zonas, costo, repartidor «Mis entregas»), búsqueda con IA, Mercado Pago (Checkout Pro + webhook firmado, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`), reembolso desde el panel.

## 15. Fase 5b · Domicilio, repartidor, Mercado Pago y búsqueda con IA (13-nov-2026)

Segunda rama de la fase 5 (sobre la 5a). Decisión de Jano (13-nov): incluir las tres partes en esta rama.

### Qué hace

- **Entrega a domicilio** (Configuración → Tienda en línea): se enciende con «Entrega a domicilio» y se definen **zonas por código postal** (envío, pedido mínimo, envío gratis desde, activa). Un código postal no puede estar en dos zonas activas. El cliente escribe su dirección y la tienda cotiza al instante (`GET /api/tienda/envio?cp=&subtotal=`). El envío entra al total del pedido y a la venta (`far-ventas.envio`), no es un producto.
- **Pago a domicilio**: en línea o **al recibir** (`tienda.pagarAlRecibir`). A domicilio no existe «pagar al recoger». El Grupo II a domicilio sigue apagado (`recetaGrupoIIDomicilio`); si se enciende, aplica la misma regla de receta.
- **Enviar con repartidor** (Panel → Pedidos, quien vende): se elige a una persona con «Mis entregas» en su rol y **en ese momento se registra la venta** (la mercancía sale del inventario): pagado en línea → método `tienda.metodoPagoEnLinea`; al recibir → método `tienda.metodoContraEntrega`, que debe ser «por confirmar». El pedido queda «En camino» y el cliente recibe un correo. Un pedido con venta ya no aparta inventario ni vence.
- **Mis entregas** (`/admin/farmacia/entregas`, rol Repartidor): lo que lleva, con dirección (liga a Google Maps), llamar, WhatsApp, «Entregado» (quién recibió, «Cobré $…» obligatorio si paga al recibir, foto opcional reducida en el teléfono, nota) y «No se pudo» (motivo; regresa a la farmacia como «Listo» y se puede volver a enviar sin vender otra vez). Al entregar un pedido «al recibir», el pago de la venta se confirma (`confirmarPagoSinPermiso`) y el cobro entra a Finanzas. La foto vive en `far-evidencias` y solo se sirve por `/api/farmacia/pedidos/:id/evidencia`.
- **Cancelar con venta**: si el pedido ya tiene venta (salió y regresó), primero se anula la venta en Ventas (regresa el inventario) y luego se cancela.
- **Mercado Pago (Checkout Pro)**: con `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` y la pasarela «Mercado Pago» en Configuración.
  - Cobro: preferencia con `external_reference` = `ped-<id>-<azar>`, `notification_url` = `/api/tienda/webhook/mercadopago`, `back_urls` al seguimiento, vencimiento = el del apartado, `X-Idempotency-Key`. Con token `TEST-…` usa el sandbox.
  - Aviso: firma `x-signature` (`ts=…,v1=…`) = HMAC-SHA256(secreto, `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), la misma regla del SDK oficial `mercadopago@3.6.2` (`utils/webhook`). Después **se consulta el pago** (`GET /v1/payments/{id}`) y solo se cree lo que dice Mercado Pago (estado, monto, MXN, referencia). Avisos de otro tipo o pagos pendientes responden 200 sin cambiar nada.
  - Un pago de un cobro anterior del mismo pedido también vale (el cliente pudo abrir el pago dos veces); un segundo pago aprobado se anota para reembolsarlo.
  - **Reembolso** total desde la ficha del pedido cancelado (encargado, «Aprobar»): `POST /v1/payments/{id}/refunds`. La pasarela de prueba simula el reembolso.
- **Búsqueda con IA** («¿Qué necesita tu mascota?», solo si hay `ANTHROPIC_API_KEY`): Claude elige hasta 6 productos **de venta libre** del catálogo publicado (nunca Grupo I ni II), sin dosis ni diagnósticos, respetando especie y peso del «¿Para quién?». Si lo escrito suena a urgencia, recomienda pedir cita (también por una lista de palabras de alarma, aunque no haya IA). Sin llave o si falla, cae a búsqueda por palabras. Límite de 20 búsquedas cada 10 minutos por IP.

### Modelo y código

- Migración `20261113_185522_farmacia_domicilio_mercadopago` (con RLS en `far_evidencias` y `farmacia_configuracion_tienda_zonas`): dirección, envío, subtotal, repartidor, datos de entrega e `idPago` en `far-pedidos`; formas `al_recibir` y estado `reembolsado`; `envio` en `far-ventas`; colección `far-evidencias`; configuración `tienda.domicilioActivo`, `pagarAlRecibir`, `metodoContraEntrega`, `horarioEntrega`, `zonas`.
- En las vistas el envío se llama `envio` (nunca «costo»: «costo» es el costo interno que no ve quien no tiene «Ver costos»).
- `lib/farmacia/pagos.ts` (adaptador con `verificarAviso` asíncrono y `reembolsar`), `tienda.ts` (`cotizar`, `enviarPedido`, `misEntregas`, `entregarDomicilio`, `noEntregado`, `reembolsarPedido`, `evidencia`, `repartidores`), `sugerir.ts` (IA), `ventas.ts` (`opciones.envio`, `confirmarPagoSinPermiso`).
- API equipo: `GET repartidores`, `GET entregas`, `GET pedidos/:id/evidencia`, `POST pedidos/:id/enviar | entregado (multipart con foto) | no-entregado | reembolsar`. API pública: `GET envio`, `POST sugerir`.

### Verificación (13-nov-2026)

- `test:farmacia` 416/416 (48 nuevas): zonas y cotización, mínimo y gratis, validaciones de domicilio, Grupo II a domicilio apagado, enviar con repartidor (venta con envío «por confirmar»), «Mis entregas» y permisos, entregado con foto y cobro confirmado, no entregado y reintento, cancelar con venta, reembolso; **Mercado Pago contra un simulador local** (preferencia, firma falsa, firma de otro pago, aviso válido, aviso repetido, otro tipo, reembolso); búsqueda por palabras y señales de alarma.
- `test:finanzas` 44/44, `test:clinica` 175/175, `auditoria-front` a 320/390/1280 (249 páginas, 0 hallazgos), recorrido en navegador (carrito a domicilio → seguimiento → enviar con repartidor → Mis entregas).
- La búsqueda con IA real y Mercado Pago real no se probaron (sin llaves en este entorno).

### Decisiones y pendientes de la fase 5b

- La venta se registra al **salir** el pedido (no al entregar): así el inventario y el libro de control reflejan la salida física.
- Comisiones de Mercado Pago: el cobro entra por el total a la cuenta del método «en_linea»; la comisión se registra aparte en Finanzas (pendiente automatizarla).
- Firma del cliente al recibir: no (solo nombre y foto). Rutas optimizadas para varias entregas: no.

## 16. Tienda dentro de la app (UX del cliente, fase 3, 14-nov-2026)

Solo presentación; la lógica, la API y las reglas de 5a/5b no cambiaron.

- **Catálogo:** «Para» en una fila de chips. Tocar la mascota elegida la quita; «Otra mascota» abre especie y peso.
  - El asistente con IA pregunta «¿Qué necesita <mascota>?».
  - Cada tarjeta lleva una sola etiqueta sobre la imagen, por prioridad: agotado, no es para, receta, le queda o falta su peso, quedan pocas.
  - El botón **+** agrega al carrito cuando el producto tiene una sola presentación y se puede comprar. Si no, la flecha abre la ficha.
- **Ficha:** precio y disponibilidad arriba, aviso de aptitud a todo lo ancho y barra fija con cantidad y «Agregar · $» encima de la barra de la app.
- **Carrito:** «¿Cómo lo quieres?» y «¿Cómo pagas?» en dos columnas (una debajo de 380 px).
  - El código postal muestra la zona y el envío, o por qué no se puede, en un aviso de color.
  - El resumen fijo desglosa productos y envío.
- **Seguimiento:**
  - Tarjeta de estado con una frase clara, la dirección o «recoges en la farmacia».
  - Repartidor y quién recibió.
  - Línea de tiempo vertical con la hora de cada paso, sacada del historial del pedido.
  - Aviso de cómo y cuánto se paga.
