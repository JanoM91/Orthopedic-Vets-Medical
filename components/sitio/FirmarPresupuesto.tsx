'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { FirmaLienzo } from '../FirmaLienzo'

/** Firma o rechazo del presupuesto por el tutor (liga sin cuenta, nov-2026). */
export function FirmarPresupuesto({ id, token, nombreInicial }: { id: number; token: string; nombreInicial: string }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(nombreInicial)
  const [firma, setFirma] = useState<string | null>(null)
  const [acepto, setAcepto] = useState(false)
  const [rechazar, setRechazar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mandar(cuerpo: Record<string, unknown>) {
    setOcupado(true)
    setError(null)
    try {
      const r = await fetch(`/api/presupuesto/${id}/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const d = (await r.json().catch(() => null)) as { error?: string } | null
      if (!r.ok) throw new Error(d?.error || 'No se pudo guardar. Intenta de nuevo.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setOcupado(false)
    }
  }

  if (rechazar)
    return (
      <section className="st-card st-pre-firma">
        <h2>¿Por ahora no?</h2>
        <div className="st-campo">
          <label htmlFor="p-motivo">Si quieres, cuéntanos por qué (opcional)</label>
          <textarea id="p-motivo" rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        {error && (
          <p className="st-reserva__error" role="alert">
            {error}
          </p>
        )}
        <div className="st-acciones">
          <button type="button" className="st-btn st-btn--claro" onClick={() => setRechazar(false)} disabled={ocupado}>
            Regresar
          </button>
          <button type="button" className="st-btn st-btn--primario" onClick={() => mandar({ accion: 'rechazar', motivo })} disabled={ocupado}>
            {ocupado ? 'Enviando…' : 'No acepto el presupuesto'}
          </button>
        </div>
      </section>
    )

  return (
    <section className="st-card st-pre-firma">
      <h2>Firma</h2>
      <div className="st-campo">
        <label htmlFor="p-nombre">Nombre completo de quien firma</label>
        <input id="p-nombre" type="text" autoComplete="name" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <FirmaLienzo onCambio={setFirma} />
      <label className="st-check">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Leí el presupuesto y el consentimiento, pude hacer mis preguntas y los acepto.</span>
      </label>
      {error && (
        <p className="st-reserva__error" role="alert">
          {error}
        </p>
      )}
      <div className="st-acciones">
        <button type="button" className="st-btn st-btn--acento" disabled={ocupado || !firma || !acepto || nombre.trim().length < 3} onClick={() => mandar({ accion: 'firmar', nombre, firma, acepto })}>
          {ocupado ? 'Guardando…' : 'Aceptar y firmar'}
        </button>
        <button type="button" className="st-btn st-btn--claro" onClick={() => setRechazar(true)} disabled={ocupado}>
          No acepto
        </button>
      </div>
      <p className="st-chico st-tenue">Al firmar guardamos tu firma, la fecha y la hora junto con este texto. Tendrás una copia para imprimir.</p>
    </section>
  )
}
