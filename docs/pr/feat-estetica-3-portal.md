# Estética E3: historial en el portal y «¿ya le toca su baño?»

> Va **encima de la E2** (`feat/estetica-2-tablero`): mezcla E1 y E2 primero.

## Qué cambia

- **Portal → ficha de la mascota → pestaña «Estética»** (solo con el módulo encendido): las estéticas **entregadas** con qué se hizo, la nota para el tutor, lo observado (con «Ya lo sabe el equipo médico; si te preocupa, pide una consulta») y las fotos de antes y después. **Nunca** muestra la nota interna ni el comportamiento.
- **Resumen de la mascota:** «Baño · le toca alrededor del …» con **Pedir cita** (mascota y servicio ya elegidos).
- **Inicio → Pendientes:** el baño que toca en los próximos 7 días (o que ya pasó, hasta 30 días). Desaparece en cuanto hay otra cita de estética por venir.
- **Correo «¿Ya le toca su baño a …?»** en el cron de la clínica (18:00):
  - sale de 3 días antes a 14 días después de la fecha, **una vez por estética**;
  - solo si la mascota está activa, no tiene otra estética agendada y el tutor acepta correos;
  - trae «Pedir cita» y WhatsApp.
- **Próximo baño** = día de la última estética + «próximo baño sugerido» de la ficha (o las **semanas por omisión** nuevas en «Estética: marca y tallas»). La misma configuración trae «Mandar ¿ya le toca su baño?» para apagarlo.

## Por qué

Es la tercera de las tres ramas de Peluqueadogs que pidió Jano el 15-nov-2026: que el tutor vea lo que se le hizo a su mascota y regrese a tiempo a su siguiente baño.

## Cómo probarlo (vista previa de Vercel)

1. Con E1 y E2 configuradas, entrega una estética (tablero → Entregar) y en su **Ficha** llena qué se hizo, una nota para el tutor, fotos y «Próximo baño sugerido».
2. Entra al portal como el tutor de esa mascota → ficha → **Estética**: ves la estética con fotos, sin la nota interna.
3. Con un próximo baño a ≤ 7 días (p. ej. una ficha de hace 1 semana con «1 semana»), el inicio muestra el **Pendiente** con «Pedir cita».
4. El cron `GET /api/clinica/cron/recordatorios` (con `Bearer $CRON_SECRET`) responde `estetica: { revisadas, enviados }` y manda el correo una sola vez.

## Base de datos y variables

- Migración `20261116_042227_estetica_portal`, que Payload aplica sola: columnas `recordatorio_activo` y `semanas_por_omision` en la configuración de estética y `recordatorio_enviado_en` en `est_fichas`. Sin tablas nuevas.
- Sin variables nuevas (usa `CRON_SECRET` y `RESEND_API_KEY`, que ya existen).

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío: `test:clinica` 175/175, **`test:estetica` 83/83** (69 + 14 nuevas) y `test:farmacia` 510/510. Las nuevas cubren:
  - historial del tutor y privacidad (sin nota interna ni comportamiento);
  - otra cuenta recibe 403/404;
  - Pendientes con el baño que toca y su liga;
  - el cron manda una sola vez y no repite;
  - el Pendiente se va al agendar otra estética;
  - la pestaña se dibuja.
- Capturas del portal (pestaña Estética y Pedir cita) a 390 px, sin desbordes.

## Riesgos y pendientes

- El recordatorio se marca como enviado aunque el tutor no tenga correo (para no revisarlo a diario); sigue viéndolo en Pendientes.
- Precios reales por talla y los límites de kilos los confirma Dr. Joni antes de encender el módulo.

## Documentación actualizada

- `docs/ESTETICA.md` §3.
- `CLAUDE.md`.
- `docs/ARRANQUE.md`, `docs/MANUAL-TUTOR.md`, `docs/MANUAL-EQUIPO.md`.
- Este archivo.
