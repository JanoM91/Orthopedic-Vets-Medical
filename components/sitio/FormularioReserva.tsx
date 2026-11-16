'use client'

import React, { useState } from 'react'

/**
 * Formulario de `/reservar` (nov-2026): solicitud de primera cita que
 * recepción confirma por WhatsApp. Manda a `POST /api/sitio/solicitudes`.
 * El campo «sitioWeb» es una trampa para robots (oculto a las personas).
 */
type Servicio = { id: number; nombre: string; area: string }

export function FormularioReserva({ servicios, servicioInicial, hoy, whatsapp, campana }: { servicios: Servicio[]; servicioInicial: number | null; hoy: string; whatsapp: string | null; campana: string | null }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folio, setFolio] = useState<string | null>(null)
  const areas = [...new Set(servicios.map((s) => s.area))]

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando) return
    const f = new FormData(e.currentTarget)
    const texto = (k: string) => String(f.get(k) ?? '').trim()
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/sitio/solicitudes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: texto('nombre'),
          whatsapp: texto('whatsapp'),
          correo: texto('correo'),
          mascota: texto('mascota'),
          especie: texto('especie') || 'perro',
          servicioId: Number(texto('servicio')) || null,
          diaPreferido: texto('dia'),
          turno: texto('turno') || 'cualquiera',
          nota: texto('nota'),
          privacidad: f.get('privacidad') === 'on',
          sitioWeb: texto('sitioWeb'),
        }),
      })
      const d = (await r.json().catch(() => null)) as { folio?: string; error?: string } | null
      if (!r.ok || !d?.folio) throw new Error(d?.error || 'No pudimos guardar tu solicitud. Intenta de nuevo.')
      setFolio(d.folio)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No pudimos guardar tu solicitud. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (folio) {
    return (
      <div className="st-card st-reserva__lista" role="status">
        <h2>Recibimos tu solicitud</h2>
        <p>
          Te escribimos por WhatsApp para confirmarte el día y la hora. Tu folio es <b>{folio}</b>.
        </p>
        <p className="st-tenue">Todavía no es una cita confirmada: queda lista cuando acordemos el horario contigo.</p>
        {whatsapp && (
          <div className="st-acciones">
            <a href={whatsapp} target="_blank" rel="noreferrer" className="st-btn st-btn--claro">
              ¿Es urgente? Escríbenos tú
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <form className="st-card st-reserva" onSubmit={enviar} noValidate={false}>
      {campana && <p className="st-reserva__campana">Campaña vigente: {campana}</p>}
      <div className="st-campo">
        <label htmlFor="r-servicio">¿Qué necesita tu mascota?</label>
        <select id="r-servicio" name="servicio" defaultValue={servicioInicial ? String(servicioInicial) : ''}>
          <option value="">No estoy seguro, que me orienten</option>
          {areas.map((a) => (
            <optgroup key={a} label={a}>
              {servicios
                .filter((s) => s.area === a)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="st-campos">
        <div className="st-campo">
          <label htmlFor="r-mascota">Nombre de tu mascota</label>
          <input id="r-mascota" name="mascota" type="text" required maxLength={60} />
        </div>
        <div className="st-campo">
          <label htmlFor="r-especie">Es</label>
          <select id="r-especie" name="especie" defaultValue="perro">
            <option value="perro">Perro</option>
            <option value="gato">Gato</option>
            <option value="otra">Otra especie</option>
          </select>
        </div>
      </div>
      <div className="st-campos">
        <div className="st-campo">
          <label htmlFor="r-dia">Día que prefieres (opcional)</label>
          <input id="r-dia" name="dia" type="date" min={hoy} />
        </div>
        <div className="st-campo">
          <label htmlFor="r-turno">Horario</label>
          <select id="r-turno" name="turno" defaultValue="cualquiera">
            <option value="cualquiera">Cualquiera</option>
            <option value="manana">Por la mañana</option>
            <option value="tarde">Por la tarde</option>
          </select>
        </div>
      </div>
      <div className="st-campos">
        <div className="st-campo">
          <label htmlFor="r-nombre">Tu nombre</label>
          <input id="r-nombre" name="nombre" type="text" autoComplete="name" required minLength={2} maxLength={80} />
        </div>
        <div className="st-campo">
          <label htmlFor="r-whatsapp">Tu WhatsApp (10 dígitos)</label>
          <input id="r-whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} />
        </div>
      </div>
      <div className="st-campo">
        <label htmlFor="r-correo">Correo (opcional)</label>
        <input id="r-correo" name="correo" type="email" autoComplete="email" maxLength={120} />
      </div>
      <div className="st-campo">
        <label htmlFor="r-nota">Cuéntanos qué le pasa (opcional)</label>
        <textarea id="r-nota" name="nota" rows={3} maxLength={500} />
      </div>
      <div className="st-trampa" aria-hidden="true">
        <label htmlFor="r-sitio">Sitio web</label>
        <input id="r-sitio" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="st-check">
        <input type="checkbox" name="privacidad" required />
        <span>
          Acepto el <a href="/aviso-de-privacidad" target="_blank" rel="noreferrer">aviso de privacidad</a> y que me escriban por WhatsApp para agendar.
        </span>
      </label>
      {error && (
        <p className="st-reserva__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="st-btn st-btn--acento st-reserva__enviar" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar mi solicitud'}
      </button>
    </form>
  )
}
