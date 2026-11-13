# Versión A, fase 5: Expediente con acciones, «De un vistazo» y nota guiada

## Qué cambia

- **Pestañas que viven en la URL** (`components/admin/clinica/Mascota.tsx`): la pestaña sale de `?ver=` (`useSearchParams`) y el clic usa `history.pushState`. Cambiar de pestaña ya no pide nada al servidor, «Atrás» regresa a la pestaña anterior y la liga se puede compartir. «Abrir nota» desde una cita del mismo expediente cambia de pestaña sin recargar (pendiente que dejó la fase 3).
- **Cabecera con acciones**: WhatsApp al tutor principal, **Receta** (pestaña Recetas), **Nueva cita** (abre la agenda con la mascota y el diálogo), Editar datos y **+ Nueva nota** (abre el formulario en Notas). Cada botón aparece solo con el permiso que corresponde.
- **«De un vistazo»** en Resumen: cartilla (refuerzo vencido en rojo con «Programar refuerzo», próximo a 30 días en ámbar; usa `lib/clinica/estadoCartilla.ts`, el mismo criterio del portal), peso con su cambio en ~30 días y una línea mínima, última nota (fecha, firmada o borrador, autor) y próxima cita (con «Agendar seguimiento» si no hay). Si la mascota está hoy en clínica, aviso «Hoy: … en atención».
- **Nota guiada**: chips de motivos frecuentes (`lib/clinica/motivosNota.ts`: primero los títulos ya usados con esa mascota, luego una lista general) y etiquetas **S/O/A/P** con una frase de ayuda cada una; en computadora van en dos columnas. El guardado y la firma (con su confirmación) no cambiaron.
- Icono `calendario` nuevo en `components/admin/finanzas/comun.tsx`.

## Por qué

Plan de la Versión A «Orden y Hoy» (decisión de Jano del 10-nov-2026), fase 5. Diagnóstico del 9-nov: el médico tenía que bajar y cambiar de pestaña para responder «¿qué le toca?», las acciones frecuentes no estaban a la mano y la pestaña se perdía al recargar o compartir.

## Cómo probarlo (vista previa de Vercel)

1. Clínica → abre una mascota con cartilla, pesos y notas.
2. Cambia de pestaña: la dirección cambia a `?ver=…` sin recargar; «Atrás» del navegador regresa a la anterior.
3. «+ Nueva nota» → se abre el formulario en Notas; toca un motivo (se llena el título); revisa las frases de S/O/A/P; guarda borrador y firma (pide confirmación, igual que antes).
4. Resumen → «De un vistazo»: con una vacuna vencida, la tarjeta sale en rojo con «Programar refuerzo» → abre la agenda con la mascota.
5. «Nueva cita» → agenda con el diálogo abierto y la mascota puesta.
6. Agenda → una cita en atención de esa mascota → «Abrir nota» → expediente en Notas.

## Base de datos y variables

- Migraciones: ninguna.
- Variables de entorno: ninguna.
- No toca API, servicios ni colecciones.

## Verificación hecha

- `npx tsc --noEmit` sin errores; `npm run lint` 0 errores (45 avisos, igual que antes); `npm run build` limpio.
- `test:finanzas` 44/44 · `test:clinica` 175/175 · `test:farmacia` 299/299 sobre Postgres local vacío.
- Playwright (1280 px): 3 cambios de pestaña sin recargar y **0 peticiones al servidor**; «Atrás» regresa a Resumen; `?ver=citas` directo abre Citas; «+ Nueva nota» abre el formulario con 8 motivos y el chip «Cojera» llena el título.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px: 219 páginas, 0 hallazgos. Capturas a 1280 y 390 revisadas contra la maqueta `Expediente-A`.

## Riesgos y pendientes

- Diferencias con la maqueta: no se movieron las acciones a una barra fija superior (la cabecera de Payload no lo permite sin reemplazar su plantilla); «Notas anteriores» no se puso al lado del formulario (la lista de notas sigue debajo); el aviso «Borrador guardado hace 1 min» requiere autoguardado, que no existe.
- Los motivos frecuentes generales son una lista fija en código (genérica, sin datos de la clínica); si se quiere editar desde el panel, haría falta un campo en configuración.
- La próxima cita se pide aparte (`mascotas/:id/citas`); con una red lenta la tarjeta tarda un instante más que el resto.

## Documentación actualizada

- CLAUDE.md (regla «Expediente»), docs/CLINICA.md (sección fase 5), docs/MANUAL-EQUIPO.md (Médicos), docs/pr/feat-ui-a-5-expediente.md.
