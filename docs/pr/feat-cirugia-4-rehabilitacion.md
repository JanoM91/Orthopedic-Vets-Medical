# Ruta ortopédica · fase 4: rehabilitación

> Esta rama sale de `feat/cirugia-3-hospital`: mergea primero el PR de la fase 3.

## Qué cambia

- **Catálogo de ejercicios** (Clínica → «Ejercicios de rehabilitación»): nombre, cómo se hace (lo lee el tutor), foto que se reduce sola y liga de video opcional (`https://`). Lo edita quien tiene «Escribir expediente».
- **Planes de rehabilitación** (folio `REH-`, uno activo por mascota):
  - nueva sección Pacientes → **Rehabilitación** con los planes activos, sesiones y % de lo hecho en casa la última semana;
  - se crean ahí, desde el expediente → Cirugía o desde una hoja quirúrgica cerrada;
  - motivo y objetivo (los ve el tutor), servicio de la sesión, sesiones previstas, frecuencia y **ejercicios para casa** (del catálogo, con repeticiones y veces al día);
  - la ficha muestra el saldo del paquete de ese servicio, las próximas citas, «Agendar sesión» (la agenda abre con la mascota y el servicio), las gráficas de avance, las sesiones y lo que marcó el tutor en 14 días; «Terminar plan» pide un resumen para el tutor.
- **Sesiones**: dolor 0–10, cojera 0–5, goniometría (articulación, lado, flexión o extensión, grados), perímetro del muslo, qué se hizo, nota para el tutor y nota interna. Desde la cita en la agenda («Sesión de rehabilitación») queda ligada a esa cita; una sesión por cita; se quita solo el mismo día. Los rangos solo atrapan errores de captura: **la plataforma no interpreta ni diagnostica**.
- **Cobro**: el de la agenda, sin código nuevo de cobro. Cada sesión es una cita con el servicio del plan; si la mascota tiene un paquete con saldo de ese servicio se descuenta, si no se cobra la cita. Una sesión sin cita no cobra.
- **App del tutor** (`/portal/rehabilitacion/<id>`, también en Pendientes y en la ficha de la mascota): objetivo, sesiones y próxima cita, ejercicios con foto, cómo se hace y video, botón «Lo hicimos» por ejercicio (hoy o ayer, hasta las veces indicadas), su semana, gráfica de dolor y cojera y la nota del equipo. Nunca ve la nota interna ni la goniometría.
- El campo de foto del panel (`CampoFoto`) ahora toma su ayuda de la descripción del campo y tiene «Quitar foto» cuando la foto es opcional.

## Por qué

Fase 4 (última) de la ruta ortopédica. Decisiones de Jano (23-nov-2026): cobro **por paquete o por sesión**, el tutor ve **plan, ejercicios y avance**, **escalas comunes** y **catálogo de ejercicios** de la clínica.

## Cómo probarlo (vista previa de Vercel)

1. Clínica → «Ejercicios de rehabilitación» → crea dos ejercicios, uno con foto.
2. Pacientes → Rehabilitación → «+ Nuevo plan»: elige una mascota con tutor en la app y el servicio de la sesión. Asigna los dos ejercicios.
3. «Agendar sesión», pasa la cita a «Llegada» y toca «Sesión de rehabilitación»: captura dolor, cojera y un ángulo. Repite con otra cita para ver las gráficas.
4. Entra a la app con el tutor: en Pendientes aparece «Ejercicios de hoy»; marca «Lo hicimos». En el panel, «Lo que marcó el tutor» lo refleja.
5. Con un paquete de ese servicio vendido a la mascota, al finalizar la cita no hay cargo; sin paquete, se cobra la cita.

## Base de datos y variables

- Migración `20261123_190050_rehabilitacion`: tablas `reh_ejercicios`, `reh_planes` y `reh_sesiones` con sus listas (6 tablas), con RLS. Payload la aplica sola al desplegar.
- No hay variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío con la app en modo producción: `test:clinica` 214/214, `test:estetica` 90/90, `test:paquetes` 48/48 y `test:cirugia` 148/148 (53 nuevas: permisos, catálogo y video `https`, un plan activo por mascota, ejercicios repetidos y veces al día, saldo del paquete, cita ligada al paquete y descontada sin cargo, cita sin paquete cobrada a $400, rangos de captura, cita de otra mascota, una sesión por cita, quitar el mismo día, vista del tutor sin nota interna ni goniometría, marcar hoy/ayer y tope, Pendientes y ficha de la mascota, foto con sesión, API genérica cerrada, quitar ejercicio, editar y terminar).
- Playwright a 1280 y 390 px (tablero, ficha del plan, catálogo con foto real subida desde el panel, plan del tutor marcando un ejercicio, inicio del portal): sin errores ni desbordes. Al revisar corregí la concordancia («Cadera izquierda») y la ayuda del campo de foto.

## Riesgos y pendientes

- La clínica tiene que cargar su catálogo de ejercicios antes de usarlo (no trae ejemplos).
- El video es una liga externa (YouTube, Drive); no se sube video a la plataforma.
- Con esto termina la ruta ortopédica (4 de 4).

## Documentación actualizada

- `CLAUDE.md`, `docs/CLINICA.md`, `docs/MANUAL-EQUIPO.md` y `docs/MANUAL-TUTOR.md`.
- Este archivo.
