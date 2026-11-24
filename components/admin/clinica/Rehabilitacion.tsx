'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { EjercicioCatalogo, Medicion, PlanBreve, PlanVista, SesionVista } from '../../../lib/clinica/rehabilitacion'
import type { ResultadoBusqueda, ServicioVista } from '../../../lib/clinica/tipos'
import { api, Aviso, Ayuda, Avatar, Boton, BotonWhatsApp, Campo, Confirmar, ErrorForm, fecha, Icono, Modal, momento, Pastilla, useCarga, useClinica } from './comun'

/**
 * Rehabilitación (ruta ortopédica, fase 4, nov-2026): planes con ejercicios
 * para casa (del catálogo «Ejercicios de rehabilitación»), sesiones con dolor,
 * cojera, goniometría y perímetro del muslo (solo se capturan y se grafican) y
 * lo que el tutor marca en casa. El cobro es el de la agenda: cada sesión es
 * una cita; con paquete se descuenta, sin paquete se cobra.
 */

type Ficha = PlanVista & { permisos: { escribir: boolean } }

const ARTICULACIONES: [string, string][] = [
  ['hombro', 'Hombro'],
  ['codo', 'Codo'],
  ['carpo', 'Carpo'],
  ['cadera', 'Cadera'],
  ['rodilla', 'Rodilla'],
  ['tarso', 'Tarso'],
]
const LADOS: [string, string][] = [
  ['izq', 'Izquierdo'],
  ['der', 'Derecho'],
]
const MOVIMIENTOS: [string, string][] = [
  ['flexion', 'Flexión'],
  ['extension', 'Extensión'],
]
const ETQ = Object.fromEntries([...ARTICULACIONES, ...LADOS, ...MOVIMIENTOS])
/** «Rodilla derecha», «Codo izquierdo»: el lado concuerda con la articulación. */
const nombreMedicion = (m: Pick<Medicion, 'articulacion' | 'lado' | 'movimiento'>) => `${ETQ[m.articulacion]} ${m.articulacion === 'cadera' || m.articulacion === 'rodilla' ? ETQ[m.lado].toLowerCase().replace(/o$/, 'a') : ETQ[m.lado].toLowerCase()} · ${ETQ[m.movimiento].toLowerCase()}`
const COLORES = ['#0b6b59', '#b45309', '#1d4ed8', '#9333ea', '#be123c', '#0e7490', '#4d7c0f', '#a16207']
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const diaCorto = (d: string) => {
  const [, m, dd] = d.split('-').map(Number)
  return `${dd}/${m}`
}

/* ═════════════════════════════ tablero ═════════════════════════════ */

