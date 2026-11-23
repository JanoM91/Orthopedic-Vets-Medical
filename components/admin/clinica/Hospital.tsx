'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import type { InternamientoBreve, InternamientoVista, TomaVista } from '../../../lib/clinica/hospital'
import type { ResultadoBusqueda } from '../../../lib/clinica/tipos'
import { reducirImagen } from '../../../lib/reducirImagen'
import { api, Aviso, Ayuda, Avatar, Boton, BotonWhatsApp, Campo, Confirmar, ErrorForm, fecha, hoyISO, Icono, Modal, momento, Pastilla, useCarga, useClinica } from './comun'

/**
 * Hospitalización (ruta ortopédica, fase 3, nov-2026): tablero de internados y
 * ficha del internamiento con las tomas del día (lo que el médico indicó, a
 * las horas que él fijó), observaciones, cargos que captura el equipo, partes
 * para el tutor y alta. La plataforma nunca calcula ni sugiere dosis.
 */

type Ficha = InternamientoVista & { permisos: { indicar: boolean; atender: boolean } }

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const TONO_TOMA: Record<TomaVista['estado'], 'ok' | 'gris' | 'aviso' | 'malo' | 'info'> = { aplicada: 'ok', omitida: 'gris', pendiente: 'info', atrasada: 'malo' }
const ETIQ_TOMA: Record<TomaVista['estado'], string> = { aplicada: 'Aplicada', omitida: 'No se aplicó', pendiente: 'Pendiente', atrasada: 'Atrasada' }
const APETITO: [string, string][] = [
  ['completo', 'Comió todo'],
  ['parcial', 'Comió parte'],
  ['nada', 'No comió'],
  ['ayuno', 'En ayuno'],
]
const ETIQ_APETITO = Object.fromEntries(APETITO)
const sumarDia = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
}

/* ═════════════════════════════ tablero ═════════════════════════════ */

