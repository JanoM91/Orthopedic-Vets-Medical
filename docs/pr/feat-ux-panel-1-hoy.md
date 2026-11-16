# UX del panel 1: «Hoy» integra la estética y la tienda

> Va **encima de la E3** (`feat/estetica-3-portal`): mezcla ese PR primero.

## Qué cambia

- **Hoy** (`/admin`), con la estética encendida y el rol con «Estética»:
  - bloque **«<estética> · hoy»**: cuántas van por llegar, en proceso, listas para recoger y entregadas;
  - la lista del día con su etapa (las listas primero, con **WhatsApp**) y «Abrir tablero»;
  - en la agenda de hoy, las citas de estética llevan **«En el tablero»** en vez de «Llegó / Atender / Abrir nota», para que pasen por las etapas y el aviso «lista».
- **Pendientes** suma «<mascota> lista para recoger», **pedidos de la tienda por atender** y **planes de compra detenidos**.
- **Estilista:** al abrir `/admin` llega directo a su tablero de estética; un rol solo de estética no ve «Hoy» en el menú Trabajo.
- **Tablero de estética:**
  - días con ‹ › (y «Hoy» cuando miras otro día), como la agenda;
  - el día vacío es una tarjeta neutra con «Ir a la agenda» (antes era un aviso verde);
  - **«Preparar roles»** solo aparece mientras falte algo y para quien administra usuarios, con un aviso que dice qué hace.

## Por qué

Etapa de UX/UI que eligió Jano el 16-nov-2026, fase 1. Lo que se hizo después de la Versión A (estética, tienda, planes) no aparecía en «Hoy»: había que ir a cada módulo para saber qué estaba pendiente.

## Cómo probarlo (vista previa de Vercel)

1. Con la estética encendida, agenda dos baños para hoy y en el tablero pasa uno a «Lista».
2. Abre **Hoy**: ves el bloque de la estética con 1 lista y su WhatsApp, y en Pendientes «<mascota> lista para recoger».
3. En «Agenda de hoy», la cita de estética dice «En el tablero».
4. Entra como una persona con rol **Estilista** y abre `/admin`: llegas a Clínica → Estética.
5. En el tablero de estética usa ‹ › para cambiar de día; en un día sin citas ves «Ir a la agenda».

## Base de datos y variables

Sin migraciones ni variables. `GET /api/clinica/estetica` ahora trae `faltaRoles`.

## Verificación hecha

- `npx tsc --noEmit`, `npm run build` (también con Postgres detenido) y `npm run lint` sin errores.
- Pruebas sobre Postgres local vacío: `test:clinica` 175/175, `test:estetica` con 3 comprobaciones nuevas (`faltaRoles` antes y después del arranque, bloque en Hoy, la estilista va a su tablero) y `test:farmacia`. Las cifras finales están en la entrega.
- Capturas de Hoy y del tablero a 1366 y 390 px con citas en cada etapa, sin desbordes.

## Riesgos y pendientes

- La agenda de hoy y el bloque de estética muestran las mismas citas de estética (una por hora, otra por etapa). Si estorba, se pueden ocultar de la agenda de Hoy.

## Documentación actualizada

- `CLAUDE.md` (Menú y tablero).
- `docs/ESTETICA.md` §2.
- `docs/MANUAL-EQUIPO.md`.
- Este archivo.
