# Ruta ortopédica · fase 2: hoja quirúrgica y de anestesia

## Qué cambia

- **Nueva pantalla para el quirófano:** «Hoja quirúrgica» (`/admin/clinica/cirugia/<id>`), diseñada para usarse en una tableta.
- **Cómo se abre:**
  - desde la cita de la cirugía en la agenda, con el botón «Hoja quirúrgica»;
  - si es una urgencia sin cita, desde el expediente → Cirugía → «+ Hoja de urgencia».
  - El expediente → Cirugía lista las hojas de la mascota.
- **Qué registra:**
  - equipo, ASA, urgencia, peso de hoy (sugiere el último registrado), ayuno y valoración preanestésica;
  - tiempos, con botón «Ahora» en cada uno;
  - fármacos aplicados, con la dosis **tal como la escribe el médico**;
  - toma de signos con gráficas de FC, FR, SpO₂ y temperatura;
  - procedimiento realizado, hallazgos, implantes, complicaciones, recuperación e indicaciones postoperatorias.
- **Avisos:** muestra las alergias y alertas de manejo de la mascota, y avisa si la cirugía no tiene consentimiento firmado.
- **Reglas:**
  - fármacos y signos se agregan renglón por renglón, con un candado por hoja para que dos personas no se pisen;
  - un renglón capturado por error se puede quitar mientras la hoja está abierta;
  - los rangos de los signos solo atrapan errores de captura, no interpretan nada clínicamente;
  - **la plataforma nunca calcula, sugiere ni valida una dosis**;
  - para cerrar se piden el cirujano, lo realizado y el inicio y fin de la cirugía; cerrada, la hoja ya no cambia.
- **Imprimible:** sale con tablas y gráficas.
- **Código:** `lib/clinica/hojaQuirurgica.ts`, la colección `cir-hojas` (en `collections/clinica/cirugia.ts`) y `components/admin/clinica/HojaQuirurgica.tsx`. Además se tocaron la agenda (botón), el expediente (lista de hojas) y `AppClinica` (ruta `cirugia/:id`).

## Por qué

Es la fase 2 de la ruta ortopédica que pidió Jano (21-nov-2026). Al aprobarse el merge de la fase 1 dijo «continuemos».

## Cómo probarlo (vista previa de Vercel)

1. En la agenda, abre una cita en «Llegada» o la cirugía de un presupuesto aceptado → «Hoja quirúrgica».
2. Llena el equipo y el ASA, toca «Ahora» en los tiempos, agrega dos fármacos y tres tomas de signos: deben verse las gráficas.
3. Intenta «Cerrar hoja» sin lo realizado: debe decir qué falta. Llénalo y cierra la hoja.
4. Toca «Imprimir».

## Base de datos y variables

- Migración `20261122_041118_cirugia_hoja`: agrega la tabla `cir_hojas` y sus listas, con RLS.
- No hay variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío, con la app en modo producción (`npm run start`):
  - `test:clinica`, `test:estetica`, `test:farmacia` y `test:paquetes` pasan igual que antes;
  - `test:cirugia` 64/64: 20 pruebas nuevas de la hoja (permisos, abrir y retomar, datos del presupuesto y del peso, horas inválidas, campos desconocidos, fármaco sin dosis, error de captura en signos, orden por hora, quitar un renglón, requisitos para cerrar, inmutabilidad, imprimible y hoja de urgencia).
- Playwright a 1280, 768 (tableta) y 390 px con 2 fármacos y 6 tomas: el botón «Ahora» funciona, se ven las gráficas, sin errores ni desbordes. Al revisar encontré temperaturas con decimales de más; ahora se redondean a 2 decimales.

## Riesgos y pendientes

- La hora de los campos `time` se ve en formato de 12 o de 24 horas según el navegador; lo guardado siempre es HH:MM en 24 horas.
- Siguientes fases: hospitalización (indicaciones del médico y registro de cada aplicación, parte del día para el tutor) y rehabilitación.

## Documentación actualizada

- `CLAUDE.md`, `docs/CLINICA.md` y `docs/MANUAL-EQUIPO.md`.
- Este archivo.
