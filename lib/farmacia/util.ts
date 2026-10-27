/**
 * Utilidades compartidas por los servicios de la fase 3 (ventas y recetas).
 * Sin dependencias de Payload: se pueden probar solas.
 */
import type { User } from '../../payload-types'
import type { PersonaBreve, ProblemaMascota } from './tipos'
import { ErrorFarmacia } from './servicio'

export const prohibido = (m = 'Tu rol no permite hacer esto en la farmacia.') => new ErrorFarmacia(403, m)
export const invalido = (m: string) => new ErrorFarmacia(400, m)
export const noEncontrado = (m = 'No encontramos ese registro.') => new ErrorFarmacia(404, m)

/**
 * Error que la pantalla de venta sabe resolver: pide la contraseña de un
 * encargado (`autorizacion`), confirmar el peso (`confirmar_peso`) o muestra
 * los choques con la mascota (`mascota`). La API manda `codigo` y `detalle`.
 */
export class ErrorConCodigo extends ErrorFarmacia {
  constructor(
    estado: number,
    mensaje: string,
    public codigo: 'autorizacion' | 'confirmar_peso' | 'mascota',
    public detalle?: unknown,
  ) {
    super(estado, mensaje)
  }
}

export const t = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}
export const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
export const nOpc = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const r3 = (x: number) => Math.round(x * 1000) / 1000
export const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
export const persona = (u: unknown): PersonaBreve | null => {
  if (!u) return null
  if (typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u), nombre: 'Usuario' }
}

/** AAAA-MM-DD + n días. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}
export function mesesEntre(nacimiento: string, hoy: string): number {
  const [y1, m1, d1] = nacimiento.split('-').map(Number)
  const [y2, m2, d2] = hoy.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

/** Minúsculas sin acentos ni signos, para comparar alergias con alérgenos y principios activos. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const DIAS_PESO_VIGENTE = 90

/**
 * Revisa un producto contra la mascota (docs/FARMACIA-PROMPT.md → «Validación
 * contra la mascota»): especie, rango de peso, edad mínima y alergias. El
 * sistema nunca calcula dosis; solo bloquea combinaciones incompatibles.
 *
 * Alergias: cada término del producto (alérgenos y principio activo) se busca
 * en el texto de alergias de la mascota, y cada término de la mascota en el
 * del producto, sin acentos («Penicilina» choca con «penicilinas»).
 */
export function revisarContraMascota(
  producto: { especies?: string[] | null; pesoMinKg?: number | null; pesoMaxKg?: number | null; edadMinMeses?: number | null; alergenos?: string | null; principioActivo?: string | null; nombre: string },
  paciente: { especie: string; pesoKg: number | null; pesoDias: number | null; edadMeses: number | null; alergias: string | null },
  pesoConfirmadoKg?: number | null,
): ProblemaMascota[] {
  const p: ProblemaMascota[] = []
  const especies = producto.especies ?? []
  if (especies.length && !especies.includes(paciente.especie)) p.push({ tipo: 'especie', mensaje: `${producto.nombre} no es para ${paciente.especie} (es para ${especies.join(', ')}).` })
  const conRango = nOpc(producto.pesoMinKg) != null || nOpc(producto.pesoMaxKg) != null
  if (conRango) {
    const peso = nOpc(pesoConfirmadoKg) ?? paciente.pesoKg
    if (peso == null) p.push({ tipo: 'sin_peso', mensaje: `${producto.nombre} se vende por rango de peso y la mascota no tiene peso registrado: confírmalo.` })
    else if (nOpc(pesoConfirmadoKg) == null && paciente.pesoDias != null && paciente.pesoDias > DIAS_PESO_VIGENTE) p.push({ tipo: 'peso_viejo', mensaje: `El último peso (${paciente.pesoKg} kg) tiene ${paciente.pesoDias} días: confírmalo antes de seguir.` })
    else {
      const min = nOpc(producto.pesoMinKg)
      const max = nOpc(producto.pesoMaxKg)
      if ((min != null && peso < min) || (max != null && peso > max)) p.push({ tipo: 'peso', mensaje: `${producto.nombre} es para ${min ?? 0}–${max ?? '∞'} kg y la mascota pesa ${peso} kg.` })
    }
  }
  const edadMin = nOpc(producto.edadMinMeses)
  if (edadMin != null && edadMin > 0 && paciente.edadMeses != null && paciente.edadMeses < edadMin) p.push({ tipo: 'edad', mensaje: `${producto.nombre} es a partir de ${edadMin} meses y la mascota tiene ${paciente.edadMeses}.` })
  const alergias = paciente.alergias ? normalizar(paciente.alergias) : ''
  if (alergias) {
    const terminosProducto = [producto.alergenos ?? '', producto.principioActivo ?? '']
      .join(',')
      .split(/[,;/]+/)
      .map(normalizar)
      .filter((x) => x.length >= 3)
    const terminosMascota = (paciente.alergias ?? '').split(/[,;/\n]+/).map(normalizar).filter((x) => x.length >= 3)
    const raiz = (x: string) => x.replace(/(es|s)$/, '')
    const choca = terminosProducto.find((tp) => terminosMascota.some((tm) => raiz(tp).includes(raiz(tm)) || raiz(tm).includes(raiz(tp))))
    if (choca) p.push({ tipo: 'alergia', mensaje: `La mascota es alérgica a algo que contiene ${producto.nombre} («${choca}»).` })
  }
  return p
}
