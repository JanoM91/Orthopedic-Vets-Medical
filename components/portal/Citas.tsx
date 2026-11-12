'use client'

/**
 * Citas en el portal (cliente): pedir, reprogramar y cancelar. Habla con
 * /api/clinica/portal/citas*. Las reglas (anticipación, horario, choques)
 * las decide el servidor; aquí solo se muestran los huecos que devuelve.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import type { CitaVista, DiaCalendario, DisponibilidadDia, ServicioVista } from '../../lib/clinica/tipos'
import { ESTADO_CITA_LABEL } from '../../lib/clinica/tipos'
import { diaLocal } from '../../lib/localTime'
import { InsigniaServicio } from '../IconoServicio'
import { Avatar, fecha, Icono, Pill } from './comun'

async function pedir<T>(url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: cuerpo === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error((data as { error?: string } | null)?.error || 'No se pudo completar. Intenta de nuevo.')
  return data as T
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const diaLargo = (d: string) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fecha(d)}`
const sumarDias = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
/** «Hoy» en la zona del negocio, no en UTC. */
const hoy = () => diaLocal(new Date())
const TONO: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'gris'> = { solicitada: 'warn', confirmada: 'info', llegada: 'info', atencion: 'ok', finalizada: 'gris', cancelada: 'bad', no_asistio: 'bad' }

export function PillCita({ estado }: { estado: CitaVista['estado'] }) {
  return <Pill tono={TONO[estado] ?? 'gris'}>{ESTADO_CITA_LABEL[estado]}</Pill>
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const ESTADO_DIA: Record<DiaCalendario['estado'], string> = { libre: 'Disponible', pocos: 'Pocos lugares', lleno: 'Lleno', cerrado: 'Cerrado', fuera: 'No disponible' }
const finDeMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const moverMes = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1 + n, 1))
  return x.toISOString().slice(0, 7)
}

/**
 * Calendario del mes (nov-2026): cada día dice si quedan horas para ese
 * servicio. Solo libre u ocupado: nunca de quién son las citas. Los días
 * pasados, cerrados o fuera de la ventana no se pueden elegir.
 */
