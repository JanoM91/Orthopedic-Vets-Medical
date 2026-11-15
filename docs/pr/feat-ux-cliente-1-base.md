# UX del cliente 1: una barra para portal, tienda y sitio (Versión B)

## Qué cambia

- **Una sola barra abajo** en el portal, la tienda y el sitio en el celular (`components/app/BarraApp.tsx` + `barra-app.css`):
  - Con sesión: Inicio · Mascotas · Citas · **Tienda** · Perfil.
  - Sin sesión: Inicio · Servicios · Citas · Tienda · Entrar.
  - «Tienda» solo aparece con Farmacia y Tienda encendidas.
- La pestaña «Farmacia» del portal ahora es **«Tienda»** y lleva a `/tienda`. Los pedidos y recetas (`/portal/farmacia`) se abren con **«Mis pedidos»** en la cabecera de la tienda.
- **La tienda ya tiene barra** (antes no tenía navegación propia). El resumen del carrito queda encima de la barra.
- **Look Versión B en el portal y la tienda**:
  - Manrope y fondo verdoso.
  - Cabecera clara con el logotipo para fondo claro.
  - Tarjetas de 18 px y botones de 14 px (ya no píldora).
  - Pestañas de la ficha como píldoras.
- **Sitio en el celular**: barra de visitante, cabecera con marca y «Pedir cita» (lo demás va en la barra). Manrope también en el sitio.
- Variable opcional `NEXT_PUBLIC_BRAND_LOGO_LIGHT` (`site.brand.logoClaro`), por omisión `/logo-mark.png`.

## Por qué

Etapa de UX/UI «Lo que ve el cliente» (decisión de Jano, 14-nov-2026): sitio, portal y tienda como una sola app moderna.

- Primero se hizo el lienzo «OVM · Experiencia del cliente: sitio, portal y tienda».
- Jano eligió el inicio «Hoy primero» y el orden **base → inicio → tienda → sitio**.
- Esta rama es la base.

## Cómo probarlo (vista previa de Vercel)

1. En el celular abre `/`. Abajo ves Inicio · Servicios · Citas · Tienda · Entrar; arriba, marca y «Pedir cita».
2. Toca **Tienda**. Ves la misma barra con «Tienda» marcada y, arriba, el carrito.
3. Agrega algo al carrito y ábrelo. El resumen con el botón queda **encima** de la barra.
4. Entra como tutor. La barra cambia a Inicio · Mascotas · Citas · Tienda · Perfil.
5. En la tienda, «Mis pedidos» abre tus pedidos y recetas.
6. En la computadora la barra flota centrada (640 px). En el sitio de computadora no aparece y manda la cabecera.

## Base de datos y variables

- Sin migraciones.
- Variable nueva **opcional**: `NEXT_PUBLIC_BRAND_LOGO_LIGHT` (no es secreta; nunca «Sensitive»). Sin ella se usa `/logo-mark.png`.

## Verificación hecha

- `npx tsc --noEmit` sin errores.
- `npm run lint`: 0 errores (45 avisos, igual que `main`).
- `npm run build` limpio.
- `test:finanzas` 44/44.
- `scripts/auditoria-front.mjs` a 320, 390 y 1280 px sobre sitio, portal (tutor) y tienda: 72 páginas, **0 hallazgos**.
- Capturas revisadas: inicio del portal, tienda y sitio a 320 y 390 px.
- No se tocaron servicios ni API. `test:clinica` y `test:farmacia` no se volvieron a correr: necesitan base vacía y la local tenía los datos de la auditoría.

## Riesgos y pendientes

- En este entorno Google Fonts está bloqueado, así que las capturas usan la letra de respaldo; en Vercel carga Manrope.
- El aviso de pedido activo en la pestaña «Tienda» y el inicio «Hoy primero» van en la fase 2.
- Entrar, registro y «olvidé» siguen sin barra (pantallas de un solo paso).

## Documentación actualizada

- `CLAUDE.md` (regla de la app del cliente).
- `docs/CLINICA.md` (variable).
- `docs/FARMACIA.md` (Portal → Farmacia).
- `docs/MANUAL-TUTOR.md` (cómo moverte).
- `.env.example`.
- Este archivo.