export function TableroRehabilitacion() {
  const { base, rutaAdmin } = useClinica()
  const { datos, error, cargando } = useCarga(() => api.get<{ activos: PlanBreve[]; terminados: PlanBreve[]; puedeCrear: boolean }>('rehabilitacion'), [])
  const [nuevo, setNuevo] = useState(false)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <h1 className="fz-h1">Rehabilitación</h1>
          <p className="fz-tenue fz-chico">
            {datos.activos.length} plan{datos.activos.length === 1 ? '' : 'es'} activo{datos.activos.length === 1 ? '' : 's'} · <Link href={`${rutaAdmin}/collections/reh-ejercicios`}>Ejercicios para casa</Link>
          </p>
        </div>
        {datos.puedeCrear && (
          <Boton tono="teal" onClick={() => setNuevo(true)}>
            + Nuevo plan
          </Boton>
        )}
      </div>
      {!datos.activos.length && <p className="fz-tenue">No hay planes activos.</p>}
      <div className="cl-hos-tablero">
        {datos.activos.map((x) => (
          <TarjetaPlan key={x.id} x={x} href={`${base}/rehabilitacion/${x.id}`} />
        ))}
      </div>
      {datos.terminados.length > 0 && (
        <section className="fz-stack fz-stack--chico">
          <h2 className="fz-h2">Terminados</h2>
          <div className="fz-tarjeta fz-lista">
            {datos.terminados.map((x) => (
              <Link key={x.id} href={`${base}/rehabilitacion/${x.id}`} className="fz-fila cl-fila-boton">
                <span className="fz-fila__main">
                  <span className="fz-fila__t1">{x.mascota.nombre}</span>
                  <span className="fz-fila__t2">
                    {x.folio} · {x.motivo} · {x.sesiones} sesion{x.sesiones === 1 ? '' : 'es'} · terminó {fecha(x.fin)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {nuevo && <NuevoPlan onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function TarjetaPlan({ x, href }: { x: PlanBreve; href: string }) {
  const bajo = x.cumplimiento7 != null && x.cumplimiento7 < 50
  return (
    <Link href={href} className="fz-tarjeta cl-hos-tarjeta">
      <Avatar nombre={x.mascota.nombre} especie={x.mascota.especie} foto={x.mascota.foto} />
      <span className="cl-hos-tarjeta__main">
        <b>{x.mascota.nombre}</b>
        <span className="fz-chico">{x.motivo}</span>
        <span className="fz-chico fz-tenue">
          {x.sesiones}
          {x.sesionesPrevistas ? ` de ${x.sesionesPrevistas}` : ''} sesion{x.sesiones === 1 && !x.sesionesPrevistas ? '' : 'es'}
          {x.ultimaSesion ? ` · última ${fecha(x.ultimaSesion, false)}` : ''}
          {x.responsable ? ` · ${x.responsable}` : ''}
        </span>
        <span className="cl-hos-tarjeta__estado">{x.cumplimiento7 != null ? <Pastilla tono={bajo ? 'aviso' : 'ok'}>En casa: {x.cumplimiento7}% esta semana</Pastilla> : <Pastilla tono="gris">Sin ejercicios para casa</Pastilla>}</span>
      </span>
    </Link>
  )
}

/** Datos del plan: al crearlo o al editarlo. */
function FormPlan({ inicial, onGuardar, ocupado, etiqueta }: { inicial: { motivo: string; objetivo: string; servicioId: number | ''; sesionesPrevistas: string; frecuencia: string }; onGuardar: (d: Record<string, unknown>) => void; ocupado: boolean; etiqueta: string }) {
  const [f, setF] = useState(inicial)
  const cat = useCarga(() => api.get<{ servicios: ServicioVista[] }>('agenda/catalogo'), [])
  const servicios = (cat.datos?.servicios ?? []).filter((s) => s.activo)
  return (
    <form
      className="fz-stack fz-stack--chico"
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar({ motivo: f.motivo, objetivo: f.objetivo, servicioId: f.servicioId || null, sesionesPrevistas: f.sesionesPrevistas ? Number(f.sesionesPrevistas) : null, frecuencia: f.frecuencia })
      }}
    >
      <Campo etiqueta="Motivo * (lo ve el tutor)">
        <input className="fz-input" value={f.motivo} maxLength={160} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ej. Postoperatorio de rodilla derecha" required />
      </Campo>
      <Campo etiqueta="Objetivo (lo ve el tutor)">
        <textarea className="fz-input" rows={2} value={f.objetivo} maxLength={600} onChange={(e) => setF({ ...f, objetivo: e.target.value })} placeholder="Ej. Que vuelva a apoyar la pata y camine 20 minutos sin cojear" />
      </Campo>
      <Campo etiqueta="Servicio de la sesión" ayuda="El que se agenda en cada sesión. Si la mascota tiene un paquete con este servicio, la agenda lo descuenta; si no, se cobra la cita.">
        <select className="fz-input" value={f.servicioId} onChange={(e) => setF({ ...f, servicioId: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">— Sin servicio —</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="cl-reh-dos">
        <Campo etiqueta="Sesiones previstas">
          <input className="fz-input" type="number" inputMode="numeric" min={1} max={100} value={f.sesionesPrevistas} onChange={(e) => setF({ ...f, sesionesPrevistas: e.target.value })} />
        </Campo>
        <Campo etiqueta="Frecuencia">
          <input className="fz-input" value={f.frecuencia} maxLength={60} onChange={(e) => setF({ ...f, frecuencia: e.target.value })} placeholder="Ej. 2 por semana" />
        </Campo>
      </div>
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--teal" disabled={ocupado}>
          {ocupado ? 'Guardando…' : etiqueta}
        </button>
      </div>
    </form>
  )
}

export function NuevoPlan({ mascota: inicial, hojaId, motivoInicial, onCerrar }: { mascota?: { id: number; nombre: string } | null; hojaId?: number | null; motivoInicial?: string; onCerrar: () => void }) {
  const { base } = useClinica()
  const router = useRouter()
  const [mascota, setMascota] = useState(inicial ?? null)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ResultadoBusqueda['mascotas']>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => api.get<ResultadoBusqueda>('buscar', { q }).then((r) => setRes(r.mascotas), () => setRes([])), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal titulo="Nuevo plan de rehabilitación" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        {mascota ? (
          <p>
            <b>{mascota.nombre}</b>{' '}
            {!inicial && (
              <button type="button" className="fz-link" onClick={() => setMascota(null)}>
                Cambiar
              </button>
            )}
          </p>
        ) : (
          <>
            <div className="fz-buscar">
              <Icono n="buscar" />
              <input className="fz-input" placeholder="Buscar mascota por nombre, tutor o teléfono" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            {q.trim() !== '' && res.length > 0 && (
              <div className="fz-tarjeta fz-lista">
                {res.slice(0, 6).map((m) => (
                  <button key={m.id} type="button" className="fz-fila cl-fila-boton" onClick={() => setMascota({ id: m.id, nombre: m.nombre })}>
                    <span className="fz-fila__main">
                      <span className="fz-fila__t1">{m.nombre}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <ErrorForm error={error} />
        <FormPlan
          inicial={{ motivo: motivoInicial ?? '', objetivo: '', servicioId: '', sesionesPrevistas: '', frecuencia: '' }}
          ocupado={ocupado}
          etiqueta="Crear plan"
          onGuardar={async (d) => {
            if (!mascota) return setError('Elige la mascota.')
            setOcupado(true)
            setError(null)
            try {
              const p = await api.post<{ id: number }>('rehabilitacion', { ...d, mascotaId: mascota.id, hojaId: hojaId ?? null })
              router.push(`${base}/rehabilitacion/${p.id}`)
            } catch (x) {
              setError(x instanceof Error ? x.message : 'No se pudo crear el plan.')
              setOcupado(false)
            }
          }}
        />
      </div>
    </Modal>
  )
}

/* ═════════════════════════════ ficha del plan ═════════════════════════════ */

export function FichaRehabilitacion({ id, citaInicial }: { id: number; citaInicial: number | null }) {
  const { base } = useClinica()
  const { datos: p, error, cargando, poner } = useCarga(() => api.get<Ficha>(`rehabilitacion/${id}`), [id])
  const [err, setErr] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editar, setEditar] = useState(false)
  const [terminar, setTerminar] = useState(false)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !p) return <p className="fz-tenue">Cargando…</p>
  const activo = p.estado === 'activo'
  const puede = activo && p.permisos.escribir
  const mandar = async (ruta: string, cuerpo: unknown, ok?: string): Promise<boolean> => {
    setErr(null)
    setAviso(null)
    try {
      const r = await api.post<PlanVista>(`rehabilitacion/${id}${ruta ? `/${ruta}` : ''}`, cuerpo)
      poner({ ...r, permisos: p.permisos })
      if (ok) setAviso(ok)
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    }
  }
  const hrefCita = `${base}/agenda?${new URLSearchParams({ mascota: String(p.mascota.id), nueva: '1', ...(p.servicio ? { servicio: String(p.servicio.id) } : {}) }).toString()}`
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div className="cl-cabecera-ficha">
          <Avatar nombre={p.mascota.nombre} especie={p.mascota.especie} foto={p.mascota.foto} grande />
          <div>
            <p className="fz-eyebrow">
              <Link href={`${base}/rehabilitacion`}>Rehabilitación</Link> · {p.folio} · <Pastilla tono={activo ? 'info' : 'gris'}>{activo ? 'Activo' : `Terminado ${fecha(p.fin, false)}`}</Pastilla>
            </p>
            <h1 className="fz-h1">{p.mascota.nombre}</h1>
            <p className="fz-chico">
              {p.motivo} · desde {fecha(p.inicio)}
              {p.responsable ? ` · ${p.responsable}` : ''}
            </p>
            <p className="fz-chico">
              <Link href={`${base}/mascotas/${p.mascota.id}?ver=cirugia`}>Expediente</Link>
              {p.hoja ? (
                <>
                  {' · '}
                  <Link href={`${base}/cirugia/${p.hoja.id}`}>Hoja {p.hoja.folio}</Link>
                </>
              ) : null}
              {p.cliente ? ` · ${p.cliente.nombre}` : ''}
            </p>
          </div>
        </div>
        <div className="cl-pre-acciones">
          {p.cliente && <BotonWhatsApp telefono={p.cliente.telefono} mensaje={`Hola ${p.cliente.nombre.split(/\s+/)[0]}, en tu app de la clínica ya están los ejercicios para casa de ${p.mascota.nombre}. Márcalos cada día para que veamos cómo va.`} etiqueta="Avisar al tutor" />}
          {activo && (
            <Link href={hrefCita} className="fz-btn fz-btn--claro">
              <Icono n="calendario" chico /> Agendar sesión
            </Link>
          )}
          {puede && <Boton onClick={() => setEditar(true)}>Editar plan</Boton>}
          {puede && (
            <Boton tono="teal" onClick={() => setTerminar(true)}>
              Terminar plan
            </Boton>
          )}
        </div>
      </div>

      <div className="cl-reh-datos">
        <Dato titulo="Sesiones" valor={`${p.sesiones}${p.sesionesPrevistas ? ` de ${p.sesionesPrevistas}` : ''}`} />
        <Dato titulo="Servicio" valor={p.servicio?.nombre ?? '—'} />
        <Dato titulo="Frecuencia" valor={p.frecuencia ?? '—'} />
        <Dato titulo="Paquete" valor={p.paquete ? `Quedan ${p.paquete.quedan} de ${p.paquete.total}` : 'Sin paquete: se cobra cada cita'} detalle={p.paquete ? `${p.paquete.folio} · ${p.paquete.nombre}` : undefined} />
        <Dato titulo="En casa (7 días)" valor={p.cumplimiento7 != null ? `${p.cumplimiento7}%` : '—'} />
      </div>
      {p.objetivo && (
        <p className="fz-chico">
          <b>Objetivo:</b> {p.objetivo}
        </p>
      )}
      {p.proximas.length > 0 && (
        <p className="fz-chico fz-tenue">
          Próximas citas: {p.proximas.map((c) => `${fecha(c.dia, false)} ${c.hora}`).join(' · ')}
        </p>
      )}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      <ErrorForm error={err} />
      {!activo && p.resumenFinal && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Resumen final (lo ve el tutor)</h2>
          <p className="cl-pre-texto">{p.resumenFinal}</p>
        </section>
      )}

      {puede && <RegistrarSesion p={p} citaInicial={citaInicial} mandar={mandar} />}
      <Avance p={p} />
      <Sesiones p={p} mandar={mandar} />
      <EjerciciosCasa p={p} puede={puede} mandar={mandar} />
      <Casa p={p} />

      {editar && (
        <Modal titulo="Editar plan" onCerrar={() => setEditar(false)}>
          <FormPlan
            inicial={{ motivo: p.motivo, objetivo: p.objetivo ?? '', servicioId: p.servicio?.id ?? '', sesionesPrevistas: p.sesionesPrevistas ? String(p.sesionesPrevistas) : '', frecuencia: p.frecuencia ?? '' }}
            ocupado={false}
            etiqueta="Guardar"
            onGuardar={async (d) => {
              if (await mandar('', d, 'Plan actualizado.')) setEditar(false)
            }}
          />
        </Modal>
      )}
      {terminar && <Terminar p={p} onCerrar={() => setTerminar(false)} mandar={mandar} />}
    </div>
  )
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="fz-tarjeta cl-reh-dato">
      <span className="fz-chico fz-tenue">{titulo}</span>
      <b>{valor}</b>
      {detalle && <span className="fz-chico fz-tenue">{detalle}</span>}
    </div>
  )
}

type FilaMedicion = { articulacion: string; lado: string; movimiento: string; grados: string }

function RegistrarSesion({ p, citaInicial, mandar }: { p: Ficha; citaInicial: number | null; mandar: (r: string, c: unknown, ok?: string) => Promise<boolean> }) {
  const inicialCita = citaInicial && p.citasHoy.some((c) => c.id === citaInicial) ? citaInicial : p.citasHoy.length === 1 ? p.citasHoy[0].id : ''
  const vacio = { citaId: inicialCita as number | '', dolor: '', cojera: '', perimetroIzq: '', perimetroDer: '', terapias: '', notaTutor: '', notaInterna: '' }
  const [f, setF] = useState(vacio)
  const [filas, setFilas] = useState<FilaMedicion[]>([])
  const anterior = p.sesionesLista.find((s) => s.mediciones.length)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const cuerpo = {
      citaId: f.citaId || null,
      dolor: num(f.dolor),
      cojera: num(f.cojera),
      perimetroIzq: num(f.perimetroIzq),
      perimetroDer: num(f.perimetroDer),
      terapias: f.terapias,
      notaTutor: f.notaTutor,
      notaInterna: f.notaInterna,
      mediciones: filas.filter((x) => x.grados.trim() !== '').map((x) => ({ articulacion: x.articulacion, lado: x.lado, movimiento: x.movimiento, grados: Number(x.grados.replace(',', '.')) })),
    }
    if (await mandar('sesiones', cuerpo, 'Sesión registrada.')) {
      setF({ ...vacio, citaId: '' })
      setFilas([])
    }
  }
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-ses">
      <h2 className="fz-h2" id="t-ses">
        Registrar sesión
      </h2>
      <Ayuda>Dolor de 0 (sin dolor) a 10, cojera de 0 (sin cojera) a 5 (no apoya), ángulos en grados y perímetro del muslo en cm. Son datos para comparar sesión a sesión: la plataforma no los interpreta. El tutor solo ve dolor, cojera y la nota para él.</Ayuda>
      <form className="fz-stack fz-stack--chico" onSubmit={guardar}>
        <Campo etiqueta="Cita" ayuda={f.citaId ? 'El cobro o el descuento del paquete se hacen al finalizar la cita en la agenda.' : 'Sin cita, la sesión no genera cobro ni descuenta del paquete.'}>
          <select className="fz-input" value={f.citaId} onChange={(e) => setF({ ...f, citaId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">Sin cita</option>
            {p.citasHoy.map((c) => (
              <option key={c.id} value={c.id}>
                {c.folio} · hoy {c.hora} · {c.servicio}
              </option>
            ))}
          </select>
        </Campo>
        <div className="cl-reh-escalas">
          <Campo etiqueta="Dolor (0–10)">
            <select className="fz-input" value={f.dolor} onChange={(e) => setF({ ...f, dolor: e.target.value })}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '0 · sin dolor' : i === 10 ? '10 · máximo' : i}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Cojera (0–5)">
            <select className="fz-input" value={f.cojera} onChange={(e) => setF({ ...f, cojera: e.target.value })}>
              <option value="">—</option>
              {Array.from({ length: 6 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '0 · sin cojera' : i === 5 ? '5 · no apoya' : i}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Muslo izq. (cm)">
            <input className="fz-input" inputMode="decimal" value={f.perimetroIzq} onChange={(e) => setF({ ...f, perimetroIzq: e.target.value })} />
          </Campo>
          <Campo etiqueta="Muslo der. (cm)">
            <input className="fz-input" inputMode="decimal" value={f.perimetroDer} onChange={(e) => setF({ ...f, perimetroDer: e.target.value })} />
          </Campo>
        </div>
        <div className="fz-stack fz-stack--chico">
          <b className="fz-chico">Goniometría</b>
          {filas.map((x, i) => (
            <div key={i} className="cl-reh-medicion">
              {(
                [
                  ['articulacion', ARTICULACIONES, 'Articulación'],
                  ['lado', LADOS, 'Lado'],
                  ['movimiento', MOVIMIENTOS, 'Movimiento'],
                ] as const
              ).map(([k, opciones, etiqueta]) => (
                <select key={k} className="fz-input" aria-label={etiqueta} value={x[k]} onChange={(e) => setFilas(filas.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))}>
                  {opciones.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ))}
              <input className="fz-input" inputMode="decimal" aria-label="Grados" placeholder="Grados" value={x.grados} onChange={(e) => setFilas(filas.map((y, j) => (j === i ? { ...y, grados: e.target.value } : y)))} />
              <Boton chico aria-label="Quitar medición" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>
                ×
              </Boton>
            </div>
          ))}
          <div className="cl-reh-botones">
            <Boton chico onClick={() => setFilas([...filas, { articulacion: filas.at(-1)?.articulacion ?? 'rodilla', lado: filas.at(-1)?.lado ?? 'der', movimiento: filas.at(-1)?.movimiento === 'flexion' ? 'extension' : 'flexion', grados: '' }])}>
              + Medición
            </Boton>
            {anterior && !filas.length && (
              <Boton chico onClick={() => setFilas(anterior.mediciones.map((m) => ({ articulacion: m.articulacion, lado: m.lado, movimiento: m.movimiento, grados: '' })))}>
                Repetir las de la sesión {anterior.numero}
              </Boton>
            )}
          </div>
        </div>
        <Campo etiqueta="Qué se hizo">
          <input className="fz-input" value={f.terapias} maxLength={300} onChange={(e) => setF({ ...f, terapias: e.target.value })} placeholder="Ej. hidroterapia 15 min, láser, ejercicios en cavaletti" />
        </Campo>
        <Campo etiqueta="Nota para el tutor (la ve en su app)">
          <textarea className="fz-input" rows={2} value={f.notaTutor} maxLength={1000} onChange={(e) => setF({ ...f, notaTutor: e.target.value })} placeholder="Ej. Hoy apoyó mejor la pata. Sigan con las caminatas cortas." />
        </Campo>
        <Campo etiqueta="Nota interna (solo el equipo)">
          <textarea className="fz-input" rows={2} value={f.notaInterna} maxLength={2000} onChange={(e) => setF({ ...f, notaInterna: e.target.value })} />
        </Campo>
        <div className="fz-acciones-fin">
          <button type="submit" className="fz-btn fz-btn--teal">
            Guardar sesión
          </button>
        </div>
      </form>
    </section>
  )
}

/** Una serie por número de sesión (x = sesión). */
function Serie({ puntos, color, etiqueta, unidad = '' }: { puntos: { n: number; valor: number }[]; color: string; etiqueta: string; unidad?: string }) {
  const ancho = 300
  const alto = 80
  if (puntos.length < 2) return null
  const xs = puntos.map((p) => p.n)
  const ys = puntos.map((p) => p.valor)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x: number) => 6 + ((x - x0) / Math.max(1, x1 - x0)) * (ancho - 12)
  const py = (y: number) => alto - 8 - ((y - y0) / Math.max(1, y1 - y0)) * (alto - 16)
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${px(p.n).toFixed(1)},${py(p.valor).toFixed(1)}`).join(' ')
  const primero = puntos[0]
  const ult = puntos[puntos.length - 1]
  return (
    <figure className="cl-hq-serie">
      <figcaption>
        <b style={{ color }}>{etiqueta}</b> {primero.valor}
        {unidad} → {ult.valor}
        {unidad} <span className="fz-tenue">(sesión {primero.n} a {ult.n})</span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${etiqueta}: ${puntos.map((p) => `sesión ${p.n} ${p.valor}`).join(', ')}`}>
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {puntos.map((p, i) => (
          <circle key={i} cx={px(p.n)} cy={py(p.valor)} r={2.5} fill={color} />
        ))}
      </svg>
    </figure>
  )
}

function Avance({ p }: { p: Ficha }) {
  const ses = [...p.sesionesLista].reverse()
  const series: { clave: string; etiqueta: string; unidad: string; puntos: { n: number; valor: number }[] }[] = [
    { clave: 'dolor', etiqueta: 'Dolor', unidad: '', puntos: ses.filter((s) => s.dolor != null).map((s) => ({ n: s.numero, valor: s.dolor! })) },
    { clave: 'cojera', etiqueta: 'Cojera', unidad: '', puntos: ses.filter((s) => s.cojera != null).map((s) => ({ n: s.numero, valor: s.cojera! })) },
    { clave: 'pi', etiqueta: 'Muslo izquierdo', unidad: ' cm', puntos: ses.filter((s) => s.perimetroIzq != null).map((s) => ({ n: s.numero, valor: s.perimetroIzq! })) },
    { clave: 'pd', etiqueta: 'Muslo derecho', unidad: ' cm', puntos: ses.filter((s) => s.perimetroDer != null).map((s) => ({ n: s.numero, valor: s.perimetroDer! })) },
  ]
  const claves = new Map<string, Medicion>()
  for (const s of ses) for (const m of s.mediciones) claves.set(`${m.articulacion}|${m.lado}|${m.movimiento}`, m)
  for (const [k, m] of claves) series.push({ clave: k, etiqueta: nombreMedicion(m), unidad: '°', puntos: ses.flatMap((s) => s.mediciones.filter((x) => `${x.articulacion}|${x.lado}|${x.movimiento}` === k).map((x) => ({ n: s.numero, valor: x.grados }))) })
  const visibles = series.filter((s) => s.puntos.length >= 2)
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-av">
      <h2 className="fz-h2" id="t-av">
        Avance
      </h2>
      {!visibles.length ? (
        <p className="fz-tenue fz-chico">Las gráficas aparecen con dos sesiones que tengan el mismo dato.</p>
      ) : (
        <div className="cl-hq-series">
          {visibles.map((s, i) => (
            <Serie key={s.clave} etiqueta={s.etiqueta} unidad={s.unidad} color={COLORES[i % COLORES.length]} puntos={s.puntos} />
          ))}
        </div>
      )}
    </section>
  )
}

function Sesiones({ p, mandar }: { p: Ficha; mandar: (r: string, c: unknown, ok?: string) => Promise<boolean> }) {
  const [quitar, setQuitar] = useState<SesionVista | null>(null)
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-lista">
      <h2 className="fz-h2" id="t-lista">
        Sesiones ({p.sesionesLista.length})
      </h2>
      {!p.sesionesLista.length && <p className="fz-tenue fz-chico">Aún no hay sesiones.</p>}
      {p.sesionesLista.map((s) => (
        <article key={s.id} className="cl-reh-sesion">
          <div className="fz-entre">
            <b>
              Sesión {s.numero} · {momento(s.fecha)}
            </b>
            <span className="fz-chico fz-tenue">
              {s.cita ? s.cita.folio : 'sin cita'}
              {s.por ? ` · ${s.por}` : ''}
            </span>
          </div>
          <p className="fz-chico">
            {[s.dolor != null ? `Dolor ${s.dolor}/10` : '', s.cojera != null ? `Cojera ${s.cojera}/5` : '', s.perimetroIzq != null ? `Muslo izq. ${s.perimetroIzq} cm` : '', s.perimetroDer != null ? `Muslo der. ${s.perimetroDer} cm` : ''].filter(Boolean).join(' · ')}
          </p>
          {s.mediciones.length > 0 && <p className="fz-chico">{s.mediciones.map((m) => `${nombreMedicion(m)} ${m.grados}°`).join(' · ')}</p>}
          {s.terapias && <p className="fz-chico">Se hizo: {s.terapias}</p>}
          {s.notaTutor && (
            <p className="fz-chico">
              <b>Para el tutor:</b> {s.notaTutor}
            </p>
          )}
          {s.notaInterna && (
            <p className="fz-chico fz-tenue">
              <b>Interna:</b> {s.notaInterna}
            </p>
          )}
          {s.quitable && p.permisos.escribir && (
            <Boton chico tono="peligro" onClick={() => setQuitar(s)}>
              Quitar
            </Boton>
          )}
        </article>
      ))}
      {quitar && (
        <Confirmar titulo={`Quitar la sesión ${quitar.numero}`} etiquetaSi="Sí, quitarla" tono="peligro" onNo={() => setQuitar(null)} onSi={async () => (await mandar('sesiones/quitar', { sesionId: quitar.id }), setQuitar(null))}>
          <p>Solo si se capturó por error. No cambia la cita ni su cobro.</p>
        </Confirmar>
      )}
    </section>
  )
}

function EjerciciosCasa({ p, puede, mandar }: { p: Ficha; puede: boolean; mandar: (r: string, c: unknown, ok?: string) => Promise<boolean> }) {
  const { rutaAdmin } = useClinica()
  const cat = useCarga(() => (puede ? api.get<EjercicioCatalogo[]>('rehabilitacion/ejercicios') : Promise.resolve([] as EjercicioCatalogo[])), [puede])
  const vacio = { ejercicioId: '' as number | '', repeticiones: '', vecesAlDia: '1', nota: '' }
  const [f, setF] = useState(vacio)
  const [quitar, setQuitar] = useState<string | null>(null)
  const activos = p.ejercicios.filter((e) => e.activo)
  const quitados = p.ejercicios.filter((e) => !e.activo)
  const disponibles = (cat.datos ?? []).filter((e) => !activos.some((a) => a.ejercicioId === e.id))
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-ej">
      <h2 className="fz-h2" id="t-ej">
        Ejercicios para casa
      </h2>
      {!activos.length && <p className="fz-tenue fz-chico">Sin ejercicios asignados.</p>}
      {activos.map((e) => (
        <div key={e.clave} className="cl-reh-ej">
          {e.foto ? <img src={e.foto} alt="" className="cl-reh-ej__foto" /> : <span className="cl-reh-ej__foto" aria-hidden="true" />}
          <span className="cl-hos-toma__main">
            <b>{e.nombre}</b>
            <span className="fz-chico">
              {[e.repeticiones, `${e.vecesAlDia} vez${e.vecesAlDia === 1 ? '' : 'es'} al día`].filter(Boolean).join(' · ')}
              {e.video ? (
                <>
                  {' · '}
                  <a href={e.video} target="_blank" rel="noreferrer">
                    Video
                  </a>
                </>
              ) : null}
            </span>
            {e.nota && <span className="fz-chico fz-tenue">{e.nota}</span>}
          </span>
          {puede && (
            <Boton chico tono="peligro" onClick={() => setQuitar(e.clave)}>
              Quitar
            </Boton>
          )}
        </div>
      ))}
      {quitados.length > 0 && (
        <details>
          <summary className="fz-chico">Quitados ({quitados.length})</summary>
          <ul className="fz-chico">
            {quitados.map((e) => (
              <li key={e.clave}>
                {e.nombre} · {fecha(e.desde, false)} a {fecha(e.quitadoEn, false)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {puede &&
        (cat.datos && !cat.datos.length ? (
          <Aviso tono="info">
            Aún no hay ejercicios en el catálogo. Agrégalos en <Link href={`${rutaAdmin}/collections/reh-ejercicios/create`}>Ejercicios de rehabilitación</Link> (nombre, cómo se hace, foto o video).
          </Aviso>
        ) : (
          <form
            className="cl-reh-form-ej"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!f.ejercicioId) return
              if (await mandar('ejercicios', { ejercicioId: f.ejercicioId, repeticiones: f.repeticiones, vecesAlDia: Number(f.vecesAlDia), nota: f.nota })) setF(vacio)
            }}
          >
            <select className="fz-input" aria-label="Ejercicio" value={f.ejercicioId} onChange={(e) => setF({ ...f, ejercicioId: e.target.value ? Number(e.target.value) : '' })} required>
              <option value="">Elige un ejercicio…</option>
              {disponibles.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <input className="fz-input" aria-label="Repeticiones" placeholder="Repeticiones (ej. 10, 2 series)" maxLength={80} value={f.repeticiones} onChange={(e) => setF({ ...f, repeticiones: e.target.value })} />
            <select className="fz-input" aria-label="Veces al día" value={f.vecesAlDia} onChange={(e) => setF({ ...f, vecesAlDia: e.target.value })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} vez{n === 1 ? '' : 'es'} al día
                </option>
              ))}
            </select>
            <input className="fz-input" aria-label="Nota para el tutor" placeholder="Nota para el tutor" maxLength={300} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
            <button type="submit" className="fz-btn fz-btn--teal">
              Asignar
            </button>
          </form>
        ))}
      {quitar && (
        <Confirmar titulo="Quitar ejercicio" etiquetaSi="Sí, quitarlo" tono="peligro" onNo={() => setQuitar(null)} onSi={async () => (await mandar('ejercicios/quitar', { clave: quitar }), setQuitar(null))}>
          <p>Deja de aparecerle al tutor desde hoy. Lo que ya marcó se conserva.</p>
        </Confirmar>
      )}
    </section>
  )
}

function Casa({ p }: { p: Ficha }) {
  if (!p.casa.filas.length) return null
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-casa">
      <h2 className="fz-h2" id="t-casa">
        Lo que marcó el tutor (14 días)
      </h2>
      <div className="cl-reh-casa">
        <table>
          <thead>
            <tr>
              <th scope="col">Ejercicio</th>
              {p.casa.dias.map((d) => (
                <th key={d} scope="col">
                  {diaCorto(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.casa.filas.map((f) => (
              <tr key={f.clave}>
                <th scope="row">{f.nombre}</th>
                {f.hechas.map((h, i) => (
                  <td key={i} className={h == null ? 'is-na' : h >= f.vecesAlDia ? 'is-ok' : h > 0 ? 'is-parcial' : 'is-nada'} title={h == null ? 'No asignado ese día' : `${h} de ${f.vecesAlDia}`}>
                    {h == null ? '' : `${h}/${f.vecesAlDia}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Terminar({ p, onCerrar, mandar }: { p: Ficha; onCerrar: () => void; mandar: (r: string, c: unknown, ok?: string) => Promise<boolean> }) {
  const [resumen, setResumen] = useState('')
  return (
    <Confirmar titulo={`Terminar el plan de ${p.mascota.nombre}`} etiquetaSi="Terminar plan" ocupado={resumen.trim().length < 10} onNo={onCerrar} onSi={async () => (await mandar('terminar', { resumenFinal: resumen }, 'Plan terminado.')) && onCerrar()}>
      <p>Los ejercicios dejan de aparecerle al tutor y el plan ya no cambia.</p>
      <Campo etiqueta="Resumen para el tutor *">
        <textarea className="fz-input" rows={4} value={resumen} maxLength={2000} onChange={(e) => setResumen(e.target.value)} placeholder="Cómo terminó, qué seguir haciendo en casa y cuándo volver a revisión." autoFocus />
      </Campo>
    </Confirmar>
  )
}

/* ═════════════════════════════ expediente ═════════════════════════════ */

export function RehabilitacionMascota({ mascotaId, mascotaNombre, activa }: { mascotaId: number; mascotaNombre: string; activa: boolean }) {
  const { base, catalogo } = useClinica()
  const lista = useCarga(() => api.get<PlanBreve[]>(`mascotas/${mascotaId}/rehabilitacion`), [mascotaId])
  const [nuevo, setNuevo] = useState(false)
  const conPlan = (lista.datos ?? []).some((x) => x.estado === 'activo')
  return (
    <section className="fz-stack fz-stack--chico" aria-labelledby="t-reh">
      <div className="fz-entre">
        <h3 className="fz-h2" id="t-reh">
          Rehabilitación
        </h3>
        {catalogo.permisos.escribirExpediente && activa && !conPlan && (
          <Boton chico onClick={() => setNuevo(true)}>
            + Plan de rehabilitación
          </Boton>
        )}
      </div>
      {(lista.datos ?? []).length === 0 ? (
        <p className="fz-tenue fz-chico">Sin planes.</p>
      ) : (
        <div className="fz-tarjeta fz-lista">
          {(lista.datos ?? []).map((x) => (
            <Link key={x.id} href={`${base}/rehabilitacion/${x.id}`} className="fz-fila cl-fila-boton">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{x.motivo}</span>
                <span className="fz-fila__t2">
                  {x.folio} · {x.sesiones} sesion{x.sesiones === 1 ? '' : 'es'} · {x.estado === 'activo' ? 'activo' : `terminó ${fecha(x.fin, false)}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {nuevo && <NuevoPlan mascota={{ id: mascotaId, nombre: mascotaNombre }} onCerrar={() => setNuevo(false)} />}
    </section>
  )
}

/** Agenda: abre el plan de la mascota para registrar la sesión de esta cita. */
export function BotonSesionRehab({ citaId }: { citaId: number }) {
  const { base } = useClinica()
  const { datos } = useCarga(() => api.get<{ planId: number; folio: string; sesionId: number | null } | null>(`rehabilitacion/cita/${citaId}`), [citaId])
  if (!datos) return null
  return (
    <Link href={`${base}/rehabilitacion/${datos.planId}${datos.sesionId ? '' : `?cita=${citaId}`}`} className="fz-btn fz-btn--claro fz-btn--chico">
      {datos.sesionId ? 'Ver sesión de rehabilitación' : 'Sesión de rehabilitación'}
    </Link>
  )
}
