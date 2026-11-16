# UX del panel 2: Puesta a punto guiada

> Va **encima de la UX del panel 1** (`feat/ux-panel-1-hoy`): mezcla ese PR primero.

## Qué cambia

- Página nueva **`/admin/puesta-a-punto`** para dueños y superadmin. Toma los pasos de `docs/ARRANQUE.md` y los revisa contra la base: qué ya está, qué falta y un botón a la pantalla donde se resuelve.
  - **Servidor:** dirección pública, correos, tareas diarias, archivos y nota de voz. Revisa **solo si la variable existe**: ningún valor sale de Vercel.
  - **Módulos y Finanzas:** módulos, categorías, cuentas y fecha de corte.
  - **Equipo:** roles, personas y cédulas de quien escribe en el expediente.
  - **Clínica y sitio:** horario, consultorios y servicios, servicios sin precio, correo de avisos, teléfono y WhatsApp, dirección y mapa, aviso de privacidad, sitio publicado y pacientes.
  - **Estética** (si está encendida): nombre, servicios con precio por talla, adicionales y roles.
  - **Farmacia** (si está encendida): almacén, métodos de pago con cuenta, área y categorías, proveedores, catálogo e inventario.
  - **Tienda** (si está encendida): productos publicados, pago en línea y zonas. Avisa si sigue el **pago de prueba** o la variable `PAGOS_PRUEBA_SECRETO`.
- Estados: **Listo**, **Falta**, **Revisa** y **Opcional** (los opcionales no cuentan). Barra de avance y filtro «Solo lo pendiente».
- **Hoy:** quien administra usuarios ve la tarjeta «Puesta a punto · N de M listos» mientras falte algo. La línea «Administración» también trae la liga.
- Títulos de pestaña: Puesta a punto, Estética, Pedidos, Mis entregas, Planes de compra y Reportes (antes salía el nombre genérico).

## Por qué

Etapa de UX/UI, fase 2, que eligió Jano el 16-nov-2026. Para encender la clínica con datos reales hay que recorrer unas 30 pantallas, y hoy solo `ARRANQUE.md` dice cuáles. Así se ve de un vistazo qué falta antes de abrirla a clientes.

## Cómo probarlo (vista previa de Vercel)

1. Entra como superadmin. En **Hoy** aparece la tarjeta «Puesta a punto» (si falta algo) → **Ver qué falta**.
2. Revisa que cada «Falta» sea real: por ejemplo, si no hay dirección en «Sitio público → Contacto», sale «Dirección y mapa · Falta».
3. Captura la dirección y la liga del mapa y vuelve: el paso pasa a **Listo**.
4. Entra con un rol sin «administrar usuarios» (Recepción): la página dice que la revisan los dueños.

## Base de datos y variables

Sin migraciones ni variables. La vista nueva se registró en `payload.config.ts` (`admin.components.views.puestaAPunto`) y en `importMap.js`.

## Verificación hecha

- `npx tsc --noEmit`, `npm run build` (también con Postgres detenido) y `npm run lint` sin errores.
- `test:estetica` con 4 comprobaciones nuevas:
  - el superadmin ve la lista con la sección de estética;
  - ninguna llave aparece en la página;
  - Recepción no la ve;
  - Hoy trae la liga.
- Capturas a 1366 y 390 px sin desbordes. La cifra de la base de pruebas fue 14 de 30 listos, coherente con lo capturado.

## Riesgos y pendientes

- «Módulos» cuenta como listo en cuanto alguien guardó la configuración de la instalación, aunque no haya cambiado nada.
- Para «Revisa» en cédulas se cuentan los roles con «escribir en el expediente».
- Si se agrega un paso a `ARRANQUE.md`, hay que agregarlo también a `lib/puestaAPunto.ts` (regla en `CLAUDE.md`).

## Documentación actualizada

- `CLAUDE.md`.
- `docs/ARRANQUE.md`.
- `docs/MANUAL-EQUIPO.md`.
- Este archivo.
