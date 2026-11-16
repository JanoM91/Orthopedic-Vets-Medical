import type { Payload } from 'payload'

import type { EstAdicional, Mascota, Servicio } from '../../payload-types'
import { TALLAS, type Talla } from '../../collections/clinica/estetica'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { leerModulos } from '../modulos'
import { ErrorClinica } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Estética · E1: talla, precio, duración y adicionales (nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Con el módulo «estetica» encendido, un servicio marcado «de estética» toma
 * precio y duración de la TALLA de la mascota:
 *   - talla fijada a mano en la mascota (`tallaEstetica`), o
 *   - su último peso contra los límites de `estetica-configuracion`
 *     (por omisión chica ≤ 10 kg, mediana ≤ 25, grande ≤ 40, gigante más).
 * Una talla sin precio o sin duración usa los del servicio. Los adicionales
 * suman precio y minutos. Al agendar se guarda lo pactado en `citas.estetica`
 * y el cargo en Finanzas usa ese total.
 *
 * Sin talla (sin peso ni talla fijada) la cita se puede pedir: dura lo del
 * servicio y el precio queda «por confirmar»; al finalizar se vuelve a
 * calcular y, si sigue sin talla, no se puede cobrar hasta capturar el peso.
 */

export const NOMBRE_TALLA: Record<Talla, string> = Object.fromEntries(TALLAS.map((t) => [t.value, t.label])) as Record<Talla, string>

export type ConfigEstetica = { activa: boolean; nombreMarca: string; logo: string | null; limites: { chico: number; mediano: number; grande: number } }

export type AdicionalVista = { id: number; nombre: string; descripcion: string | null; precio: number; duracionMin: number; enLinea: boolean; activo: boolean }

export type Cotizacion = {
  talla: Talla | null
  /** Cómo salió la talla. */
  origenTalla: 'fijada' | 'peso' | null
  pesoKg: number | null
  duracionMin: number
  precioBase: number | null
  adicionales: { id: number; nombre: string; precio: number; duracionMin: number }[]
  /** null = por confirmar (sin talla y sin precio general). */
  total: number | null
}

export async function configEstetica(payload: Payload): Promise<ConfigEstetica> {
  const m = await leerModulos(payload)
  const g = (await payload.findGlobal({ slug: 'estetica-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as { nombreMarca?: string | null; logo?: string | null; tallas?: { chicoHasta?: number | null; medianoHasta?: number | null; grandeHasta?: number | null } } | null
  const chico = Number(g?.tallas?.chicoHasta) || 10
  const mediano = Math.max(chico, Number(g?.tallas?.medianoHasta) || 25)
  const grande = Math.max(mediano, Number(g?.tallas?.grandeHasta) || 40)
  return { activa: m.clinica && m.estetica, nombreMarca: g?.nombreMarca?.trim() || 'Estética', logo: g?.logo?.trim() || null, limites: { chico, mediano, grande } }
}

export function tallaDePeso(kg: number | null | undefined, l: ConfigEstetica['limites']): Talla | null {
  if (kg == null || !(kg > 0)) return null
  if (kg <= l.chico) return 'chico'
  if (kg <= l.mediano) return 'mediano'
  if (kg <= l.grande) return 'grande'
  return 'gigante'
}

export async function tallaDeMascota(payload: Payload, mascota: Pick<Mascota, 'id' | 'tallaEstetica'>, cfg: ConfigEstetica): Promise<{ talla: Talla | null; origen: Cotizacion['origenTalla']; pesoKg: number | null }> {
  const r = await payload.find({ collection: 'mas-pesos', depth: 0, limit: 1, overrideAccess: true, sort: ['-fecha', '-createdAt'], where: { mascota: { equals: mascota.id } } })
  const pesoKg = r.docs[0]?.kg ?? null
  if (mascota.tallaEstetica) return { talla: mascota.tallaEstetica, origen: 'fijada', pesoKg }
  const t = tallaDePeso(pesoKg, cfg.limites)
  return { talla: t, origen: t ? 'peso' : null, pesoKg }
}

export const vistaAdicional = (a: EstAdicional): AdicionalVista => ({ id: a.id, nombre: a.nombre, descripcion: a.descripcion ?? null, precio: a.precio, duracionMin: a.duracionMin ?? 0, enLinea: a.enLinea !== false, activo: a.activo !== false })

export async function adicionales(payload: Payload, soloEnLinea = false): Promise<AdicionalVista[]> {
  const r = await payload.find({ collection: 'est-adicionales', depth: 0, pagination: false, overrideAccess: true, sort: 'orden', where: { and: [{ activo: { equals: true } }, ...(soloEnLinea ? [{ enLinea: { equals: true } }] : [])] } })
  return r.docs.map(vistaAdicional)
}

/** ¿Este servicio se cotiza por talla? (módulo encendido y servicio marcado). */
export const esServicioEstetica = (s: Pick<Servicio, 'estetica'>, cfg: ConfigEstetica) => cfg.activa && Boolean(s.estetica)

/** Precio y duración por talla del servicio (sin adicionales). */
export function porTalla(s: Pick<Servicio, 'precio' | 'duracionMin' | 'preciosTalla' | 'duracionTalla'>, talla: Talla | null): { precio: number | null; duracionMin: number } {
  const precio = talla ? (s.preciosTalla?.[talla] ?? null) : null
  const dur = talla ? (s.duracionTalla?.[talla] ?? null) : null
  return { precio: precio != null && precio > 0 ? precio : (s.precio ?? null), duracionMin: dur && dur > 0 ? dur : s.duracionMin }
}

/**
 * Cotiza un servicio de estética para una mascota con adicionales.
 * `soloEnLinea`: el tutor solo puede elegir adicionales marcados «en línea».
 */
export async function cotizar(payload: Payload, servicio: Servicio, mascota: Pick<Mascota, 'id' | 'tallaEstetica'>, adicionalesIds: number[], opciones: { soloEnLinea?: boolean; cfg?: ConfigEstetica } = {}): Promise<Cotizacion> {
  const cfg = opciones.cfg ?? (await configEstetica(payload))
  if (!esServicioEstetica(servicio, cfg)) throw new ErrorClinica(400, 'Ese servicio no es de estética.')
  const { talla, origen, pesoKg } = await tallaDeMascota(payload, mascota, cfg)
  const base = porTalla(servicio, talla)
  const ids = [...new Set(adicionalesIds)].slice(0, 10)
  const lista = ids.length ? (await payload.find({ collection: 'est-adicionales', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } })).docs : []
  if (lista.length !== ids.length || lista.some((a) => a.activo === false || (opciones.soloEnLinea && a.enLinea === false))) throw new ErrorClinica(400, 'Uno de los adicionales ya no está disponible.')
  const ads = lista.map((a) => ({ id: a.id, nombre: a.nombre, precio: a.precio, duracionMin: a.duracionMin ?? 0 }))
  /* Sin precio del servicio para esa talla (ni general), el total queda por confirmar aunque haya adicionales. */
  const total = base.precio == null ? null : aPesos((aCentavos(base.precio) || 0) + ads.reduce((s, a) => s + (aCentavos(a.precio) || 0), 0))
  return { talla, origenTalla: origen, pesoKg, duracionMin: base.duracionMin + ads.reduce((s, a) => s + a.duracionMin, 0), precioBase: base.precio, adicionales: ads, total }
}

/** Lo que se guarda en `citas.estetica`. */
export const datosCita = (c: Cotizacion) => ({ cotizada: true, talla: c.talla, precioBase: c.precioBase, total: c.total, adicionales: c.adicionales.map((a) => ({ adicional: a.id, nombre: a.nombre, precio: a.precio, duracionMin: a.duracionMin })) })

/** «Desde $X» de un servicio de estética: el precio más bajo entre tallas y general. */
export function precioDesde(s: Pick<Servicio, 'precio' | 'preciosTalla'>): number | null {
  const v = [s.precio, ...Object.values(s.preciosTalla ?? {})].filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length ? Math.min(...v) : null
}

/** Para el portal y el sitio: marca de la estética. */
export async function marcaEstetica(payload: Payload): Promise<{ activa: boolean; nombre: string; logo: string | null }> {
  const c = await configEstetica(payload)
  return { activa: c.activa, nombre: c.nombreMarca, logo: c.logo }
}
