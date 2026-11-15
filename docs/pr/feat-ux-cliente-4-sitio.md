# UX del cliente 4: sitio público renovado

> Va **encima de la fase 3** (`feat/ux-cliente-3-tienda`): mezcla primero ese PR y después este.

## Qué cambia

- **Página principal** (`app/(sitio)/page.tsx`), con el look de la app (Versión B):
  - **Hero oscuro** con el lema, la descripción, «Pedir cita en línea» y WhatsApp.
    - Al lado, la tarjeta **«Hoy»**: abierto o cerrado según el horario de la agenda, dirección, aviso de urgencias, «Cómo llegar» y «Llamar».
  - **Servicios destacados** (hasta 6, primero uno por área) en tarjetas con icono, duración, precio y «Pedir cita» directo a ese servicio.
    - En el teléfono son filas compactas.
  - **Banda de la tienda** (solo con la tienda encendida): texto, «Ver la tienda» y sus secciones como accesos (`/tienda?linea=…`).
  - **Banda «Tu mascota en tu celular»**: tres pasos, «Crear mi cuenta» y «Ya tengo cuenta».
  - Equipo con iniciales, Horario y «Cómo llegar» en tarjetas, preguntas frecuentes y llamada final.
- **Cabecera:** Servicios · Equipo (si hay) · Tienda · Cómo llegar · **Entrar** · **Pedir cita**.
  - En el teléfono quedan la marca y «Pedir cita»; lo demás va en la barra de la app.
- **Servicios** (`/servicios`): mismas tarjetas y botones de la Versión B.
- Estilos en la capa final de `app/(sitio)/sitio.css`, con los mismos tokens que el portal.

Todo sale de «Sitio público», del catálogo de servicios y del horario de la agenda. **No hay datos de ejemplo**: la tarjeta de muestra del lienzo («próxima cita de Luna») no se puso en el sitio real.

## Por qué

Etapa «Lo que ve el cliente», fase 4, la última del orden base → inicio → tienda → sitio (decisión de Jano del 14-nov-2026). Sigue los artboards «Sitio computadora» y «Sitio celular» del lienzo.

## Cómo probarlo (vista previa de Vercel)

1. En el panel, Clínica → «Sitio público»: revisa que estén capturados lema, descripción, dirección, liga del mapa, teléfono y WhatsApp.
2. Abre `/` en la computadora. Arriba ves el hero y, a la derecha, la tarjeta «Hoy» con el horario de hoy, la dirección y «Cómo llegar».
3. En «Lo que hacemos por tu mascota», el botón «Pedir cita» abre la cita con ese servicio ya elegido.
4. Con la tienda encendida aparece la banda de la tienda; cada sección abre la tienda filtrada.
5. En el celular, los servicios son filas compactas y abajo está la barra de la app.

## Base de datos y variables

Ninguna.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío: `test:finanzas` 44/44, `test:clinica` 175/175 y `test:farmacia` 416/416.
  - La raíz sigue mostrando el lema, el WhatsApp con +52 y los servicios.
  - El sitio sigue mostrando «Tienda».
- `scripts/auditoria-front.mjs` sobre el sitio, el inicio del portal y la tienda, a 320, 390, 768, 1280 y 1440 px: 0 hallazgos.
- Capturas revisadas a 1280 px (página completa) y a 320 px (hero y servicios).

## Riesgos y pendientes

- Sin dirección ni liga del mapa capturadas, la tarjeta «Hoy» solo dice si se abre hoy. Hay que llenarlas en «Sitio público → Contacto».
- No hay fotos reales de la clínica ni del equipo. El equipo usa iniciales; fotos de equipo y clínica serían un campo nuevo en «Sitio público».
- El sitio sin publicar sigue mostrando solo el nombre y los accesos.

## Documentación actualizada

- `CLAUDE.md` (regla del sitio).
- `docs/CLINICA.md` (tabla de módulos).
- `docs/ARRANQUE.md` (paso 4: dirección y mapa).
- Este archivo.
