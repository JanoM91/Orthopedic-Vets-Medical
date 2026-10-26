import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import { Link } from '@payloadcms/ui'
import React from 'react'
import { permisosDe, usaFarmacia } from '../../lib/permisos'
import { leerModulos } from '../../lib/modulos'

/** Enlace «Farmacia» en el menú del panel. Solo si el módulo está encendido y el rol la usa. */
export default async function EnlaceFarmacia({ payload, user }: ServerProps) {
  if (!payload || !user) return null
  if (!(await leerModulos(payload)).farmacia) return null
  const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
  const p = await permisosDe(req)
  if (!usaFarmacia(p)) return null
  const rutaAdmin = payload.config?.routes?.admin ?? '/admin'
  return (
    <>
      <div className="mx-nav-etiqueta">Farmacia</div>
      <Link className="nav__link" href={`${rutaAdmin}/farmacia`}>
        <span className="nav__link-label">Inicio de farmacia</span>
      </Link>
      <Link className="nav__link" href={`${rutaAdmin}/farmacia/productos`}>
        <span className="nav__link-label">Productos</span>
      </Link>
      <Link className="nav__link" href={`${rutaAdmin}/farmacia/inventario`}>
        <span className="nav__link-label">Inventario</span>
      </Link>
    </>
  )
}
