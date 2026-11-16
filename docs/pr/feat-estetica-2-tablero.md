# Estética E2: tablero del día, ficha, fotos y aviso «lista para recoger»

> Va **encima de la E1** (`feat/estetica-1-precios`): mezcla ese PR primero.

## Qué cambia

- **Clínica → Estética** (también «Estética» en el menú Trabajo): el **tablero del día**. Las citas de estética van en columnas por etapa: Por llegar → Recibida → Baño → Secado → Corte → Lista para recoger → Entregada.
  - **Recibir** registra la llegada. Baño, secado y corte dejan la cita «en atención». Se puede saltar el corte.
  - **Lista:** al tutor le llega **un** correo «ya está lista para recoger» y la tarjeta ofrece **WhatsApp** con el mensaje listo.
  - **Entregar** finaliza la cita y cobra lo pactado en Finanzas, como en la agenda.
  - Cada tarjeta muestra talla, adicionales, **alertas y alergias** y lo observado.
- **Ficha de la cita:**
  - qué se hizo, corte, productos y comportamiento;
  - **lo que se observó** (pulgas, heridas, bultos…): no es diagnóstico; al guardarlo llega un correo al equipo médico con la liga al expediente;
  - nota para el tutor, nota interna y próximo baño sugerido;
  - **fotos de antes y de después**, hasta 3 de cada una.
  - «Necesitó bozal» o «agresiva» agrega una **alerta de manejo** en el expediente.
- **Expediente → Resumen:** las últimas estéticas con lo observado y las fotos.
- **Permiso nuevo «Estética»** en Roles y rol sugerido **Estilista** (estética, sin agenda, expediente ni Finanzas). Recepción, Dueño y Administración también lo traen. En una instalación con roles ya hechos, el superadmin toca **«Preparar roles»** en el tablero.

## Por qué

Es la segunda de las tres ramas de Peluqueadogs que pidió Jano el 15-nov-2026: la operación del día de la estética y su comunicación con el tutor y el médico.

## Cómo probarlo (vista previa de Vercel)

1. Con la E1 encendida y configurada, entra como superadmin → Clínica → Estética → **Preparar roles**.
2. Da de alta a una persona con el rol **Estilista**.
3. Agenda un baño para hoy. En el tablero: **Recibir → A baño → A secado → Lista** (llega el correo al tutor) → **Entregar**.
4. Abre **Ficha**: marca lo que se hizo, «Pulgas» y una nota, y sube una foto de antes y una de después. Si «Correos de la clínica para avisos» tiene un correo, ahí llega lo observado.
5. En el expediente de la mascota, el Resumen muestra la estética con sus fotos.

## Base de datos y variables

- Migración `20261116_041602_estetica_tablero`, que Payload aplica sola:
  - tablas `est_fichas` (y sus listas) y `est_fotos`, con RLS;
  - fase y avisos en `citas`;
  - casilla `clinica_estetica` en `roles`.
- Sin variables nuevas. Los correos usan `RESEND_API_KEY`, que ya existe.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío:
  - `test:clinica` 175/175.
  - **`test:estetica` 69/69** (42 + 27 nuevas), que cubren:
    - roles y permisos (la estilista no ve la agenda; el médico no entra al tablero);
    - etapas y sus reglas;
    - ficha con «Otro» que pide el detalle, y alerta de bozal;
    - fotos (máximo 3, quitar, quién las ve, 401 sin sesión);
    - API genérica 403;
    - «lista» con WhatsApp;
    - entregar con cargo de $450;
    - expediente.
- Capturas del tablero y de la ficha a 390 y 1366 px, sin desbordes.

## Riesgos y pendientes

- Las fotos se guardan en la base (como las de las mascotas), reducidas a ~1080 px. Con mucho volumen convendría pasarlas al almacén privado de Blob.
- Lo que sigue (E3): el tutor ve el historial de estética con fotos y notas en su portal, y le llega el recordatorio «¿ya le toca su baño?».

## Documentación actualizada

- `docs/ESTETICA.md` §2.
- `CLAUDE.md`.
- `docs/MANUAL-EQUIPO.md`.
- Este archivo.
