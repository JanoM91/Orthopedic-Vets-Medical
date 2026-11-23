import type { Metadata } from 'next'
import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { internamientoPorLiga, type InternamientoTutor } from '../../../../../lib/clinica/hospital'
import { ErrorClinica } from '../../../../../lib/clinica/servicio'
import { site } from '../../../../../lib/site'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Así sigue tu mascota', robots: { index: false, follow: false } }

const cuando = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: site.location.timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })

/**
 * Partes de hospitalización para el tutor (nov-2026): liga sin cuenta que
 * manda la clínica (también sale en «Pendientes» de su app). Solo partes y,
 * al alta, indicaciones para casa: nunca medicamentos, dosis ni cargos.
 */
export default async function HospitalTutor({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params
  let h: InternamientoTutor | null = null
  let error: string | null = null
  try {
    h = await internamientoPorLiga(await getPayload({ config }), Number(id), token)
  } catch (e) {
    error = e instanceof ErrorClinica ? e.message : 'No pudimos abrir esta página.'
  }
  return (
    <>
      <header className="st-cabecera">
        <div className="st-wrap st-cabecera__in">
          <span className="st-marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" />
            <span>{site.brand.name}</span>
          </span>
        </div>
      </header>
      <main className="st-main st-presupuesto">
        {!h ? (
          <div className="st-card">
            <h1>No disponible</h1>
            <p className="st-tenue">{error}</p>
          </div>
        ) : (
          <>
            <p className="st-eyebrow">
              {h.estado === 'internado' ? `Hospitalización · día ${h.dias}` : `Alta · ${h.dias} día${h.dias === 1 ? '' : 's'} internada`}
            </p>
            <h1>Así sigue {h.mascota}</h1>
            <p className="st-tenue">{h.motivo}</p>
            {h.estado === 'alta' && h.indicacionesAlta && (
              <section className="st-card st-pre-aviso--ok">
                <h2>Indicaciones para casa</h2>
                <p className="st-pre-texto">{h.indicacionesAlta}</p>
              </section>
            )}
            {h.partes.length === 0 && (
              <div className="st-card">
                <p className="st-tenue">Todavía no hay partes. En cuanto el médico revise a {h.mascota}, aquí verás cómo sigue.</p>
              </div>
            )}
            {h.partes.map((p) => (
              <article key={p.indice} className="st-card st-hos-parte">
                <p className="st-chico st-tenue">{cuando(p.en)}</p>
                <p className="st-pre-texto">{p.texto}</p>
                {p.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.foto} alt={`Foto de ${h.mascota}`} loading="lazy" />
                )}
              </article>
            ))}
            {h.telefono && (
              <p className="st-chico st-tenue">
                ¿Dudas? Llama a la clínica: <a href={`tel:${h.telefono.replace(/\s+/g, '')}`}>{h.telefono}</a>
              </p>
            )}
          </>
        )}
      </main>
    </>
  )
}
