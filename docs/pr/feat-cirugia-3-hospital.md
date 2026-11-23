# Ruta ortopédica · fase 3: hospitalización

## Qué cambia

- **Nueva sección «Hospital»** en Pacientes (`/admin/clinica/hospital`): tablero de internados con tomas atrasadas, pendientes del día y «Sin parte hoy», más las altas recientes. «Hoy» muestra cuántos pacientes hay internados y cuántas tomas van atrasadas.
- **Cómo se interna:**
  - «+ Internar» en el tablero (busca la mascota);
  - desde la hoja quirúrgica, botón «Internar» (hereda la hoja y el presupuesto);
  - el expediente → Cirugía lista los internamientos de la mascota.
- **Ficha del internamiento** (`/admin/clinica/hospital/<id>`, folio `HOS-`):
  - **Indicaciones del médico:** tratamiento, dosis tal como la escribe, vía, frecuencia y las horas HH:MM que él fija (sin horas = según necesidad). Se suspenden, no se editan.
  - **Tomas del día:** armadas solo con esas horas; «Aplicada» o «No se aplicó» (con motivo); atrasada a los 30 min; se navega por día.
  - **Observaciones:** temperatura, FC, FR, dolor 0–10, apetito, orina, heces y notas.
  - **Partes para el tutor:** texto y foto opcional; le llega por correo y hay botón «Liga al tutor» por WhatsApp.
  - **Cargos** que captura el equipo.
  - **Alta:** indicaciones para casa (las ve el tutor) y resumen interno; la suma de los cargos entra a Finanzas como entrada por cobrar (`hospitalizacion-<id>`) y se avisa al tutor.
- **Tutor:** página sin cuenta `/hospital/<id>/<token>` (vale hasta 30 días después del alta) y aviso en Pendientes de su app («X está internada» / «ya puede irse a casa»). Solo ve partes, fotos, indicaciones para casa y el teléfono; **nunca** medicamentos, dosis, observaciones ni cargos.
- **Reglas:** una internada activa por mascota; todo se agrega con candado `6 800 000 + id`; internar, indicar, partes y alta piden «Escribir expediente»; tomas, observaciones y cargos, «Escribir expediente» o «Agenda». **La plataforma nunca calcula ni sugiere dosis, horarios ni frecuencias.**
- **Código:** `collections/clinica/hospital.ts`, `lib/clinica/hospital.ts`, `components/admin/clinica/Hospital.tsx`, `app/(sitio)/hospital/[id]/[token]/page.tsx`; rutas nuevas en `app/api/clinica/[...ruta]/route.ts`; se tocaron `AppClinica`, `Cirugia`, `HojaQuirurgica`, `Tablero`, el portal (Pendientes) y `lib/permisos.ts` (prefijo `hos-`).

## Por qué

Fase 3 de la ruta ortopédica (21-nov-2026). Decisiones de Jano al decir «continuemos» (22-nov-2026): el cobro es **solo lo que capture el equipo** y el tutor recibe un **parte del día**.

## Cómo probarlo (vista previa de Vercel)

1. Pacientes → Hospital → «+ Internar»: elige una mascota, motivo y jaula.
2. Agrega una indicación con horas (por ejemplo `08:00, 16:00`) y otra sin horas. En «Tomas de hoy» marca una «Aplicada» y otra «No se aplicó» (pide motivo).
3. Guarda una observación, agrega un cargo y publica un parte con foto. Abre «Liga al tutor» en una ventana privada: debe verse el parte, sin medicamentos ni cargos.
4. «Dar de alta» con indicaciones para casa: en Finanzas → Pendientes aparece «Hospitalización · <mascota>» por cobrar.

## Base de datos y variables

- Migración `20261123_001039_hospital`: tabla `hos_internamientos` y sus 5 listas, con RLS. Payload la aplica sola al desplegar.
- No hay variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío con la app en modo producción: `test:clinica` 214/214, `test:estetica` 90/90, `test:paquetes` 48/48 y `test:cirugia` 95/95 (31 nuevas de hospitalización: permisos por rol, una internada por mascota, horas mal escritas, toma fuera de las horas del médico o repetida, omitir sin motivo, según necesidad, suspender, rango de captura de temperatura, cargos, parte vacío, liga y Pendientes del tutor sin medicamentos ni cargos, API genérica cerrada, alta con cargo en Finanzas, nada cambia después del alta).
- Playwright a 1280 y 390 px (tablero, ficha, página del tutor y «Hoy»): sin errores ni desbordes. Al revisar se corrigieron el formulario de indicaciones (pasa a dos filas) y el botón «Registrar aplicación» en el teléfono.

## Riesgos y pendientes

- La foto del parte se guarda como JPEG reducido en la base (igual que las fotos de mascotas).
- Las tomas se arman con la zona horaria del negocio; un cambio de horario de verano no aplica en México.
- Siguiente fase: rehabilitación.

## Documentación actualizada

- `CLAUDE.md`, `docs/CLINICA.md`, `docs/MANUAL-EQUIPO.md` y `docs/MANUAL-TUTOR.md`.
- Este archivo.
