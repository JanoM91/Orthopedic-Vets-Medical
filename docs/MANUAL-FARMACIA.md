# Manual de la farmacia

Para el equipo de la farmacia: vendedores, encargado, repartidor y dueño. Todo está en **Farmacia** (en el celular, en la barra de abajo; lo que no cabe está en **Más**).

Lo que puedes hacer depende de tu rol. Si no ves una opción, tu rol no la incluye: pídesela al dueño.

| Rol | Qué hace |
| --- | --- |
| **Vendedor de mostrador** | Vende, prepara pedidos de la tienda, hace el cierre del día. No ve costos ni da descuentos sin autorización. |
| **Encargado de farmacia** | Lo del vendedor, más: autoriza descuentos y recetas, valida recetas, recibe compras, ajusta inventario, reembolsa, ve costos y reportes. |
| **Repartidor** | Solo «Mis entregas». |
| **Dueño** | Todo, incluida la configuración. |

**Regla de oro:** el sistema nunca calcula ni sugiere dosis. Si un cliente pregunta cómo darlo, la respuesta es «pregúntale a tu veterinario».

---

## 1. Tu día

### Al abrir

1. **Farmacia → Inicio**: revisa los números del día (ventas, pedidos por atender, alertas).
2. **Alertas**: caducidades, faltantes, recetas pendientes. Atiende o descarta (no se repiten mientras no empeoren). Se recalculan solas a las 8:00.
3. **Pedidos → Nuevos**: lo que entró por la tienda en la noche, incluidas las **entregas de planes** (ya pagadas).

### Vender en mostrador

1. **Vender** (botón principal del inicio).
2. Escanea el código o busca por nombre.
3. Si es para una mascota de la clínica, toca **«+ Mascota»**: el sistema revisa especie, peso, edad y alergias. Si algo choca, no deja vender; el encargado puede autorizar con motivo.
4. **Con receta** (Grupo II y I): «Ligar receta» en el producto. El Grupo I además pide «Recibí el original».
5. Cantidad con − y +. «Descuento» pide la contraseña del encargado.
6. Elige cómo paga. En efectivo toca el billete con que pagan y ves el cambio. «Pago mixto» agrega otro método.
7. **Cobrar**. Imprime el ticket o mándalo por correo.

Si se cae la señal y vuelves a cobrar, no se cobra dos veces.

### Pedidos de la tienda

1. **Nuevos** → «Empezar a preparar». Si dice «Por pagar», espera: el cliente aún no termina de pagar en línea.
2. Junta los productos → **«Listo para recoger»** (al cliente le llega un correo).
3. Cuando llegue → **«Entregar»**:
   - Ya pagado en línea: solo entregas.
   - Paga al recoger: elige el método y cobra.
   - **Entrega de un plan anual** (pastilla «Plan PLN-…»): «Entregar (cubierto por el plan)», no se cobra.
4. Lo que está en un pedido queda **apartado**: el mostrador no lo puede vender. Si nadie paga ni recoge a tiempo, se libera solo.
5. **A domicilio**: «Listo para salir» → **«Enviar con repartidor»** (en ese momento se registra la venta).

### Repartidor: Mis entregas

1. Cada pedido trae dirección (abre el mapa), **Llamar** y **WhatsApp**.
2. Al entregar: **«Entregado»**, quién recibió, «Cobré $…» si paga al recibir y, si quieres, una foto.
3. ¿No había nadie? **«No se pudo»** con el motivo: el pedido regresa a la farmacia.
4. Lo cobrado lo entregas en caja: ya está registrado en Finanzas.

### Al cerrar

**Cierre del día**: cuenta el efectivo de la caja y escríbelo. Si no cuadra, explica la diferencia en la nota.

---

## 2. Cada semana