export function TableroHospital() {
  const { base } = useClinica()
  const { datos, error, cargando } = useCarga(() => api.get<{ internados: InternamientoBreve[]; altasRecientes: InternamientoBreve[]; puedeInternar: boolean }>('hospital'), [])
  const [internar, setInternar] = useState(false)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <h1 className="fz-h1">Hospital</h1>
          <p className="fz-tenue fz-chico">
            {datos.internados.length} internado{datos.internados.length === 1 ? '' : 's'}
            {datos.internados.some((x) => x.atrasadas) ? ` · ${datos.internados.reduce((s, x) => s + x.atrasadas, 0)} tomas atrasadas` : ''}
          </p>
        </div>
        {datos.puedeInternar && (
          <Boton tono="teal" onClick={() => setInternar(true)}>
            + Internar
          </Boton>
        )}
      </div>
      {!datos.internados.length && <p className="fz-tenue">No hay pacientes internados.</p>}
      <div className="cl-hos-tablero">
        {datos.internados.map((x) => (
          <TarjetaInternado key={x.id} x={x} href={`${base}/hospital/${x.id}`} />
        ))}
      </div>
      {datos.altasRecientes.length > 0 && (
        <section className="fz-stack fz-stack--chico">
          <h2 className="fz-h2">Altas recientes</h2>
          <div className="fz-tarjeta fz-lista">
            {datos.altasRecientes.map((x) => (
              <Link key={x.id} href={`${base}/hospital/${x.id}`} className="fz-fila cl-fila-boton">
                <span className="fz-fila__main">
                  <span className="fz-fila__t1">{x.mascota.nombre}</span>
                  <span className="fz-fila__t2">
                    {x.folio} · {x.motivo} · alta {momento(x.alta)} · {x.dias} día{x.dias === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {internar && <Internar onCerrar={() => setInternar(false)} />}
    </div>
  )
}

function TarjetaInternado({ x, href }: { x: InternamientoBreve; href: string }) {
  return (
    <Link href={href} className={`fz-tarjeta cl-hos-tarjeta${x.atrasadas ? ' is-atrasada' : ''}`}>
      <Avatar nombre={x.mascota.nombre} especie={x.mascota.especie} foto={x.mascota.foto} />
      <span className="cl-hos-tarjeta__main">
        <b>{x.mascota.nombre}</b>
        <span className="fz-chico">{x.motivo}</span>
        <span className="fz-chico fz-tenue">
          {x.espacio ? `${x.espacio} · ` : ''}día {x.dias}
          {x.medico ? ` · ${x.medico}` : ''}
        </span>
        <span className="cl-hos-tarjeta__estado">
          {x.atrasadas ? <Pastilla tono="malo">{x.atrasadas} atrasada{x.atrasadas === 1 ? '' : 's'}</Pastilla> : null}
          {x.pendientesHoy ? <Pastilla tono="info">{x.pendientesHoy} pendiente{x.pendientesHoy === 1 ? '' : 's'} hoy</Pastilla> : null}
          {!x.ultimoParte || x.ultimoParte < hoyISO() ? <Pastilla tono="aviso">Sin parte hoy</Pastilla> : null}
        </span>
      </span>
    </Link>
  )
}

/** Internar: busca la mascota (o llega con ella / con la hoja quirúrgica). */
export function Internar({ mascota: inicial, hojaId, motivoInicial, onCerrar }: { mascota?: { id: number; nombre: string } | null; hojaId?: number | null; motivoInicial?: string; onCerrar: () => void }) {
  const { base } = useClinica()
  const router = useRouter()
  const [mascota, setMascota] = useState(inicial ?? null)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ResultadoBusqueda['mascotas']>([])
  const [motivo, setMotivo] = useState(motivoInicial ?? '')
  const [espacio, setEspacio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => api.get<ResultadoBusqueda>('buscar', { q }).then((r) => setRes(r.mascotas), () => setRes([])), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal titulo="Internar" onCerrar={onCerrar}>
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!mascota) return setError('Elige la mascota.')
          setOcupado(true)
          setError(null)
          try {
            const h = await api.post<{ id: number }>('hospital', { mascotaId: mascota.id, motivo, espacio, hojaId: hojaId ?? null })
            router.push(`${base}/hospital/${h.id}`)
          } catch (x) {
            setError(x instanceof Error ? x.message : 'No se pudo internar.')
            setOcupado(false)
          }
        }}
      >
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
        <Campo etiqueta="Motivo *">
          <input className="fz-input" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Postoperatorio de osteosíntesis de fémur" required />
        </Campo>
        <Campo etiqueta="Jaula o espacio">
          <input className="fz-input" value={espacio} maxLength={40} onChange={(e) => setEspacio(e.target.value)} />
        </Campo>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <button type="submit" className="fz-btn fz-btn--teal" disabled={ocupado}>
            {ocupado ? 'Internando…' : 'Internar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ═════════════════════════════ ficha ═════════════════════════════ */

export function FichaInternamiento({ id }: { id: number }) {
  const { base } = useClinica()
  const [dia, setDia] = useState(hoyISO())
  const { datos: h, error, cargando, poner } = useCarga(() => api.get<Ficha>(`hospital/${id}`, { dia }), [id, dia])
  const [err, setErr] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !h) return <p className="fz-tenue">Cargando…</p>
  const internado = h.estado === 'internado'
  const mandar = async (ruta: string, cuerpo: unknown): Promise<boolean> => {
    setErr(null)
    try {
      const r = await api.post<InternamientoVista & { correo?: boolean }>(`hospital/${id}/${ruta}`, cuerpo)
      if (ruta === 'partes') setAviso(r.correo ? 'Parte publicado. Le llegó un correo al tutor.' : 'Parte publicado. El tutor no tiene correo con avisos: mándale la liga por WhatsApp.')
      /* Las tomas se recalculan del día que se está viendo. */
      poner({ ...(dia === hoyISO() ? r : await api.get<Ficha>(`hospital/${id}`, { dia })), permisos: h.permisos } as Ficha)
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    }
  }
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div className="cl-cabecera-ficha">
          <Avatar nombre={h.mascota.nombre} especie={h.mascota.especie} foto={h.mascota.foto} grande />
          <div>
            <p className="fz-eyebrow">
              <Link href={`${base}/hospital`}>Hospital</Link> · {h.folio} · <Pastilla tono={internado ? 'info' : 'gris'}>{internado ? `Internado · día ${h.dias}` : `Alta · ${h.dias} día${h.dias === 1 ? '' : 's'}`}</Pastilla>
            </p>
            <h1 className="fz-h1">{h.mascota.nombre}</h1>
            <p className="fz-chico">
              {h.motivo}
              {h.espacio ? ` · ${h.espacio}` : ''}
              {h.medico ? ` · ${h.medico}` : ''} · ingresó {momento(h.ingreso)}
            </p>
            <p className="fz-chico">
              <Link href={`${base}/mascotas/${h.mascota.id}?ver=cirugia`}>Expediente</Link>
              {h.hoja ? (
                <>
                  {' · '}
                  <Link href={`${base}/cirugia/${h.hoja.id}`}>Hoja {h.hoja.folio}</Link>
                </>
              ) : null}
              {h.cliente ? ` · ${h.cliente.nombre}` : ''}
            </p>
          </div>
        </div>
        <div className="cl-pre-acciones">
          {h.liga && h.cliente && <BotonWhatsApp telefono={h.cliente.telefono} mensaje={`Hola ${h.cliente.nombre.split(/\s+/)[0]}, aquí puedes ver cómo sigue ${h.mascota.nombre}: ${h.liga}`} etiqueta="Liga al tutor" />}
          {internado && h.permisos.indicar && (
            <Boton tono="teal" onClick={() => setAlta(true)}>
              Dar de alta
            </Boton>
          )}
        </div>
      </div>
      {h.alergias && (
        <Aviso tono="malo">
          <b>Alergias:</b> {h.alergias}
        </Aviso>
      )}
      {h.alertas.map((a, i) => (
        <Aviso key={i} tono="aviso">
          <b>Manejo:</b> {a}
        </Aviso>
      ))}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      <ErrorForm error={err} />
      {!internado && (
        <Aviso tono="info">
          Dado de alta el {momento(h.alta)}.{h.cargoFinanzas ? ` Cargos (${pesos(h.totalCargos)}) registrados en Finanzas.` : ''}
        </Aviso>
      )}

      <Tomas h={h} dia={dia} setDia={setDia} puede={internado && h.permisos.atender} mandar={mandar} />
      <Indicaciones h={h} puede={internado && h.permisos.indicar} mandar={mandar} />
      <Observaciones h={h} puede={internado && h.permisos.atender} mandar={mandar} />
      <Partes h={h} puede={internado && h.permisos.indicar} mandar={mandar} />
      <Cargos h={h} puede={internado && h.permisos.atender} mandar={mandar} />
      {!internado && (h.resumenAlta || h.indicacionesAlta) && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Alta</h2>
          {h.resumenAlta && <p className="cl-pre-texto">{h.resumenAlta}</p>}
          {h.indicacionesAlta && (
            <>
              <b className="fz-chico">Indicaciones para casa (las ve el tutor)</b>
              <p className="cl-pre-texto">{h.indicacionesAlta}</p>
            </>
          )}
        </section>
      )}
      {alta && <DarAlta h={h} onCerrar={() => setAlta(false)} mandar={mandar} />}
    </div>
  )
}

function Tomas({ h, dia, setDia, puede, mandar }: { h: Ficha; dia: string; setDia: (d: string) => void; puede: boolean; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const [omitir, setOmitir] = useState<TomaVista | null>(null)
  const [motivo, setMotivo] = useState('')
  const hoy = hoyISO()
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-tomas">
      <div className="fz-entre">
        <h2 className="fz-h2" id="t-tomas">
          Tomas {dia === hoy ? 'de hoy' : `del ${fecha(dia)}`}
        </h2>
        <div className="cl-hos-dia">
          <Boton chico aria-label="Día anterior" onClick={() => setDia(sumarDia(dia, -1))}>
            ‹
          </Boton>
          {dia !== hoy && (
            <Boton chico onClick={() => setDia(hoy)}>
              Hoy
            </Boton>
          )}
          <Boton chico aria-label="Día siguiente" disabled={dia >= hoy} onClick={() => setDia(sumarDia(dia, 1))}>
            ›
          </Boton>
        </div>
      </div>
      <p className="fz-chico fz-tenue">A las horas que fijó el médico. «Atrasada» = más de 30 minutos sin registrar.</p>
      {!h.tomas.length && !h.porNecesidad.length && <p className="fz-tenue fz-chico">Sin tomas este día.</p>}
      {h.tomas.map((x) => (
        <div key={`${x.clave}-${x.programada}`} className={`cl-hos-toma is-${x.estado}`}>
          <b className="cl-hos-toma__hora">{x.hora}</b>
          <span className="cl-hos-toma__main">
            <b>{x.tratamiento}</b>
            <span className="fz-chico">{[x.dosis, x.via].filter(Boolean).join(' · ')}</span>
            {x.en && (
              <span className="fz-chico fz-tenue">
                {x.estado === 'omitida' ? `No se aplicó: ${x.motivo}` : 'Aplicada'} · {momento(x.en)} · {x.por}
              </span>
            )}
          </span>
          <Pastilla tono={TONO_TOMA[x.estado]}>{ETIQ_TOMA[x.estado]}</Pastilla>
          {puede && (x.estado === 'pendiente' || x.estado === 'atrasada') && (
            <span className="cl-hos-toma__btns">
              <Boton chico tono="teal" onClick={() => mandar('aplicaciones', { clave: x.clave, programada: x.programada, estado: 'aplicada' })}>
                Aplicada
              </Boton>
              <Boton chico onClick={() => (setOmitir(x), setMotivo(''))}>
                No se aplicó
              </Boton>
            </span>
          )}
        </div>
      ))}
      {h.indicaciones.some((i) => i.activa && !i.horas.length) && (
        <div className="fz-stack fz-stack--chico">
          <b className="fz-chico">Según necesidad</b>
          {h.indicaciones
            .filter((i) => i.activa && !i.horas.length)
            .map((i) => (
              <div key={i.clave} className="cl-hos-toma">
                <span className="cl-hos-toma__hora">—</span>
                <span className="cl-hos-toma__main">
                  <b>{i.tratamiento}</b>
                  <span className="fz-chico">{[i.dosis, i.via, i.frecuencia].filter(Boolean).join(' · ')}</span>
                  {h.porNecesidad
                    .filter((x) => x.clave === i.clave)
                    .map((x, k) => (
                      <span key={k} className="fz-chico fz-tenue">
                        {x.estado === 'omitida' ? `No se aplicó: ${x.motivo}` : 'Aplicada'} · {momento(x.en)} · {x.por}
                      </span>
                    ))}
                </span>
                {puede && dia === hoy && (
                  <span className="cl-hos-toma__btns">
                    <Boton chico tono="teal" onClick={() => mandar('aplicaciones', { clave: i.clave, estado: 'aplicada' })}>
                      Registrar aplicación
                    </Boton>
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
      {omitir && (
        <Confirmar titulo="No se aplicó" etiquetaSi="Guardar" ocupado={motivo.trim().length < 3} onNo={() => setOmitir(null)} onSi={async () => (await mandar('aplicaciones', { clave: omitir.clave, programada: omitir.programada, estado: 'omitida', motivo })) && setOmitir(null)}>
          <p>
            {omitir.tratamiento} de las {omitir.hora}.
          </p>
          <Campo etiqueta="¿Por qué? *">
            <input className="fz-input" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. vomitó, el médico lo pospuso" autoFocus />
          </Campo>
        </Confirmar>
      )}
    </section>
  )
}

function Indicaciones({ h, puede, mandar }: { h: Ficha; puede: boolean; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const vacio = { tratamiento: '', dosis: '', via: '', frecuencia: '', horas: '', nota: '' }
  const [f, setF] = useState(vacio)
  const [suspender, setSuspender] = useState<string | null>(null)
  const activas = h.indicaciones.filter((i) => i.activa)
  const suspendidas = h.indicaciones.filter((i) => !i.activa)
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-ind">
      <h2 className="fz-h2" id="t-ind">
        Indicaciones del médico
      </h2>
      <Ayuda>Escribe el tratamiento, la dosis y la vía tal como los indicas, y las horas en que se aplica (HH:MM separadas por coma). Sin horas, queda «según necesidad». La plataforma no calcula ni sugiere dosis ni horarios.</Ayuda>
      {!activas.length && <p className="fz-tenue fz-chico">Sin indicaciones activas.</p>}
      {activas.map((i) => (
        <div key={i.clave} className="cl-hos-ind">
          <span className="cl-hos-toma__main">
            <b>{i.tratamiento}</b>
            <span className="fz-chico">{[i.dosis, i.via, i.frecuencia].filter(Boolean).join(' · ')}</span>
            <span className="fz-chico fz-tenue">
              {i.horas.length ? `Horas: ${i.horas.join(', ')}` : 'Según necesidad'}
              {i.nota ? ` · ${i.nota}` : ''} · indicó {i.por}
            </span>
          </span>
          {puede && (
            <Boton chico tono="peligro" onClick={() => setSuspender(i.clave)}>
              Suspender
            </Boton>
          )}
        </div>
      ))}
      {suspendidas.length > 0 && (
        <details>
          <summary className="fz-chico">Suspendidas ({suspendidas.length})</summary>
          <ul className="fz-chico">
            {suspendidas.map((i) => (
              <li key={i.clave}>
                {i.tratamiento} · {[i.dosis, i.via].filter(Boolean).join(' · ')} · suspendida {momento(i.suspendidaEn)} por {i.suspendidaPor}
              </li>
            ))}
          </ul>
        </details>
      )}
      {puede && (
        <form
          className="cl-hos-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await mandar('indicaciones', f)) setF(vacio)
          }}
        >
          <input className="fz-input" aria-label="Tratamiento" placeholder="Tratamiento o medicamento *" maxLength={120} value={f.tratamiento} onChange={(e) => setF({ ...f, tratamiento: e.target.value })} required />
          <input className="fz-input" aria-label="Dosis" placeholder="Dosis indicada" maxLength={80} value={f.dosis} onChange={(e) => setF({ ...f, dosis: e.target.value })} />
          <input className="fz-input" aria-label="Vía" placeholder="Vía" maxLength={40} value={f.via} onChange={(e) => setF({ ...f, via: e.target.value })} />
          <input className="fz-input" aria-label="Frecuencia" placeholder="Frecuencia (ej. cada 8 h)" maxLength={60} value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value })} />
          <input className="fz-input" aria-label="Horas" placeholder="Horas: 08:00, 16:00, 00:00" maxLength={120} value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} />
          <input className="fz-input" aria-label="Nota" placeholder="Nota" maxLength={300} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
          <button type="submit" className="fz-btn fz-btn--teal">
            Agregar indicación
          </button>
        </form>
      )}
      {suspender && (
        <Confirmar titulo="Suspender indicación" etiquetaSi="Sí, suspenderla" tono="peligro" onNo={() => setSuspender(null)} onSi={async () => (await mandar('indicaciones/suspender', { clave: suspender }), setSuspender(null))}>
          <p>Las tomas que faltan dejan de aparecer. Lo ya registrado se conserva.</p>
        </Confirmar>
      )}
    </section>
  )
}

function Observaciones({ h, puede, mandar }: { h: Ficha; puede: boolean; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const vacio = { temp: '', fc: '', fr: '', dolor: '', apetito: '', orina: false, heces: false, notas: '' }
  const [o, setO] = useState(vacio)
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-obs">
      <h2 className="fz-h2" id="t-obs">
        Observaciones
      </h2>
      {puede && (
        <form
          className="cl-hos-obs"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await mandar('observaciones', { temp: num(o.temp), fc: num(o.fc), fr: num(o.fr), dolor: num(o.dolor), apetito: o.apetito || null, orina: o.orina, heces: o.heces, notas: o.notas })) setO(vacio)
          }}
        >
          {(
            [
              ['temp', 'Temp °C'],
              ['fc', 'FC'],
              ['fr', 'FR'],
              ['dolor', 'Dolor 0–10'],
            ] as const
          ).map(([k, et]) => (
            <label key={k} className="fz-campo">
              <span className="fz-etiqueta">{et}</span>
              <input className="fz-input" inputMode="decimal" value={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.value })} />
            </label>
          ))}
          <label className="fz-campo">
            <span className="fz-etiqueta">Apetito</span>
            <select className="fz-input" value={o.apetito} onChange={(e) => setO({ ...o, apetito: e.target.value })}>
              <option value="">—</option>
              {APETITO.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="cl-check">
            <input type="checkbox" checked={o.orina} onChange={(e) => setO({ ...o, orina: e.target.checked })} /> Orinó
          </label>
          <label className="cl-check">
            <input type="checkbox" checked={o.heces} onChange={(e) => setO({ ...o, heces: e.target.checked })} /> Defecó
          </label>
          <label className="fz-campo cl-hos-obs__nota">
            <span className="fz-etiqueta">Notas</span>
            <input className="fz-input" maxLength={500} value={o.notas} onChange={(e) => setO({ ...o, notas: e.target.value })} />
          </label>
          <button type="submit" className="fz-btn fz-btn--teal">
            Guardar
          </button>
        </form>
      )}
      {h.observaciones.length ? (
        <div className="cl-hq-scroll">
          <table className="cl-hq-tabla-signos">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Temp</th>
                <th>FC</th>
                <th>FR</th>
                <th>Dolor</th>
                <th>Apetito</th>
                <th>Orina/heces</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {h.observaciones.slice(0, 40).map((x) => (
                <tr key={x.indice}>
                  <td>{momento(x.en)}</td>
                  <td>{x.temp ?? ''}</td>
                  <td>{x.fc ?? ''}</td>
                  <td>{x.fr ?? ''}</td>
                  <td>{x.dolor ?? ''}</td>
                  <td>{x.apetito ? ETIQ_APETITO[x.apetito] : ''}</td>
                  <td>{[x.orina ? 'orina' : '', x.heces ? 'heces' : ''].filter(Boolean).join(', ')}</td>
                  <td className="cl-hos-nota">
                    {x.notas ?? ''} <span className="fz-tenue">{x.por}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="fz-tenue fz-chico">Sin observaciones.</p>
      )}
    </section>
  )
}

function Partes({ h, puede, mandar }: { h: Ficha; puede: boolean; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-partes">
      <h2 className="fz-h2" id="t-partes">
        Partes para el tutor
      </h2>
      <p className="fz-chico fz-tenue">Lo lee el tutor en su app o con la liga (le llega un correo). Escribe cómo está, si comió, cómo durmió. No incluyas medicamentos ni dosis.</p>
      {puede && (
        <form
          className="fz-stack fz-stack--chico"
          onSubmit={async (e) => {
            e.preventDefault()
            setOcupado(true)
            if (await mandar('partes', { texto, foto })) {
              setTexto('')
              setFoto(null)
            }
            setOcupado(false)
          }}
        >
          <textarea className="fz-input" rows={3} maxLength={1500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. Pasó buena noche, ya apoya un poco la pata y comió la mitad de su ración." required />
          <div className="cl-pre-acciones">
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const a = e.target.files?.[0]
                if (!a) return
                setError(null)
                try {
                  const b = await reducirImagen(a, { lado: 1080 })
                  const r = new FileReader()
                  r.onload = () => setFoto(String(r.result))
                  r.readAsDataURL(b)
                } catch (x) {
                  setError(x instanceof Error ? x.message : 'No se pudo usar esa foto.')
                }
              }}
            />
            <Boton chico onClick={() => entrada.current?.click()}>
              {foto ? 'Cambiar foto' : 'Agregar foto'}
            </Boton>
            {foto && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt="Foto del parte" className="cl-hos-parte__mini" />
                <Boton chico onClick={() => setFoto(null)}>
                  Quitar foto
                </Boton>
              </>
            )}
            <button type="submit" className="fz-btn fz-btn--teal" disabled={ocupado || texto.trim().length < 10}>
              {ocupado ? 'Publicando…' : 'Publicar parte'}
            </button>
          </div>
          <ErrorForm error={error} />
        </form>
      )}
      {h.partes.length ? (
        h.partes.map((p) => (
          <article key={p.indice} className="cl-hos-parte">
            <p className="fz-chico fz-tenue">
              {momento(p.en)} · {p.por}
            </p>
            <p className="cl-pre-texto">{p.texto}</p>
            {p.foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.foto} alt={`Foto del parte de ${h.mascota.nombre}`} className="cl-hos-parte__foto" loading="lazy" />
            )}
          </article>
        ))
      ) : (
        <p className="fz-tenue fz-chico">Sin partes publicados.</p>
      )}
    </section>
  )
}

