# UX del cliente 3: la tienda dentro de la app

## Qué cambia

Solo presentación de `components/tienda/Tienda.tsx`, `app/(portal)/tienda/tienda.css` y el subtítulo de `/tienda`. La lógica, la API y las reglas de 5a/5b no cambian.

- **Catálogo:**
  - «Para» en una fila de chips, con el peso de cada mascota. Tocar la elegida la quita; «Otra mascota» abre especie y peso.
  - El asistente con IA pregunta «¿Qué necesita Luna?» y tiene el botón dentro del campo.
  - Cada tarjeta lleva **una** etiqueta sobre la imagen (Agotado, No es para…, Con receta / Tu receta, Le queda, Quedan pocas) y un botón **+** de 44 px que agrega al carrito.
  - El subtítulo dice «Recoge en la clínica o recíbelo en casa» si el domicilio está encendido.
- **Ficha:**
  - Precio y disponibilidad arriba.
  - Aviso de aptitud a todo lo ancho («Le queda a Luna», «No es para…»).
  - Barra fija con cantidad y «Agregar · $» encima de la barra de la app.
- **Carrito:**
  - «¿Cómo lo quieres?» y «¿Cómo pagas?» en dos columnas (una sola debajo de 380 px).
  - El código postal muestra la zona y el envío, o por qué no se puede, en un aviso de color.
  - El resumen fijo desglosa productos y envío.
- **Seguimiento:**
  - Tarjeta de estado con una frase clara y la dirección.
  - Repartidor y quién recibió.
  - Línea de tiempo vertical con la hora de cada paso (del historial del pedido).
  - Aviso de cómo y cuánto se paga.
- Iconos nuevos en el portal: `billete` y `camion`.

## Por qué

Etapa «Lo que ve el cliente», fase 3 (orden base → inicio → tienda → sitio, decisión de Jano del 14-nov-2026). Se siguen las maquetas Tienda, Ficha, Carrito y Seguimiento del lienzo «OVM · Experiencia del cliente».

## Cómo probarlo (vista previa de Vercel)

1. En el celular, entra como tutor y abre **Tienda**.
2. Toca una mascota en «Para»: las tarjetas marcan «Le queda» o «No es para…».
3. Toca **+** en un producto: el contador del carrito sube.
4. Abre una ficha: arriba ves precio y disponibilidad, y abajo la barra «Agregar · $».
5. En el carrito elige «A domicilio» y escribe un código postal de una zona: aparece el aviso con la zona y el desglose del envío.
6. Haz el pedido. En el seguimiento ves la tarjeta de estado y la línea de tiempo.
7. Con un pedido a domicilio enviado, ves «<repartidor> te lo lleva».

## Base de datos y variables

Ninguna.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores.
- `npm run lint`: 0 errores (45 avisos, igual que `main`).
- Pruebas sobre Postgres local vacío: `test:clinica` 175/175 y `test:farmacia` 416/416.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px: 75 páginas, 0 hallazgos.
- Capturas revisadas:
  - Catálogo con mascota elegida, ficha (320 y 1280 px), carrito a domicilio con CP fuera del mínimo y seguimiento de un pedido entregado a 390 px.
  - A 320 px el precio se quita del botón «Agregar» para que no se parta.

## Riesgos y pendientes

- No hay teléfono del repartidor en la vista del pedido. Por eso el seguimiento dice quién lo lleva, pero no tiene «Llamar». Agregarlo requiere exponer ese dato y revisar su privacidad.
- La etiqueta del carrito por renglón aún no dice para qué mascota es cada producto: el carrito guarda una sola elección de «Para».
- El sitio público queda para la fase 4.

## Documentación actualizada

- `CLAUDE.md` (regla de la tienda en la app).
- `docs/FARMACIA.md` §16.
- `docs/MANUAL-TUTOR.md`.
- Este archivo.
