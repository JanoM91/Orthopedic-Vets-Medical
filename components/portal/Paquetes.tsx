'use client'

import React, { useState } from 'react'

/**
 * «Lo quiero» de un paquete en la app del cliente (nov-2026): deja una
 * solicitud con su ficha y la mascota elegida; recepción la confirma y la
 * cobra en la clínica (decisión de Jano: «solicitud que confirma recepción»).
 */
export function PedirPaquete({ paqueteId, nombre, mascotas }: { paqueteId: number; nombre: string; mascotas: { id: number; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false)
  const [mascota, setMascota] = useState<number | ''>(mascotas.length === 1 ? mascotas[0].id : '')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folio, setFolio] = useState<string | null>(null)

  if (folio)
    return (
      <div className="pt-aviso pt-aviso--ok" role="status">
        Recibimos tu solicitud ({folio}). Te escribimos para confirmarla; el paquete se paga en la clínica.
      </div>
    )
  if (!mascotas.length) return <p className="pt-chico pt-tenue">Para pedirlo, primero registra a tu mascota en la clínica.</p>
  if (!abierto)
    return (
      <button type="button" className="pt-btn pt-btn--acento pt-btn--chico" onClick={() => setAbierto(true)}>
        Lo quiero
      </button>
    )
  return (
    <form
      className="pt-form pt-paq-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!mascota) return setError('Elige para cuál mascota.')
        setOcupado(true)
        setError(null)
        try {
          const r = await fetch('/api/clinica/portal/paquetes/solicitar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paqueteId, mascotaId: mascota, nota }) })
          const d = (await r.json().catch(() => null)) as { folio?: string; error?: string } | null
          if (!r.ok || !d?.folio) throw new Error(d?.error || 'No pudimos enviar tu solicitud. Intenta de nuevo.')
          setFolio(d.folio)
        } catch (x) {
          setError(x instanceof Error ? x.message : 'No pudimos enviar tu solicitud.')
          setOcupado(false)
        }
      }}
    >
      <label className="pt-campo">
        <span>¿Para quién es {nombre}?</span>
        <select className="pt-input" value={mascota} onChange={(e) => setMascota(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Elige</option>
          {mascotas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="pt-campo">
        <span>¿Algo que debamos saber? (opcional)</span>
        <input className="pt-input" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
      </label>
      {error && (
        <div className="pt-aviso pt-aviso--bad" role="alert">
          {error}
        </div>
      )}
      <div className="pt-paq-form__botones">
        <button type="button" className="pt-btn pt-btn--chico" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button type="submit" className="pt-btn pt-btn--acento pt-btn--chico" disabled={ocupado}>
          {ocupado ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  )
}
