import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import React from 'react'

import { catalogo, contextoDesdeReq } from '../../../lib/clinica/servicio'
import { usaClinica } from '../../../lib/permisos'
import { site } from '../../../lib/site'
import AppClinica from './AppClinica'

/**
 * Pacientes y expediente dentro del panel (octubre de 2026).
 *
 * Payload manda aquí todo lo que empiece con /admin/clinica (payload.config.ts).
 * Igual que VistaFinanzas: pide sesión del equipo, calcula permisos y pinta la
 * app dentro del panel (con menú) si el rol entra al panel completo, o sola si
 * no (un médico o recepción que solo usan la clínica y Finanzas).
 */
export default async function VistaClinica({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  const segmentos = Array.isArray(params?.segments) ? (params.segments as string[]) : []
  const ruta = segmentos.slice(segmentos.indexOf('clinica') + 1)

  if (!req.user) {
    const vuelta = `${rutaAdmin}/${segmentos.join('/')}`
    redirect(`${rutaAdmin}/login?redirect=${encodeURIComponent(vuelta)}`)
  }

  const ctx = await contextoDesdeReq(req)
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === 'string') query[k] = v

  const plantilla = (hijos: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{hijos}</Gutter>
    </DefaultTemplate>
  )

  if (!ctx || !usaClinica(ctx.p)) {
    const aviso = (
      <div className="fz-app">
        <div className="fz-aviso fz-aviso--info" style={{ marginTop: 24 }}>
          <div>Tu rol no incluye pacientes ni expediente. Si lo necesitas, pídelo a un dueño o al superadministrador (Usuarios → Rol de acceso).</div>
        </div>
      </div>
    )
    return ctx?.p.panel ? plantilla(aviso) : aviso
  }

  const app = <AppClinica catalogo={await catalogo(ctx)} ruta={ruta} query={query} rutaAdmin={rutaAdmin} marca={{ wordmark: '/logo-mark-white.png', nombre: site.brand.name }} />
  return ctx.p.panel ? plantilla(app) : app
}
