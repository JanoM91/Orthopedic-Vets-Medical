/**
 * Motivos frecuentes para el título de una nota clínica (Versión A, fase 5). Puro.
 * Primero los títulos que ya se usaron con esta mascota (lo más útil en
 * seguimientos), luego una lista general. Sin duplicados, máximo `n`.
 * Es solo una ayuda para escribir: el campo sigue siendo texto libre.
 */
export const MOTIVOS_GENERALES = ['Consulta general', 'Cojera', 'Dolor', 'Control postoperatorio', 'Revisión de herida', 'Vacunación', 'Vómito o diarrea', 'Problema de piel', 'Seguimiento de tratamiento']

const clave = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function motivosFrecuentes(titulosPrevios: string[], n = 8): string[] {
  const vistos = new Set<string>()
  const r: string[] = []
  for (const t of [...titulosPrevios, ...MOTIVOS_GENERALES]) {
    const limpio = t.trim()
    if (!limpio || limpio.length > 60) continue
    const k = clave(limpio)
    if (vistos.has(k)) continue
    vistos.add(k)
    r.push(limpio)
    if (r.length >= n) break
  }
  return r
}