- **Compras** (Más → Compras → Nueva): sube el XML de la factura. La primera vez liga cada renglón a tu producto; después se reconoce solo. Captura **lote y caducidad** y «Recibir en inventario». El gasto entra solo a Finanzas.
- **Reabasto** (Más → Reabasto): lo que hay que pedir por proveedor, ya en cajas completas. «Copiar pedido» o «WhatsApp» al proveedor.
- **Promociones** (Más → Promociones): el sistema propone descuento a lotes de venta libre por caducar. El encargado aprueba o rechaza.
- **Recetas → Por validar** (encargado): valida o rechaza las recetas externas con motivo. **Originales pendientes**: las del Grupo I que faltan en papel.
- **Planes de compra** (Más → Planes de compra): revisa los **en pausa**. Se pausan solos cuando a la mascota ya no le corresponde el producto (peso, edad, alergias) o cuando falta receta. Cuando se resuelva (nueva receta, el veterinario cambió el producto), toca **Reanudar**. El sistema nunca cambia el producto por su cuenta.

## 3. Cada mes (encargado y dueño)

**Más → Reportes**. Elige el periodo («Desde» y «Hasta»; por omisión, del 1 del mes a hoy) y, si lo necesitas, **Descargar CSV** (se abre en Excel con acentos). Lo que ves en pantalla es exactamente lo que baja.

| Reporte | Para qué sirve |
| --- | --- |
| **Ventas** | Total por día, mostrador contra tienda, descuentos, envíos, ticket promedio y lo cobrado por método. |
| **Productos y margen** | Qué se vendió y cuánto. Con «Ver costos»: costo, margen y margen %. |
| **Rotación** | Cuánto sale cada producto por día y para cuántos días alcanza lo que hay. Arriba, lo que más tarda en salir. |
| **Caducidades** | Lotes con existencia que caducan hasta una fecha (90 días por omisión), incluidos los vencidos. Con «Ver costos», el valor en riesgo. |
| **Valor del inventario** | Solo con «Ver costos»: existencia y valor al costo, hoy. |
| **Libro de control** | Salidas del Grupo I (NOM-064), para la autoridad. |
| **Planes anuales** | Lo cobrado por adelantado, lo ya entregado y **lo que se debe** (por entregar). |

Sin la casilla «Ver costos» en tu rol, ningún reporte muestra costos ni márgenes.

## 4. Inventario

- **Inventario**: existencia por producto y lote, con su caducidad. La venta siempre saca primero el lote que caduca antes.
- **Conteo físico** (Más → Conteo) y **ajustes o mermas**: siempre con motivo. Todo queda en el kardex y no se puede borrar.
- Para que un producto mande «¿Ya toca?» o se pueda poner en un plan, llena su **«Duración por omisión (días)»**: cuántos días cubre una unidad (pipeta = 30).

## 5. Lo que hace el sistema solo

- **8:00 cada día:** recalcula alertas y el punto de reorden; manda un resumen a quien tiene «Reportes»; vence apartados sin pago; manda los «¿Ya toca?»; genera las entregas de los planes que tocan y pausa los que ya no cuadran.
- **Cada venta** entra a Finanzas con su método de pago. Las del Grupo I dejan su asiento en el libro de control.
- **Planes anuales:** el pago completo entra una vez a Finanzas como anticipo; cada entrega se registra como venta sin cobro.

## 6. Configuración (dueño)

**Más → Configuración**: métodos de pago y su cuenta de Finanzas, días de aviso de caducidad, promociones, proveedores, almacenes, tienda en línea (apartado, domicilio, Mercado Pago), aviso de recompra y **planes de compra** (descuento anual, número de entregas, días de anticipación y categoría de los anticipos). El arranque paso a paso está en `docs/ARRANQUE.md`.

## Dudas frecuentes

- **«No me deja vender»**: revisa el chip rojo de la mascota (especie, peso, edad o alergia) o la receta. El encargado puede autorizar con motivo; el Grupo I nunca sin receta.
- **«Dice que no alcanza»**: puede estar apartado en un pedido de la tienda. Revisa **Pedidos**.
- **Cliente con un plan anual pide cancelar**: lo cancela el encargado en Planes de compra, con motivo. El reembolso de lo no entregado sigue la política de la farmacia y se hace fuera del sistema.
- **Llegó un correo de «cobro con el plan en pausa»**: la pasarela cobró antes de que se pausara. Reembolsa en la pasarela o surte al reanudar.
