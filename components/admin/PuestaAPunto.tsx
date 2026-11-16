import type { AdminViewServerProps, PayloadRequest } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { leerModulos } from '../../lib/modulos'
import { permisosDe } from '../../lib/permisos'
import { type EstadoPaso, puestaAPunto } from '../../lib/puestaAPunto'

/**
 * Sistema → Puesta a punto (UX del panel 2, nov-2026): `docs/ARRANQUE.md`
 * revisado contra la base. Solo lee; cada paso lleva a la pantalla donde se
 * resuelve. La ven quienes administran usuarios (dueño y superadmin).
 */

const ETIQUETA: Record<EstadoPaso, string> = { listo: 'Listo', falta: 'Falta', revisa: 'Revisa', opcional: 'Opcional' }

export default async function VistaPuestaAPunto({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const req = initPageResult.req as PayloadRequest
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  if (!req.user) redirect(`${rutaAdmin}/login?redirect=${encodeURIComponent(`${rutaAdmin}/puesta-a-punto`)}`)

  const p = await permisosDe(req)
  const soloPendientes = searchParams?.ver === 'pendientes'

  let cuerpo: React.ReactNode
  if ((req.user as { collection?: string }).collection !== 'users' || !p.gestionarUsuarios) {
    cuerpo = (
      <div className="fz-aviso fz-aviso--info" style={{ marginTop: 24 }}>
        <div>La puesta a punto la revisan los dueños o el superadministrador.</div>
      </div>
    )
  } else {
    const r = await puestaAPunto(req.payload, await leerModulos(req.payload), rutaAdmin)
    const pct = r.total ? Math.round((r.listos / r.total) * 100) : 100
    cuerpo = (
      <div className="fz-app pap">
        <header className="pap__cabecera">
          <div>
            <p className="fz-eyebrow">Sistema</p>
            <h1 className="fz-h1">Puesta a punto</h1>
            <p className="fz-tenue fz-chico">Lo que falta para operar con datos reales. Se revisa cada vez que abres esta página.</p>
          </div>
          <Link className="fz-btn fz-btn--claro fz-btn--chico" href={soloPendientes ? `${rutaAdmin}/puesta-a-punto` : `${rutaAdmin}/puesta-a-punto?ver=pendientes`}>
            {soloPendientes ? 'Ver todo' : 'Solo lo pendiente'}
          </Link>
        </header>

        <section className="fz-tarjeta pap__avance" aria-label="Avance">
          <div className="fz-entre">
            <b>{r.pendientes === 0 ? 'Todo listo' : `${r.listos} de ${r.total} listos`}</b>
            <span className="fz-chico fz-tenue">{r.pendientes === 0 ? 'Los opcionales mejoran la operación.' : `${r.pendientes} por resolver`}</span>
          </div>
          <div className="pap__barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Pasos listos">
            <span style={{ width: `${pct}%` }} />
          </div>
        </section>

        {r.secciones.map((s) => {
          const contables = s.pasos.filter((x) => x.estado !== 'opcional')
          const hechos = contables.filter((x) => x.estado === 'listo').length
          const pasos = soloPendientes ? s.pasos.filter((x) => x.estado === 'falta' || x.estado === 'revisa') : s.pasos
          if (!pasos.length) return null
          return (
            <section key={s.clave} className="fz-tarjeta pap__seccion" aria-labelledby={`pap-${s.clave}`}>
              <div className="fz-entre pap__titulo">
                <h2 className="fz-h2" id={`pap-${s.clave}`}>
                  {s.titulo}
                </h2>
                {contables.length > 0 && (
                  <span className={`pap__cuenta${hechos === contables.length ? ' is-completa' : ''}`}>
                    {hechos}/{contables.length}
                  </span>
                )}
              </div>
              <ul className="pap__pasos">
                {pasos.map((x) => (
                  <li key={x.clave} className={`pap__paso is-${x.estado}`}>
                    <span className={`pap__estado pap__estado--${x.estado}`}>{ETIQUETA[x.estado]}</span>
                    <span className="pap__texto">
                      <b>{x.titulo}</b>
                      <span className="fz-chico fz-tenue">{x.detalle}</span>
                    </span>
                    {x.href && x.accion ? (
                      <Link className={`fz-btn fz-btn--chico ${x.estado === 'falta' ? 'fz-btn--navy' : 'fz-btn--claro'}`} href={x.href}>
                        {x.estado === 'listo' ? 'Abrir' : x.accion}
                      </Link>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        <p className="fz-chico fz-tenue">
          Guía completa en <code>docs/ARRANQUE.md</code>. Las variables del servidor solo se revisan por presencia; sus valores no salen de Vercel.
        </p>
      </div>
    )
  }

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      /* Sin `req`, el menú no lee la preferencia `nav` y abre todos los grupos. */
      req={req}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{cuerpo}</Gutter>
    </DefaultTemplate>
  )
}
