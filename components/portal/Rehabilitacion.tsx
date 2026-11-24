'use client'

import React, { useState } from 'react'
import type { PlanTutor } from '../../lib/clinica/rehabilitacion'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaSemana = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return DIAS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]
}

/**
 * Ejercicios para casa en la app del cliente (rehabilitación, nov-2026): el
 * tutor marca cuántas veces hizo cada ejercicio hoy (o ayer, si se le pasó) y
 * ve su semana. Solo cambia `casa` del plan por `POST portal/rehabilitacion/:id/casa`.
 */
export function EjerciciosCasa({ inicial }: { inicial: PlanTutor }) {
  const [plan, setPlan] = useState(inicial)
  const [dia, setDia] = useState<'hoy' | 'ayer'>('hoy')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activo = plan.estado === 'activo'

  async function marcar(clave: string, accion: 'sumar' | 'restar') {
    setOcupado(clave)
    setError(null)
    try {
      const r = await fetch(`/api/clinica/portal/rehabilitacion/${plan.id}/casa`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, dia: dia === 'hoy' ? plan.hoy : plan.ayer, accion }) })
      const d = (await r.json().catch(() => null)) as (PlanTutor & { error?: string }) | null
      if (!r.ok || !d || d.error) throw new Error(d?.error || 'No se pudo guardar. Intenta de nuevo.')
      setPlan(d)
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo guardar.')
    } finally {
      setOcupado(null)
    }
  }

  if (!plan.ejercicios.length) return activo ? <p className="pt-chico pt-tenue">Aún no te asignan ejercicios para casa.</p> : null
  const maxSemana = Math.max(1, ...plan.semana.map((s) => s.esperadas))
  return (
    <div className="pt-reh-casa">
      {activo && (
        <div className="pt-reh-dia" role="group" aria-label="Día que marcas">
          {(['hoy', 'ayer'] as const).map((d) => (
            <button key={d} type="button" className={dia === d ? 'is-on' : ''} aria-pressed={dia === d} onClick={() => setDia(d)}>
              {d === 'hoy' ? 'Hoy' : 'Ayer'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="pt-aviso pt-aviso--bad" role="alert">
          {error}
        </div>
      )}
      <ul className="pt-reh-ejercicios">
        {plan.ejercicios.map((e) => {
          const hechas = dia === 'hoy' ? e.hoy : e.ayer
          const completo = hechas >= e.vecesAlDia
          return (
            <li key={e.clave} className={`pt-card pt-reh-ej${e.foto ? '' : ' pt-reh-ej--sin-foto'}${completo ? ' is-completo' : ''}`}>
              {e.foto && <img src={e.foto} alt={`Cómo se hace: ${e.nombre}`} className="pt-reh-ej__foto" loading="lazy" />}
              <div className="pt-reh-ej__cuerpo">
                <h3>{e.nombre}</h3>
                <p className="pt-chico">
                  {[e.repeticiones, `${e.vecesAlDia} ${e.vecesAlDia === 1 ? 'vez' : 'veces'} al día`].filter(Boolean).join(' · ')}
                </p>
                {e.nota && <p className="pt-chico pt-reh-ej__nota">{e.nota}</p>}
                {e.comoSeHace && (
                  <details>
                    <summary className="pt-chico">Cómo se hace</summary>
                    <p className="pt-chico pt-reh-texto">{e.comoSeHace}</p>
                  </details>
                )}
                {e.video && (
                  <a href={e.video} target="_blank" rel="noreferrer" className="pt-chico pt-reh-video">
                    Ver video
                  </a>
                )}
              </div>
              {activo && (
                <div className="pt-reh-contador">
                  <span className="pt-chico" aria-live="polite">
                    {dia === 'hoy' ? 'Hoy' : 'Ayer'}: <b>{hechas}</b> de {e.vecesAlDia}
                  </span>
                  <div className="pt-reh-contador__btns">
                    <button type="button" className="pt-btn pt-btn--chico" aria-label={`Quitar una vez de ${e.nombre}`} disabled={ocupado === e.clave || hechas === 0} onClick={() => marcar(e.clave, 'restar')}>
                      −
                    </button>
                    <button type="button" className="pt-btn pt-btn--chico pt-btn--acento" disabled={ocupado === e.clave || completo} onClick={() => marcar(e.clave, 'sumar')}>
                      {completo ? 'Listo' : 'Lo hicimos'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {activo && (
        <section aria-labelledby="t-semana">
          <h2 id="t-semana" className="pt-eyebrow">
            Tu semana
          </h2>
          <div className="pt-card pt-reh-semana">
            {plan.semana.map((s) => (
              <div key={s.dia} className="pt-reh-semana__dia" title={`${s.hechas} de ${s.esperadas}`}>
                <span className="pt-reh-semana__barra" aria-hidden="true">
                  <span style={{ height: `${s.esperadas ? Math.round((s.hechas / maxSemana) * 100) : 0}%` }} className={s.esperadas && s.hechas >= s.esperadas ? 'is-ok' : ''} />
                </span>
                <span className="pt-chico">{s.dia === plan.hoy ? 'hoy' : diaSemana(s.dia)}</span>
                <span className="pt-chico pt-tenue">{s.esperadas ? `${s.hechas}/${s.esperadas}` : '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
