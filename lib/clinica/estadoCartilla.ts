/**
 * Estado de la cartilla para el tutor (nov-2026). Puro.
 *
 * Por producto (sin acentos ni mayúsculas) solo cuenta la aplicación más
 * reciente: si una vacuna se volvió a aplicar, la anterior ya no está «vencida».
 *   - vencida: la próxima fecha ya pasó.
 *   - proxima: faltan `dias` días o menos (30 por omisión).
 *   - al_dia: la próxima fecha está más lejos.
 *   - sin_fecha: el médico no indicó refuerzo.
 *   - historial: hay una aplicación más reciente del mismo producto.
 */
import type { CartillaVista } from './tipos'

export type EstadoCartilla = 'vencida' | 'proxima' | 'al_dia' | 'sin_fecha' | 'historial'

export const ESTADO_CARTILLA_LABEL: Record<EstadoCartilla, string> = {
  vencida: 'Vencida',
  proxima: 'Próxima',
  al_dia: 'Al día',
  sin_fecha: 'Sin refuerzo indicado',
  historial: 'Anterior',
}

const clave = (p: string) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function sumar(d: string, n: number): string {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

export function estadosCartilla(cartilla: CartillaVista[], hoy: string, dias = 30): Map<number, EstadoCartilla> {
  const ultima = new Map<string, CartillaVista>()
  for (const c of cartilla) {
    const k = clave(c.producto)
    const previa = ultima.get(k)
    if (!previa || c.fechaAplicacion > previa.fechaAplicacion || (c.fechaAplicacion === previa.fechaAplicacion && c.id > previa.id)) ultima.set(k, c)
  }
  const limite = sumar(hoy, dias)
  const r = new Map<number, EstadoCartilla>()
  for (const c of cartilla) {
    if (ultima.get(clave(c.producto))?.id !== c.id) r.set(c.id, 'historial')
    else if (!c.proximaFecha) r.set(c.id, 'sin_fecha')
    else if (c.proximaFecha < hoy) r.set(c.id, 'vencida')
    else if (c.proximaFecha <= limite) r.set(c.id, 'proxima')
    else r.set(c.id, 'al_dia')
  }
  return r
}
