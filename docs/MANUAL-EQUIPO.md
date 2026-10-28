# Manual del equipo

> 27-oct-2026 · Para recepción, médicos, farmacia y administración. Cada quien ve solo lo que su rol permite; si falta un botón, es tu rol, no un error.

## Entrar

`/admin` con tu correo y contraseña. En el teléfono funciona igual (agrégalo a la pantalla de inicio). La sesión dura 7 días; si pierdes el teléfono, avisa para que cierren tus sesiones.

## Recepción

**Agenda** (Clínica → Agenda)
- Elige el día; cada columna es un consultorio. «Nueva cita»: mascota, servicio, hora. «Confirmar» si ya quedó con el tutor.
- Estados: solicitada → confirmada → llegó → en atención → finalizada (o cancelada con motivo / no asistió). Al **finalizar** una cita con precio, se crea solo el cargo en Finanzas.
- «Por confirmar» muestra lo que pidieron los tutores desde el portal (también llega un correo a la clínica). Confírmalas o muévelas.
- Junto al tutor hay **«Recordar por WhatsApp»**: abre WhatsApp con el mensaje listo; revísalo y envíalo.
- El tutor recibe correo al pedir, confirmar, cambiar o cancelar, y un **recordatorio la víspera a las 18:00** (si tiene correo y acepta avisos).

**Clientes y mascotas**
- Busca por nombre, teléfono o folio. Teléfono a 10 dígitos.
- En la ficha del cliente: **WhatsApp**, mascotas y **Acceso al portal**: **«Invitar por correo»** (crea la cuenta con el correo de la ficha y le llega al tutor una liga para elegir su contraseña, vence en 7 días) o **«Generar código»** (el tutor crea su cuenta y escribe el código). «Reenviar acceso» si perdió la liga; «Quitar acceso» para desligarla.
- **Cartilla**: en el expediente, pestaña Cartilla → registrar vacuna o desparasitación → **«Imprimir cartilla»** (también sirve para guardarla en PDF y mandarla).

## Médicos

- **Expediente** (Clínica → mascota): resumen, cartilla, peso, notas, recetas, documentos, citas.
- **Notas SOAP**: escribe y **firma**. Firmada ya no cambia; para corregir, agrega una adenda.
- **Recetas** (pestaña Recetas → «Emitir receta»): elige el producto o escribe el principio activo, la dosis, la frecuencia, la duración, los surtidos y la vigencia. El peso vigente se pone solo; **la dosis la escribes tú** (el sistema nunca la sugiere). Grupo I exige el folio de receta cuantificada. «Firmar y emitir» exige tu cédula en tu usuario. Firmada ya no cambia.
- **Documentos**: sube estudios o publícalos al tutor.

## Farmacia

**Vender** (Farmacia → Vender)
1. Escanea el código (lector o cámara) o busca por nombre.
2. Opcional: «Agregar mascota» → revisa especie, peso, edad y alergias. Si algo choca, no deja vender; el encargado puede autorizar con motivo.
3. Grupo II y I: «Ligar receta». Grupo I además «Recibí el original».
4. Pago: efectivo (escribe con cuánto paga y ve el cambio), terminal, transferencia (queda por confirmar) o una mezcla con «Otro método».
5. **Cobrar**. Ticket para imprimir o mandar por correo.
- Un descuento o un medicamento con receta piden la **contraseña del encargado** en el momento.
- Si te quedas sin señal y vuelves a cobrar, no se cobra dos veces.

**Recetas** (Farmacia → Recetas): bandeja «Por validar» (externas) y «Originales pendientes». El encargado valida o rechaza con motivo (el tutor recibe el motivo por correo).

**Compras** (Farmacia → Compras → Nueva): sube el XML de la factura; liga cada renglón a tu producto la primera vez (después se reconoce solo); captura **lote y caducidad** de cada renglón; «Recibir en inventario».

**Alertas** (Farmacia → Alertas): caducidades, faltantes, puntos de reorden sugeridos, productos sin rotación y recetas pendientes. Se recalculan a las 8:00 y llega un resumen por correo a quien tiene «Reportes». «Atendida» o «Descartar» (no se repite mientras no empeore).

**Reabasto** (Farmacia → Reabasto): lo que hay que pedir, por proveedor, ya en cajas completas. «Copiar pedido» o «WhatsApp» al proveedor.

**Promociones**: el sistema propone descuento a lotes de venta libre por caducar; el encargado aprueba o rechaza.

**Conteo físico** y **Ajustes y mermas**: siempre con motivo; todo queda en el kardex.

**Cierre del día**: cuenta el efectivo de la caja y escríbelo; si no cuadra, explica la diferencia en la nota.

## Finanzas

- **Registrar**: entrada o gasto, importe, cuenta, categoría y área; foto del comprobante. También por **nota de voz**.
- **Pendientes**: cobros y pagos por hacer (los cargos de citas y compras a crédito llegan aquí solos).
- Nada se borra: se corrige o se anula con motivo.

## Dudas frecuentes

- *No veo un menú*: tu rol no lo incluye. Pide al dueño que lo revise en Sistema → Roles.
- *El tutor no recibió el correo*: revisa que su ficha tenga correo y «Avisos» por «correo» marcados.
- *El botón de WhatsApp no aparece*: el teléfono debe tener 10 dígitos.
