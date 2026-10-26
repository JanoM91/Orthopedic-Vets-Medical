import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import React from 'react'

import { catalogo, contextoDesdeReq, usaFarmacia } from '../../../lib/farmacia/servicio'
import { site } from '../../../lib/site'
import AppFarmacia from './AppFarmacia'

/**
 * Farmacia dentro del panel (25-oct-2026, docs/FARMACIA-PROMPT.md).
 *
 * Payload manda aquí todo lo que empiece con /admin/farmacia (payload.config.ts).
 * Igual que VistaClinica: pide sesión del equipo, calcula permisos y pinta la
 * app dentro del panel (con menú) si el rol entra al panel completo, o sola si
 * no (un encargado o vendedor que solo usan la farmacia).
 */
export default async function VistaFarmacia({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  const segmentos = Array.isArray(params?.segments) ? (params.segments as string[]) : []
  const ruta = segmentos.slice(segmentos.indexOf('farmacia') + 1)

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

  if (!ctx || !ctx.modulos.farmacia || !usaFarmacia(ctx.p)) {
    const aviso = (
      <div className="fz-app">
        <div className="fz-aviso fz-aviso--info" style={{ marginTop: 24 }}>
          <div>
            {ctx && !ctx.modulos.farmacia
              ? 'El módulo de Farmacia está apagado en esta instalación. El superadministrador lo enciende en Sistema → Instalación: módulos.'
              : 'Tu rol no incluye la farmacia. Si la necesitas, pídela a un dueño o al superadministrador (Usuarios → Rol de acceso).'}
          </div>
        </div>
      </div>
    )
    return ctx?.p.panel ? plantilla(aviso) : aviso
  }

  const app = <AppFarmacia catalogo={await catalogo(ctx)} ruta={ruta} query={query} rutaAdmin={rutaAdmin} marca={{ wordmark: '/logo-mark-white.png', nombre: site.brand.name }} />
  return ctx.p.panel ? plantilla(app) : app
}
