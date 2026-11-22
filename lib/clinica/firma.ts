/**
 * Firma del consentimiento (nov-2026): PNG dibujado con el dedo en un lienzo,
 * guardado como `data:image/png;base64,…`. Tope de 400 KB en base64 (Payload
 * limita los textos a 40 000 caracteres si no se le dice otra cosa).
 */
export const MAX_FIRMA_BASE64 = 400 * 1024
export const PREFIJO_FIRMA = 'data:image/png;base64,'

/** ¿Es una firma PNG válida y razonable? (no vacía, no gigante). */
export function firmaValida(v: unknown): v is string {
  if (typeof v !== 'string' || !v.startsWith(PREFIJO_FIRMA)) return false
  const b64 = v.slice(PREFIJO_FIRMA.length)
  return b64.length > 400 && b64.length <= MAX_FIRMA_BASE64 && /^[A-Za-z0-9+/]+=*$/.test(b64)
}
