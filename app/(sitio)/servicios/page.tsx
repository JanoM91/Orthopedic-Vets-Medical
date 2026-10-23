import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import { BotonesCita, Cabecera, Pie } from '../../../components/sitio/Piezas'
import { contenidoSitio } from '../../../lib/sitio/contenido'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Servicios' }

export default async function Servicios() {
  const c = await contenidoSitio()
  if (!c.publicado) notFound()
  return (
    <>
      <Cabecera c={c} activa="servicios" />
      <main className="st-main">
        <h1>Servicios</h1>
        <p className="st-tenue">Duración y precio son de referencia; el médico confirma en la valoración.</p>
        {c.grupos.map((g) => (
          <section key={g.area} className="st-sec--compacta">
            <h2>{g.area}</h2>
            <div className="st-servicios">
              {g.servicios.map((s) => (
                <article key={s.id} id={`s-${s.id}`} className="st-card">
                  <h3>{s.nombre}</h3>
                  <p className="st-tenue st-chico">
                    ≈ {s.duracionMin} min{s.precio ? ` · $${s.precio.toLocaleString('es-MX')}` : ''}
                    {!s.enLinea ? ' · se agenda por teléfono' : ''}
                  </p>
                  {s.descripcion && <p>{s.descripcion}</p>}
                  {s.indicaciones && (
                    <p className="st-chico">
                      <b>Antes de venir:</b> {s.indicaciones}
                    </p>
                  )}
                  {s.enLinea && (
                    <Link href="/portal/citas/nueva" className="st-btn st-btn--acento st-btn--chico">
                      Pedir cita
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
        {c.grupos.length === 0 && <p className="st-tenue">Pronto publicaremos nuestros servicios.</p>}
        <BotonesCita c={c} />
      </main>
      <Pie c={c} />
    </>
  )
}
