'use client'

/**
 * Citas en el portal (cliente): pedir, reprogramar y cancelar. Habla con
 * /api/clinica/portal/citas*. Las reglas (anticipación, horario, choques)
 * las decide el servidor; aquí solo se muestran los huecos que devuelve.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { CitaVista, DisponibilidadDia, ServicioVista } from '../../lib/clinica/tipos'
import { ESTADO_CITA_LABEL } from '../../lib/clinica/tipos'
import { fecha, Pill } from './comun'

async function pedir<T>(url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: cuerpo === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error((data as { error?: string } | null)?.error || 'No se pudo completar. Intenta de nuevo.')
  return data as T
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaLargo = (d: string) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fecha(d)}`
const sumarDias = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const hoy = () => new Date().toISOString().slice(0, 10)
const TONO: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'gris'> = { solicitada: 'warn', confirmada: 'info', llegada: 'info', atencion: 'ok', finalizada: 'gris', cancelada: 'bad', no_asistio: 'bad' }

export function PillCita({ estado }: { estado: CitaVista['estado'] }) {
  return <Pill tono={TONO[estado] ?? 'gris'}>{estado === 'solicitada' ? 'Por confirmar' : ESTADO_CITA_LABEL[estado]}</Pill>
}

export function Huecos({ servicioId, diaInicial, ignorarCita, onElegir, etiqueta }: { servicioId: number; diaInicial: string; ignorarCita?: number; onElegir: (dia: string, hora: string) => Promise<void>; etiqueta: string }) {
  const [dia, setDia] = useState(diaInicial)
  const [disp, setDisp] = useState<DisponibilidadDia | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    setDisp(null)
    setHora(null)
    pedir<DisponibilidadDia>(`/api/clinica/portal/citas/disponibilidad?servicio=${servicioId}&dia=${dia}${ignorarCita ? `&ignorar=${ignorarCita}` : ''}`).then(setDisp, (e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [servicioId, dia, ignorarCita])
  return (
    <div className="pt-form">
      <div className="pt-acciones" style={{ alignItems: 'center' }}>
        <button type="button" className="pt-btn" onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior" disabled={dia <= hoy()}>
          ‹
        </button>
        <input className="pt-input" style={{ width: 'auto', flex: 1 }} type="date" value={dia} min={hoy()} onChange={(e) => e.target.value && setDia(e.target.value)} />
        <button type="button" className="pt-btn" onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente">
          ›
        </button>
      </div>
      <p className="pt-chico" style={{ textTransform: 'capitalize' }}>{diaLargo(dia)}</p>
      {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
      {disp && !disp.abierto && <div className="pt-aviso pt-aviso--info">{disp.motivo ?? 'Ese día no hay atención.'}</div>}
      {disp && disp.abierto && (
        <div className="pt-huecos">
          {disp.huecos.map((h) => (
            <button key={h.hora} type="button" className={`pt-hueco${hora === h.hora ? ' is-on' : ''}`} disabled={!h.disponible} onClick={() => setHora(h.hora)}>
              {h.hora}
            </button>
          ))}
        </div>
      )}
      {disp && disp.abierto && disp.huecos.every((h) => !h.disponible) && <p className="pt-chico pt-tenue">No quedan huecos ese día. Prueba otro.</p>}
      <button
        type="button"
        className="pt-btn pt-btn--primario pt-btn--bloque"
        disabled={!hora || ocupado}
        onClick={async () => {
          if (!hora) return
          setOcupado(true)
          setError(null)
          try {
            await onElegir(dia, hora)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo.')
            setOcupado(false)
          }
        }}
      >
        {ocupado ? 'Enviando…' : hora ? `${etiqueta} · ${fecha(dia)} ${hora}` : 'Elige una hora'}
      </button>
    </div>
  )
}

export function NuevaCita({ mascotas, servicios, mascotaInicial, anticipacionHoras }: { mascotas: { id: number; nombre: string; especie: string }[]; servicios: ServicioVista[]; mascotaInicial: number | null; anticipacionHoras: number }) {
  const router = useRouter()
  const [mascota, setMascota] = useState<number>(mascotaInicial ?? mascotas[0]?.id ?? 0)
  const [servicio, setServicio] = useState<number>(0)
  const [notas, setNotas] = useState('')
  const [hecha, setHecha] = useState<CitaVista | null>(null)
  const s = servicios.find((x) => x.id === servicio)
  if (hecha)
    return (
      <div className="pt-card">
        <h2>Cita solicitada</h2>
        <p>
          <b>{hecha.servicio.nombre}</b> para <b>{hecha.mascota.nombre}</b>: {diaLargo(hecha.dia)}, {hecha.horaInicio}.
        </p>
        <div className="pt-aviso pt-aviso--info">La clínica la confirmará y te avisará. Si necesitas cambiarla, puedes hacerlo desde «Mis citas».</div>
        <Link href="/portal/citas" className="pt-btn pt-btn--primario">
          Ver mis citas
        </Link>
      </div>
    )
  if (!mascotas.length) return <div className="pt-aviso pt-aviso--info">Aún no hay mascotas activas en tu ficha. La clínica las registra en tu primera visita.</div>
  return (
    <div className="pt-form">
      <label className="pt-campo">
        <span>¿Para quién?</span>
        <select className="pt-input" value={mascota} onChange={(e) => setMascota(Number(e.target.value))}>
          {mascotas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="pt-campo">
        <span>Servicio</span>
        <select className="pt-input" value={servicio} onChange={(e) => setServicio(Number(e.target.value))}>
          <option value={0}>Elige…</option>
          {servicios.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre} · {x.duracionMin} min{x.reservaEnLinea === 'valoracion' ? ' · requiere valoración' : ''}
            </option>
          ))}
        </select>
      </label>
      {s && (
        <div className="pt-card" style={{ gap: 4 }}>
          {s.descripcion && <p className="pt-chico">{s.descripcion}</p>}
          {s.indicaciones && (
            <p className="pt-chico">
              <b>Antes de venir:</b> {s.indicaciones}
            </p>
          )}
          {s.reservaEnLinea === 'valoracion' && <p className="pt-chico pt-tenue">Este servicio requiere valoración previa: tu solicitud la revisa la clínica y te confirma o te propone una consulta primero.</p>}
          {s.precio ? <p className="pt-chico">Precio de referencia: ${s.precio.toLocaleString('es-MX')}</p> : null}
        </div>
      )}
      <label className="pt-campo">
        <span>Motivo o notas para la clínica (opcional)</span>
        <textarea className="pt-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
      {s ? (
        <Huecos
          servicioId={s.id}
          diaInicial={sumarDias(hoy(), 1)}
          etiqueta="Pedir cita"
          onElegir={async (d, h) => {
            const c = await pedir<CitaVista>('/api/clinica/portal/citas', { mascotaId: mascota, servicioId: s.id, dia: d, hora: h, notasTutor: notas })
            setHecha(c)
            router.refresh()
          }}
        />
      ) : (
        <p className="pt-chico pt-tenue">Las citas se piden con al menos {anticipacionHoras} h de anticipación. Elige un servicio para ver los horarios.</p>
      )}
    </div>
  )
}

export function AccionesCita({ cita, cancelacionHoras }: { cita: CitaVista; cancelacionHoras: number }) {
  const router = useRouter()
  const [modo, setModo] = useState<'nada' | 'mover' | 'cancelar'>('nada')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const puede = ['solicitada', 'confirmada'].includes(cita.estado)
  if (!puede) return null
  return (
    <div className="pt-form" style={{ marginTop: 6 }}>
      {modo === 'nada' && (
        <div className="pt-acciones">
          <button type="button" className="pt-btn" onClick={() => setModo('mover')}>
            Reprogramar
          </button>
          <button type="button" className="pt-btn" onClick={() => setModo('cancelar')}>
            Cancelar
          </button>
        </div>
      )}
      {modo === 'mover' && (
        <>
          <Huecos
            servicioId={cita.servicio.id}
            diaInicial={cita.dia}
            ignorarCita={cita.id}
            etiqueta="Cambiar a"
            onElegir={async (d, h) => {
              await pedir(`/api/clinica/portal/citas/${cita.id}/reprogramar`, { dia: d, hora: h })
              setModo('nada')
              router.refresh()
            }}
          />
          <button type="button" className="pt-btn" onClick={() => setModo('nada')}>
            Dejarla como está
          </button>
        </>
      )}
      {modo === 'cancelar' && (
        <>
          <label className="pt-campo">
            <span>¿Por qué? (opcional)</span>
            <input className="pt-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
          <div className="pt-acciones">
            <button
              type="button"
              className="pt-btn pt-btn--primario"
              onClick={async () => {
                setError(null)
                try {
                  await pedir(`/api/clinica/portal/citas/${cita.id}/cancelar`, { motivo })
                  setModo('nada')
                  router.refresh()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo cancelar.')
                }
              }}
            >
              Sí, cancelar la cita
            </button>
            <button type="button" className="pt-btn" onClick={() => setModo('nada')}>
              No
            </button>
          </div>
        </>
      )}
      <p className="pt-chico pt-tenue">Cambios con al menos {cancelacionHoras} h de anticipación; después, llámanos.</p>
    </div>
  )
}
