# Historial de PRs anteriores a la convención (reconstruido el 12-nov-2026)

Los PRs #11 a #13 se abrieron sin descripción. Este resumen sale de los commits
y del registro de avance del proyecto; sirve de contexto para cambios futuros.

## Versión A «Orden y Hoy», fase 1 · Correcciones de uso — `feat/ui-a-1-correcciones` (mezclada en `a944032`, 11-nov-2026)

- Marca del menú legible; tamaños mínimos (botón 44 px, chico/chip/segmento/pestaña 40 px, textos de barra y estado 12 px).
- Gasto con color propio (`--mx-gasto` terracota) distinto de la entrada.
- Sin textos de desarrollo visibles («fase N», nombres de variables).
- Estados de cita en paleta OVM; «Solicitada» pasa a «Por confirmar».
- Confirmaciones con `<Confirmar>` antes de Finalizar (con importe), «No asistió», firmar nota; sin `confirm()` nativo.
- Fechas del portal y sitio en la zona del negocio; portal: éxito al reprogramar, «Sí, cancelar» en estilo de peligro.
- Sin migraciones.

## Fase 2 · Menú «Trabajo» y tablero «Hoy» — PR #11, `feat/ui-a-2-menu-hoy` (`73939fd`)

- Bloque «Trabajo» arriba del menú (Hoy, Agenda, Pacientes, Mostrador, Farmacia, Finanzas según rol y módulo).
- Grupos de catálogos plegados por omisión (`lib/navPlegado.ts`, `afterLogin`).
- Tablero `/admin` = `components/admin/Tablero.tsx` con cifras del día, agenda, acciones rápidas y pendientes; conserva redirecciones de solo captura y solo farmacia.
- Sin migraciones. Hallazgo: el rol «Recepción» sugerido no entra al panel (decisión pendiente de Jano).

## Fase 3 · Agenda — PR #12, `feat/ui-a-3-agenda` (`a5ba435`)

- Citas por minuto y encimadas lado a lado (`acomodar()`), clic en hora libre para agendar con hora y espacio, «Mascota nueva» que regresa a la agenda, línea de «ahora», detalle con línea de tiempo y siguiente paso, Finalizar con opción de abrir la nota.
- Verificado: 10 de 10 citas dibujadas con intervalos de 15, 20 y 30 min. Sin migraciones.

## Portal, fotos, calendario, carga e icono — PR #13, `feat/portal-experiencia` (`e36e34c`, 12-nov-2026)

- Pedido de Jano (11-nov): el sistema se sentía «ordinario y poco intuitivo».
- Cargador animado (gato y perro), títulos de pestaña sin «Payload», iconos e instalación «OVM Vet - Portal» / «OVM Vet - Panel» (Finanzas conserva la suya).
- Portal: inicio con próxima cita, mascotas con foto y cuatro acciones; páginas Mascotas y Servicios; Pedir cita por pasos con calendario del mes.
- Fotos de mascotas (`mas-fotos`) en portal y panel; iconos de servicio (campo «Icono»).
- **Migración** `20261112_055949_clinica_fotos_iconos` (aplicada en producción el 12-nov). Variables `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_SHORT_NAME` (creadas en Vercel).
- Pruebas: `test:clinica` pasó de 149 a 175 comprobaciones.
