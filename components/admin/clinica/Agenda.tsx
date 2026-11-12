'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { ACCION_ESTADO_LABEL, type CitaVista, type DisponibilidadDia, ESTADO_CITA_LABEL, type EstadoCitaVista, type RecursoVista, type ResultadoBusqueda, type ServicioVista, type ConfiguracionAgenda } from '../../../lib/clinica/tipos'
import { api, Avatar, Aviso, Ayuda, Boton, BotonWhatsApp, Campo, Confirmar, ErrorForm, ESPECIE_LABEL, fecha, hoyISO, Icono, InputFecha, Modal, momento, Pastilla, telefonoBonito, useCarga, useClinica } from './comun'
import { diaLocal, partesLocales } from '../../../lib/localTime'
import { site } from '../../../lib/site'
import { mensajes } from '../../../lib/whatsapp'

/**
 * Agenda del panel: un día, una columna por recurso (espacio), las citas como
 * bloques según su hora y duración. A la derecha, la cita elegida con su línea
 * de tiempo y acciones, y las solicitudes del portal por confirmar.
 *
 * Dibujo (Versión A, fase 3, nov-2026): cada cita se coloca por minuto sobre
 * la columna de su espacio (una capa por columna encima de las celdas), así
 * que una cita a las 10:15 con intervalos de 30 min cae a media fila y ninguna
 * se pierde al cambiar el intervalo. Las que se enciman se reparten en
 * columnas del ancho de la celda (`acomodar`). Clic en una celda vacía abre
 * «Nueva cita» con esa hora y ese espacio.
 */

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
const hhmm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
const sumarDias = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaLargo = (d: string) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fecha(d)}`
const esHora = (h: string | null | undefined): h is string => Boolean(h && /^([01]\d|2[0-3]):[0-5]\d$/.test(h))

type Catalogo = { recursos: RecursoVista[]; servicios: ServicioVista[]; configuracion: ConfiguracionAgenda }
/** Hora y espacio con que se abre «Nueva cita» (clic en una celda vacía o regreso del alta de mascota). */
type Preparada = { dia?: string; hora?: string | null; recurso?: number | null }

/** Pastilla de estado con la paleta de la marca (clinica.css: .cl-st); es la misma de los bloques de la agenda. */
export function EstadoCita({ estado }: { estado: EstadoCitaVista }) {
  return <span className={`cl-st cl-st--${estado}`}>{ESTADO_CITA_LABEL[estado]}</span>
}

/** Minutos del día y fecha en la zona del negocio; se refresca cada 30 s. Null hasta montar (sin desfase de hidratación). */
function useAhora(): { dia: string; min: number } | null {
  const [ahora, setAhora] = useState<{ dia: string; min: number } | null>(null)
  useEffect(() => {
    const leer = () => {
      const d = new Date()
      const p = partesLocales(d)
      setAhora({ dia: diaLocal(d), min: p.hour * 60 + p.minute })
    }
    leer()
    const t = setInterval(leer, 30_000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

/* ───────────────────────────── acomodo de bloques ───────────────────────────── */

const ALTO = 56 // px por intervalo
const ALTO_MIN = 44 // px: un bloque más bajo no se lee (nombre + hora y servicio)
const COL_MIN = 120 // px: ancho mínimo de un espacio
const SUBCOL_MIN = 104 // px: ancho mínimo de cada cita cuando varias se enciman

export type Bloque = { cita: CitaVista; ini: number; top: number; alto: number; col: number; cols: number }

/**
 * Coloca las citas de UN espacio: posición vertical por minuto y, si se enciman,
 * columnas lado a lado. Dos bloques chocan si se enciman *a la vista* (un bloque
 * de 15 min se dibuja al menos de ALTO_MIN px), no solo por horario, para que
 * ninguno tape a otro. Todos los de un mismo grupo de choques usan el mismo
 * número de columnas.
 */
export function acomodar(citas: CitaVista[], de: number, intervalo: number, alto = ALTO): Bloque[] {
  const px = alto / intervalo
  const minVisible = Math.ceil((ALTO_MIN + 4) / px)
  const orden = [...citas].sort((a, b) => minutos(a.horaInicio) - minutos(b.horaInicio) || b.duracionMin - a.duracionMin || a.id - b.id)
  const res: Bloque[] = []
  let grupo: Bloque[] = []
  let fines: number[] = []
  let finGrupo = -Infinity
  const cerrar = () => {
    for (const b of grupo) b.cols = fines.length
    grupo = []
    fines = []
    finGrupo = -Infinity
  }
  for (const c of orden) {
    const ini = minutos(c.horaInicio)
    const finVisible = ini + Math.max(c.duracionMin, minVisible)
    if (grupo.length && ini >= finGrupo) cerrar()
    let col = fines.findIndex((f) => f <= ini)
    if (col === -1) {
      col = fines.length
      fines.push(finVisible)
    } else fines[col] = finVisible
    finGrupo = Math.max(finGrupo, finVisible)
    const b: Bloque = { cita: c, ini, top: (ini - de) * px + 2, alto: Math.max(ALTO_MIN, c.duracionMin * px - 4), col, cols: 1 }
    grupo.push(b)
    res.push(b)
  }
  cerrar()
  return res
}

/* ───────────────────────────── pantalla ───────────────────────────── */

export default function Agenda({ diaInicial, mascotaInicial, nuevaInicial = false, horaInicial = null, recursoInicial = null }: { diaInicial: string | null; mascotaInicial: number | null; nuevaInicial?: boolean; horaInicial?: string | null; recursoInicial?: number | null }) {
  const { catalogo: cat, base } = useClinica()
  const [dia, setDia] = useState(diaInicial && /^\d{4}-\d{2}-\d{2}$/.test(diaInicial) ? diaInicial : hoyISO())
  const agenda = useCarga(() => api.get<{ dia: string; citas: CitaVista[]; porConfirmar: CitaVista[]; abierto: boolean; de: string; a: string }>('agenda', { dia }), [dia])
  const catalogoAgenda = useCarga(() => api.get<Catalogo>('agenda/catalogo'), [])
  const [sel, setSel] = useState<number | null>(null)
  const [nueva, setNueva] = useState<Preparada | null>(Boolean(mascotaInicial) || nuevaInicial ? { hora: esHora(horaInicial) ? horaInicial : null, recurso: recursoInicial } : null)
  const [msg, setMsg] = useState<string | null>(null)
  const ahora = useAhora()
  const rejilla = useRef<HTMLDivElement>(null)
  const lateral = useRef<HTMLElement>(null)
  const desplazado = useRef<string | null>(null)

  const a = agenda.datos
  const c = catalogoAgenda.datos
  const intervalo = c?.configuracion.intervaloMin || 30
  const de = a?.abierto ? minutos(a.de) : 8 * 60
  const hasta = a?.abierto ? minutos(a.a) : 20 * 60
  const esHoy = Boolean(ahora && a && ahora.dia === a.dia)
  const ahoraMin = esHoy && ahora && ahora.min >= de && ahora.min < hasta ? ahora.min : null

  /* Al abrir el día de hoy, la línea de «ahora» queda a la vista (una vez por día mostrado). */
  useEffect(() => {
    if (!a || ahoraMin === null || desplazado.current === a.dia || !rejilla.current) return
    desplazado.current = a.dia
    rejilla.current.scrollTop = Math.max(0, ((ahoraMin - de) / intervalo) * ALTO - ALTO * 1.5)
  }, [a, ahoraMin, de, intervalo])

  /* En pantallas angostas el detalle queda debajo de la rejilla: al elegir una cita se lleva a la vista. */
  useEffect(() => {
    if (sel === null || !lateral.current || window.matchMedia('(min-width: 1000px)').matches) return
    lateral.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sel])

  if (catalogoAgenda.error) return <Aviso tono="malo">{catalogoAgenda.error}</Aviso>
  if (!c) return <p className="fz-tenue">Cargando…</p>
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

  const filas: number[] = []
  for (let t = de; t < hasta; t += intervalo) filas.push(t)
  const N = filas.length
  const citas = a?.citas ?? []
  const dentro = citas.filter((x) => minutos(x.horaInicio) >= de && minutos(x.horaInicio) < hasta)
  const fuera = citas.filter((x) => minutos(x.horaInicio) < de || minutos(x.horaInicio) >= hasta)
  const filaAhora = ahoraMin === null ? -1 : Math.floor((ahoraMin - de) / intervalo)
  /* Bloques por espacio; un espacio con citas encimadas se ensancha para que cada una se lea (la rejilla se desplaza de lado si no cabe). */
  const bloques = recursos.map((r) => acomodar(dentro.filter((x) => x.recurso.id === r.id), de, intervalo))
  const columnas = bloques.map((bs) => `minmax(${Math.max(COL_MIN, ...bs.map((b) => b.cols * SUBCOL_MIN))}px, 1fr)`).join(' ')
  const citaSel = citas.find((x) => x.id === sel) ?? a?.porConfirmar.find((x) => x.id === sel) ?? null
  const libre = Boolean(a?.abierto)

  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <div>
          <h1 className="fz-h1">Agenda</h1>
          <p className="fz-chico fz-tenue">
            {recursos.length} {recursos.length === 1 ? 'espacio' : 'espacios'} · intervalos de {intervalo} min{a?.abierto ? ` · horario ${a.de}–${a.a}` : ''}
          </p>
        </div>
        <div className="fz-acciones-fin">
          <Boton tono="navy" onClick={() => setNueva({})}>
            <Icono n="mas" chico /> Nueva cita
          </Boton>
        </div>
      </div>
      <div className="fz-entre">
        <div className="cl-agenda__dia">
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
        </div>
        <div className="fz-chips">
          {(['solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada', 'cancelada'] as EstadoCitaVista[]).map((e) => (
            <EstadoCita key={e} estado={e} />
          ))}
        </div>
      </div>
      {agenda.error && <Aviso tono="malo">{agenda.error}</Aviso>}
      {!c.configuracion.configurada && cat.permisos.configurarAgenda && <Aviso>Horario por omisión: L–V 9–19, sáb 9–14. Ajústalo en «Agenda: horario y reglas».</Aviso>}

      <div className="cl-agenda-wrap">
        <div ref={rejilla} className={`cl-agenda${agenda.cargando ? ' cl-cargando' : ''}`} style={{ gridTemplateColumns: `56px ${columnas}` }}>
          <div className="cl-agenda__h cl-agenda__h--esquina" style={{ gridRow: 1, gridColumn: 1 }} />
          {recursos.map((r, j) => (
            <div key={r.id} className="cl-agenda__h" style={{ gridRow: 1, gridColumn: j + 2 }}>
              {r.nombre}
            </div>
          ))}
          {filas.map((t, i) => (
            <React.Fragment key={t}>
              <div className="cl-agenda__t" style={{ gridRow: i + 2, gridColumn: 1, height: ALTO }}>
                {hhmm(t)}
              </div>
              {recursos.map((r, j) => (
                <div
                  key={r.id}
                  className={`cl-agenda__c${i === filaAhora ? ' is-ahora' : ''}${libre ? ' is-libre' : ''}`}
                  style={{ gridRow: i + 2, gridColumn: j + 2, height: ALTO }}
                  data-hora={hhmm(t)}
                  title={libre ? `Nueva cita: ${hhmm(t)} · ${r.nombre}` : undefined}
                  onClick={libre ? () => setNueva({ dia, hora: hhmm(t), recurso: r.id }) : undefined}
                />
              ))}
            </React.Fragment>
          ))}
          {/* Una capa por espacio con sus citas, colocadas por minuto y repartidas en columnas si se enciman. */}
          {recursos.map((r, j) => (
            <div key={`capa-${r.id}`} className="cl-agenda__capa" style={{ gridRow: `2 / span ${N}`, gridColumn: j + 2 }}>
              {bloques[j].map((b) => {
                const x = b.cita
                return (
                  <button
                    key={x.id}
                    type="button"
                    className={`cl-cita st-${x.estado}${sel === x.id ? ' is-sel' : ''}${b.alto < 64 ? ' is-corta' : ''}`}
                    style={{ top: b.top, height: b.alto, left: `calc(${(b.col * 100) / b.cols}% + 3px)`, width: `calc(${100 / b.cols}% - 6px)` }}
                    onClick={() => setSel(x.id)}
                    title={`${x.horaInicio}–${x.horaFin} · ${x.mascota.nombre} · ${x.servicio.nombre} · ${ESTADO_CITA_LABEL[x.estado]}`}
                    aria-label={`${x.horaInicio}, ${x.mascota.nombre}, ${x.servicio.nombre}, ${ESTADO_CITA_LABEL[x.estado]}`}
                  >
                    <b>
                      {x.mascota.nombre}
                      {x.mascota.alertas.length ? ' ⚑' : ''}
                    </b>
                    <span>
                      {x.horaInicio} · {x.servicio.nombre}
                    </span>
                    <span className="cl-cita__st">{ESTADO_CITA_LABEL[x.estado]}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {ahoraMin !== null && (
            <div className="cl-agenda__ahora-capa" style={{ gridRow: `2 / span ${N}`, gridColumn: '1 / -1' }} aria-hidden="true">
              <div className="cl-agenda__ahora" style={{ top: ((ahoraMin - de) / intervalo) * ALTO }}>
                <span>{hhmm(ahoraMin)}</span>
              </div>
            </div>
          )}
          {/* citas fuera del horario (capturadas a mano) */}
          {fuera.length > 0 && (
            <div className="cl-agenda__fuera" style={{ gridRow: N + 2, gridColumn: '1 / -1' }}>
              Fuera del horario:{' '}
              {fuera.map((x) => (
                <button key={x.id} type="button" className="fz-chip" onClick={() => setSel(x.id)}>
                  {x.horaInicio} {x.mascota.nombre} · {x.recurso.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside ref={lateral} className="fz-stack fz-stack--chico cl-agenda__lateral">
          <div className="fz-tarjeta cl-caja">
            {citaSel ? (
              <DetalleCita cita={citaSel} catalogo={c} onCambio={agenda.recargar} />
            ) : (
              <div className="fz-stack fz-stack--chico">
                <h3>Elige una cita</h3>
                <p className="fz-chico fz-tenue">{libre ? 'O toca una hora libre para agendar ahí.' : 'Este día está cerrado.'}</p>
                <Ayuda>
                  Toca una cita para confirmarla, registrar la llegada, pasarla a atención, finalizarla, reprogramarla o cancelarla. Al confirmar o mover, el sistema vuelve a comprobar que el espacio siga libre. Una celda vacía abre «Nueva cita» con esa hora y ese espacio ya puestos.
                </Ayuda>
              </div>
            )}
          </div>
          {a && a.porConfirmar.length > 0 && (
            <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
              <h3>
                Por confirmar <Pastilla tono="aviso">{a.porConfirmar.length}</Pastilla>
              </h3>
              {a.porConfirmar.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="cl-fila-boton"
                  style={{ padding: '8px 0', display: 'flex', gap: 8, alignItems: 'center' }}
                  onClick={() => {
                    setSel(x.id)
                    if (x.dia !== dia) setDia(x.dia)
                  }}
                >
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
        <Modal titulo="Nueva cita" onCerrar={() => setNueva(null)} ancho="ancho">
          <FormularioCita
            catalogo={c}
            diaInicial={nueva.dia ?? dia}
            horaInicial={nueva.hora ?? null}
            recursoInicial={nueva.recurso ?? null}
            mascotaInicial={mascotaInicial}
            onListo={(x) => {
              setNueva(null)
              if (x.dia !== dia) setDia(x.dia)
              setSel(x.id)
              agenda.recargar()
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

/** Orden de avance de una cita: la primera transición de esta lista es la acción principal. */
const AVANCE: EstadoCitaVista[] = ['confirmada', 'llegada', 'atencion', 'finalizada']

const horaCorta = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: site.location.timeZone }).format(new Date(iso))
  } catch {
    return ''
  }
}
const duracionTexto = (min: number) => {
  const m = Math.max(0, Math.round(min))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}

/**
 * Tiempo en clínica: desde que se registró la llegada (o, si pasó directo, desde
 * que entró a atención) hasta ahora o hasta que se finalizó. Sale del historial.
 */
function tiempoEnClinica(cita: CitaVista, ahora: number): { desde: string; min: number; enAtencionMin: number | null; termino: boolean } | null {
  if (!['llegada', 'atencion', 'finalizada'].includes(cita.estado)) return null
  const ultimo = (e: string) => [...cita.historial].reverse().find((h) => h.estado === e)
  const llegada = ultimo('llegada') ?? ultimo('atencion')
  if (!llegada) return null
  const ini = new Date(llegada.fecha).getTime()
  const finalizada = cita.estado === 'finalizada' ? ultimo('finalizada') : null
  if (cita.estado === 'finalizada' && !finalizada) return null
  const hasta = finalizada ? new Date(finalizada.fecha).getTime() : ahora
  const atencion = cita.estado === 'atencion' ? ultimo('atencion') : null
  return {
    desde: horaCorta(llegada.fecha),
    min: (hasta - ini) / 60_000,
    enAtencionMin: atencion && atencion !== llegada ? (ahora - new Date(atencion.fecha).getTime()) / 60_000 : null,
    termino: Boolean(finalizada),
  }
}

/** Hora actual (ms) que avanza cada 30 s mientras `activo` (la mascota está en la clínica). */
function useReloj(activo: boolean): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    const tic = () => setT(Date.now())
    tic()
    const id = setInterval(tic, 30_000)
    return () => clearInterval(id)
  }, [activo])
  return t
}

export function DetalleCita({ cita, catalogo, onCambio, compacto }: { cita: CitaVista; catalogo: Catalogo; onCambio: () => void; compacto?: boolean }) {
  const { base, catalogo: cat } = useClinica()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [confirmando, setConfirmando] = useState<EstadoCitaVista | null>(null)
  const [abrirNota, setAbrirNota] = useState(true)
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState(cita.notasInternas ?? '')
  const [ocupado, setOcupado] = useState(false)
  const reloj = useReloj(['llegada', 'atencion'].includes(cita.estado))
  useEffect(() => {
    setNotas(cita.notasInternas ?? '')
    setMoviendo(false)
    setCancelando(false)
    setConfirmando(null)
    setError(null)
  }, [cita.id, cita.notasInternas])

  const accion = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setOcupado(true)
    setError(null)
    try {
      await fn()
      onCambio()
      setOcupado(false)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
      setOcupado(false)
      return false
    }
  }
  const puede = cat.permisos.agenda
  const verNotas = cat.permisos.verExpediente
  const hrefNota = `${base}/mascotas/${cita.mascota.id}?ver=notas`
  const hrefCobro = cita.cargoFinanzas ? `${base.replace(/\/clinica$/, '')}/finanzas/operacion/${cita.cargoFinanzas}` : null
  const irANota = () => {
    /* En el expediente de la misma mascota, la pestaña se lee al cargar: recarga en vez de navegar en el cliente. */
    if (typeof window !== 'undefined' && window.location.pathname === `${base}/mascotas/${cita.mascota.id}`) window.location.assign(new URL(hrefNota, window.location.href).toString())
    else router.push(hrefNota)
  }
  const cambiarEstado = (e: EstadoCitaVista) => accion(() => api.post(`agenda/citas/${cita.id}/estado`, { estado: e }))
  /* Finalizar (genera el cargo en Finanzas) y «No asistió» cierran la cita sin vuelta atrás: piden confirmación. */
  const pideConfirmar = (e: EstadoCitaVista) => e === 'finalizada' || e === 'no_asistio'
  const servicio = catalogo.servicios.find((x) => x.id === cita.servicio.id)
  const precioServicio = servicio?.precio ?? null
  const principal = AVANCE.find((e) => cita.siguientes.includes(e)) ?? null
  const otras = cita.siguientes.filter((e) => e !== 'cancelada' && e !== principal)
  const enClinica = tiempoEnClinica(cita, reloj)
  const tutorCorto = cita.cliente?.nombre.split(' ')[0] ?? ''
  const pulsar = (e: EstadoCitaVista) => (pideConfirmar(e) ? setConfirmando(e) : void cambiarEstado(e))

  return (
    <div className="fz-stack fz-stack--chico cl-detalle">
      <div className="cl-detalle__cab">
        <Avatar nombre={cita.mascota.nombre} especie={cita.mascota.especie} foto={cita.mascota.foto} />
        <div className="fz-grow" style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 17 }}>
            <Link href={`${base}/mascotas/${cita.mascota.id}`}>{cita.mascota.nombre}</Link> <span className="fz-tenue fz-normal">· {ESPECIE_LABEL[cita.mascota.especie] ?? cita.mascota.especie}</span>
          </h3>
          {cita.cliente && (
            <p className="fz-chico fz-tenue">
              <Link href={`${base}/clientes/${cita.cliente.id}`}>{cita.cliente.nombre}</Link>
              {cita.cliente.telefono ? ` · ${telefonoBonito(cita.cliente.telefono)}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="fz-entre">
        <span className="cl-detalle__estado">
          <EstadoCita estado={cita.estado} />
          {enClinica && !enClinica.termino && <span className="fz-chico">{duracionTexto(enClinica.min)} en clínica</span>}
        </span>
        <span className="fz-chico fz-tenue">{cita.folio}</span>
      </div>
      <dl className="cl-dl">
        <dt>Servicio</dt>
        <dd>
          {cita.servicio.nombre}
          {precioServicio ? ` · ${pesos(precioServicio)}` : ''}
        </dd>
        <dt>Hora</dt>
        <dd>
          <span style={{ textTransform: 'capitalize' }}>{diaLargo(cita.dia)}</span> · {cita.horaInicio}–{cita.horaFin} · {cita.duracionMin} min
        </dd>
        <dt>Espacio</dt>
        <dd>{cita.recurso.nombre}</dd>
        <dt>Atiende</dt>
        <dd>{cita.profesional?.nombre ?? <span className="fz-tenue">Sin asignar</span>}</dd>
        {enClinica && (
          <>
            <dt>En clínica</dt>
            <dd>
              Desde {enClinica.desde}
              {enClinica.termino ? ` · ${duracionTexto(enClinica.min)} en total` : ''}
              {enClinica.enAtencionMin !== null ? ` · ${duracionTexto(enClinica.enAtencionMin)} en atención` : ''}
            </dd>
          </>
        )}
      </dl>
      {cita.mascota.alertas.length > 0 && <div className="cl-alerta" style={{ fontSize: 13 }}>{cita.mascota.alertas.join(' · ')}</div>}
      {cita.notasTutor && (
        <div className="fz-aviso fz-aviso--info">
          <div>
            <b>Dice el tutor:</b> {cita.notasTutor}
          </div>
        </div>
      )}
      {cita.motivoCancelacion && <p className="fz-chico fz-rojo">Motivo: {cita.motivoCancelacion}</p>}
      {!compacto && cita.historial.length > 0 && (
        <ol className="cl-tl" aria-label="Línea de tiempo de la cita">
          {cita.historial.map((h, i) => {
            const otroDia = h.fecha && diaLocal(new Date(h.fecha)) !== cita.dia
            return (
              <li key={i} data-st={h.estado}>
                <time dateTime={h.fecha} title={momento(h.fecha)}>
                  {otroDia ? `${fecha(diaLocal(new Date(h.fecha)), false)} ` : ''}
                  {horaCorta(h.fecha)}
                </time>
                <span>
                  {h.detalle && i === 0 ? h.detalle : ESTADO_CITA_LABEL[h.estado as EstadoCitaVista] ?? h.estado}
                  {h.por ? <span className="fz-tenue"> · {h.por}</span> : null}
                  {h.detalle && i > 0 ? <span className="fz-tenue"> · {h.detalle}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {puede && !moviendo && !cancelando && (
        <div className="fz-stack fz-stack--chico">
          {principal && (
            <Boton tono="navy" className="cl-detalle__principal" disabled={ocupado} onClick={() => pulsar(principal)}>
              {principal === 'finalizada' ? 'Finalizar consulta' : ACCION_ESTADO_LABEL[principal]}
            </Boton>
          )}
          <div className="fz-acciones-fin cl-detalle__acciones">
            {otras.map((e) => (
              <Boton key={e} chico tono={e === 'no_asistio' ? 'peligro' : 'claro'} disabled={ocupado} onClick={() => pulsar(e)}>
                {ACCION_ESTADO_LABEL[e]}
              </Boton>
            ))}
            {cita.estado === 'atencion' && verNotas && (
              <Link href={hrefNota} className="fz-btn fz-btn--claro fz-btn--chico">
                Abrir nota
              </Link>
            )}
            {['solicitada', 'confirmada'].includes(cita.estado) && (
              <Boton chico onClick={() => setMoviendo(true)}>
                Reprogramar
              </Boton>
            )}
            {cita.cliente && ['solicitada', 'confirmada'].includes(cita.estado) && <BotonWhatsApp telefono={cita.cliente.telefono} mensaje={mensajes.cita(tutorCorto, cita.mascota.nombre, cita.dia, cita.horaInicio, cita.servicio.nombre, site.brand.name)} etiqueta="Recordar por WhatsApp" />}
            {cita.siguientes.includes('cancelada') && (
              <Boton chico tono="peligro" onClick={() => setCancelando(true)}>
                Cancelar
              </Boton>
            )}
          </div>
        </div>
      )}
      {cita.estado === 'finalizada' && (verNotas || hrefCobro) && (
        <div className="cl-detalle__despues">
          <p className="fz-chico">
            <b>Consulta finalizada.</b> {hrefCobro ? 'El cargo ya está en Finanzas.' : 'El servicio no tenía precio: no se generó cargo.'}
          </p>
          <div className="fz-acciones-fin cl-detalle__acciones">
            {verNotas && (
              <Link href={hrefNota} className="fz-btn fz-btn--navy fz-btn--chico">
                Abrir nota
              </Link>
            )}
            {hrefCobro && (
              <Link href={hrefCobro} className="fz-btn fz-btn--claro fz-btn--chico">
                Registrar cobro
              </Link>
            )}
          </div>
        </div>
      )}
      {cita.estado !== 'finalizada' && hrefCobro && (
        <p className="fz-chico">
          Cargo registrado en Finanzas (<Link href={hrefCobro}>abrir</Link>).
        </p>
      )}
      {cancelando && (
        <form
          className="fz-stack fz-stack--chico"
          onSubmit={(e) => {
            e.preventDefault()
            void accion(() => api.post(`agenda/citas/${cita.id}/estado`, { estado: 'cancelada', motivo })).then((ok) => ok && setCancelando(false))
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
          onElegir={(d, h, r) => void accion(() => api.post(`agenda/citas/${cita.id}/reprogramar`, { dia: d, hora: h, recursoId: r })).then((ok) => ok && setMoviendo(false))}
          onCancelar={() => setMoviendo(false)}
        />
      )}
      {confirmando === 'finalizada' && (
        <Confirmar
          titulo={`¿Finalizar la consulta de ${cita.mascota.nombre}?`}
          etiquetaSi={verNotas && abrirNota ? 'Finalizar y abrir nota' : 'Finalizar'}
          ocupado={ocupado}
          onNo={() => setConfirmando(null)}
          onSi={() => {
            setConfirmando(null)
            const ir = verNotas && abrirNota
            void cambiarEstado('finalizada').then((ok) => ok && ir && irANota())
          }}
        >
          {precioServicio ? (
            <p>
              Se registrará en Finanzas un cargo de <b>{pesos(precioServicio)}</b> por «{cita.servicio.nombre}»{cita.cliente ? <> a nombre de {cita.cliente.nombre}</> : null}.
            </p>
          ) : (
            <p>Este servicio no tiene precio, así que no se genera ningún cargo en Finanzas.</p>
          )}
          <p>La cita quedará como finalizada y ya no se podrá cambiar de estado.</p>
          {verNotas && (
            <label className="cl-check">
              <input type="checkbox" checked={abrirNota} onChange={(e) => setAbrirNota(e.target.checked)} /> Abrir la nota clínica al terminar
            </label>
          )}
        </Confirmar>
      )}
      {confirmando === 'no_asistio' && (
        <Confirmar
          titulo={`¿Marcar que ${cita.mascota.nombre} no asistió?`}
          etiquetaSi="Sí, no asistió"
          tono="peligro"
          ocupado={ocupado}
          onNo={() => setConfirmando(null)}
          onSi={() => {
            setConfirmando(null)
            void cambiarEstado('no_asistio')
          }}
        >
          <p>
            La cita de {diaLargo(cita.dia)} a las {cita.horaInicio} se cierra como «No asistió» y ya no se podrá cambiar de estado.
          </p>
        </Confirmar>
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
    </div>
  )
}

/* ───────────────────────────── elegir día y hora ───────────────────────────── */

function SelectorHorario({ catalogo, servicioId, recursoId, diaInicial, horaInicial = null, ignorarCita, onElegir, onCancelar, portal }: { catalogo: Catalogo; servicioId: number; recursoId: number | null; diaInicial: string; horaInicial?: string | null; ignorarCita?: number; onElegir: (dia: string, hora: string, recursoId: number | null) => void; onCancelar?: () => void; portal?: boolean }) {
  const [dia, setDia] = useState(diaInicial)
  const [recurso, setRecurso] = useState<number | null>(recursoId)
  const disp = useCarga(() => api.get<DisponibilidadDia>(portal ? 'portal/citas/disponibilidad' : 'agenda/disponibilidad', { servicio: servicioId, dia, recurso, ignorar: ignorarCita }), [servicioId, dia, recurso, ignorarCita])
  const [hora, setHora] = useState<string | null>(horaInicial)
  /* Una hora puesta de antemano (clic en la celda) solo vale si está libre para este servicio, día y espacio. */
  const hueco = disp.datos?.abierto ? disp.datos.huecos.find((h) => h.hora === hora) : undefined
  const horaValida = hora && hueco?.disponible ? hora : null
  const preparadaOcupada = Boolean(horaInicial && hora === horaInicial && disp.datos && !disp.cargando && !horaValida)
  return (
    <div className="fz-stack fz-stack--chico">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Boton chico onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior">
          ‹
        </Boton>
        <InputFecha valor={dia} onChange={(v) => v && setDia(v)} />
        <Boton chico onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente">
          ›
        </Boton>
        {!portal && (
          <select className="fz-input fz-input--compacto" value={recurso ?? ''} onChange={(e) => setRecurso(e.target.value ? Number(e.target.value) : null)} aria-label="Espacio">
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
      {preparadaOcupada && <Aviso tono="aviso">Las {hora} no están libres para este servicio en ese espacio. Elige otra hora.</Aviso>}
      {disp.datos && disp.datos.abierto && (
        <div className="cl-huecos">
          {disp.datos.huecos.map((h) => (
            <button key={h.hora} type="button" className={`cl-hueco${horaValida === h.hora ? ' is-on' : ''}`} disabled={!h.disponible} onClick={() => setHora(h.hora)}>
              {h.hora}
            </button>
          ))}
          {disp.datos.huecos.every((h) => !h.disponible) && <p className="fz-chico fz-tenue">Sin huecos ese día.</p>}
        </div>
      )}
      <div className="fz-acciones-fin">
        <Boton chico tono="navy" disabled={!horaValida} onClick={() => horaValida && onElegir(dia, horaValida, recurso)}>
          {horaValida ? `Confirmar ${fecha(dia)} ${horaValida}` : 'Elige una hora'}
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

function FormularioCita({ catalogo, diaInicial, horaInicial, recursoInicial, mascotaInicial, onListo }: { catalogo: Catalogo; diaInicial: string; horaInicial: string | null; recursoInicial: number | null; mascotaInicial: number | null; onListo: (c: CitaVista) => void }) {
  const { base, catalogo: cat } = useClinica()
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
  const recursoPrep = recursoInicial ? catalogo.recursos.find((r) => r.id === recursoInicial) ?? null : null
  /* Alta de mascota que regresa a esta agenda con la misma hora y el mismo espacio (AppClinica: ?volver=agenda). */
  const hrefAlta = `${base}/mascotas/nueva?${new URLSearchParams({ volver: 'agenda', dia: diaInicial, ...(horaInicial ? { hora: horaInicial } : {}), ...(recursoInicial ? { recurso: String(recursoInicial) } : {}) }).toString()}`
  return (
    <div className="fz-stack fz-stack--chico">
      {horaInicial && (
        <p className="cl-preparada">
          <span style={{ textTransform: 'capitalize' }}>{diaLargo(diaInicial)}</span> · {horaInicial}
          {recursoPrep ? ` · ${recursoPrep.nombre}` : ''}
        </p>
      )}
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
                  <Avatar nombre={m.nombre} especie={m.especie} foto={m.foto} />
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
          {cat.permisos.editarPacientes ? (
            <p className="fz-chico cl-mascota-nueva">
              ¿No aparece?{' '}
              <Link href={hrefAlta} className="fz-btn fz-btn--claro fz-btn--chico">
                <Icono n="mas" chico /> Mascota nueva
              </Link>
              <span className="fz-tenue">Al guardarla vuelves aquí.</span>
            </p>
          ) : (
            <p className="fz-chico fz-tenue">¿Mascota nueva? Pide que la den de alta y vuelve aquí.</p>
          )}
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
              key={serv.id}
              catalogo={catalogo}
              servicioId={serv.id}
              recursoId={recursoInicial}
              diaInicial={diaInicial}
              horaInicial={horaInicial}
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
