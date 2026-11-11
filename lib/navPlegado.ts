import type { CollectionAfterLoginHook, Payload } from 'payload'

/**
 * Grupos de catálogos del menú plegados por omisión (Versión A, fase 2).
 *
 * Payload 3 abre cada grupo del menú (Sistema, Clínica, Farmacia, Finanzas)
 * salvo que la preferencia `nav` de la persona diga lo contrario, y no tiene
 * opción para «cerrado por omisión». Al iniciar sesión, este gancho escribe
 * `open: false` en cada grupo que la persona nunca ha tocado. Lo que ya abrió
 * o cerró a mano se respeta (si abre un grupo, sigue abierto en la siguiente
 * sesión).
 *
 * Es solo comodidad: si falla, el inicio de sesión sigue igual.
 * El efecto se ve desde el siguiente inicio de sesión (las sesiones abiertas
 * conservan el menú como estaba hasta salir y volver a entrar).
 */

type PrefNav = { groups?: Record<string, { open?: boolean }>; [k: string]: unknown }

/** Etiquetas de grupo que usa la instalación (de `admin.group` en colecciones y globales visibles). */
export function gruposDelMenu(payload: Payload): string[] {
  const etiquetas = new Set<string>()
  const revisar = (admin: { group?: unknown; hidden?: unknown } | undefined) => {
    if (!admin || admin.hidden === true) return
    if (typeof admin.group === 'string' && admin.group.trim()) etiquetas.add(admin.group)
  }
  for (const c of payload.config.collections ?? []) revisar(c.admin as { group?: unknown; hidden?: unknown } | undefined)
  for (const g of payload.config.globals ?? []) revisar(g.admin as { group?: unknown; hidden?: unknown } | undefined)
  return [...etiquetas]
}

/** Devuelve la preferencia con los grupos faltantes cerrados, o null si no hay nada que cambiar (puro). */
export function plegarFaltantes(actual: PrefNav | null | undefined, grupos: string[]): PrefNav | null {
  const base: PrefNav = actual && typeof actual === 'object' ? actual : {}
  const previos = base.groups && typeof base.groups === 'object' ? base.groups : {}
  const faltan = grupos.filter((g) => typeof previos[g]?.open !== 'boolean')
  if (!faltan.length) return null
  return { ...base, groups: { ...previos, ...Object.fromEntries(faltan.map((g) => [g, { open: false }])) } }
}

export const plegarMenuAlEntrar: CollectionAfterLoginHook = async ({ collection, req, user }) => {
  try {
    const grupos = gruposDelMenu(req.payload)
    if (!grupos.length || !user?.id) return user
    const encontrado = await req.payload.find({
      collection: 'payload-preferences',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: { and: [{ key: { equals: 'nav' } }, { 'user.relationTo': { equals: collection.slug } }, { 'user.value': { equals: user.id } }] },
    })
    const doc = encontrado.docs[0] as { id: number | string; value?: PrefNav } | undefined
    const nuevo = plegarFaltantes(doc?.value, grupos)
    if (!nuevo) return user
    if (doc) {
      await req.payload.update({ collection: 'payload-preferences', id: doc.id, data: { value: nuevo }, overrideAccess: true, req, depth: 0 })
    } else {
      await req.payload.create({ collection: 'payload-preferences', data: { key: 'nav', user: { relationTo: collection.slug as 'users' | 'tutores', value: user.id }, value: nuevo }, overrideAccess: true, req, depth: 0 })
    }
  } catch (e) {
    req.payload.logger.warn({ err: e, msg: 'No se pudo plegar el menú al iniciar sesión.' })
  }
  return user
}
