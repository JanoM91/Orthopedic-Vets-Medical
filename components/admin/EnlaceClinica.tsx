import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import { Link } from '@payloadcms/ui'
import React from 'react'
import { permisosDe, usaClinica } from '../../lib/permisos'

/** Enlace «Pacientes» en el menú del panel. Solo si el rol usa la clínica. */
export default async function EnlaceClinica({ payload, user }: ServerProps) {
  if (!payload || !user) return null
  const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
  const p = await permisosDe(req)
  if (!usaClinica(p)) return null
  const rutaAdmin = payload.config?.routes?.admin ?? '/admin'
  return (
    <>
      <div className="mx-nav-etiqueta">Clínica</div>
      <Link className="nav__link" href={`${rutaAdmin}/clinica`}>
        <span className="nav__link-label">Pacientes y expediente</span>
      </Link>
      {p.clinica.importar && (
        <Link className="nav__link" href={`${rutaAdmin}/clinica/importar`}>
          <span className="nav__link-label">Importar archivo</span>
        </Link>
      )}
    </>
  )
}
