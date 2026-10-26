# Prompt maestro · Farmacia Orthopedic Vet's

Oct 25, 2026 · @Alejandro Ortiz

## Cómo usar este prompt

Este documento se entrega completo a Claude Code dentro del repo `JanoM91/Orthopedic-Vets-Medical`, y se ejecuta **una fase por sesión** (sección «Fases»). Cowork queda para la investigación pendiente, los manuales y las preguntas al Dr. Joni.

1. Exporta este documento a Markdown y guárdalo en el repo como `docs/FARMACIA-PROMPT.md`.
2. En Claude Code, rama nueva `feat/farmacia-fase-N`, y pide: «Lee `CLAUDE.md`, `docs/CLINICA.md` y `docs/FARMACIA-PROMPT.md`. Ejecuta la Fase N completa y no avances a la siguiente».
3. Al terminar cada fase, Claude Code entrega: commits, migraciones nuevas, resultado de pruebas y la lista de criterios de aceptación marcada. Tú revisas el preview de Vercel y haces el merge.
4. Si una decisión de este documento cambia, se edita aquí primero y luego se vuelve a exportar.

## Rol, contexto y objetivo

**Tu rol:** eres el desarrollador principal del módulo **Farmacia** dentro de la plataforma de Orthopedic Vet's Medical (OVM). Construyes funcionalidad completa, probada y documentada; el diseño visual final llega después, pero todo debe ser usable en un teléfono de 390 px.

**Sistema existente (no lo rehagas, extiéndelo):**

- Next.js 16 + Payload 3 + Postgres en Supabase (esquema por migraciones que la app aplica al arrancar; todas las tablas con RLS activado y sin políticas) + Vercel + Vercel Blob privado. Nunca corras `npm run dev` contra producción.
- **Finanzas:** entradas, gastos, cobros y pagos parciales, cuentas y cajas con saldo, traspasos, nómina restringida, bitácora de corrección y anulación, catálogo de **áreas** (ya existe «Farmacia») y categorías. Los gastos de luz, agua, renta y salarios **se siguen capturando en Finanzas**; Farmacia no los duplica.
- **Clínica:** `clientes`, `mascotas`, `mas-pesos`, `mas-cartilla`, `mas-notas` (SOAP; firmada = inmutable), `mas-documentos`, `tutores`, `codigos-vinculacion`, `servicios`, `citas`, agenda por consultorio. Folios públicos `CLI-`, `MAS-`, `CIT-`.
- **Portal del tutor** `/portal`: cuenta con correo y contraseña + código de vinculación; mascotas, cartilla, peso, documentos, citas.
- **Roles configurables** con permisos por grupo; la primera cuenta nace superadministradora.
- Correo por Resend (sin llaves no se envía nada y nada falla), cron de Vercel con `CRON_SECRET`, botón de WhatsApp con mensaje prellenado, sitio público en `/`.
- **Marca blanca = una instalación por clínica**, configurada por variables `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_BRAND_*`.

**Objetivo del módulo:** una farmacia veterinaria con (1) panel interno para catálogo, inventario por lote, compras, ventas de mostrador, recetas, alertas y reportes, y (2) **tienda digital** para tutores, con buscador inteligente, validación contra el perfil de la mascota, compra recurrente, recolección en farmacia o entrega a domicilio y varios métodos de pago. Primero sirve a OVM; después se venderá a farmacias veterinarias **sin clínica**, así que todo lo de Clínica debe poder apagarse por configuración sin romper Farmacia.

## Decisiones (25-oct-2026)

Las filas «Jano» son decisiones tomadas; las filas «Propuesta» son recomendaciones del asistente que se construyen así salvo que Jano diga otra cosa.

