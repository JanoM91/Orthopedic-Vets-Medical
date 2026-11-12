'use client'

/**
 * Foto de la mascota en el portal (nov-2026): el tutor la toma o la elige, se
 * reduce en el teléfono (lib/reducirImagen.ts) y se sube a
 * /api/clinica/portal/mascotas/:id/foto. Al terminar, la página se refresca.
 */
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'
import { reducirImagen } from '../../lib/reducirImagen'

export function CambiarFoto({ mascotaId, nombre, tieneFoto, variante = 'boton' }: { mascotaId: number; nombre: string; tieneFoto: boolean; variante?: 'boton' | 'flotante' | 'claro' }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState<'subiendo' | 'quitando' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  const subir = async (archivo: File) => {
    setError(null)
    setOcupado('subiendo')
    try {
      const foto = await reducirImagen(archivo, { lado: 720, cuadrada: true })
      const fd = new FormData()
      fd.append('archivo', new File([foto], 'foto.jpg', { type: 'image/jpeg' }))
      const r = await fetch(`/api/clinica/portal/mascotas/${mascotaId}/foto`, { method: 'POST', body: fd, credentials: 'same-origin' })
      const d = (await r.json().catch(() => null)) as { error?: string } | null
      if (!r.ok) throw new Error(d?.error || 'No se pudo subir la foto.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setOcupado(null)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const quitar = async () => {
    setError(null)
    setOcupado('quitando')
    try {
      const r = await fetch(`/api/clinica/portal/mascotas/${mascotaId}/foto/quitar`, { method: 'POST', credentials: 'same-origin' })
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error || 'No se pudo quitar.')
      setConfirmarQuitar(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar.')
    } finally {
      setOcupado(null)
    }
  }

  const etiqueta = ocupado === 'subiendo' ? 'Subiendo…' : tieneFoto ? 'Cambiar foto' : 'Agregar foto'
  return (
    <div className={`pt-foto-acciones pt-foto-acciones--${variante}`}>
      <input ref={entrada} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
      {variante === 'flotante' ? (
        <button type="button" className="pt-foto-flotante" onClick={() => entrada.current?.click()} disabled={Boolean(ocupado)} aria-label={`${etiqueta} de ${nombre}`} title={etiqueta}>
          {ocupado ? <span className="pt-giro" aria-hidden="true" /> : <IconoCamara />}
        </button>
      ) : (
        <div className="pt-acciones">
          <button type="button" className={`pt-btn pt-btn--chico${variante === 'claro' ? ' pt-btn--claro' : ''}`} onClick={() => entrada.current?.click()} disabled={Boolean(ocupado)}>
            <IconoCamara /> {etiqueta}
          </button>
          {tieneFoto && !confirmarQuitar && (
            <button type="button" className={`pt-btn pt-btn--chico pt-btn--texto${variante === 'claro' ? ' pt-btn--claro' : ''}`} onClick={() => setConfirmarQuitar(true)} disabled={Boolean(ocupado)}>
              Quitar
            </button>
          )}
          {confirmarQuitar && (
            <>
              <button type="button" className="pt-btn pt-btn--chico pt-btn--peligro" onClick={quitar} disabled={Boolean(ocupado)}>
                {ocupado === 'quitando' ? 'Quitando…' : 'Sí, quitar foto'}
              </button>
              <button type="button" className={`pt-btn pt-btn--chico pt-btn--texto${variante === 'claro' ? ' pt-btn--claro' : ''}`} onClick={() => setConfirmarQuitar(false)}>
                No
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="pt-foto-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function IconoCamara() {
  return (
    <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  )
}
