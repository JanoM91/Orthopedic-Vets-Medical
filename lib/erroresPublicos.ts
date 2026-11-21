import type { AfterErrorHook } from 'payload'

/**
 * Mensajes de error que sí deben llegar a la persona (nov-2026, arreglo de
 * «restablecer contraseña»).
 *
 * En producción, Next.js minifica el código y las clases de error de Payload
 * pierden su nombre (`error.name === ''`). El formateador de Payload solo copia
 * el mensaje cuando el error tiene nombre o trae `data`; sin eso responde
 * «An unknown error occurred.» aunque el error sea público (un 400, 403 o 429
 * que lanzamos a propósito con un mensaje en español). Así le pasó a Jano con
 * una liga de recuperación ya usada: el panel solo decía «unknown error».
 *
 * Este gancho global corrige la respuesta: si el error es público (mismas
 * reglas que Payload: `isPublic`, o un estado distinto de 500), devuelve su
 * mensaje real, traducido cuando es uno de los textos en inglés de Payload.
 * Los errores internos (500) siguen ocultos.
 */
const GENERICO = 'An unknown error occurred.'

const TRADUCCIONES: Record<string, string> = {
  'Token is either invalid or has expired.': 'Esta liga ya se usó, ya venció o se pidió otra más nueva. Abre el correo más reciente o pide otra liga.',
  'Missing required data.': 'Faltan datos. Revisa el formulario e intenta otra vez.',
}

type ErrorPayload = Error & { status?: number; isPublic?: boolean; data?: Record<string, unknown> | null }

export function esErrorPublico(error: ErrorPayload): boolean {
  if (error.isPublic === true) return true
  if (error.isPublic === false) return false
  return Boolean(error.status && error.status !== 500)
}

export const mostrarMensajeDeError: AfterErrorHook = ({ error, result }) => {
  const primero = result?.errors?.[0] as { message?: string } | undefined
  if (!primero || primero.message !== GENERICO) return
  const e = error as ErrorPayload
  if (!e?.message || e.message === GENERICO || !esErrorPublico(e)) return
  const message = TRADUCCIONES[e.message] ?? e.message
  return { response: { errors: [{ message, ...(e.data ? { data: e.data } : {}) }] } }
}