| Tema | Decisión | Origen |
| --- | --- | --- |
| Dónde | Módulo dentro de la app actual, mismo repo y base | Jano |
| Quién construye | Claude Code (código); Cowork (investigación, manuales) | Jano |
| Para quién | Primero OVM; después producto vendible a farmacias veterinarias | Jano |
| Módulos activables | Clínica, Farmacia, Tienda, Finanzas se encienden por configuración; sin Clínica, la mascota usa un perfil ligero | Propuesta |
| Líneas de producto | Venta libre y antiparasitarios; con receta y controlados; alimento y dietas de prescripción; accesorios, higiene y suplementos | Jano |
| Venta fraccionada | Por confirmar con el Dr. Joni; el modelo la soporta desde el inicio (unidad base + presentaciones con factor) | Propuesta |
| Catálogo inicial | En construcción; se importa con plantilla propia del sistema | Jano / Propuesta |
| Lote y caducidad | Toda entrada registra lote y caducidad; salidas por el lote que vence primero (FEFO) | Propuesta |
| Inventario de la clínica | Separado; el modelo usa almacenes para poder agregarlo después | Jano / Propuesta |
| Alertas | Panel + correo (resumen diario) | Jano |
| Próximo a caducar | El sistema propone promoción en la tienda; un humano aprueba; nunca en receta ni controlados | Jano / Propuesta |
| Mínimos que aprenden | Mínimo fijo inicial; tras \~8 semanas propone punto de reorden; humano acepta | Propuesta |
| Pedidos a proveedor | Solo lista sugerida de reabasto, agrupada por proveedor | Jano |
| Registro de compras | XML CFDI de la factura o captura manual; lote y caducidad siempre a mano | Jano |
| Proveedores | Catálogo configurable con días de entrega | Jano |
| Pagos | Efectivo, transferencia, terminal bancaria, Clip, Mercado Pago, otros configurables | Jano |
| Pasarela en línea | Una en la v1 detrás de un adaptador (ver Investigación) | Propuesta |
| Caja | Hoy no hacen corte; se agrega «cierre del día» opcional, activado por omisión | Propuesta |
| CFDI a clientes | Módulo opcional posterior; desde ya se guardan datos fiscales opcionales | Jano |
| Roles | Superadministrador, Dueño, Encargado/farmacéutico, Vendedor de mostrador, Repartidor | Jano |
| Costos para vendedor | No ve costos ni márgenes | Jano |
| Descuentos | Solo encargado o dueño | Jano |
| Compra digital | Invitado para venta libre; cuenta del portal para receta | Jano |
| Recetas | Receta digital del veterinario (`REC-`) o receta externa adjunta validada por el encargado | Jano |
| Controlados | Con receta física presentada o adjunta en la compra digital; entrega solo en farmacia con verificación de la receta | Jano / Propuesta |
| Prioridades tienda v1 | Compra recurrente, aviso de recompra por dosis y peso, buscador en lenguaje natural, planes anuales prepagados o a meses | Jano |
| Validación por mascota | Especie, rango de peso, edad y alergias: obligatoria en el carrito; filtro de navegación en v2 | Propuesta |
| Entregas | Repartidor propio, tarifa por zona o colonia | Jano |
| Pago en domicilio | Solo anticipado; el repartidor no maneja dinero | Jano |
| Recolección | Aparta 24 h; si no estaba pagado se libera solo | Jano |
| Receta a domicilio | Por confirmar; por omisión configurable y apagado | Propuesta |
| Devoluciones | Por confirmar con el Dr. Joni; configurable | Propuesta |

## Investigación (25-oct-2026)

La regulación mexicana define tres grupos de medicamentos veterinarios, y eso decide qué puede venderse en línea. Mercado Pago es la pasarela recomendada para la v1 porque es la única de las tres que ya usan con API de suscripciones documentada.

### Regulación: NOM-064-ZOO-2000 (SENASICA)

