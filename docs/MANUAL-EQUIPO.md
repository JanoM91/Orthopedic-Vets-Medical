# Manual del equipo

> 27-oct-2026 · Para recepción, médicos, farmacia y administración. Cada quien ve solo lo que su rol permite; si falta un botón, es tu rol, no un error.

## Entrar

`/admin` con tu correo y contraseña. En el teléfono funciona igual (agrégalo a la pantalla de inicio). La sesión dura 7 días; si pierdes el teléfono, avisa para que cierren tus sesiones.

Arriba del menú está **Trabajo**: Hoy, Agenda, Estética, Pacientes, Mostrador, Farmacia y Finanzas (solo lo que tu rol usa). Los catálogos (Sistema, Clínica, Farmacia, Finanzas) quedan plegados debajo; ábrelos con un clic y se quedan como los dejes. En la computadora, con el menú cerrado queda una columna de iconos: pasa el cursor para verlo completo, o tócale al botón ☰ para dejarlo abierto.

**Hoy** (`/admin`) es el tablero del día: citas de hoy, en clínica, por confirmar, ventas de mostrador y cobros pendientes; la agenda de hoy con el siguiente paso de cada cita («Confirmar», «Llegó», «Atender», «Abrir nota»), acciones rápidas y pendientes (cobros, farmacia, pedidos de la tienda, planes detenidos y mascotas listas para recoger). Finalizar y «No asistió» se hacen en la agenda, donde piden confirmación. Con la estética encendida, Hoy trae su bloque: cuántas van por llegar, en proceso, listas y entregadas, y las del día con su etapa y el WhatsApp de las listas; las citas de estética de la agenda de hoy se avanzan «En el tablero». La estilista entra directo a su tablero.

**Puesta a punto** (dueños y superadmin; liga en Hoy): qué falta para operar con datos reales —horario, precios, contacto del sitio, aviso de privacidad, métodos de pago, catálogo…— con un botón a cada pantalla. «Solo lo pendiente» esconde lo que ya está.

## Recepción

**Agenda** (Trabajo → Agenda)
- Elige el día; cada columna es un espacio (consultorio, quirófano, estética). Cada cita se dibuja a su hora exacta; si dos se enciman, quedan lado a lado. La línea oscura marca la hora actual.
- **Toca una hora libre** y se abre «Nueva cita» con esa hora y ese espacio ya puestos: elige mascota y servicio y confirma. «Nueva cita» (arriba) abre el formulario vacío. «Confirmar» si ya quedó con el tutor.
- ¿La mascota no existe? En «Nueva cita», **«Mascota nueva»**: la das de alta y regresas a la agenda con la misma hora.
- Al tocar una cita ves su **línea de tiempo** (cuándo se pidió, confirmó, llegó, entró a atención) y, si está dentro, **cuánto lleva en la clínica**. El botón grande es el siguiente paso.
- Estados: por confirmar → confirmada → llegó → en atención → finalizada (o cancelada con motivo / no asistió). **Finalizar** y **No asistió** piden confirmación porque cierran la cita; al finalizar una cita con precio, se crea solo el cargo en Finanzas (el aviso te dice el importe). Ya finalizada, la cita ofrece **«Abrir nota»** (expediente, pestaña Notas) y **«Registrar cobro»** (el cargo en Finanzas).
- «Por confirmar» muestra lo que pidieron los tutores desde el portal (también llega un correo a la clínica). Confírmalas o muévelas.
- En una cita por confirmar o confirmada está **«Recordar por WhatsApp»**: abre WhatsApp con el mensaje listo; revísalo y envíalo.
- El tutor recibe correo al pedir, confirmar, cambiar o cancelar, y un **recordatorio la víspera a las 18:00** (si tiene correo y acepta avisos).

**Clientes y mascotas**
- Busca por nombre, teléfono o folio. Teléfono a 10 dígitos.
- En la ficha del cliente: **WhatsApp**, mascotas y **Acceso al portal**: **«Invitar por correo»** (crea la cuenta con el correo de la ficha y le llega al tutor una liga para elegir su contraseña, vence en 7 días) o **«Generar código»** (el tutor crea su cuenta y escribe el código). «Reenviar acceso» si perdió la liga; «Quitar acceso» para desligarla.
- **Cartilla**: en el expediente, pestaña Cartilla → registrar vacuna o desparasitación → **«Imprimir cartilla»** (también sirve para guardarla en PDF y mandarla).

