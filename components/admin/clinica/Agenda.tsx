'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { ACCION_ESTADO_LABEL, type CitaVista, type DisponibilidadDia, ESTADO_CITA_LABEL, type EstadoCitaVista, type RecursoVista, type ResultadoBusqueda, type ServicioVista, type ConfiguracionAgenda } from '../../../lib/clinica/tipos'
import { api, Avatar, Aviso, Boton, BotonWhatsApp, Campo, ErrorForm, ESPECIE_LABEL, fecha, hoyISO, Icono, InputFecha, Modal, momento, Pastilla, useCarga, useClinica } from './comun'
import { site } from '../../../lib/site'
import { mensajes } from '../../../lib/whatsapp'

/**
 * Agenda del panel: un día, una columna por recurso, las citas como bloques
 * según su hora y duración. A la derecha, la cita elegida con sus acciones y
 * las solicitudes del portal por confirmar.
 */

const TONO: Record<EstadoCitaVista, 'ok' | 'aviso' | 'malo' | 'info' | 'gris'> = { solicitada: 'aviso', confirmada: 'info', llegada: 'info', atencion: 'ok', finalizada: 'gris', cancelada: 'malo', no_asistio: 'malo' }
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
const sumarDias = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaLargo = (d: string) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fecha(d)}`

type Catalogo = { recursos: RecursoVista[]; servicios: ServicioVista[]; configuracion: ConfiguracionAgenda }

export function EstadoCita({ estado }: { estado: EstadoCitaVista }) {
  return <Pastilla tono={TONO[estado]}>{ESTADO_CITA_LABEL[estado]}</Pastilla>
}

export default function Agenda({ diaInicial, mascotaInicial }: { diaInicial: string | null; mascotaInicial: number | null }) {
  const { catalogo: cat, base } = useClinica()
  const [dia, setDia] = useState(diaInicial && /^\d{4}-\d{2}-\d{2}$/.test(diaInicial) ? diaInicial : hoyISO())
  const agenda = useCarga(() => api.get<{ dia: string; citas: CitaVista[]; porConfirmar: CitaVista[]; abierto: boolean; de: string; a: string }>('agenda', { dia }), [dia])
  const catalogoAgenda = useCarga(() => api.get<Catalogo>('agenda/catalogo'), [])
  const [sel, setSel] = useState<number | null>(null)
  const [nueva, setNueva] = useState<boolean>(Boolean(mascotaInicial))
  const [msg, setMsg] = useState<string | null>(null)

  const recargar = () => {
    agenda.recargar()
  }
  if (catalogoAgenda.error) return <Aviso tono="malo">{catalogoAgenda.error}</Aviso>
  if (!catalogoAgenda.datos) return <p className="fz-tenue">Cargando…</p>
  const c = catalogoAgenda.datos
  const recursos = c.recursos.filter((r) => r.activo)

  if (!recursos.length) {
    return (
      <div className="fz-stack">
        <h1 className="fz-h1">Agenda</h1>
        <Aviso>
          La agenda aún no tiene consultorios ni servicios. {cat.permisos.configurarAgenda ? 'Crea los sugeridos (se editan después en Clínica → Recursos y Servicios del panel) o captúralos a mano.' : 'Pídele a un dueño o administrador que los configure.'}
        </Aviso>
        {cat.permisos.configurarAgenda && (
          <div>
            <Boton tono="navy" onClick={() => api.post<{ hecho: string[] }>('agenda/arranque').then(() => catalogoAgenda.recargar(), (e) => setMsg(e instanceof Error ? e.message : 'No se pudo.'))}>
              Crear recursos y servicios sugeridos
            </Boton>
          </div>
        )}
        {msg && <Aviso tono="malo">{msg}</Aviso>}
      </div>
    )
  }

  const a = agenda.datos
  const de = a?.abierto ? minutos(a.de) : 8 * 60
  const hasta = a?.abierto ? minutos(a.a) : 20 * 60
  const filas: number[] = []
  for (let t = de; t < hasta; t += c.configuracion.intervaloMin) filas.push(t)
  const alto = 56 // px por intervalo
  const citaSel = a?.citas.find((x) => x.id === sel) ?? a?.porConfirmar.find((x) => x.id === sel) ?? null

  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Clínica</p>
          <h1 className="fz-h1">Agenda</h1>
        </div>
        <div className="fz-acciones-fin">
          <Boton onClick={() => setNueva(true)}>
            <Icono n="mas" chico /> Nueva cita
          </Boton>
        </div>
      </div>
      <div className="fz-entre">
        <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Boton chico onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior">
            ‹
          </Boton>
          <InputFecha valor={dia} onChange={(v) => v && setDia(v)} />
          <Boton chico onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente">
            ›
          </Boton>
          <Boton chico onClick={() => setDia(hoyISO())}>
            Hoy
          </Boton>
          <b style={{ textTransform: 'capitalize' }}>{diaLargo(dia)}</b>
          {a && !a.abierto && <Pastilla tono="gris">cerrado</Pastilla>}
          {a && a.abierto && (
            <span className="fz-chico fz-tenue">
              {a.de}–{a.a}
            </span>
          )}
        </div>
        <div className="fz-chips">
          {(['solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada', 'cancelada'] as EstadoCitaVista[]).map((e) => (
            <EstadoCita key={e} estado={e} />
          ))}
        </div>
      </div>
      {agenda.error && <Aviso tono="malo">{agenda.error}</Aviso>}
      {!c.configuracion.configurada && cat.permisos.configurarAgenda && <Aviso>Horario de atención por omisión (lunes a viernes 9–19, sábado 9–14). Ajústalo en el panel: Clínica → «Agenda: horario y reglas».</Aviso>}

      <div className="cl-agenda-wrap">
        <div className={`cl-agenda${agenda.cargando ? ' cl-cargando' : ''}`} style={{ gridTemplateColumns: `56px repeat(${recursos.length}, minmax(150px, 1fr))` }}>
          <div className="cl-agenda__h" />
          {recursos.map((r) => (
            <div key={r.id} className="cl-agenda__h">
              {r.nombre}
            </div>
          ))}
          {filas.map((t) => (
            <React.Fragment key={t}>
              <div className="cl-agenda__t" style={{ height: alto }}>
                {`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`}
              </div>
              {recursos.map((r) => {
                const aqui = (a?.citas ?? []).filter((x) => x.recurso.id === r.id && minutos(x.horaInicio) === t)
                return (
                  <div key={r.id} className="cl-agenda__c" style={{ height: alto }} onDoubleClick={() => setNueva(true)}>
                    {aqui.map((x, i) => (
                      <button
                        key={x.id}
                        type="button"
                        className={`cl-cita st-${x.estado}${sel === x.id ? ' is-sel' : ''}`}
                        style={{ height: Math.max(alto - 4, (x.duracionMin / c.configuracion.intervaloMin) * alto - 4), left: `${3 + i * 12}px` }}
                        onClick={() => setSel(x.id)}
                        aria-label={`${x.mascota.nombre}, ${x.servicio.nombre}, ${ESTADO_CITA_LABEL[x.estado]}`}
                      >
                        <b>
                          {x.mascota.nombre}
                          {x.mascota.alertas.length ? ' ⚑' : ''}
                        </b>
                        <span>{x.servicio.nombre}</span>
                        <span className="cl-cita__st">{ESTADO_CITA_LABEL[x.estado]}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
          {/* citas fuera del horario (capturadas a mano) */}
          {(a?.citas ?? []).filter((x) => minutos(x.horaInicio) < de || minutos(x.horaInicio) >= hasta).length > 0 && (
            <div className="cl-agenda__fuera" style={{ gridColumn: `1 / span ${recursos.length + 1}` }}>
              Fuera del horario:{' '}
              {(a?.citas ?? [])
                .filter((x) => minutos(x.horaInicio) < de || minutos(x.horaInicio) >= hasta)
                .map((x) => (
                  <button key={x.id} type="button" className="fz-chip" onClick={() => setSel(x.id)}>
                    {x.horaInicio} {x.mascota.nombre} · {x.recurso.nombre}
                  </button>
                ))}
            </div>
          )}
        </div>

        <aside className="fz-stack fz-stack--chico">
          <div className="fz-tarjeta cl-caja">
            {citaSel ? (
              <DetalleCita cita={citaSel} catalogo={c} onCambio={recargar} />
            ) : (
              <>
                <h3>Elige una cita</h3>
                <p className="fz-chico fz-tenue" style={{ marginTop: 6 }}>Toca una cita para confirmarla, registrar la llegada, pasarla a atención, finalizarla, reprogramarla o cancelarla. Al confirmar o mover, el sistema vuelve a comprobar que el consultorio siga libre.</p>
              </>
            )}
          </div>
          {a && a.porConfirmar.length > 0 && (
            <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
              <h3>
                Por confirmar <Pastilla tono="aviso">{a.porConfirmar.length}</Pastilla>
              </h3>
              {a.porConfirmar.map((x) => (
                <button key={x.id} type="button" className="cl-fila-boton" style={{ padding: '8px 0', display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => { setSel(x.id); if (x.dia !== dia) setDia(x.dia) }}>
                  <span className="fz-grow fz-chico" style={{ textAlign: 'left' }}>
                    <b>{x.mascota.nombre}</b> · {x.servicio.nombre}
                    <br />
                    <span className="fz-tenue">
                      {fecha(x.dia)} {x.horaInicio} · {x.origen === 'portal' ? 'desde el portal' : 'panel'}
                    </span>
                  </span>
                  <Icono n="flecha" chico />
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {nueva && (
        <Modal titulo="Nueva cita" onCerrar={() => setNueva(false)} ancho="ancho">
          <FormularioCita
            catalogo={c}
            diaInicial={dia}
            mascotaInicial={mascotaInicial}
            onListo={(x) => {
              setNueva(false)
              if (x.dia !== dia) setDia(x.dia)
              setSel(x.id)
              recargar()
            }}
          />
        </Modal>
      )}
      <p className="fz-chico fz-tenue">
        Servicios, consultorios y horario se editan en el panel: <Link href={`${base.replace(/\/clinica$/, '')}/collections/servicios`}>Servicios</Link>, <Link href={`${base.replace(/\/clinica$/, '')}/collections/recursos`}>Recursos</Link>, <Link href={`${base.replace(/\/clinica$/, '')}/globals/agenda-configuracion`}>Horario y reglas</Link>.
      </p>
    </div>
  )
}

/* ───────────────────────────── detalle y acciones ───────────────────────────── */

export function DetalleCita({ cita, catalogo, onCambio, compacto }: { cita: CitaVista; catalogo: Catalogo; onCambio: () => void; compacto?: boolean }) {
  const { base, catalogo: cat } = useClinica()
  const [error, setError] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState(cita.notasInternas ?? '')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    setNotas(cita.notasInternas ?? '')
    setMoviendo(false)
    setCancelando(false)
    setError(null)
  }, [cita.id, cita.notasInternas])

  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    setError(null)
    try {
      await fn()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
    setOcupado(false)
  }
  const puede = cat.permisos.agenda
  return (
    <div className="fz-stack fz-stack--chico">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">
            {cita.folio} · {cita.origen === 'portal' ? 'pedida desde el portal' : 'agendada en el panel'}
          </p>
          <h3 style={{ fontSize: 17 }}>
            <Link href={`${base}/mascotas/${cita.mascota.id}`}>{cita.mascota.nombre}</Link> <span className="fz-tenue fz-normal">· {ESPECIE_LABEL[cita.mascota.especie] ?? cita.mascota.especie}</span>
          </h3>
        </div>
        <EstadoCita estado={cita.estado} />
      </div>
      <p className="fz-chico">
        <b>{cita.servicio.nombre}</b> · {diaLargo(cita.dia)} · {cita.horaInicio}–{cita.horaFin} · {cita.recurso.nombre}
        {cita.profesional ? ` · ${cita.profesional.nombre}` : ''}
      </p>
      {cita.cliente && (
        <p className="fz-chico">
          Tutor: <Link href={`${base}/clientes/${cita.cliente.id}`}>{cita.cliente.nombre}</Link>
          {cita.cliente.telefono ? ` · ${cita.cliente.telefono}` : ''}{' '}
          {['solicitada', 'confirmada'].includes(cita.estado) && <BotonWhatsApp telefono={cita.cliente.telefono} mensaje={mensajes.cita(cita.cliente.nombre.split(' ')[0], cita.mascota.nombre, cita.dia, cita.horaInicio, cita.servicio.nombre, site.brand.name)} etiqueta="Recordar por WhatsApp" />}
        </p>
      )}
      {cita.mascota.alertas.length > 0 && <div className="cl-alerta" style={{ fontSize: 13 }}>{cita.mascota.alertas.join(' · ')}</div>}
      {cita.notasTutor && (
        <div className="fz-aviso fz-aviso--info">
          <div>
            <b>Dice el tutor:</b> {cita.notasTutor}
          </div>
        </div>
      )}
      {cita.motivoCancelacion && <p className="fz-chico fz-rojo">Motivo: {cita.motivoCancelacion}</p>}
      {cita.cargoFinanzas && (
        <p className="fz-chico">
          Cargo registrado en Finanzas (<Link href={`${base.replace(/\/clinica$/, '')}/finanzas/operacion/${cita.cargoFinanzas}`}>abrir</Link>).
        </p>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {puede && !moviendo && !cancelando && (
        <div className="fz-acciones-fin">
          {cita.siguientes
            .filter((e) => e !== 'cancelada')
            .map((e) => (
              <Boton key={e} chico tono={e === 'no_asistio' ? 'peligro' : 'navy'} disabled={ocupado} onClick={() => void accion(() => api.post(`agenda/citas/${cita.id}/estado`, { estado: e }))}>
                {ACCION_ESTADO_LABEL[e]}
              </Boton>
            ))}
          {['solicitada', 'confirmada'].includes(cita.estado) && (
            <Boton chico onClick={() => setMoviendo(true)}>
              Reprogramar
            </Boton>
          )}
          {cita.siguientes.includes('cancelada') && (
            <Boton chico tono="peligro" onClick={() => setCancelando(true)}>
              Cancelar
            </Boton>
          )}
        </div>
      )}
      {cancelando && (
        <form
          className="fz-stack fz-stack--chico"
          onSubmit={(e) => {
            e.preventDefault()
            void accion(() => api.post(`agenda/citas/${cita.id}/estado`, { estado: 'cancelada', motivo })).then(() => setCancelando(false))
          }}
        >
          <Campo etiqueta="Motivo de la cancelación *">
            <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required autoFocus />
          </Campo>
          <div className="fz-acciones-fin">
            <button type="submit" className="fz-btn fz-btn--peligro fz-btn--chico" disabled={ocupado}>
              Cancelar la cita
            </button>
            <Boton chico onClick={() => setCancelando(false)}>
              Volver
            </Boton>
          </div>
        </form>
      )}
      {moviendo && (
        <SelectorHorario
          catalogo={catalogo}
          servicioId={cita.servicio.id}
          recursoId={cita.recurso.id}
          diaInicial={cita.dia}
          ignorarCita={cita.id}
          onElegir={(d, h, r) => void accion(() => api.post(`agenda/citas/${cita.id}/reprogramar`, { dia: d, hora: h, recursoId: r })).then(() => setMoviendo(false))}
          onCancelar={() => setMoviendo(false)}
        />
      )}
      {puede && !compacto && (
        <details>
          <summary className="fz-chico" style={{ cursor: 'pointer' }}>Notas internas y quién atiende</summary>
          <div className="fz-stack fz-stack--chico" style={{ marginTop: 8 }}>
            <textarea className="fz-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas internas (el tutor no las ve)" />
            <select className="fz-input fz-input--compacto" value={cita.profesional?.id ?? ''} onChange={(e) => void accion(() => api.post(`agenda/citas/${cita.id}/notas`, { profesionalId: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Atiende: sin asignar</option>
              {cat.equipo.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            <div>
              <Boton chico disabled={ocupado || notas === (cita.notasInternas ?? '')} onClick={() => void accion(() => api.post(`agenda/citas/${cita.id}/notas`, { notasInternas: notas }))}>
                Guardar notas
              </Boton>
            </div>
          </div>
        </details>
      )}
      {!compacto && cita.historial.length > 0 && (
        <details>
          <summary className="fz-chico" style={{ cursor: 'pointer' }}>Historial ({cita.historial.length})</summary>
          <ul className="cl-ul fz-chico">
            {cita.historial.map((h, i) => (
              <li key={i}>
                {momento(h.fecha)} · {ESTADO_CITA_LABEL[h.estado as EstadoCitaVista] ?? h.estado}
                {h.por ? ` · ${h.por}` : ''}
                {h.detalle ? ` · ${h.detalle}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/* ───────────────────────────── elegir día y hora ───────────────────────────── */

