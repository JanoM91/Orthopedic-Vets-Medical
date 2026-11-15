# UX del cliente 2: inicio «Hoy primero» y compras por mascota

## Qué cambia

- **Inicio del portal «Hoy primero»** (`app/(portal)/portal/page.tsx`, Opción 1 del lienzo):
  - Saludo según la hora («Buenos días / tardes / noches»).
  - **La cita más cercana** en tarjeta oscura: mascota, día u «hoy», hora y servicio, estado, «Cómo llegar» (si hay liga de mapa en «Sitio público → Contacto») y «Ver o reprogramar». Sin citas: «Pedir cita».
  - **Pedidos de la tienda en curso** con una frase clara («Tu pedido va en camino», «listo para recoger»…) y cómo se paga.
  - **Pendientes** con su botón: refuerzos vencidos o a 30 días («Pedir refuerzo») y recetas listas para surtir («Surtir»). Sin pendientes: «Todo al día».
  - Atajos (Pedir cita, Tienda o Servicios, WhatsApp) y las mascotas en una fila.
- **Perfil** (`/portal/cuenta`) ahora tiene «Tu ficha en la clínica» y «¿Duda o urgencia?», que salieron del inicio.
- **Ficha de la mascota → pestaña «Compras»** (solo con la tienda encendida): «Comprar para…», recetas vigentes y pedidos de esa mascota. En Resumen, «Compras de…» si hay algo por surtir o en curso.
- **Número sobre «Tienda»** en la barra con los pedidos en curso (en el inicio y en Mis pedidos).
- Portal → Farmacia se titula **«Mis pedidos»**. Sus filas salen de `components/portal/Compras.tsx`, compartido con el inicio y la ficha.
- Código nuevo:
  - `portalRefuerzosPendientes()` en `lib/clinica/servicio.ts`: solo lectura, con las reglas de acceso del tutor y el mismo criterio de `estadoCartilla`.
  - `lib/portal/refuerzo.ts`: la liga «Pedir refuerzo», antes dentro de la ficha.
  - `contactoClinica()` devuelve también `mapaUrl`.

## Por qué

Etapa «Lo que ve el cliente», fase 2. El 14-nov-2026 Jano eligió el inicio «Hoy primero» y el orden base → inicio → tienda → sitio.

## Cómo probarlo (vista previa de Vercel)

1. En el celular, entra como tutor con una cita próxima. Arriba debe verse la tarjeta oscura con la cita.
2. En el panel, agrega en la cartilla de su mascota una vacuna con próxima fecha ya pasada. En el inicio aparece en Pendientes con «Pedir refuerzo», que abre Pedir cita con la mascota y la nota.
3. Con la tienda encendida, haz un pedido para recoger. En el inicio sale «Recibimos tu pedido» y la barra marca 1 sobre «Tienda».
4. En la ficha de la mascota, abre la pestaña **Compras**: ves el pedido y «Comprar para…».
5. En Perfil están tu ficha y el contacto.

## Base de datos y variables

Ninguna: sin migraciones ni variables. «Cómo llegar» usa el campo «Liga del mapa» que ya existe en «Sitio público → Contacto».

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores.
- `npm run lint`: 0 errores (45 avisos, igual que `main`).
- Pruebas sobre Postgres local vacío: `test:finanzas` 44/44, `test:clinica` 175/175, `test:farmacia` 416/416.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px (sitio, portal, tienda y la nueva pestaña Compras): 0 hallazgos.
- Capturas a 320 y 390 px del inicio, con y sin pendientes, con un pedido en curso y la pestaña Compras.
  - A 320 px la foto de la mascota se oculta en la tarjeta de la cita para no apretar el texto.

## Riesgos y pendientes

- El inicio hace más lecturas que antes:
  - citas, cartilla de todas las mascotas y servicios;
  - con la tienda encendida, también pedidos y recetas.
  - Son pocas filas por tutor, pero conviene vigilar el tiempo de respuesta en producción.
- El número sobre «Tienda» solo aparece en el inicio y en Mis pedidos; en las demás pantallas no se consulta.
- «Volver a pedir» (recompra) queda para Farmacia 6.

## Documentación actualizada

- `CLAUDE.md` (regla del inicio).
- `docs/CLINICA.md` (inicio del portal).
- `docs/FARMACIA.md` (Mis pedidos y Compras).
- `docs/MANUAL-TUTOR.md`.
- `scripts/auditoria-front.mjs` (ruta de Compras).
- Este archivo.
