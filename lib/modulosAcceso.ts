import type { Access, CollectionConfig, GlobalConfig } from 'payload'
import { type Modulo, moduloActivo } from './modulos'

/**
 * Envuelve las reglas de acceso de una colección o global para que, con el
 * módulo apagado (lib/modulos.ts), todo responda «no»: así Payload esconde
 * la colección del menú del panel y la API genérica responde 403, sin tocar
 * las reglas propias de cada módulo. Con el módulo encendido, nada cambia.
 */

const OPERACIONES = ['read', 'create', 'update', 'delete', 'readVersions', 'unlock'] as const

function envolver(modulo: Modulo, original: Access | undefined): Access {
  return async (args) => {
    if (!(await moduloActivo(args.req, modulo))) return false
    return original ? original(args) : Boolean(args.req.user)
  }
}

export function conModuloColeccion(modulo: Modulo, c: CollectionConfig): CollectionConfig {
  const access = { ...(c.access ?? {}) } as Record<string, Access | undefined>
  for (const op of OPERACIONES) {
    if (op === 'unlock' && !access[op]) continue
    access[op] = envolver(modulo, access[op])
  }
  return { ...c, access: access as CollectionConfig['access'] }
}

export function conModuloGlobal(modulo: Modulo, g: GlobalConfig): GlobalConfig {
  const access = { ...(g.access ?? {}) } as Record<string, Access | undefined>
  for (const op of ['read', 'update', 'readVersions'] as const) access[op] = envolver(modulo, access[op])
  return { ...g, access: access as GlobalConfig['access'] }
}