function SelectorHorario({ catalogo, servicioId, recursoId, diaInicial, ignorarCita, onElegir, onCancelar, portal }: { catalogo: Catalogo; servicioId: number; recursoId: number | null; diaInicial: string; ignorarCita?: number; onElegir: (dia: string, hora: string, recursoId: number | null) => void; onCancelar?: () => void; portal?: boolean }) {
  const [dia, setDia] = useState(diaInicial)
  const [recurso, setRecurso] = useState<number | null>(recursoId)
  const disp = useCarga(() => api.get<DisponibilidadDia>(portal ? 'portal/citas/disponibilidad' : 'agenda/disponibilidad', { servicio: servicioId, dia, recurso, ignorar: ignorarCita }), [servicioId, dia, recurso, ignorarCita])
  const [hora, setHora] = useState<string | null>(null)
  return (
    <div className="fz-stack fz-stack--chico">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Boton chico onClick={() => setDia(sumarDias(dia, -1))}>
          ‹
        </Boton>
        <InputFecha valor={dia} onChange={(v) => v && setDia(v)} />
        <Boton chico onClick={() => setDia(sumarDias(dia, 1))}>
          ›
        </Boton>
        {!portal && (
          <select className="fz-input fz-input--compacto" value={recurso ?? ''} onChange={(e) => setRecurso(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Recurso del servicio</option>
            {catalogo.recursos.filter((r) => r.activo).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="fz-chico" style={{ textTransform: 'capitalize' }}>{diaLargo(dia)}</p>
      {disp.error && <Aviso tono="malo">{disp.error}</Aviso>}
      {disp.datos && !disp.datos.abierto && <Aviso tono="gris">{disp.datos.motivo ?? 'Cerrado.'}</Aviso>}
      {disp.datos && disp.datos.abierto && (
        <div className="cl-huecos">
          {disp.datos.huecos.map((h) => (
            <button key={h.hora} type="button" className={`cl-hueco${hora === h.hora ? ' is-on' : ''}`} disabled={!h.disponible} onClick={() => setHora(h.hora)}>
              {h.hora}
            </button>
          ))}
          {disp.datos.huecos.every((h) => !h.disponible) && <p className="fz-chico fz-tenue">Sin huecos ese día.</p>}
        </div>
      )}
      <div className="fz-acciones-fin">
        <Boton chico tono="navy" disabled={!hora} onClick={() => hora && onElegir(dia, hora, recurso)}>
          {hora ? `Confirmar ${fecha(dia)} ${hora}` : 'Elige una hora'}
        </Boton>
        {onCancelar && (
          <Boton chico onClick={onCancelar}>
            Volver
          </Boton>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────── nueva cita ───────────────────────────── */

function FormularioCita({ catalogo, diaInicial, mascotaInicial, onListo }: { catalogo: Catalogo; diaInicial: string; mascotaInicial: number | null; onListo: (c: CitaVista) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ResultadoBusqueda['mascotas']>([])
  const [mascota, setMascota] = useState<{ id: number; nombre: string; especie: string; tutor: string } | null>(null)
  const [servicio, setServicio] = useState<number | ''>('')
  const [confirmar, setConfirmar] = useState(true)
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!mascotaInicial) return
    api.get<{ mascota: { id: number; nombre: string; especie: string; tutores: { nombre: string }[] } }>(`mascotas/${mascotaInicial}`).then((e) => setMascota({ id: e.mascota.id, nombre: e.mascota.nombre, especie: e.mascota.especie, tutor: e.mascota.tutores.map((t) => t.nombre).join(', ') }), () => undefined)
  }, [mascotaInicial])
  useEffect(() => {
    if (!q.trim()) {
      setRes([])
      return
    }
    const t = setTimeout(() => api.get<ResultadoBusqueda>('buscar', { q }).then((r) => setRes(r.mascotas), () => setRes([])), 250)
    return () => clearTimeout(t)
  }, [q])
  const serv = catalogo.servicios.find((s) => s.id === servicio)
  return (
    <div className="fz-stack fz-stack--chico">
      {!mascota ? (
        <>
          <div className="fz-buscar">
            <Icono n="buscar" />
            <input className="fz-input" placeholder="Buscar mascota por nombre, tutor o teléfono" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {res.length > 0 && (
            <div className="fz-tarjeta fz-lista">
              {res.map((m) => (
                <button key={m.id} type="button" className="fz-fila cl-fila-boton" onClick={() => setMascota({ id: m.id, nombre: m.nombre, especie: m.especie, tutor: m.tutores.map((t) => t.nombre).join(', ') })}>
                  <Avatar nombre={m.nombre} especie={m.especie} />
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">{m.nombre}</span>
                    <span className="fz-fila__t2">
                      {ESPECIE_LABEL[m.especie] ?? m.especie} · {m.tutores.map((t) => t.nombre).join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="fz-chico fz-tenue">¿Mascota nueva? Dala de alta primero en «Nueva mascota» y vuelve aquí.</p>
        </>
      ) : (
        <div className="cl-tutor-fila" style={{ borderBottom: 0 }}>
          <Avatar nombre={mascota.nombre} especie={mascota.especie} />
          <span className="fz-grow">
            <b>{mascota.nombre}</b> <span className="fz-tenue fz-chico">{mascota.tutor}</span>
          </span>
          <Boton chico onClick={() => setMascota(null)}>
            Cambiar
          </Boton>
        </div>
      )}
      {mascota && (
        <>
          <Campo etiqueta="Servicio *">
            <select className="fz-input" value={servicio} onChange={(e) => setServicio(e.target.value ? Number(e.target.value) : '')}>
              <option value="">—</option>
              {catalogo.servicios.filter((s) => s.activo).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {s.duracionMin} min{s.precio ? ` · $${s.precio}` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Notas internas">
            <input className="fz-input" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
          <label className="cl-check">
            <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} /> Dejarla confirmada (ya se acordó con el tutor)
          </label>
          <ErrorForm error={error} />
          {serv && (
            <SelectorHorario
              catalogo={catalogo}
              servicioId={serv.id}
              recursoId={null}
              diaInicial={diaInicial}
              onElegir={(d, h, r) =>
                api.post<CitaVista>('agenda/citas', { mascotaId: mascota.id, servicioId: serv.id, dia: d, hora: h, recursoId: r, confirmar, notasInternas: notas }).then(onListo, (e) => setError(e instanceof Error ? e.message : 'No se pudo agendar.'))
              }
            />
          )}
        </>
      )}
    </div>
  )
}

export { SelectorHorario }
