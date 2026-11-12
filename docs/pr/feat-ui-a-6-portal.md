# Versión A, fase 6: cierre del portal (refuerzos, citas por mascota y salida por WhatsApp)

## Qué cambia

- **Ficha de la mascota en el portal** (`app/(portal)/portal/mascotas/[id]/page.tsx`):
  - Pestaña nueva **«Citas»**: próximas de esa mascota (con Reprogramar y Cancelar) y anteriores.
  - **Cartilla con estados** por producto: Vencida, Próxima (≤ 30 días), Al día; las aplicaciones viejas de un producto ya reaplicado se ven como «Anterior» y no cuentan como vencidas (`lib/clinica/estadoCartilla.ts`, puro).
  - **«Pedir refuerzo»** en el resumen (vencidos) y en la cartilla (vencidos y próximos): abre Pedir cita con la mascota, el servicio cuyo icono es vacuna o desparasitación y la nota «Refuerzo: <producto>» (`?nota=`, nuevo en `NuevaCita`).
- **Sin callejones para quien no puede pedir cita en línea**:
  - Sitio: «¿Primera vez? Escríbenos por WhatsApp y te agendamos» junto a «Pedir cita» (`PrimeraVez` en `components/sitio/Piezas.tsx`), también por servicio con el nombre del servicio en el mensaje. «Pedir cita» de cada servicio ya lleva `?servicio=`.
  - Portal: «¿Aún no eres cliente?» en Entrar y Crear cuenta; «¿No tienes tu código?» en Vincular y en el inicio sin ficha (`SalidaWhatsApp` en `components/portal/comun.tsx`).
  - Mensajes nuevos en `lib/whatsapp.ts`: `mensajes.primeraVez`, `mensajes.codigoPortal`. Usan el WhatsApp de «Sitio público → Contacto»; sin él no aparecen.
- Convención de documentación de PRs: `.github/pull_request_template.md`, `docs/pr/` (este archivo, `README.md` e `HISTORIAL.md` de los PRs #11–#13).

## Por qué

Plan de la Versión A (fase 6, «Portal, sitio y tokens»). Lo grueso llegó en el PR #13; esta rama cierra lo que faltaba. La documentación de PRs la pidió Jano el 12-nov-2026 para que los ajustes futuros tengan contexto.

## Cómo probarlo (vista previa de Vercel)

1. Entra al portal como tutor con una mascota que tenga una vacuna con próxima fecha pasada → en Resumen aparece «Refuerzo vencido» con «Pedir refuerzo».
2. Toca «Pedir refuerzo» → Pedir cita llega con la mascota, el servicio de vacunación y la nota llenos.
3. Ficha → Cartilla: cada producto con su estado; Ficha → Citas: las de esa mascota.
4. Cierra sesión → Entrar y Crear cuenta muestran «¿Aún no eres cliente?» con WhatsApp.
5. Sitio → Servicios: cada servicio tiene «¿Primera vez? Escríbenos por WhatsApp» con el servicio en el mensaje.

## Base de datos y variables

- Migraciones: ninguna.
- Variables de entorno: ninguna.

## Verificación hecha

- `npx tsc --noEmit` sin errores; `npm run lint` 0 errores (45 avisos, igual que `main`); `npm run build` limpio.
- `test:finanzas` 44/44 · `test:clinica` 175/175 · `test:farmacia` 299/299 sobre Postgres local vacío.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px: 216 páginas + 18 dirigidas (ficha → Citas, Entrar, Crear cuenta, sitio → Servicios), 0 hallazgos.
- Capturas a 390 px revisadas; liga de refuerzo verificada (`?mascota=1&nota=Refuerzo: Antirrábica&servicio=3`).

## Riesgos y pendientes

- Si alguien sin sesión toca «Pedir cita» de un servicio en el sitio, al entrar llega a Pedir cita sin el servicio preseleccionado.
- «Pedir refuerzo» elige el servicio por su icono (vacuna o desparasitación); si ningún servicio en línea tiene esos iconos, abre Pedir cita sin servicio.
- No se probó contra Supabase ni en un celular real.

## Documentación actualizada

- CLAUDE.md (Portal renovado; convención de PRs), docs/CLINICA.md, docs/MANUAL-TUTOR.md, docs/pr/.
