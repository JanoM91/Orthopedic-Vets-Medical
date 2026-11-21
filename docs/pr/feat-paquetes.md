# Paquetes con saldo de usos (panel, sitio y app del cliente)

## Qué cambia

- **Catálogo de paquetes** en Clínica → Paquetes, con el permiso «Configurar agenda». Cada paquete lleva:
  - renglones: un servicio y cuántos usos, o un producto de la farmacia y cuántas piezas;
  - precio, o precio por talla para la estética;
  - vigencia en días;
  - las casillas «Activo» y «Mostrar en el sitio y en la app».

  Nunca se aceptan productos de Grupo I ni II. Las presentaciones de la farmacia ahora se ven como «Producto · presentación».
- **Expediente → pestaña Paquetes** (permiso «Agenda»):
  - «Vender paquete» registra una entrada por cobrar en Finanzas con la clave `paquete-<id>`. Con precios por talla, usa la talla de la mascota.
  - Cada paquete muestra cuánto queda de cada renglón y una barra de avance.
  - «Registrar uso» sirve para un servicio dado sin cita.
  - «Entregar» un producto registra una venta de mostrador en cero y descuenta el inventario por FEFO.
  - «Cancelar» solo se puede sin usos, y anula la entrada en Finanzas.
- **Agenda:**
  - Al agendar, la cita se liga sola al paquete vigente que tenga saldo de ese servicio. Hay una casilla para no descontarla.
  - Al finalizar, se descuenta el uso y no se cobra el servicio; solo se cobran los adicionales de estética.
  - El detalle de la cita muestra el paquete.
- **Sitio:**
  - `/paquetes`, una sección «Paquetes» en la portada y la liga «Paquetes» en la cabecera, solo si hay paquetes en línea.
  - «Lo quiero» lleva a `/reservar?paquete=<id>`, donde se deja una solicitud sin crear cuenta.
- **App del cliente:**
  - `/portal/paquetes` muestra lo que le queda a cada mascota y los paquetes disponibles. «Lo quiero» deja una solicitud con su ficha y la mascota.
  - En Inicio, «Pendientes» lista lo que le queda de cada paquete, con «Pedir cita», y hay un atajo «Paquetes».
- **Solicitudes:**
  - Traen el paquete y, si vienen de la app, el cliente y la mascota.
  - El botón «Vender el paquete» abre el expediente con el paquete ya elegido.
  - Al venderlo, la solicitud pasa a «Paquete vendido».
- **Código:**
  - `lib/clinica/paquetes.ts` concentra toda la lógica, con un candado por paquete vendido.
  - `collections/clinica/paquetes.ts` define `paquetes`, `paq-vendidos` y `paq-usos`.
  - Pantallas: `components/admin/clinica/Paquetes.tsx`, `app/(portal)/portal/paquetes`, `app/(sitio)/paquetes` y `components/sitio/TarjetaPaquete.tsx`.
  - Prueba nueva: `scripts/probarPaquetes.mjs` (`npm run test:paquetes`).

## Por qué

Jano lo pidió el 21-nov-2026, después de revisar otros sistemas veterinarios (Lius tiene «Paquetes» en su plan PRO). Sus decisiones:

- **Saldo de usos:** se cobra una vez y se va usando.
- **Solicitud que confirma recepción:** el cliente lo pide en el sitio o en la app y se paga en la clínica.
- **Contenido:** servicios de la clínica, de la estética y productos de la farmacia.

## Cómo probarlo (vista previa de Vercel)

1. En el panel, abre Clínica → Paquetes → «Crear». Arma, por ejemplo, «Rehabilitación: 10 sesiones» con el servicio de rehabilitación × 10, precio y 90 días. Deja marcado «Mostrar en el sitio y en la app».
2. Abre el expediente de una mascota → Paquetes → «Vender paquete». Revisa en Finanzas que quedó la entrada por cobrar.
3. Agenda una cita de ese servicio para la mascota: el detalle de la cita dice «Paquete». Avanza la cita hasta «Finalizar»: no se genera cargo del servicio y en Paquetes queda un uso menos.
4. Abre `/paquetes` en el sitio, toca «Lo quiero» y envía la solicitud. Debe aparecer en Clínica → Solicitudes de cita.
5. Entra a la app como cliente → Inicio → Paquetes: ves el saldo y puedes pedir otro paquete. La solicitud trae el botón «Vender el paquete».

## Base de datos y variables

- La migración `20261121_205724_paquetes`:
  - crea las tablas `paquetes`, `paq_vendidos` y `paq_usos`, con RLS;
  - agrega las columnas `citas.paquete`, `solicitudes.paquete`, `solicitudes.cliente` y `solicitudes.mascota_ficha`, y `far_presentaciones.titulo`, que se llena con el nombre del producto y de la presentación;
  - agrega el estado «vendida» a las solicitudes.

  Payload la aplica solo al desplegar.
- No hay variables nuevas.
- **Va encima de `fix/restablecer-contrasena`**: mezcla primero ese PR. De ahí toma el gancho de errores públicos, que hace que los avisos de validación del catálogo se lean en producción.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` terminan sin errores; `npm run lint` da 0 errores.
- Pruebas sobre Postgres local vacío con `npm run start`, es decir, con código minificado como en producción:
  - `test:clinica`: 214 de 214;
  - `test:estetica`: 90 de 90;
  - `test:farmacia`: 510 de 510;
  - `test:paquetes`: 57 de 57, cubriendo catálogo, venta y Finanzas, citas ligadas y apartados, uso a mano, finalizar sin cargo, estética por talla con cobro solo del adicional, cancelar con anulación en Finanzas, la app del cliente, solicitudes desde el sitio y la app, y la entrega de producto (venta en cero y kardex).
- Revisión visual (Playwright, a 390 y 1280 px) de: expediente → Paquetes, venta, `/paquetes`, sección de la portada, `/reservar?paquete=` y `/portal/paquetes`.

## Riesgos y pendientes

- El cobro es en la clínica. El pago en línea con Mercado Pago queda para cuando haya credenciales.
- No hay «deshacer uso». Si se registró un uso por error, por ahora se corrige vendiendo un paquete de ajuste o con soporte técnico.
- Todavía no se avisa al cliente cuando su paquete está por vencer.
- Si un producto cambia de nombre, su hook actualiza el título de sus presentaciones. Una edición directa en la base no lo haría.

## Documentación actualizada

- `CLAUDE.md`: reglas de los paquetes.
- `docs/CLINICA.md`: sección «Paquetes con saldo de usos».
- `docs/MANUAL-EQUIPO.md` y `docs/MANUAL-TUTOR.md`: sección «Paquetes».
- Este archivo.
