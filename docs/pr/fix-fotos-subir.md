# Arreglo: las fotos de las mascotas no se podían subir

## Qué cambia

- **El arreglo de fondo:** Payload limita cualquier campo de texto a **40 000 caracteres** si no se le dice otra cosa. Las fotos se guardan en la base como base64, así que toda foto de más de ~30 KB (cualquier foto real, aun reducida) se rechazaba con «El siguiente campo es inválido: Imagen (base64)». Ahora los tres campos que guardan fotos permiten hasta el tope de 600 KB (`maxLength: MAX_FOTO_BASE64`, `lib/fotosBase64.ts`):
  - `mas-fotos`: foto de la mascota, portal y expediente;
  - `est-fotos`: fotos de antes y después de la estética;
  - `far-evidencias`: foto de la entrega a domicilio.
- **Reducción en el navegador** (`lib/reducirImagen.ts`), para que entre «cualquier foto»:
  - acepta archivos que el teléfono manda **sin tipo** (algunos selectores de Android y Google Fotos);
  - si una foto con mucho detalle queda pesada, la vuelve a comprimir con menos calidad o más chica hasta quedar bajo 550 KB;
  - en Safari viejo, si `toBlob` falla, la arma desde `toDataURL`;
  - **HEIC (iPhone):** Safari lo abre y el iPhone ya entrega JPEG al elegir la foto. Chrome y Firefox en la computadora o en Android no lo abren; en ese caso el mensaje dice qué hacer (subirla desde el iPhone o Safari, o guardarla como JPG).
  - Rechaza de entrada solo lo que claramente no es foto (video, PDF).

## Por qué

Jano no pudo subir la foto de su mascota desde su perfil de tutor (16-nov-2026). Los registros de Vercel no muestran errores del servidor (el 400 de validación no se registra). En local, con una foto de 4000×3000, el portal respondía 400 con ese mensaje. Las pruebas no lo habían detectado porque subían imágenes de unos cuantos bytes.

## Cómo probarlo (vista previa de Vercel)

1. Entra al portal como tutor → tu mascota → **Agregar foto** y elige una foto normal del celular: se sube y aparece.
2. En el panel, en el expediente de una mascota, cambia su foto con una foto real.
3. Con la estética encendida, sube una foto de antes en la ficha de una cita.

## Base de datos y variables

Sin migración: `migrate:create` confirma que no hay cambios de esquema (las columnas ya eran `varchar` sin tope; el límite era solo la validación de Payload). Sin variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío: `test:clinica` **178/178** (3 nuevas con una foto de 320 KB, por el portal y por el equipo), `test:estetica` 90/90 y `test:farmacia` 510/510. La foto de la estética y la de la entrega a domicilio ahora son de ~300 KB.
- En el navegador (Playwright, 390 px), en el portal, se probaron cinco archivos:
  - JPEG de 4000×3000 y 11 MB, que antes daba 400: **sube**;
  - PNG: sube;
  - WebP: sube;
  - archivo sin extensión ni tipo: sube;
  - HEIC en Chromium: muestra el aviso de HEIC.

## Riesgos y pendientes

- Para abrir HEIC también en Chrome se necesita una librería (p. ej. `heic-to`, licencia LGPL). No se agregó: es una dependencia nueva y pesada que hay que aprobar.
- Las fotos siguen en la base. Con mucho volumen convendría moverlas al almacén privado de Blob.

## Documentación actualizada

- `CLAUDE.md` (Fotos de mascotas y número de pruebas).
- Este archivo.
