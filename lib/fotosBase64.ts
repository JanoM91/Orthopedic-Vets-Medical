/**
 * Fotos guardadas en la base como base64 (mascotas, estética, evidencias de
 * entrega). Payload limita los campos de texto a 40 000 caracteres por omisión
 * (`defaultMaxTextLength`): sin `maxLength` propio, una foto real de más de
 * ~30 KB se rechazaba con «El siguiente campo es inválido» (17-nov-2026).
 *
 * El tope de la foto es 600 KB; su base64 mide 4/3 de eso.
 */
export const MAX_FOTO_BYTES = 600 * 1024
export const MAX_FOTO_BASE64 = Math.ceil(MAX_FOTO_BYTES / 3) * 4
