# Estética E1: precio y duración por talla, adicionales y cobro

> Primera de tres ramas del módulo de Estética (Peluqueadogs en OVM). Va directo sobre `main`.

## Qué cambia

- **Módulo nuevo «Estética»** en Sistema → Instalación: módulos. Viene **apagado**; apagado, la estética se agenda como cualquier servicio.
- **Clínica → «Estética: marca y tallas»:** nombre que ve el tutor y kilos de cada talla. Por omisión: chica ≤ 10 kg, mediana ≤ 25, grande ≤ 40 y gigante para lo demás.
- **Servicios:** casilla «Servicio de estética», con **precio y duración por talla**. Una talla vacía usa el precio y la duración generales.
- **Adicionales de estética** (uñas, deslanado…): precio, minutos extra y si el tutor lo puede pedir en línea.
- **Talla de la mascota:** la fijada a mano en «Editar datos» o, si no hay, la de su último peso. Sin peso ni talla, el precio queda «por confirmar».
- **Agenda → Nueva cita:** adicionales como chips y la línea «Talla mediana (18 kg) · 105 min · $430». La cita dura lo cotizado y los choques se revisan con esa duración.
- **Portal → Pedir cita:** «¿Le agregamos algo?», solo con los adicionales en línea, y el precio para la talla de su mascota. Servicios y sitio muestran «desde $…»; en el sitio la estética se agrupa con su nombre.
- **Cobro:**
  - Al finalizar se cobra **lo pactado al agendar**, aunque el precio cambie después.
  - Si no había talla, se recalcula en ese momento; sin peso ni talla no se puede finalizar.
  - El concepto en Finanzas lleva la talla y los adicionales.

## Por qué

Jano eligió el 15-nov-2026 hacer el módulo de Estética (Peluqueadogs) en tres ramas de una vez y **cobrar solo por talla**. La agenda ya podía agendar estética, pero con un precio fijo por servicio.

## Cómo probarlo (vista previa de Vercel)

1. Sistema → Instalación: módulos → enciende «Estética».
2. Clínica → «Estética: marca y tallas»: escribe el nombre (p. ej. Peluqueadogs).
3. Clínica → Servicios → «Baño»: marca «Servicio de estética» y captura precio y duración por talla.
4. Clínica → Adicionales de estética: crea «Corte de uñas» con precio y minutos.
5. Agenda → Nueva cita con una mascota que tenga peso: elige Baño y uñas, y ves talla, tiempo y total. Finaliza: el cargo en Finanzas sale por ese total.
6. Desde el portal de un tutor: Pedir cita → Baño ya muestra el precio para su mascota.

## Base de datos y variables

- Migración `20261116_040643_estetica_precios`, que Payload aplica sola:
  - tablas nuevas `est_adicionales`, `estetica_configuracion` y `citas_estetica_adicionales`, con RLS;
  - columnas nuevas en servicios (por talla), citas (`estetica_*`), mascotas (`talla_estetica`) e instalación (`modulos_estetica`).
- Sin variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores. `npm run lint` con 0 errores; los avisos nuevos son los parámetros sin usar de la migración generada, como en las anteriores.
- Pruebas sobre Postgres local vacío:
  - `test:clinica` 175/175.
  - **`test:estetica` 42/42** (script nuevo), que cubre:
    - módulo apagado y encendido, y permisos;
    - talla por peso y fijada;
    - cotización con adicionales;
    - duración en la disponibilidad y choques;
    - precio pactado contra precio nuevo;
    - mascota sin peso, que no se finaliza hasta pesarla;
    - en el portal, solo mascotas propias y adicionales en línea;
    - sitio y portal con «desde $…».

## Riesgos y pendientes

- Hay que capturar los **precios reales por talla** (no hay de ejemplo).
- Los límites de peso por omisión (10/25/40 kg) son una propuesta: que el Dr. Joni o la estética los confirmen.
- Lo que sigue: tablero del día y ficha (E2), e historial y recordatorio en el portal (E3).

## Documentación actualizada

- `docs/ESTETICA.md` (nuevo).
- `CLAUDE.md`.
- `docs/ARRANQUE.md`.
- `docs/MANUAL-EQUIPO.md`.
- `docs/MANUAL-TUTOR.md`.
- Este archivo.