function Cargos({ h, puede, mandar }: { h: Ficha; puede: boolean; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const [c, setC] = useState({ concepto: '', cantidad: '1', precio: '' })
  const [quitar, setQuitar] = useState<number | null>(null)
  const num = (s: string) => Number(s.replace(/[$,\s]/g, ''))
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-labelledby="t-cargos">
      <div className="fz-entre">
        <h2 className="fz-h2" id="t-cargos">
          Cargos
        </h2>
        <b>{pesos(h.totalCargos)}</b>
      </div>
      <p className="fz-chico fz-tenue">Lo que captura el equipo (días, estudios, insumos). Al dar de alta, la suma entra a Finanzas como entrada por cobrar. No incluyas lo que ya está en el presupuesto de la cirugía.</p>
      {h.cargos.map((x) => (
        <div key={x.indice} className="cl-hos-cargo">
          <span>
            {x.concepto}
            {x.cantidad !== 1 ? ` × ${x.cantidad}` : ''} <span className="fz-chico fz-tenue">· {fecha(x.fecha)} · {x.por}</span>
          </span>
          <b>{pesos(x.importe)}</b>
          {puede && (
            <button type="button" className="cl-cerrar" aria-label="Quitar cargo" onClick={() => setQuitar(x.indice)}>
              ×
            </button>
          )}
        </div>
      ))}
      {puede && (
        <form
          className="cl-hos-form cl-hos-form--cargo"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await mandar('cargos', { concepto: c.concepto, cantidad: num(c.cantidad), precioUnitario: num(c.precio) })) setC({ concepto: '', cantidad: '1', precio: '' })
          }}
        >
          <input className="fz-input" aria-label="Concepto" placeholder="Concepto *" maxLength={160} value={c.concepto} onChange={(e) => setC({ ...c, concepto: e.target.value })} required />
          <input className="fz-input" aria-label="Cantidad" inputMode="decimal" value={c.cantidad} onChange={(e) => setC({ ...c, cantidad: e.target.value })} />
          <input className="fz-input" aria-label="Precio unitario" inputMode="decimal" placeholder="$" value={c.precio} onChange={(e) => setC({ ...c, precio: e.target.value })} required />
          <button type="submit" className="fz-btn fz-btn--teal">
            Agregar cargo
          </button>
        </form>
      )}
      {quitar != null && (
        <Confirmar titulo="Quitar cargo" etiquetaSi="Sí, quitarlo" tono="peligro" onNo={() => setQuitar(null)} onSi={async () => (await mandar('cargos/quitar', { indice: quitar }), setQuitar(null))}>
          <p>Se quita de la cuenta del internamiento.</p>
        </Confirmar>
      )}
    </section>
  )
}

