import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import React from 'react'

import { permisosDe, usaClinica, usaFarmacia, usaFinanzas } from '../../lib/permisos'
import { leerModulos } from '../../lib/modulos'
import MenuTrabajoEnlaces, { type EnlaceTrabajo } from './MenuTrabajoEnlaces'

/**
 * Bloque «Trabajo» arriba del menú lateral (Versión A, fase 2, nov-2026).
 *
 * Va en `admin.components.beforeNavLinks`, después de la marca: así lo que se
 * usa todo el día (Hoy, Agenda, Pacientes, Mostrador, Farmacia, Finanzas) queda
 * a un clic desde cualquier pantalla, antes de los grupos de catálogos de
 * Payload. Cada enlace aparece solo si el módulo está encendido y el rol lo usa.
 * Reemplaza a los antiguos EnlaceClinica / EnlaceFarmacia / EnlaceFinanzas.
 *
 * Los enlaces propios no reciben la marca de «activo» de Payload: la pone el
 * componente cliente (MenuTrabajoEnlaces) con `usePathname`.
 */
export default async function MenuTrabajo({ payload, user }: ServerProps) {
  if (!payload || !user) return null
  if ((user as { collection?: string }).collection && (user as { collection?: string }).collection !== 'users') return null
  const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
  const [p, modulos] = await Promise.all([permisosDe(req), leerModulos(payload)])
  const rutaAdmin = payload.config?.routes?.admin ?? '/admin'

  const conFarmacia = modulos.farmacia && usaFarmacia(p)
  /* Un solo conteo (barato, con índice por estado); si falla, el menú sale sin número. */
  let alertas = 0
  if (conFarmacia) {
    try {
      alertas = (await payload.count({ collection: 'far-alertas', overrideAccess: true, where: { estado: { equals: 'abierta' } } })).totalDocs
    } catch {
      alertas = 0
    }
  }

  const enlaces: EnlaceTrabajo[] = []
  if (p.panel) enlaces.push({ clave: 'hoy', texto: 'Hoy', href: rutaAdmin })
  if (modulos.clinica && p.clinica.agenda) enlaces.push({ clave: 'agenda', texto: 'Agenda', href: `${rutaAdmin}/clinica/agenda` })
  if (modulos.clinica && usaClinica(p)) enlaces.push({ clave: 'pacientes', texto: 'Pacientes', href: `${rutaAdmin}/clinica` })
  if (conFarmacia && p.farmacia.vender) enlaces.push({ clave: 'mostrador', texto: 'Mostrador', href: `${rutaAdmin}/farmacia/vender` })
  if (conFarmacia) enlaces.push({ clave: 'farmacia', texto: 'Farmacia', href: `${rutaAdmin}/farmacia`, contador: alertas || undefined })
  if (usaFinanzas(p)) enlaces.push({ clave: 'finanzas', texto: 'Finanzas', href: `${rutaAdmin}/finanzas` })
  if (!enlaces.length) return null

  return <MenuTrabajoEnlaces enlaces={enlaces} rutaAdmin={rutaAdmin} />
}
