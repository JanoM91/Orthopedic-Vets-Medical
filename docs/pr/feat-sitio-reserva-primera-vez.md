# Reserva de primera vez: solicitud que recepción confirma

> Va encima de `feat/sitio-home-b`. Mezclar primero esa rama.

## Qué cambia

- Página nueva **`/reservar`**: un visitante sin cuenta deja su solicitud de primera cita (servicio, mascota, día y horario preferidos, nombre y WhatsApp). Ve su folio `SOL-…` y el aviso de que recepción le confirma por WhatsApp.
- En el panel: Clínica → **«Solicitudes de cita»** (colección nueva) con estado (Nueva, Ya le escribimos, Cita agendada, Descartada), nota del equipo y botón **«Escribir por WhatsApp»**. «Hoy» avisa cuántas siguen sin atender y llega un correo a los correos de avisos de la agenda.
- En el sitio, «Reserva tu primera cita» (home) y «¿Primera vez?» (botones de cita y `/servicios`) llevan a `/reservar`; WhatsApp queda como alternativa.
- Una solicitud **no** aparta horario ni crea citas o fichas.
- Archivos: `app/(sitio)/reservar/page.tsx`, `components/sitio/FormularioReserva.tsx`, `lib/sitio/solicitudes.ts`, `app/api/sitio/solicitudes/route.ts`, `collections/clinica/solicitudes.ts`, `components/admin/AccionesSolicitud.tsx`, `components/admin/Tablero.tsx`.

## Por qué

Jano pidió (16-nov-2026) que los visitantes puedan reservar por primera vez desde el sitio y eligió el modelo «solicitud que recepción confirma» frente a la cita directa en el calendario: es más rápido de construir y no llena la agenda de citas falsas.

## Cómo probarlo

1. Con el sitio publicado, abre `/` → «Reservar mi primera cita» → llena el formulario y envía: aparece «Recibimos tu solicitud» con el folio.
2. Entra al panel: «Hoy» muestra «1 solicitud de primera cita por atender». Tócalo.
3. Abre la solicitud → «Escribir por WhatsApp» abre el chat con el mensaje listo.
4. Cambia el estado a «Cita agendada» y guarda: el aviso desaparece de «Hoy».
5. Prueba un WhatsApp de 5 dígitos o sin aceptar el aviso de privacidad: el formulario dice qué corregir.

## Base de datos y variables

- Migración `20261116_160019_solicitudes_cita`: tabla `solicitudes` (con RLS) y tres tipos enumerados.
- Variables nuevas: ninguna. El correo a la clínica usa las de siempre (`RESEND_API_KEY`, `LEADS_FROM_EMAIL`) y los correos de Agenda → «Correos de la clínica para avisos».

## Verificación hecha

En la nube, con Postgres 16 local vacío y `npm run start` (16-nov-2026):

- `npx tsc --noEmit`: limpio. `npm run lint`: 0 errores, 73 avisos (4 nuevos, los de siempre en el archivo de migración). `npm run build`: limpio.
- `test:finanzas` 44/44 · `test:clinica` **208/208** (16 nuevas: formulario, validaciones, campo trampa, no duplicar, datos guardados y campaña de origen, no crea citas ni fichas, permisos, cambio de estado, no se borra, freno a la sexta, aviso en «Hoy») · `test:estetica` 90/90 · `test:farmacia` 510/510.
- `/reservar` a 1280 y 390 px: sin desbordes ni errores de consola; envío real desde el formulario en Chrome con su pantalla de confirmación.
- Panel: lista y ficha de la solicitud revisadas; «Escribir por WhatsApp» arma la liga `wa.me/52…` con el mensaje.

## Riesgos y pendientes

- El freno por conexión vive en memoria de cada instancia (como el de la tienda): frena abusos simples, no un ataque distribuido. Si llega spam, el siguiente paso es un captcha.
- El correo a la clínica no se probó con envío real (sin llaves en la prueba).
- No hay botón «convertir en cliente y cita»: recepción da de alta la ficha a mano. Sería la mejora siguiente.
- No se probó en un iPhone real ni en la vista previa de Vercel.

## Documentación actualizada

`CLAUDE.md`, `docs/CLINICA.md` (sección nueva), `docs/MANUAL-EQUIPO.md` (sección nueva).