**Estética** (si está encendida): al agendar un servicio de estética, el precio y el tiempo salen de la **talla** de la mascota (por su último peso, o la que fijes en «Editar datos»). Elige los **adicionales** (uñas, deslanado…) y ves el total antes de guardar. Ese total es el que se cobra al finalizar, aunque el precio cambie después. Si la mascota no tiene peso, la cita se agenda con «precio al recibirla»: **pésala al llegar**; sin peso o talla no se puede finalizar.

**Tablero de estética** (Clínica → Estética, o «Estética» en el menú): las citas de estética del día por etapa. Toca **Recibir** cuando llega, luego **A baño**, **A secado**, **A corte** y **Lista**: al tutor le llega un correo y tienes el botón de **WhatsApp**. Cuando la recogen, **Entregar** (se cobra lo pactado). En **Ficha** anota qué se hizo, cómo se portó, lo que observaste (pulgas, heridas, bultos…; le llega al médico) y una nota para el tutor, y sube fotos de antes y después (hasta 3 de cada una). Si necesitó bozal, queda como alerta en su expediente. Llena **«Próximo baño sugerido»**: con eso le llega al tutor el recordatorio «¿ya le toca su baño?».

## Médicos

- **Expediente** (Clínica → mascota): arriba, los botones de lo que haces con el paciente enfrente: **WhatsApp** al tutor, **Receta**, **Nueva cita**, **Editar datos** y **+ Nueva nota**. «De un vistazo» resume cartilla (en rojo si hay un refuerzo vencido, con «Programar refuerzo»), último peso y cómo cambió, última nota y próxima cita. Las pestañas (resumen, cartilla, peso, notas, recetas, documentos, citas) cambian sin recargar y la dirección guarda dónde estás: «Atrás» regresa a la pestaña anterior y puedes compartir la liga a una pestaña.
- **Notas SOAP**: el motivo se elige con un toque entre los frecuentes (primero los que ya usaste con esa mascota) o se escribe. Cada sección dice qué va ahí: **S** lo que cuenta el tutor, **O** lo que observas y mides, **A** tu análisis, **P** el plan. Escribe y **firma**. Firmada ya no cambia; para corregir, agrega una adenda.
- **Recetas** (pestaña Recetas → «Emitir receta»): elige el producto o escribe el principio activo, la dosis, la frecuencia, la duración, los surtidos y la vigencia. El peso vigente se pone solo; **la dosis la escribes tú** (el sistema nunca la sugiere). Grupo I exige el folio de receta cuantificada. «Firmar y emitir» exige tu cédula en tu usuario. Firmada ya no cambia.
- **Documentos**: sube estudios o publícalos al tutor.

## Farmacia

El manual completo del equipo de farmacia (día, semana, mes, reportes) está en `docs/MANUAL-FARMACIA.md`. Aquí, lo esencial.

**Mostrador** (Trabajo → Mostrador, o Farmacia → Mostrador; en Farmacia → Inicio es el botón principal «Vender»)
En computadora la pantalla va en dos columnas: el ticket a la izquierda y el cobro siempre visible a la derecha. En el celular, el ticket arriba y la barra «Cobrar» abajo.
1. Escanea el código (lector o cámara) o busca por nombre.
2. Opcional: chip «+ Mascota» → revisa especie, peso, edad y alergias (salen como chip rojo). Si algo choca, no deja vender; el encargado puede autorizar con motivo.
3. Grupo II y I: «Ligar receta» en el producto; ligada, aparece como chip arriba del ticket. Grupo I además «Recibí el original».
4. Cantidad con − y +; «descuento» abre el porcentaje de ese producto.
5. Pago: elige el método; en efectivo toca el billete con que pagan (se sugieren montos redondos) o «Exacto», y ves el cambio. «Pago mixto» agrega otro método.
6. **Cobrar $…**. Ticket para imprimir o mandar por correo.
- Un descuento o un medicamento con receta piden la **contraseña del encargado** en el momento.
- Si te quedas sin señal y vuelves a cobrar, no se cobra dos veces.

