'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { InsigniaServicio } from '../IconoServicio'
import type { ClaveIcono } from '../../lib/iconosServicio'

/**
 * «¿Qué necesita hoy tu mascota?» (home versión B, nov-2026): una píldora por
 * área del catálogo y, debajo, sus servicios. Todas las áreas van en el HTML
 * (las que no están elegidas, con `hidden`): sin JavaScript se ve la primera y
 * los buscadores leen todas.
 */
export type AreaSitio = {
  nombre: string
  /** Liga de WhatsApp con el área en el mensaje, o null si la clínica no capturó su número. */
  whatsapp: string | null
  servicios: { id: number; nombre: string; detalle: string; descripcion: string | null; enLinea: boolean; icono: ClaveIcono }[]
  /** Cuántos servicios más tiene el área (se ven en /servicios). */
  mas: number
}

export function Areas({ areas }: { areas: AreaSitio[] }) {
  const [elegida, setElegida] = useState(0)
  return (
    <div className="st-areas">
      {areas.length > 1 && (
        <div className="st-areas__pildoras" role="group" aria-label="Áreas de servicio">
          {areas.map((a, i) => (
            <button key={a.nombre} type="button" className={`st-pildora${i === elegida ? ' is-on' : ''}`} aria-pressed={i === elegida} onClick={() => setElegida(i)}>
              {a.nombre}
            </button>
          ))}
        </div>
      )}
      {areas.map((a, i) => (
        <div key={a.nombre} className="st-area" hidden={i !== elegida}>
          <div className="st-area__cab">
            <h3>{a.nombre}</h3>
            <div className="st-area__acciones">
              {a.whatsapp && (
                <a href={a.whatsapp} target="_blank" rel="noreferrer" className="st-btn st-btn--acento">
                  <svg className="st-i" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z" />
                  </svg>
                  Preguntar por WhatsApp
                </a>
              )}
              <Link href="/servicios" className="st-enlace">
                {a.mas > 0 ? `Ver los ${a.servicios.length + a.mas} servicios y precios` : 'Ver precios y detalles'}
              </Link>
            </div>
          </div>
          <ul className="st-area__lista">
            {a.servicios.map((s) => (
              <li key={s.id}>
                <Link href={s.enLinea ? `/portal/citas/nueva?servicio=${s.id}` : `/servicios#s-${s.id}`} className="st-fila">
                  <InsigniaServicio clave={s.icono} />
                  <span className="st-fila__txt">
                    <b>{s.nombre}</b>
                    <span>{s.detalle}</span>
                  </span>
                  <span className="st-fila__ir">{s.enLinea ? 'Pedir cita' : 'Ver detalles'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