Fuente: [capacitación SENASICA sobre recetas y comercialización](https://www.gob.mx/cms/uploads/attachment/file/722845/CAPACITACI_N_A_MVZ_O_PMVZ_REGULATORIOS_DSCP.pdf). No es asesoría legal; el médico responsable de OVM debe confirmarlo.

| Grupo | Qué incluye | Cómo se vende | Regla para el sistema |
| --- | --- | --- | --- |
| I | Psicotrópicos, estupefacientes, anabólicos, hormonales | Receta médica **cuantificada** con folio autorizado por SENASICA; la farmacia conserva el **original cancelado**; libro de control de salidas | Se puede apartar en línea con foto, pero **solo se entrega en farmacia** al recibir el original. Nunca a domicilio. Libro de control obligatorio |
| II | Riesgo de hipersensibilidad, toxicidad o interacciones | Receta médica simple (original + 2 copias); la farmacia conserva el original | Receta digital de OVM o foto validada por el encargado; el original físico queda «pendiente» hasta recibirlo |
| III | Inocuos para paciente y usuario | Venta libre | Compra como invitado, domicilio y promociones permitidas |

El libro de control del Grupo I registra: laboratorio, producto, número de registro, lote, fecha de compra, folio de receta, fecha de uso, cantidad y animal de destino. Los productos regulados llevan número de registro SENASICA en la etiqueta (letra Q para farmacéuticos, B para biológicos); el catálogo debe guardarlo.

### Referente: Chewy Pharmacy (EE. UU.)

Patrones aplicables, según su [FAQ de dietas veterinarias](https://image.chewy.com/is/content/catalog/61777_FAQ._V1540324616_.pdf) y su [ficha en App Store](https://apps.apple.com/us/app/-/id1149449468):

- La receta define **vigencia y número de surtidos**; la compra recurrente continúa mientras la receta lo permita y, al agotarse, se pide nueva autorización al veterinario.
- En el checkout el cliente indica mascota y veterinario; la farmacia valida antes de enviar.
- Recordatorios de medicamento para recompra y un rastreador de síntomas que orienta al siguiente paso, sin recetar.
- Descuento por compra recurrente como incentivo de permanencia.

Adaptación para OVM: la ventaja propia es que el veterinario y la farmacia están en la misma plataforma, así que la validación es inmediata con la receta digital `REC-`, sin llamar a nadie.

### Pasarelas de pago en México

| Proveedor | Lo útil para la tienda | Fuente |
| --- | --- | --- |
| Mercado Pago | API de **suscripciones** con reintentos automáticos y frecuencia semanal, mensual o anual; Checkout Pro con meses sin intereses, OXXO y SPEI | [Suscripciones](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/overview), [Checkout Pro](https://www.mercadopago.com.mx/developers/en/docs/shopify/integration-configuration/checkout-pro) |
| Clip | API de checkout por link de pago (expira a las 72 h); meses sin intereses; no se encontró API de suscripciones | [Checkout Clip](https://developer.clip.mx/reference/introduccion-a-clip-checkout) |
| Terminal bancaria | Cobro presencial fuera del sistema | — |

Recomendación: **Mercado Pago** para la tienda en línea (pago único, meses sin intereses y suscripciones) detrás de un adaptador `PaymentProvider`; Clip y la terminal bancaria se registran como métodos manuales en mostrador. Las comisiones se consultan en el panel de cada proveedor al contratar; no se fijan en el código.

### Buscador inteligente

Propuesta sin infraestructura nueva: búsqueda de texto en Postgres con tolerancia a errores de escritura (`pg_trgm`) y sinónimos, más **Claude** (ya hay `ANTHROPIC_API_KEY` en la app) para convertir la frase del cliente en filtros: especie, peso, categoría, principio activo, presentación. Si la frase describe un síntoma, la respuesta no sugiere productos: ofrece agendar consulta. Búsqueda semántica con `pgvector` queda para la v2.

## Modelo de datos

Todas las colecciones nuevas llevan prefijo `far-`, llave interna serial y, donde se indica, folio público inmutable. Cada una entra con su migración y RLS activado sin políticas, igual que las existentes. Usa el mismo tipo monetario y la misma zona horaria que Finanzas.

| Colección | Folio | Propósito y campos clave |
| --- | --- | --- |
| `far-productos` | `PRD-` | Nombre comercial, principio activo, laboratorio, **registro SENASICA**, **grupo** (I, II, III, desregulado), línea (medicamento, antiparasitario, alimento, dieta de prescripción, accesorio, higiene, suplemento), especies, peso mínimo y máximo (kg), edad mínima (meses), alérgenos o principios a cruzar, refrigeración, unidad base, imagen, descripción, publicado en tienda, mínimo de inventario, punto de reorden propuesto y aceptado, proveedor preferente |
| `far-presentaciones` | — | Producto, nombre («Caja 30 tabletas»), factor a unidad base, código de barras, precio de venta, se vende fraccionado sí/no |
| `far-almacenes` | — | Nombre, tipo (farmacia, clínica, sucursal), activo. Arranca con uno: «Farmacia» |
| `far-proveedores` | — | Nombre, RFC, contacto, días de entrega, activo |
| `far-proveedor-claves` | — | Proveedor + clave del proveedor (la del XML) → presentación propia. Se aprende en la primera recepción |
| `far-lotes` | `LOT-` | Producto, almacén, número de lote, caducidad, costo por unidad base, cantidad recibida, existencia, compra de origen |
| `far-movimientos` | — | Kardex **inmutable**: tipo (compra, venta, ajuste, merma, traspaso, devolución), lote, cantidad con signo, costo, referencia, usuario, motivo, fecha. Las correcciones son movimientos inversos, nunca ediciones |
| `far-reservas` | — | Pedido, lote, cantidad, expira en. Descuentan existencia disponible, no física |
| `far-compras` | `COM-` | Proveedor, folio y UUID de la factura, XML original (Blob privado), renglones con lote y caducidad, subtotal, IVA, total, contado o crédito, estado (borrador, recibida, anulada), gasto ligado en Finanzas |
| `far-ventas` | `VTA-` | Canal (mostrador, tienda), cliente y mascota opcionales, renglones (presentación, lotes usados, cantidad, precio, descuento, costo), pagos (método, monto, referencia, estado), vendedor, receta usada, entrada ligada en Finanzas, datos fiscales opcionales |
| `far-pedidos` | `PED-` | Pedido de la tienda: tutor o invitado, mascota, renglones, recolección o domicilio, zona, dirección, envío, estado, pago en pasarela, recetas, repartidor, venta generada |
| `far-recetas` | `REC-` | Origen (OVM desde el expediente / externa en foto), mascota, MVZ, cédula, folio cuantificado (Grupo I), emisión, vigencia, renglones (producto o principio, dosis, frecuencia, duración, surtidos permitidos y usados), archivo, estado (por validar, válida, rechazada, original recibido), quién validó |
| `far-libro-control` | — | Asiento automático e inmutable por cada salida de Grupo I con los campos que pide la NOM-064 (ver Investigación) |
| `far-planes` | `PLN-` | Compra recurrente o plan anual: tutor, mascota, producto y presentación, frecuencia, modalidad (recurrente, anual prepagado, anual a meses), próxima entrega, dosis entregadas y totales, receta ligada, id de suscripción en la pasarela, estado |
| `far-promociones` | — | Producto o lote, descuento, vigencia, origen (caducidad o manual), estado (propuesta, aprobada, rechazada, vencida), quién aprobó |
| `far-alertas` | — | Tipo (caducidad, desabasto, reorden sugerido, receta por validar, original pendiente, plan por renovar), objeto, severidad, estado (abierta, atendida, descartada), fechas |
| `far-zonas-entrega` | — | Nombre, colonias o códigos postales, tarifa, pedido mínimo, envío gratis desde |
| `far-cierres-dia` | — | Fecha, caja, efectivo esperado, contado, diferencia, usuario, nota |
| Global `farmacia-configuracion` | — | Días de aviso de caducidad por línea, horas de apartado (24), cierre del día activo, receta Grupo II a domicilio (apagado), política de devoluciones, semanas de historial para aprender (8), almacén por omisión, área y categorías de Finanzas, pasarela activa |

**Relaciones con lo existente:**

- La mascota es la misma colección `mascotas`. Si no tiene campo de alergias, agrégalo por migración. Con Clínica apagada, el tutor captura un perfil ligero desde la tienda (especie, raza, nacimiento, peso, alergias).
- El peso vigente sale de `mas-pesos`. La receta interna se emite desde el expediente y queda ligada a la nota SOAP.
- Cada venta crea una **entrada** en Finanzas (área Farmacia) en la cuenta o caja del método de pago; cada compra crea un **gasto** (contado o por pagar). Si Finanzas no distingue anticipos, agrega lo mínimo para registrar el prepago de planes anuales como anticipo y reconocerlo por entrega, y documéntalo.
- Módulos activables en una configuración global de la instalación: Clínica, Farmacia, Tienda. Sin Clínica, el panel y el portal ocultan expediente y agenda.

## Reglas de negocio

Estas reglas se implementan en el servidor (hooks y servicios), nunca solo en la interfaz, y cada una lleva prueba automatizada.

### Inventario

- Existencia física = suma de movimientos del lote. Disponible = física − reservas vigentes.
- Las salidas toman el lote no vencido con caducidad más próxima (FEFO). Un lote vencido queda bloqueado para venta y aparece como «retirar».
- Venta fraccionada solo si la presentación lo permite; descuenta unidades base del lote.
- Ajustes y mermas: solo encargado o superior, motivo obligatorio, bitácora. Pantalla de **conteo físico** que genera los ajustes por diferencia.
- Código de barras: lector USB (actúa como teclado) y cámara del teléfono (API `BarcodeDetector` con respaldo de captura manual).

### Alertas

- **Caducidad** por lote, con días de aviso por línea (por omisión 90 medicamentos, 60 alimento, configurable): aviso, urgente (≤ 30 días) y vencido.
- **Desabasto:** disponible ≤ mínimo (o punto de reorden aceptado). En la tienda, agotado muestra «Avísame cuando llegue».
- **Aprendizaje:** con al menos 8 semanas de ventas del producto, calcula el punto de reorden y lo propone si difiere más de 20 % del vigente. Un humano acepta o corrige; nunca cambia solo.
- **Sin rotación:** productos sin venta en 90 días.
- Una sola alerta abierta por objeto y tipo. Resumen diario por correo a las 08:00 (hora de México) para quien tenga permiso; contador en el panel.

Fórmula del punto de reorden (demanda diaria d̄ con desviación σ, días de entrega L del proveedor, z = 1.65 para 95 % de servicio):

```latex
R = \bar{d}\,L + z\,\sigma\,\sqrt{L}
```

Cantidad sugerida en la lista de reabasto = R + d̄ × días de cobertura (configurable, 30 por omisión) − disponible, redondeada a la presentación de compra.

### Compras

- Importar XML CFDI 4.0: emisor (RFC → proveedor), conceptos (`NoIdentificacion`, descripción, cantidad, valor unitario, importe), impuestos y UUID del timbre. Rechaza un UUID repetido.
- Claves sin relacionar piden elegir la presentación una vez y se guardan en `far-proveedor-claves`.
- No se puede «recibir» sin lote y caducidad en cada renglón. Recibir crea lotes, movimientos y el gasto en Finanzas.
- Anular una compra solo si sus lotes no han tenido salidas; genera movimientos inversos.
- Lista de reabasto agrupada por proveedor preferente, copiable como texto para WhatsApp o descargable en CSV.

### Venta de mostrador

- Buscar o escanear, cantidad, precio de la presentación. Pagos mixtos; efectivo con cambio; transferencia «por confirmar».
- Descuento: solo lo aplica o autoriza encargado o dueño (reingresando su contraseña en el momento si la sesión es de un vendedor).
- Grupo II exige receta válida ligada. Grupo I exige folio cuantificado, marcar «original recibido» y genera el asiento del libro de control.
- Ticket imprimible o PDF y envío por correo. Reintentos sin duplicar (misma idempotencia que Finanzas).

### Recetas

- **Interna:** el veterinario la emite desde el expediente; precarga el peso vigente; la dosis la escribe él. Firmada = inmutable.
- **Externa:** el tutor sube la foto; el encargado revisa MVZ, cédula, fecha, producto y dosis, y la marca válida o rechazada con motivo; el tutor recibe correo.
- Vigencia y surtidos los fija el MVZ. Cada venta consume un surtido; agotada o vencida, no surte.
- Grupo I: el original físico es obligatorio antes de entregar. Grupo II externa: «original pendiente», exigible según configuración.

### Validación contra la mascota (tienda y mostrador)

- Especie no incluida, peso fuera de rango, edad menor a la mínima o alergia coincidente → **bloqueo** en la tienda con mensaje claro y, si existe, la presentación correcta del mismo producto. En mostrador, el encargado puede autorizar con motivo.
- Peso con más de 90 días en productos por rango de peso → pide confirmar el peso antes de seguir.
- El sistema **nunca calcula ni sugiere dosis** de un medicamento con receta.

### Compra recurrente y planes

- **Recurrente:** genera el pedido 3 días antes de la próxima entrega y cobra por la suscripción de la pasarela. Si la receta venció o se agotaron los surtidos, no genera: avisa y ofrece cita.
- **Anual prepagado:** descuento configurable; un cobro; entrega dosis por dosis; anticipo en Finanzas reconocido por entrega. Si la mascota cambia de rango de peso, cambia la presentación; la diferencia la decide el encargado.
- **Anual a meses:** un cobro con meses sin intereses en la pasarela; mismas reglas de entrega.
- **Aviso de recompra:** fecha estimada = unidades compradas ÷ consumo diario (posología de la receta o duración por omisión del producto, p. ej. pipeta = 30 días). Correo 5 días antes con recompra en un clic.
- Cancelación y reembolso de planes: según la política de devoluciones (pendiente).

### Pedidos de la tienda

Estados: `creado` → `pago_pendiente` → `pagado` → `receta_por_validar` (si aplica) → `preparando` → `listo_para_recoger` o `en_ruta` → `entregado`; además `cancelado` y `expirado`.

- Recolección: se paga en línea o en mostrador. Sin pago, la reserva expira a las 24 h y se libera sola. Pagado y no recogido: alerta al encargado; no se libera sin su decisión.
- Domicilio: solo pagado por adelantado, solo dentro de una zona configurada, nunca Grupo I; Grupo II según configuración.
- El repartidor ve solo sus pedidos y marca «entregado» con nombre de quien recibe. No maneja dinero.
- Correo al tutor en cada cambio de estado relevante; aviso a la farmacia en pedido nuevo.

### Promociones por caducidad

- Solo Grupo III y desregulados. Descuento sugerido escalonado y configurable (p. ej. 15 % a 90 días, 30 % a 45 días).
- Queda como «propuesta» hasta que el encargado la aprueba; aplica solo al lote afectado y vence antes de la caducidad.

### Cierre del día y devoluciones

- Cierre del día (activado por omisión): efectivo esperado según Finanzas vs. contado; la diferencia queda registrada con nota y usuario.
- Devoluciones según política configurable; por omisión no se aceptan medicamentos salvo error de la farmacia. Lo devuelto vuelve a inventario solo cerrado y con aprobación del encargado; si no, es merma.

## Panel interno

El panel vive en `/admin/farmacia` y sigue el patrón de `/admin/clinica`: inicio con cifras de hoy y pantallas por tarea, todas usables a 390 px. La pantalla de venta debe permitir cobrar un producto escaneado en menos de 15 segundos.

**Pantallas:**

1. **Inicio:** ventas del día, pedidos por preparar, recetas por validar, originales pendientes, alertas abiertas, cierre del día pendiente.
2. **Vender:** búsqueda y escaneo, carrito, mascota opcional con validación, receta, pagos mixtos, ticket.
3. **Pedidos:** tablero por estado, preparar, asignar repartidor, marcar listo.
4. **Productos:** catálogo, presentaciones, precios, publicación en tienda, importación con plantilla.
5. **Inventario:** existencias por producto y lote, kardex, conteo físico, ajustes y mermas.
6. **Compras:** nueva compra (XML o manual), recepción con lote y caducidad, historial.
7. **Reabasto:** lista sugerida por proveedor y propuestas de punto de reorden.
8. **Recetas:** bandeja por validar, historial, originales pendientes.
9. **Planes:** compras recurrentes y planes anuales, próximas entregas, renovaciones.
10. **Promociones:** propuestas por caducidad, activas, historial.
11. **Reportes:** ventas, margen por producto y línea, rotación, caducidades, valor del inventario a costo, libro de control Grupo I (exportable).
12. **Configuración:** parámetros, proveedores, almacenes, zonas de entrega.
13. **Mis entregas** (repartidor): lista del día con dirección, teléfono, botón de WhatsApp y «entregado».

**Permisos nuevos** en Roles, grupo «Farmacia». Los roles sugeridos se crean con «Crear los sugeridos», igual que hoy. La receta interna la emite el rol Médico veterinario desde Clínica.

| Permiso | Superadmin | Dueño | Encargado | Vendedor | Repartidor |
| --- | --- | --- | --- | --- | --- |
| Vender en mostrador | ✓ | ✓ | ✓ | ✓ |  |
| Ver costos y márgenes | ✓ | ✓ | ✓ |  |  |
| Aplicar o autorizar descuentos | ✓ | ✓ | ✓ |  |  |
| Catálogo y precios | ✓ | ✓ | ✓ |  |  |
| Recibir compras | ✓ | ✓ | ✓ |  |  |
| Ajustes, mermas y conteo | ✓ | ✓ | ✓ |  |  |
| Validar recetas y despachar Grupo I y II | ✓ | ✓ | ✓ |  |  |
| Aprobar promociones y puntos de reorden | ✓ | ✓ | ✓ |  |  |
| Preparar pedidos de la tienda | ✓ | ✓ | ✓ | ✓ |  |
| Asignar repartidor | ✓ | ✓ | ✓ |  |  |
| Ver y cerrar mis entregas |  |  |  |  | ✓ |
| Registrar cierre del día | ✓ | ✓ | ✓ | ✓ |  |
| Reportes y libro de control | ✓ | ✓ | ✓ |  |  |
| Configuración de la farmacia | ✓ | ✓ |  |  |  |

Un usuario que no tiene «Ver costos» no recibe costos ni márgenes en ninguna respuesta de la API, no solo en pantalla.

## Tienda digital

La tienda vive en `/tienda`, con la marca de la instalación, y se organiza **alrededor de la mascota y de la necesidad**, no del catálogo. Meta: que un tutor que ya compró antes repita la compra en tres toques.

### Navegación

- **«¿Para quién compras?»** arriba de todo. Con sesión, chips con las mascotas del tutor; como invitado, un selector rápido de especie y peso («Perro · 12 kg») que se guarda en la sesión. Todo el catálogo se anota con «Apto» o «No apto» para esa mascota.
- **Entradas por necesidad:** Pulgas y garrapatas · Desparasitar · Alimento · Dieta especial · Articulaciones y movilidad · Piel y pelo · Higiene · Accesorios. El orden y los nombres se configuran.
- **«Lo que ya usa Rocky»:** compras anteriores con recompra en un clic.
- **«Recetado por tu veterinario»:** con sesión, las recetas internas vigentes aparecen listas para comprar, sin subir nada.

### Buscador

- Una sola barra. La frase se interpreta y se muestran los filtros entendidos como chips editables («perro · 10–20 kg · antipulgas»).
- Tolera errores de escritura y nombres comerciales o principios activos.
- Si la frase describe un síntoma, muestra una tarjeta «Esto lo debe revisar un veterinario» con botón para agendar cita y WhatsApp; no muestra productos.
- Cada búsqueda sin resultados se guarda para que el encargado vea qué piden y no tienen.

### Ficha de producto

- Sello de compatibilidad: «Apto para Rocky» o «No apto: es para 20–40 kg», con enlace a la presentación correcta.
- Indicador «Requiere receta» en Grupo II; disponibilidad y «recógelo hoy» si hay existencia.
- Selector de modalidad: una vez · cada N días con descuento · plan anual (prepagado o a meses).
- En promoción por caducidad, se muestra la fecha de caducidad del lote antes de pagar.
- **Grupo I no aparece en el catálogo público** ni en el sitemap: solo lo ve un tutor con sesión que tenga una receta para esa mascota, como «Apartar con tu receta».

### Carrito y pago

- Validación contra la mascota antes de pagar (ver Reglas). Receta: «tu veterinario ya la emitió» o subir foto.
- Checkout en máximo tres pasos: **entrega** (recoger o domicilio, zona por código postal y costo visible) → **pago** (Mercado Pago con tarjeta, meses sin intereses, OXXO o SPEI; transferencia con referencia; pagar al recoger solo en recolección) → **confirmación** con número `PED-` y seguimiento.
- Invitado: nombre, correo y teléfono; al final se le ofrece crear cuenta para guardar su mascota.

### En el portal del tutor

Pestaña **Farmacia** en `/portal`: pedidos y su estado, planes activos con próxima entrega, recetas con vigencia y surtidos restantes, recompra en un clic y avisos.

### Calidad

Textos en español claro, sin promesas médicas. Usable a 390 px, accesible con teclado y lector de pantalla, imágenes optimizadas. El catálogo de Grupo III y desregulados es indexable; el carrito, el portal y Grupo I no.

## Integraciones y configuración

Toda integración externa es opcional: sin su llave, la función se apaga con un mensaje claro y el resto sigue funcionando, como ya pasa con Resend y la nota de voz.

| Integración | Cómo | Variables en Vercel |
| --- | --- | --- |
| Finanzas | Servicio interno que crea entradas y gastos con área Farmacia; nunca escribe directo en tablas de Finanzas desde la UI | — |
| Mercado Pago | Adaptador `PaymentProvider` (crear cobro, suscripción, reembolso, consultar estado). Webhook con firma verificada e idempotente; el estado del pedido solo cambia por webhook o consulta al proveedor, nunca por el regreso del navegador | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` (Sensitive) |
| Correo | Resend, mismo adaptador existente: pedidos, recetas, recompra, resumen de alertas | `RESEND_API_KEY`, `LEADS_FROM_EMAIL` |
| Buscador con IA | Claude convierte la frase en filtros JSON validados con esquema; caché por frase; límite de llamadas por IP; sin llave, búsqueda de texto normal | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (existentes) |
| Archivos | Blob privado existente para fotos de receta y XML; acceso solo por URL firmada a usuarios con permiso | `FINANZAS_BLOB_READ_WRITE_TOKEN` (existente) |
| Tareas programadas | Un cron diario a las 08:00 de México: alertas, resumen, planes por generar, avisos de recompra, limpieza de reservas vencidas. La expiración de reservas se evalúa también al leer (`expira_en < ahora` = no vigente), así que no depende de un cron frecuente | `CRON_SECRET` (existente) |
| WhatsApp | Botón con mensaje prellenado, como en Clínica (pedido listo, receta rechazada, entrega en camino) | `NEXT_PUBLIC_BRAND_PHONE` |

**Marca blanca y módulos:**

- La marca sigue saliendo de `NEXT_PUBLIC_SITE_NAME` y `NEXT_PUBLIC_BRAND_*`.
- Nueva global `instalacion-configuracion`, editable solo por superadmin: módulos activos (Clínica, Farmacia, Tienda; Finanzas siempre activo). Apagar un módulo oculta sus rutas, menús y permisos sin borrar datos.
- Una instalación de farmacia sin clínica debe poder arrancar desde cero solo con Farmacia, Tienda y Finanzas, y pasar todas sus pruebas.

## Fases y criterios de aceptación

Siete fases, una por sesión de Claude Code y una rama por fase. Criterios comunes a todas: `tsc --noEmit`, `npm run lint` y `npm run build` sin errores; `npm run test:finanzas` y `npm run test:clinica` siguen en verde; `npm run test:farmacia` crece con cada fase; arranque en modo producción contra Postgres vacío aplica las migraciones solo; recorrido en Chromium a 390 px y 1280 px sin errores de JavaScript.

### Fase 1 · Base del catálogo e inventario

Colecciones de productos, presentaciones, almacenes, proveedores, lotes, movimientos; global de configuración; permisos y roles sugeridos; global `instalacion-configuracion`; plantilla de importación de productos.

- [ ] Importar la plantilla con 50 productos de ejemplo crea productos y presentaciones con folio `PRD-`, y reporta filas con error sin cortar la importación.
- [ ] La existencia de un lote es siempre la suma de sus movimientos; editar o borrar un movimiento es imposible por API.
- [ ] Un usuario sin «Ver costos» no recibe campos de costo en ninguna respuesta.
- [ ] Con Clínica apagada, el panel no muestra expediente ni agenda y las pruebas de Farmacia pasan.

### Fase 2 · Compras e inventario operativo

- [ ] Un XML CFDI 4.0 de ejemplo llena la compra; el mismo UUID se rechaza la segunda vez.
- [ ] No se puede recibir sin lote y caducidad; recibir crea lotes, movimientos y un gasto en Finanzas (contado o por pagar).
- [ ] La segunda compra del mismo proveedor reconoce sola las claves ya relacionadas.
- [ ] Conteo físico genera ajustes con motivo; una merma sin motivo se rechaza.

### Fase 3 · Venta de mostrador y recetas

- [ ] Venta con escaneo, pago mixto (efectivo + terminal) y cambio; crea entrada en Finanzas y descuenta por FEFO.
- [ ] Un lote vencido no se puede vender.
- [ ] Un vendedor no puede aplicar descuento sin la contraseña de un encargado.
- [ ] Grupo II sin receta válida se rechaza; Grupo I sin folio ni «original recibido» se rechaza y, con ellos, crea asiento en el libro de control.
- [ ] Receta interna emitida desde el expediente queda inmutable al firmar; receta externa pasa por validación con motivo de rechazo.
- [ ] Validación por mascota bloquea especie, peso, edad o alergia incompatibles.
- [ ] Cierre del día registra la diferencia entre esperado y contado.

### Fase 4 · Alertas, reabasto y promociones

- [ ] Con datos sembrados, aparecen alertas de caducidad (aviso, urgente, vencido) y desabasto, sin duplicados.
- [ ] Con 8 semanas de ventas simuladas, el sistema propone un punto de reorden que coincide con la fórmula; aceptarlo cambia el mínimo, ignorarlo no.
- [ ] La lista de reabasto agrupa por proveedor y se copia como texto.
- [ ] El cron genera un solo correo resumen; sin llave de Resend no falla.
- [ ] Un lote de Grupo III cerca de caducar genera promoción «propuesta»; Grupo I o II nunca.

### Fase 5 · Tienda digital y pedidos

- [ ] Invitado compra un producto de venta libre para recoger; sin pago, la reserva expira a las 24 h.
- [ ] Tutor con sesión compra Grupo II a domicilio dentro de zona con receta interna; fuera de zona solo puede recoger.
- [ ] Grupo I no aparece en catálogo público ni sitemap; con receta, solo permite apartar y recoger.
- [ ] Pago con Mercado Pago en modo prueba: el pedido pasa a `pagado` solo por webhook firmado; un webhook repetido no duplica la venta.
- [ ] El buscador interpreta «antipulgas perro 12 kg» en filtros; una frase de síntoma muestra la tarjeta de cita; sin llave de Anthropic, la búsqueda de texto funciona.
- [ ] El repartidor ve solo sus pedidos y no ve importes de costo.
- [ ] Pestaña Farmacia en el portal con pedidos, recetas y recompra.

### Fase 6 · Compra recurrente y planes

- [ ] Suscripción en modo prueba genera el pedido 3 días antes de la entrega.
- [ ] Receta vencida detiene el plan y envía aviso con enlace a cita.
- [ ] Plan anual prepagado registra anticipo en Finanzas y lo reconoce dosis por dosis.
- [ ] Cambio de rango de peso cambia la presentación del plan.
- [ ] Aviso de recompra se envía 5 días antes de la fecha estimada.

### Fase 7 · Reportes, manuales y entrega

- [ ] Reportes de ventas, margen, rotación, caducidades, valor de inventario y libro de control, exportables a CSV.
- [ ] `docs/FARMACIA.md` (técnico), `docs/MANUAL-FARMACIA.md` (equipo) y secciones nuevas en `docs/ARRANQUE.md` y `docs/MANUAL-TUTOR.md`.
- [ ] Instalación nueva solo con Farmacia, Tienda y Finanzas arranca desde cero y pasa todas las pruebas.

## Reglas de trabajo y pendientes

### Para Claude Code

1. Lee `CLAUDE.md`, `docs/CLINICA.md` y este documento antes de escribir código. Sigue «Cambios al modelo de datos» para cada migración.
2. No inventes datos ni reglas: si algo falta, déjalo configurable con un valor por omisión seguro y anótalo en el resumen de la fase.
3. No toques producción: nada de `npm run dev` contra la base de producción, migraciones manuales ni cambios de variables en Vercel. Mercado Pago solo con credenciales de prueba.
4. Reutiliza lo que existe (permisos, bitácora, idempotencia, Resend, Blob, cron). Una dependencia nueva solo con justificación escrita.
5. Toda regla de negocio va en el servidor y con prueba. Interfaz y documentación en español.
6. Al cerrar cada fase entrega: commits, migraciones nuevas, resultado de pruebas, criterios marcados, pendientes y `docs/FARMACIA.md` actualizado.

### Por confirmar con Jano

- [ ] Módulos activables por instalación (Clínica, Farmacia, Tienda).
- [ ] Cierre del día activado por omisión.
- [ ] Grupo I fuera del catálogo público.

### Por pedir al Dr. Joni

- [ ] ¿Venden fraccionado (tableta, blíster, ml)? ¿Qué productos?
- [ ] Política de devoluciones y de cancelación de planes prepagados.
- [ ] ¿Medicamentos con receta (Grupo II) a domicilio?
- [ ] Médico responsable y Aviso de Inicio de Funcionamiento de la farmacia ante SENASICA; folios de receta cuantificada si venderán Grupo I.
- [ ] Lista de controlados que manejan y grupo de cada producto en el catálogo.
- [ ] Proveedores y días de entrega; zonas y tarifas de envío.
- [ ] Descuento para compra recurrente y planes anuales.
- [ ] Cuenta de Mercado Pago de la clínica (a nombre de la clínica).
- [ ] Catálogo en construcción: que se arme ya en la plantilla del sistema.

### Fuentes

- [SENASICA · Recetas médicas y comercialización, NOM-064-ZOO-2000](https://www.gob.mx/cms/uploads/attachment/file/722845/CAPACITACI_N_A_MVZ_O_PMVZ_REGULATORIOS_DSCP.pdf)
- [Chewy · FAQ de dietas veterinarias y compra recurrente](https://image.chewy.com/is/content/catalog/61777_FAQ._V1540324616_.pdf)
- [Chewy · App Store](https://apps.apple.com/us/app/-/id1149449468)
- [Mercado Pago · Suscripciones](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/overview)
- [Mercado Pago · Checkout Pro](https://www.mercadopago.com.mx/developers/en/docs/shopify/integration-configuration/checkout-pro)
- [Clip · Checkout redireccionado](https://developer.clip.mx/reference/introduccion-a-clip-checkout)
