# Farmacia: catálogo, inventario, compras, venta de mostrador y recetas (fases 1 a 3)

> 25-oct-2026. Módulo de Farmacia sobre la plataforma (Finanzas + Clínica), según `docs/FARMACIA-PROMPT.md`. Este documento es la referencia técnica del módulo y crece con cada fase. Lo que hay hoy son las **fases 1 y 2 de 7**: base del catálogo e inventario, permisos, módulos activables e importación (fase 1, 25-oct); compras desde el XML CFDI o a mano, recepción con lote y caducidad, gasto en Finanzas, anulación y conteo físico (fase 2, 26-oct; sección 10); venta de mostrador, recetas, libro de control del Grupo I y cierre del día (fase 3, 27-oct; sección 11). Alertas, tienda y planes llegan en las fases 4 a 7.

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
- **No incluido en esta fase (por diseño):** `far-proveedor-claves` y conteo físico (hechos en la fase 2, sección 10), alertas por correo y cron (fase 4), zonas de entrega (fase 5).
- **Nota sobre el repo:** `main` no trae el cron de Vercel (`vercel.json`), los correos de citas ni `docs/ARRANQUE.md` / `docs/MANUAL-*.md` que el prompt maestro da por existentes; están en el parche `0002-0003-correos-manuales-whatsapp.patch` de la etapa de clínica, pendiente de aplicar y mezclar. La fase 4 (resumen diario por correo) los necesita.

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

- **Vender** (`/admin/farmacia/vender`, permiso «Vender»): escaneo con lector USB (escribe el código + Enter) o con la **cámara** del teléfono (API `BarcodeDetector`; si el navegador no la tiene, el botón no aparece y queda la captura manual), búsqueda por nombre, principio activo o laboratorio con existencia vendible, carrito con cantidad y descuento por renglón, mascota opcional, receta para Grupo I/II, **pagos mixtos** (efectivo con «recibido» y cambio, billetes rápidos, terminal, transferencia) y ticket. Con un solo método el monto sigue al total: escanear → Cobrar.
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