**Pedidos de la tienda** (Farmacia → Pedidos; el número junto a «Pedidos» son los que esperan)
1. **Nuevos**: «Empezar a preparar». Si dice «Por pagar», espera: el cliente eligió pagar en línea y aún no termina.
2. Junta los productos y toca **«Listo para recoger»**: al cliente le llega un correo.
3. Cuando llegue: **«Entregar»**. Si ya pagó en línea, solo entregas. Si paga al recoger, elige el método y cobra. Se registra como una venta normal (con receta y autorización del encargado si es Grupo II).
4. ¿No hay producto o el cliente desiste? «Cancelar pedido» con el motivo (le llega por correo). Si ya había pagado en línea, el reembolso se hace en la pasarela.
- Lo que está en un pedido queda **apartado**: el mostrador no lo puede vender. Si el cliente no paga ni recoge a tiempo, se libera solo.
- **A domicilio** (dice «A domicilio» en la lista): prepara, toca «Listo para salir» y luego **«Enviar con repartidor»**: eliges quién lo lleva y en ese momento se registra la venta. Si regresa sin entregarse, se vuelve a enviar sin vender otra vez. Para cancelarlo, primero anula la venta en Ventas.
- **Reembolsos**: si cancelas un pedido ya pagado en línea, el encargado toca «Reembolsar» en la ficha del pedido.

**Mis entregas** (repartidor; en el celular es la primera opción de la barra)
1. Ves cada pedido con dirección (toca para abrir el mapa), **Llamar** y **WhatsApp**.
2. Al entregar: **«Entregado»** → quién recibió, «Cobré $…» si paga al recibir, y si quieres una foto.
3. ¿No estaba nadie? **«No se pudo»** con el motivo: el pedido regresa a la farmacia.
4. Lo cobrado lo entregas en caja: ya quedó registrado en Finanzas.

**Recetas** (Farmacia → Recetas): bandeja «Por validar» (externas) y «Originales pendientes». El encargado valida o rechaza con motivo (el tutor recibe el motivo por correo).

**Compras** (Farmacia → Compras → Nueva): sube el XML de la factura; liga cada renglón a tu producto la primera vez (después se reconoce solo); captura **lote y caducidad** de cada renglón; «Recibir en inventario».

**Alertas** (Farmacia → Alertas): caducidades, faltantes, puntos de reorden sugeridos, productos sin rotación y recetas pendientes. Se recalculan a las 8:00 y llega un resumen por correo a quien tiene «Reportes». «Atendida» o «Descartar» (no se repite mientras no empeore).

**Reabasto** (Farmacia → Reabasto): lo que hay que pedir, por proveedor, ya en cajas completas. «Copiar pedido» o «WhatsApp» al proveedor.

**Aviso de recompra** (Farmacia → Configuración → Tienda en línea): en cada producto que dura un tiempo llena **«Duración por omisión (días)»** (cuántos días cubre una unidad: pipeta = 30, tableta mensual = 30, bolsa de alimento = los días que suele durar). Al vender ese producto a un cliente con ficha (o en la tienda), el sistema calcula cuándo se acaba y, unos días antes (5 por omisión), le escribe con «Volver a pedir». No usa la receta ni calcula dosis.

**Planes de compra** (Farmacia → Configuración → Tienda en línea → «Planes de compra»): el tutor con cuenta vinculada puede pedir que se le prepare un producto cada cierto tiempo (se calcula con la «Duración por omisión»). Hay dos formas: **pago en cada entrega** (se cobra solo con la tarjeta del tutor) o **anual** (paga por adelantado varias entregas con descuento). Cada entrega te llega a **Pedidos** ya pagada, con la pastilla del plan: prepárala y entrégala como cualquier pedido; si es anual, «Entregar» no cobra. En **Farmacia → Más → Planes de compra** ves los planes, lo que falta por entregar de los anuales y los que están **en pausa**: el sistema pausa un plan si a la mascota ya no le corresponde el producto (peso, edad, alergias) o si falta receta. Cuando se resuelva, toca **Reanudar**. Cancelar un plan anual ya pagado lo hace el encargado o el dueño; el reembolso se decide con la política de la farmacia.

**Reportes** (Farmacia → Más → Reportes; encargado y dueño): ventas, productos y margen, rotación, caducidades, valor del inventario, libro de control y planes anuales, con «Descargar CSV». Sin «Ver costos» no aparecen costos ni márgenes.

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