function DarAlta({ h, onCerrar, mandar }: { h: Ficha; onCerrar: () => void; mandar: (r: string, c: unknown) => Promise<boolean> }) {
  const [resumen, setResumen] = useState('')
  const [ind, setInd] = useState('')
  const [ocupado, setOcupado] = useState(false)
  return (
    <Modal titulo={`Dar de alta a ${h.mascota.nombre}`} onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <Campo etiqueta="Resumen del internamiento (interno)">
          <textarea className="fz-input" rows={3} maxLength={3000} value={resumen} onChange={(e) => setResumen(e.target.value)} />
        </Campo>
        <Campo etiqueta="Indicaciones para casa * (las ve el tutor)">
          <textarea className="fz-input" rows={4} maxLength={3000} value={ind} onChange={(e) => setInd(e.target.value)} placeholder="Reposo, cuidados de la herida, cuándo regresar a revisión…" />
        </Campo>
        <p className="fz-chico">
          Cargos capturados: <b>{pesos(h.totalCargos)}</b>
          {h.totalCargos > 0 ? ' — se registran en Finanzas como entrada por cobrar.' : ' — no se registra nada en Finanzas.'}
        </p>
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <Boton
            tono="teal"
            disabled={ocupado || ind.trim().length < 5}
            onClick={async () => {
              setOcupado(true)
              if (await mandar('alta', { resumen, indicacionesAlta: ind })) onCerrar()
              setOcupado(false)
            }}
          >
            {ocupado ? 'Guardando…' : 'Dar de alta'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

/** Expediente → Cirugía: internamientos de la mascota y «Internar». */
export function HospitalMascota({ mascotaId, mascotaNombre, activa }: { mascotaId: number; mascotaNombre: string; activa: boolean }) {
  const { base, catalogo } = useClinica()
  const lista = useCarga(() => api.get<InternamientoBreve[]>(`mascotas/${mascotaId}/internamientos`), [mascotaId])
  const [internar, setInternar] = useState(false)
  const internado = (lista.datos ?? []).some((x) => x.estado === 'internado')
  return (
    <section className="fz-stack fz-stack--chico" aria-labelledby="t-hosp">
      <div className="fz-entre">
        <h3 className="fz-h2" id="t-hosp">
          Hospitalización
        </h3>
        {catalogo.permisos.escribirExpediente && activa && !internado && (
          <Boton chico onClick={() => setInternar(true)}>
            + Internar
          </Boton>
        )}
      </div>
      {(lista.datos ?? []).length === 0 ? (
        <p className="fz-tenue fz-chico">Sin internamientos.</p>
      ) : (
        <div className="fz-tarjeta fz-lista">
          {(lista.datos ?? []).map((x) => (
            <Link key={x.id} href={`${base}/hospital/${x.id}`} className="fz-fila cl-fila-boton">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{x.motivo}</span>
                <span className="fz-fila__t2">
                  {x.folio} · {x.estado === 'internado' ? `internado, día ${x.dias}` : `alta ${momento(x.alta)}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {internar && <Internar mascota={{ id: mascotaId, nombre: mascotaNombre }} onCerrar={() => setInternar(false)} />}
    </section>
  )
}
