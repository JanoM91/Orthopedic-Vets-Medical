'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { ESTADO_CITA_LABEL, type EstadoCitaVista } from '../../lib/clinica/tipos'

export type FilaAgenda = {
  id: number
  hora: string
  mascota: string
  mascotaId: number
  tutor: string | null
  servicio: string
  lugar: string
  estado: EstadoCitaVista
  siguientes: EstadoCitaVista[]
}

/**
 * Siguiente paso de cada cita en el tablero «Hoy». Solo los pasos que se
 * pueden deshacer o que no generan nada (confirmar, registrar llegada, pasar a
 * atención) se hacen aquí con un clic. Finalizar (crea el cargo en Finanzas) y
 * «No asistió» se quedan en la agenda, donde piden confirmación.
 */
function pasoDe(f: FilaAgenda): { estado: EstadoCitaVista; texto: string } | null {
  if (f.estado === 'solicitada' && f.siguientes.includes('confirmada')) return { estado: 'confirmada', texto: 'Confirmar' }
  if (f.estado === 'confirmada' && f.siguientes.includes('llegada')) return { estado: 'llegada', texto: 'Llegó' }
  if (f.estado === 'llegada' && f.siguientes.includes('atencion')) return { estado: 'atencion', texto: 'Atender' }
  return null
}

export function AgendaDeHoy({ filas, base, verExpediente }: { filas: FilaAgenda[]; base: string; verExpediente: boolean }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; texto: string } | null>(null)

  const avanzar = async (f: FilaAgenda, estado: EstadoCitaVista) => {
    setOcupado(f.id)
    setError(null)
    try {
      const r = await fetch(`/api/clinica/agenda/citas/${f.id}/estado`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!r.ok) {
        let msg = r.status === 401 ? 'Tu sesión terminó. Vuelve a entrar.' : 'No se pudo cambiar la cita.'
        try {
          msg = ((await r.json()) as { error?: string }).error || msg
        } catch {
          /* respuesta sin cuerpo */
        }
        setError({ id: f.id, texto: msg })
      } else {
        router.refresh()
      }
    } catch {
      setError({ id: f.id, texto: 'Sin conexión. Intenta de nuevo.' })
    }
    setOcupado(null)
  }

  return (
    <ul className="hoy__citas">
      {filas.map((f) => {
        const paso = pasoDe(f)
        const cerrada = f.estado === 'finalizada' || f.estado === 'no_asistio'
        return (
          <li key={f.id} className={`hoy__cita${cerrada ? ' hoy__cita--cerrada' : ''}`}>
            <span className="hoy__hora">{f.hora}</span>
            <span className="hoy__quien">
              <Link href={`${base}/mascotas/${f.mascotaId}`} className="hoy__mascota">
                {f.mascota}
              </Link>
              {f.tutor && <span className="hoy__sub">{f.tutor}</span>}
            </span>
            <span className="hoy__servicio">
              {f.servicio}
              <span className="hoy__sub">{f.lugar}</span>
            </span>
            <span className="hoy__estado">
              <span className={`cl-st cl-st--${f.estado}`}>{ESTADO_CITA_LABEL[f.estado]}</span>
            </span>
            <span className="hoy__accion-cita">
              {paso && (
                <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={ocupado === f.id} onClick={() => void avanzar(f, paso.estado)}>
                  {ocupado === f.id ? 'Guardando…' : paso.texto}
                </button>
              )}
              {f.estado === 'atencion' && verExpediente && (
                <Link className="fz-btn fz-btn--chico hoy__accion" href={`${base}/mascotas/${f.mascotaId}?ver=notas`}>
                  Abrir nota
                </Link>
              )}
            </span>
            {error?.id === f.id && (
              <span className="hoy__error fz-chico fz-rojo" role="alert">
                {error.texto}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
