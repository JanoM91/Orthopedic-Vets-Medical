import type { Access, FieldAccess, PayloadRequest } from 'payload'
import { esPersonal, permisosDe, usaFarmacia } from '../../lib/permisos'
import type { PermisosFarmacia } from '../../lib/permisosBase'
import { moduloActivo } from '../../lib/modulos'

/**
 * Reglas de acceso de las colecciones de la farmacia (octubre de 2026,
 * docs/FARMACIA-PROMPT.md).
 *
 * Solo el equipo (colección «users») entra aquí, según las casillas del grupo
 * «Farmacia» de su rol (lib/permisosBase.ts → farmacia). Los tutores del
 * portal y los visitantes no leen nada por la API genérica: la tienda digital
 * (fase 5) expondrá lo público por su propia API.
 *
 * Igual que en la clínica, estas reglas no tienen efectos: Payload las evalúa
 * al calcular permisos de cualquier visitante en cada página. Si el módulo de
 * Farmacia está apagado en «instalacion-configuracion», todo responde «no».
 */

export type PermisoFarmacia = keyof PermisosFarmacia

/** Equipo con esa casilla y el módulo encendido. */
export const farmaciaCon = (permiso: PermisoFarmacia): Access => async ({ req }) => {
  if (!esPersonal(req)) return false
  if (!(await moduloActivo(req, 'farmacia'))) return false
  return (await permisosDe(req)).farmacia[permiso]
}

/** Equipo con cualquier casilla de Farmacia (ver catálogo, existencias, proveedores…). */
export const equipoFarmacia: Access = async ({ req }) => {
  if (!esPersonal(req)) return false
  if (!(await moduloActivo(req, 'farmacia'))) return false
  return usaFarmacia(await permisosDe(req))
}

export const nadie: Access = () => false

/**
 * Costos y márgenes: solo con «Ver costos». Es acceso de CAMPO: Payload quita
 * el campo de la respuesta de la API genérica y de la API local sin
 * `overrideAccess`. El servicio (lib/farmacia/servicio.ts) además los quita
 * de sus vistas cuando arma respuestas con `overrideAccess: true`.
 */
export const leeCostos: FieldAccess = async ({ req }) => esPersonal(req) && (await permisosDe(req)).farmacia.verCostos

/** Campos que solo el sistema escribe (existencias, folios): nadie los edita por la API. */
export const soloSistema: FieldAccess = () => false

export const esEquipo = (req: PayloadRequest): boolean => esPersonal(req)

/** Fecha AAAA-MM-DD válida u omitida (misma regla que la clínica). */
export const validarFecha = (v: unknown, opcional = true) => {
  if (v == null || v === '') return opcional ? true : 'Escribe la fecha como AAAA-MM-DD.'
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Escribe la fecha como AAAA-MM-DD, por ejemplo 2027-05-31.'
  const [y, m, d] = v.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? true : 'Esa fecha no existe.'
}

export const folioParaId = (prefijo: string, id: number | string): string => `${prefijo}-${String(id).padStart(5, '0')}`
