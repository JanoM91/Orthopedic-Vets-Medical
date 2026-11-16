# Home versión B «Todo en un lugar» con campaña, médico y accesos de primera vez

## Qué cambia

- La página principal (`/`) pasa a la **versión B** del lienzo «OVM Centro Veterinario · Home: 3 versiones»: cabecera oscura pegada al hero, mosaico de fotos, banda de **campaña**, bloque **«¿Primera vez con nosotros?»**, servicios por área con píldoras, razones, **médico con retrato y credenciales**, banda de la estética, tienda, app, testimonios, horario y contacto.
- **WhatsApp es el botón principal** en el hero, la cabecera y el cierre; «Agendar en línea» queda como segunda opción. Sin WhatsApp capturado, todo vuelve a «Pedir cita en línea».
- **Primera vez**: «Reserva tu primera cita» (WhatsApp con mensaje listo), «Compra en la farmacia y tienda» (lleva a `/tienda`, que ya vende a invitados; solo con la tienda encendida) y «Ya soy cliente» (portal).
- En el panel: Clínica → **«Fotos del sitio»** (colección nueva) y campos nuevos en **«Sitio público»**: fotos de la portada, campaña vigente, por qué elegirnos, médico responsable y testimonios.
- Archivos: `app/(sitio)/page.tsx`, `app/(sitio)/sitio.css`, `components/sitio/Areas.tsx`, `components/sitio/Piezas.tsx`, `components/admin/CampoFoto.tsx`, `app/api/sitio/fotos/[id]/route.ts`, `collections/clinica/sitio.ts`, `lib/sitio/contenido.ts`.

## Por qué

Jano eligió la versión B el 16-nov-2026 y pidió sumarle la sección «Lo atiende el médico veterinario…» con foto y credenciales, que la home sirva de destino de campañas, y que los visitantes tengan acceso a reservar por primera vez y a la tienda.

## Cómo probarlo

1. Panel → Clínica → «Fotos del sitio» → crear: elige una foto del celular; debe verse la vista previa y guardarse.
2. Panel → Clínica → «Sitio público»: elige fotos de portada, enciende «Campaña vigente» con título, llena «Médico responsable» con dos credenciales y guarda.
3. Abre `/`: se ven el mosaico, la banda menta de la campaña, los tres accesos de primera vez, las áreas (cambia de píldora), el médico con su retrato y credenciales.
4. Pon en la campaña un «Último día» pasado: la banda desaparece. Quita el nombre del médico: la sección desaparece.
5. En el teléfono (390 px): la cabecera muestra la marca y «WhatsApp»; nada se desborda.

## Base de datos y variables

- Migración `20261116_150807_sitio_home_b`: tabla `sitio_fotos`, tablas de `razones`, `doctor_credenciales`, `testimonios` y `_rels` del global, y columnas de campaña y médico. Todas las tablas nuevas con RLS.
- Variables nuevas: ninguna.

## Verificación hecha

En la nube, con Postgres 16 local vacío y `npm run start` (16-nov-2026):

- `npx tsc --noEmit`: limpio. `npm run lint`: 0 errores, 69 avisos. `npm run build`: limpio.
- `test:finanzas` 44/44 · `test:clinica` **192/192** (14 nuevas: accesos de primera vez, secciones ocultas sin datos, permisos y validación de fotos, foto pública con caché, campaña vencida y vigente, fecha inválida, médico, razones y testimonios) · `test:estetica` 90/90 · `test:farmacia` 510/510.
- Capturas de `/` a 1280 y 390 px con contenido de prueba: sin desbordes ni errores de consola.
- Panel: se creó una foto desde «Fotos del sitio» con una imagen de 3000×2000 px en Chrome; se redujo, mostró la vista previa y se guardó.

## Riesgos y pendientes

- **Reservar en línea sin cuenta no existe todavía**: el visitante nuevo agenda por WhatsApp. Es la siguiente rama y necesita una decisión de Jano (solicitud que recepción confirma, o cita con día y hora elegidos por el visitante).
- Las fotos se guardan en la base (como las de mascotas); cada una pesa hasta ~550 KB. Con la caché de un año no se vuelven a pedir, pero la primera visita descarga hasta 5.
- No se probó el campo de foto en un iPhone real ni en la vista previa de Vercel con Supabase.
- `scripts/auditoria-front.mjs` no se corrió en esta rama.
- Falta el contenido real del Dr. Joni (fotos, credenciales, testimonios, campaña): sin él esas secciones no aparecen.

## Documentación actualizada

`CLAUDE.md` (Reglas de front), `docs/CLINICA.md` (sección nueva), `docs/ARRANQUE.md` (paso 4).
