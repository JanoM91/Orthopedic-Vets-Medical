import type { Metadata } from 'next'
import React from 'react'
import { presupuestoPorLiga, type PresupuestoVista } from '../../../../../lib/clinica/cirugia'
import { ErrorClinica } from '../../../../../lib/clinica/servicio'
import { diaLocal } from '../../../../../lib/localTime'
import { site } from '../../../../../lib/site'
import { fechaLarga } from '../../../../../lib/whatsapp'
import { getPayload } from 'payload'
import config from '@payload-config'
import { FirmarPresupuesto } from '../../../../../components/sitio/FirmarPresupuesto'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Presupuesto de cirugía', robots: { index: false, follow: false } }

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

/**
 * Presupuesto de cirugía para el tutor (nov-2026): lo abre con la liga que le
 * mandó la clínica (sin cuenta), revisa el detalle y el consentimiento, y firma
 * con el dedo o lo rechaza. Ya firmado, muestra la constancia para imprimir.
 */
export default async function PresupuestoTutor({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params
  const payload = await getPayload({ config })
  let v: (PresupuestoVista & { texto: string; firma: string | null }) | null = null
  let error: string | null = null
  try {
    v = await presupuestoPorLiga(payload, Number(id), token, diaLocal(new Date()))
  } catch (e) {
    error = e instanceof ErrorClinica ? e.message : 'No pudimos abrir este presupuesto.'
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
        {!v ? (
          <div className="st-card">
            <h1>Presupuesto no disponible</h1>
            <p className="st-tenue">{error}</p>
          </div>
        ) : (
          <>
            <p className="st-eyebrow">
              Presupuesto {v.folio} · {v.mascota.nombre}
            </p>
            <h1>{v.procedimiento}</h1>
            {v.medico && <p className="st-tenue">Médico a cargo: {v.medico.nombre}</p>}
            {v.estado === 'aceptado' && v.consentimiento && (
              <div className="st-pre-aviso st-pre-aviso--ok" role="status">
                Firmado por <b>{v.consentimiento.nombreFirmante}</b> el {new Date(v.consentimiento.firmadoEn).toLocaleString('es-MX', { timeZone: site.location.timeZone, dateStyle: 'long', timeStyle: 'short' })}
                <br />
                La clínica te contactará para la fecha de la cirugía.
              </div>
            )}
            {v.estado === 'vencido' && <div className="st-pre-aviso st-pre-aviso--malo">Este presupuesto venció el {fechaLarga(v.vence!)}. Pide a la clínica que te lo envíe de nuevo.</div>}
            {v.estado === 'rechazado' && <div className="st-pre-aviso">Nos dijiste que por ahora no. Si cambias de opinión, escríbenos.</div>}
            {v.explicacion && (
              <section className="st-card">
                <h2>Qué se va a hacer</h2>
                <p className="st-pre-texto">{v.explicacion}</p>
              </section>
            )}
            <section className="st-card">
              <h2>Presupuesto</h2>
              <ul className="st-pre-renglones">
                {v.renglones.map((r, i) => (
                  <li key={i}>
                    <span>
                      {r.concepto}
                      {r.cantidad !== 1 ? <span className="st-tenue"> × {r.cantidad}</span> : null}
                    </span>
                    <b>{pesos(r.importe)}</b>
                  </li>
                ))}
                <li className="st-pre-total">
                  <span>Total</span>
                  <b>{pesos(v.total)}</b>
                </li>
                {v.anticipo ? (
                  <li>
                    <span>Anticipo para apartar la fecha</span>
                    <b>{pesos(v.anticipo)}</b>
                  </li>
                ) : null}
              </ul>
              {v.vence && v.estado === 'enviado' && <p className="st-chico st-tenue">Vigente hasta el {fechaLarga(v.vence)}.</p>}
            </section>
            {v.indicaciones && (
              <section className="st-card">
                <h2>Antes de la cirugía</h2>
                <p className="st-pre-texto">{v.indicaciones}</p>
              </section>
            )}
            <section className="st-card">
              <h2>Consentimiento informado</h2>
              <div className="st-pre-texto st-pre-consentimiento">{v.texto}</div>
              {v.estado === 'aceptado' && v.firma && (
                <div className="st-pre-firmada">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.firma} alt={`Firma de ${v.consentimiento?.nombreFirmante ?? 'el tutor'}`} />
                  <span className="st-chico">{v.consentimiento?.nombreFirmante}</span>
                </div>
              )}
            </section>
            {v.estado === 'enviado' && <FirmarPresupuesto id={v.id} token={token} nombreInicial={v.cliente?.nombre ?? ''} />}
            {v.estado === 'aceptado' && (
              <p>
                <a className="st-btn st-btn--claro" href={`/api/presupuesto/${v.id}/${token}?imprimir=1`} target="_blank" rel="noreferrer">
                  Ver para imprimir o guardar PDF
                </a>
              </p>
            )}
          </>
        )}
      </main>
    </>
  )
}
