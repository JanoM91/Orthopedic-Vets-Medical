# Estética (submarca de la clínica)

Módulo activable **«Estética»** (Sistema → Instalación: módulos). En OVM la estética se llama **Peluqueadogs**, pero el nombre sale de la configuración, no del código. Sin el módulo, la estética se agenda como cualquier servicio.

Plan acordado con Jano el 15-nov-2026, en tres ramas apiladas:

| Etapa | Qué | Estado |
| --- | --- | --- |
| **E1** | Precio y duración **por talla**, adicionales y cobro con lo pactado | Hecha (`feat/estetica-1-precios`) |
| **E2** | Tablero del día (recibida → baño → secado → corte → lista), ficha con hallazgos, fotos antes y después, aviso «lista para recoger» | Pendiente |
| **E3** | Portal: historial de estética con fotos y recordatorio «¿ya le toca su baño?» | Pendiente |

Decisión de Jano (15-nov-2026): se cobra **solo por talla** (no por tipo de pelo).

## 1. E1 · Talla, precio, duración y adicionales

### Configuración

- **Clínica → «Estética: marca y tallas»** (global `estetica-configuracion`, quien tiene «Configurar agenda»):
  - nombre de la estética (lo ve el tutor; vacío = «Estética») y logotipo opcional;
  - kilos máximos de cada talla. Por omisión: **chica ≤ 10 kg, mediana ≤ 25, grande ≤ 40, gigante** más.
- **Clínica → Servicios:** casilla «Servicio de estética». Al marcarla aparecen **precio por talla** y **duración por talla**. Una talla sin precio o sin duración usa el precio y la duración generales del servicio. No hay precios de ejemplo: se capturan los reales.
- **Clínica → Adicionales de estética** (`est-adicionales`): nombre, precio, minutos extra, si el tutor lo puede agregar en línea, orden y activo. No se borran: se desactivan.
- **Expediente → Editar datos:** «Talla para estética» fija la talla a mano; vacío = por su último peso.

### Reglas

- **Talla:** la fijada en la mascota; si no hay, la del **último peso** contra los límites. Sin peso ni talla fijada, la talla queda **por confirmar**.
- **Cotización** (`lib/clinica/estetica.ts`, `cotizar()`):
  - duración = la de la talla + minutos de los adicionales;
  - precio = el de la talla + adicionales;
  - sin talla: dura lo general y el precio queda por confirmar.
- **Al agendar** (panel o portal) se guarda lo pactado en `citas.estetica` (`cotizada`, talla, precio del servicio, adicionales y total). La cita dura lo cotizado y los choques se revisan con esa duración.
- **Disponibilidad y calendario** aceptan `mascota` y `adicionales` para buscar huecos del largo correcto. Al reprogramar se usa la duración de la propia cita.
- **El portal** solo cotiza las mascotas del tutor y solo ofrece adicionales marcados «en línea».
- **Cobro al finalizar** (`registrarCargo` en `lib/clinica/agenda.ts`):
  - se cobra **lo pactado** aunque el precio cambie después;
  - si la cita no tenía total (sin talla), se recalcula con la talla de ese momento y los adicionales guardados;
  - con precios por talla y sin talla, **no se puede finalizar** hasta registrar el peso o fijar la talla;
  - sin ningún precio en el servicio, no hay cargo (como cualquier servicio).
  - El concepto en Finanzas lleva la talla y los adicionales.
- **Apagar el módulo** no borra nada: los servicios vuelven a su precio y duración generales, los adicionales responden 403 y las citas ya cotizadas conservan lo pactado.

### Dónde se ve

- **Agenda → Nueva cita:** adicionales como chips y la línea «Talla mediana (18 kg) · 105 min · $430».
- **Detalle de la cita:** talla, adicionales y total.
- **Portal → Pedir cita:** «¿Le agregamos algo?» con los adicionales en línea y el precio para la talla de su mascota. Sin peso: «Precio al recibirla».
- **Portal → Servicios y sitio público:** la estética aparece como «desde $…». En el sitio se agrupa con el nombre de la estética.

### Código

| Qué | Dónde |
| --- | --- |
| Colecciones | `collections/clinica/estetica.ts` (global y adicionales); campos nuevos en `servicios`, `citas` (`estetica`) y `mascotas` (`tallaEstetica`) |
| Lógica | `lib/clinica/estetica.ts` (configuración, talla, cotización); `lib/clinica/agenda.ts` (agendar, disponibilidad, cobro) |
| API | `GET agenda/cotizar`, `GET portal/citas/cotizar`; `mascota` y `adicionales` en disponibilidad y calendario (`app/api/clinica/[...ruta]/route.ts`) |
| Módulo | `lib/modulos.ts` (`estetica`, apagado por omisión); `est-*` se envuelve con `conModuloColeccion('estetica', …)` |
| Migración | `20261116_*_estetica_precios` (tablas con RLS) |
| Pruebas | `npm run test:estetica` (después de `test:clinica`) |