export function Calendario({ servicioId, ignorarCita, dia, onDia, diasAdelante }: { servicioId: number; ignorarCita?: number; dia: string | null; onDia: (d: string) => void; diasAdelante: number }) {
  const [mes, setMes] = useState((dia ?? hoy()).slice(0, 7))
  /* La respuesta lleva la clave de lo que se pidió: si cambia el mes, se ve «cargando» sin borrar el estado dentro del efecto. */
  const clave = `${servicioId}|${mes}|${ignorarCita ?? ''}`
  const [res, setRes] = useState<{ clave: string; dias: DiaCalendario[] | null; error: string | null } | null>(null)
  const dias = res?.clave === clave ? res.dias : null
  const error = res?.clave === clave ? res.error : null
  const elegidoAuto = useRef(false)
  useEffect(() => {
    let vivo = true
    pedir<DiaCalendario[]>(`/api/clinica/portal/citas/calendario?servicio=${servicioId}&desde=${mes}-01&hasta=${finDeMes(mes)}${ignorarCita ? `&ignorar=${ignorarCita}` : ''}`).then(
      (r) => {
        if (!vivo) return
        setRes({ clave, dias: r, error: null })
        /* Al abrir: si el día propuesto no tiene horas, se propone el primero que sí. */
        if (!elegidoAuto.current) {
          const propuesto = dia ? r.find((x) => x.dia === dia) : null
          if (propuesto && (propuesto.estado === 'libre' || propuesto.estado === 'pocos')) elegidoAuto.current = true
          else {
            const primero = r.find((x) => x.estado === 'libre' || x.estado === 'pocos')
            if (primero) {
              elegidoAuto.current = true
              onDia(primero.dia)
            } else if (mes === hoy().slice(0, 7)) setMes(moverMes(mes, 1)) // nada libre este mes: se mira el siguiente
            else elegidoAuto.current = true
          }
        }
      },
      (e) => vivo && setRes({ clave, dias: null, error: e instanceof Error ? e.message : 'Error' }),
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  const [y, m] = mes.split('-').map(Number)
  const huecoInicial = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // lunes primero
  const limite = sumarDias(hoy(), diasAdelante)
  const puedeAtras = mes > hoy().slice(0, 7)
  const puedeAdelante = `${moverMes(mes, 1)}-01` <= limite
  return (
    <div className="pt-cal">
      <div className="pt-cal__cab">
        <button type="button" className="pt-cal__nav" onClick={() => setMes(moverMes(mes, -1))} disabled={!puedeAtras} aria-label="Mes anterior">
          ‹
        </button>
        <b>
          {mayus(MESES_LARGOS[m - 1])} {y}
        </b>
        <button type="button" className="pt-cal__nav" onClick={() => setMes(moverMes(mes, 1))} disabled={!puedeAdelante} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      <div className="pt-cal__semana" aria-hidden="true">
        {SEMANA.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className={`pt-cal__dias${dias ? '' : ' is-cargando'}`} role="grid" aria-label={`Días de ${MESES_LARGOS[m - 1]}`}>
        {Array.from({ length: huecoInicial }).map((_, i) => (
          <span key={`v${i}`} />
        ))}
        {(dias ?? Array.from({ length: Number(finDeMes(mes).slice(8)) }, (_, i) => ({ dia: `${mes}-${String(i + 1).padStart(2, '0')}`, estado: 'fuera' as const, libres: 0, total: 0 }))).map((x) => {
          const elegible = x.estado === 'libre' || x.estado === 'pocos'
          return (
            <button
              key={x.dia}
              type="button"
              className={`pt-cal__dia is-${dias ? x.estado : 'cargando'}${dia === x.dia ? ' is-on' : ''}${x.dia === hoy() ? ' is-hoy' : ''}`}
              disabled={!elegible}
              onClick={() => onDia(x.dia)}
              aria-pressed={dia === x.dia}
              aria-label={`${diaLargo(x.dia)}: ${dias ? (elegible ? `${x.libres} horarios libres` : ESTADO_DIA[x.estado]) : 'cargando'}`}
            >
              <span>{Number(x.dia.slice(8))}</span>
              <i aria-hidden="true" />
            </button>
          )
        })}
      </div>
      {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
      <div className="pt-cal__leyenda" aria-hidden="true">
        <span className="is-libre">Disponible</span>
        <span className="is-pocos">Pocos lugares</span>
        <span className="is-lleno">Lleno</span>
        <span className="is-cerrado">Cerrado</span>
      </div>
    </div>
  )
}

/** Horas de un día: libres para elegir y ocupadas tachadas, por mañana y tarde. */
export function Horas({ servicioId, dia, ignorarCita, hora, onHora }: { servicioId: number; dia: string; ignorarCita?: number; hora: string | null; onHora: (h: string | null) => void }) {
  const clave = `${servicioId}|${dia}|${ignorarCita ?? ''}`
  const [res, setRes] = useState<{ clave: string; disp: DisponibilidadDia | null; error: string | null } | null>(null)
  const disp = res?.clave === clave ? res.disp : null
  const error = res?.clave === clave ? res.error : null
  useEffect(() => {
    let vivo = true
    pedir<DisponibilidadDia>(`/api/clinica/portal/citas/disponibilidad?servicio=${servicioId}&dia=${dia}${ignorarCita ? `&ignorar=${ignorarCita}` : ''}`).then(
      (r) => {
        if (!vivo) return
        setRes({ clave, disp: r, error: null })
        if (hora && !r.huecos.some((h) => h.hora === hora && h.disponible)) onHora(null)
      },
      (e) => vivo && setRes({ clave, disp: null, error: e instanceof Error ? e.message : 'Error' }),
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  if (error) return <div className="pt-aviso pt-aviso--bad">{error}</div>
  if (!disp) return <p className="pt-chico pt-tenue">Buscando horarios…</p>
  if (!disp.abierto) return <div className="pt-aviso pt-aviso--info">{disp.motivo ?? 'Ese día no hay atención.'}</div>
  const libres = disp.huecos.filter((h) => h.disponible).length
  const grupos: [string, string, typeof disp.huecos][] = [
    ['Mañana', 'sol', disp.huecos.filter((h) => h.hora < '12:00')],
    ['Tarde', 'luna', disp.huecos.filter((h) => h.hora >= '12:00')],
  ]
  return (
    <div className="pt-horas">
      <p className="pt-horas__titulo">
        <b>{mayus(diaLargo(dia))}</b> · {libres === 0 ? 'sin horarios libres' : `${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}`}
      </p>
      {grupos
        .filter(([, , hs]) => hs.length)
        .map(([titulo, icono, hs]) => (
          <div key={titulo} className="pt-horas__grupo">
            <p className="pt-horas__grupo-t">
              <Icono n={icono} /> {titulo}
            </p>
            <div className="pt-huecos">
              {hs.map((h) => (
                <button key={h.hora} type="button" className={`pt-hueco${hora === h.hora ? ' is-on' : ''}`} disabled={!h.disponible} onClick={() => onHora(h.hora)} aria-pressed={hora === h.hora} aria-label={`${h.hora}${h.disponible ? '' : ', ocupado'}`}>
                  {h.hora}
                </button>
              ))}
            </div>
          </div>
        ))}
      <div className="pt-cal__leyenda" aria-hidden="true">
        <span className="is-hora-libre">Libre</span>
        <span className="is-hora-ocupada">Ocupado</span>
        <span className="is-hora-elegida">Tu elección</span>
      </div>
    </div>
  )
}

/** Calendario + horas + barra fija con el resumen y el botón (pedir y reprogramar). */
export function ElegirHorario({ servicioId, diaInicial, ignorarCita, etiqueta, resumen, diasAdelante, onElegir, extra }: { servicioId: number; diaInicial: string | null; ignorarCita?: number; etiqueta: string; resumen?: string; diasAdelante: number; onElegir: (dia: string, hora: string) => Promise<void>; extra?: React.ReactNode }) {
  const [dia, setDia] = useState<string | null>(diaInicial)
  const [hora, setHora] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  return (
    <div className="pt-form">
      <Calendario servicioId={servicioId} ignorarCita={ignorarCita} dia={dia} diasAdelante={diasAdelante} onDia={(d) => { setDia(d); setHora(null) }} />
      {dia && <Horas servicioId={servicioId} dia={dia} ignorarCita={ignorarCita} hora={hora} onHora={setHora} />}
      {extra}
      <div className="pt-resumen">
        {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
        <div className="pt-resumen__fila">
          <span className="pt-resumen__texto">
            {resumen && <span>{resumen}</span>}
            <b>{dia && hora ? `${mayus(diaLargo(dia))} · ${hora}` : dia ? 'Elige una hora' : 'Elige un día'}</b>
          </span>
          <button
            type="button"
            className="pt-btn pt-btn--primario"
            disabled={!dia || !hora || ocupado}
            onClick={async () => {
              if (!dia || !hora) return
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
            {ocupado ? 'Enviando…' : etiqueta}
          </button>
        </div>
      </div>
    </div>
  )
}

type MascotaElegible = { id: number; nombre: string; especie: string; foto: string | null }

export function NuevaCita({ mascotas, servicios, mascotaInicial, servicioInicial, anticipacionHoras, diasAdelante }: { mascotas: MascotaElegible[]; servicios: ServicioVista[]; mascotaInicial: number | null; servicioInicial: number | null; anticipacionHoras: number; diasAdelante: number }) {
  const router = useRouter()
  const [mascota, setMascota] = useState<number>(mascotas.some((m) => m.id === mascotaInicial) ? mascotaInicial! : mascotas[0]?.id ?? 0)
  const [servicio, setServicio] = useState<number>(servicios.some((x) => x.id === servicioInicial) ? servicioInicial! : 0)
  const [notas, setNotas] = useState('')
  const [hecha, setHecha] = useState<CitaVista | null>(null)
  const s = servicios.find((x) => x.id === servicio)
  const m = mascotas.find((x) => x.id === mascota)
  if (hecha)
    return (
      <div className="pt-card pt-hecha">
        <span className="pt-hecha__check">
          <Icono n="check" />
        </span>
        <h2>¡Cita solicitada!</h2>
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
    <div className="pt-pasos">
      <section className="pt-paso">
        <h2 className="pt-paso__t">
          <span>1</span> ¿Para quién?
        </h2>
        <div className="pt-chips" role="radiogroup" aria-label="Mascota">
          {mascotas.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={mascota === x.id} className={`pt-chip-mascota${mascota === x.id ? ' is-on' : ''}`} onClick={() => setMascota(x.id)}>
              <Avatar nombre={x.nombre} especie={x.especie} foto={x.foto} />
              <span>{x.nombre}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pt-paso">
        <h2 className="pt-paso__t">
          <span>2</span> ¿Qué servicio?
        </h2>
        <div className="pt-elegir-servicio" role="radiogroup" aria-label="Servicio">
          {servicios.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={servicio === x.id} className={`pt-opcion-servicio${servicio === x.id ? ' is-on' : ''}`} onClick={() => setServicio(x.id)}>
              <InsigniaServicio clave={x.icono} />
              <span className="pt-opcion-servicio__t">
                <b>{x.nombre}</b>
                <span>
                  {x.duracionMin} min{x.reservaEnLinea === 'valoracion' ? ' · con valoración' : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
        {s && (s.descripcion || s.indicaciones || s.reservaEnLinea === 'valoracion' || s.precio) && (
          <div className="pt-detalle-servicio">
            {s.descripcion && <p className="pt-chico">{s.descripcion}</p>}
            {s.indicaciones && (
              <p className="pt-chico">
                <b>Antes de venir:</b> {s.indicaciones}
              </p>
            )}
            {s.reservaEnLinea === 'valoracion' && <p className="pt-chico pt-tenue">Requiere valoración previa: la clínica revisa tu solicitud y te confirma o te propone una consulta primero.</p>}
            {s.precio ? <p className="pt-chico">Precio de referencia: ${s.precio.toLocaleString('es-MX')}</p> : null}
          </div>
        )}
      </section>

      <section className="pt-paso">
        <h2 className="pt-paso__t">
          <span>3</span> ¿Cuándo?
        </h2>
        {s ? (
          <ElegirHorario
            key={s.id}
            servicioId={s.id}
            diaInicial={sumarDias(hoy(), 1)}
            diasAdelante={diasAdelante}
            etiqueta="Pedir cita"
            resumen={`${m?.nombre ?? ''} · ${s.nombre}`}
            extra={
              <label className="pt-campo">
                <span>Motivo o notas para la clínica (opcional)</span>
                <textarea className="pt-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </label>
            }
            onElegir={async (d, h) => {
              const c = await pedir<CitaVista>('/api/clinica/portal/citas', { mascotaId: mascota, servicioId: s.id, dia: d, hora: h, notasTutor: notas })
              setHecha(c)
              window.scrollTo({ top: 0, behavior: 'smooth' })
              router.refresh()
            }}
          />
        ) : (
          <p className="pt-chico pt-tenue">Elige un servicio para ver los días y horas disponibles. Las citas se piden con al menos {anticipacionHoras} h de anticipación.</p>
        )}
      </section>
    </div>
  )
}

export function AccionesCita({ cita, cancelacionHoras, diasAdelante }: { cita: CitaVista; cancelacionHoras: number; diasAdelante: number }) {
  const router = useRouter()
  const [modo, setModo] = useState<'nada' | 'mover' | 'cancelar'>('nada')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const puede = ['solicitada', 'confirmada'].includes(cita.estado)
  if (!puede) return null
  return (
    <div className="pt-form" style={{ marginTop: 6 }}>
      {exito && modo === 'nada' && (
        <div className="pt-aviso pt-aviso--ok" role="status">
          {exito}
        </div>
      )}
      {modo === 'nada' && (
        <div className="pt-acciones">
          <button
            type="button"
            className="pt-btn"
            onClick={() => {
              setExito(null)
              setModo('mover')
            }}
          >
            Reprogramar
          </button>
          <button type="button" className="pt-btn" onClick={() => setModo('cancelar')}>
            Cancelar
          </button>
        </div>
      )}
      {modo === 'mover' && (
        <>
          <ElegirHorario
            servicioId={cita.servicio.id}
            diaInicial={cita.dia}
            ignorarCita={cita.id}
            diasAdelante={diasAdelante}
            etiqueta="Cambiar"
            onElegir={async (d, h) => {
              /* Si falla, ElegirHorario muestra el error del servidor junto al botón y deja elegir otra hora. */
              const nueva = await pedir<CitaVista>(`/api/clinica/portal/citas/${cita.id}/reprogramar`, { dia: d, hora: h })
              setExito(`Listo: tu cita quedó para el ${diaLargo(nueva.dia)} a las ${nueva.horaInicio}. ${nueva.estado === 'confirmada' ? 'Ya está confirmada.' : 'Quedó por confirmar: la clínica te avisará.'}`)
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
              className="pt-btn pt-btn--peligro"
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
