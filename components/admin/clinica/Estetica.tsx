'use client'

import Link from 'next/link'
import React, { useRef, useState } from 'react'

import type { EtapaEstetica, FichaVista, OpcionesFicha, TableroEstetica, TarjetaEstetica } from '../../../lib/clinica/esteticaDia'
import { reducirImagen } from '../../../lib/reducirImagen'
import { api, Avatar, Aviso, Boton, Campo, ErrorForm, fecha, hoyISO, InputFecha, Modal, telefonoBonito, useCarga, useClinica } from './comun'

/**
 * Clínica → Estética (E2): el tablero del día. Columnas por etapa (en el
 * teléfono, una lista por etapa); cada tarjeta avanza con un botón y abre su
 * ficha (qué se hizo, comportamiento, hallazgos, notas y fotos).
 */

const SIGUIENTE: Partial<Record<EtapaEstetica, { a: EtapaEstetica; texto: string }>> = {
  por_llegar: { a: 'recibida', texto: 'Recibir' },
  recibida: { a: 'bano', texto: 'A baño' },
  bano: { a: 'secado', texto: 'A secado' },
  secado: { a: 'corte', texto: 'A corte' },
  corte: { a: 'lista', texto: 'Lista' },
  lista: { a: 'entregada', texto: 'Entregar' },
}
const pesos = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

export function Estetica({ diaInicial }: { diaInicial: string | null }) {
  const { catalogo } = useClinica()
  const [dia, setDia] = useState(diaInicial ?? hoyISO())
  const t = useCarga(() => api.get<TableroEstetica>('estetica', { dia }), [dia])
  const [abierta, setAbierta] = useState<TarjetaEstetica | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [arranque, setArranque] = useState<string | null>(null)
  const datos = t.datos
  const mover = async (x: TarjetaEstetica, a: EtapaEstetica) => {
    setOcupado(x.cita.id)
    setError(null)
    try {
      const n = await api.post<TarjetaEstetica>(`estetica/citas/${x.cita.id}/mover`, { a })
      if (datos) t.poner({ ...datos, tarjetas: datos.tarjetas.map((y) => (y.cita.id === n.cita.id ? n : y)) })
      if (abierta?.cita.id === n.cita.id) setAbierta(n)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
    setOcupado(null)
  }
  const etapas = datos?.etapas ?? []
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Estética</p>
          <h1 className="fz-h1">{datos?.marca ?? 'Estética'} · {dia === hoyISO() ? 'hoy' : fecha(dia)}</h1>
        </div>
        <div className="fz-acciones-fin">
          <InputFecha valor={dia} onChange={(v) => v && setDia(v)} />
          {catalogo.permisos.superadmin && (
            <Boton
              chico
              onClick={async () => {
                try {
                  setArranque((await api.post<{ hecho: string[] }>('estetica/arranque')).hecho.join(' · '))
                } catch (e) {
                  setArranque(e instanceof Error ? e.message : 'No se pudo.')
                }
              }}
            >
              Preparar roles
            </Boton>
          )}
        </div>
      </div>
      {arranque && <Aviso tono="info">{arranque}</Aviso>}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {t.error && <Aviso tono="malo">{t.error}</Aviso>}
      {!datos && !t.error && <p className="fz-tenue">Cargando…</p>}
      {datos && datos.tarjetas.length === 0 && <Aviso tono="ok">No hay citas de estética este día.</Aviso>}
      {datos && datos.tarjetas.length > 0 && (
        <div className="cl-est-tablero">
          {etapas.map((e) => {
            const lista = datos.tarjetas.filter((x) => x.etapa === e.clave)
            return (
              <section key={e.clave} className={`cl-est-col cl-est-col--${e.clave}${lista.length ? '' : ' is-vacia'}`} aria-label={e.nombre}>
                <h2 className="cl-est-col__t">
                  {e.nombre} <span>{lista.length}</span>
                </h2>
                {lista.map((x) => {
                  const sig = SIGUIENTE[x.etapa]
                  return (
                    <article key={x.cita.id} className="cl-est-tarjeta">
                      <button type="button" className="cl-est-tarjeta__cab" onClick={() => setAbierta(x)}>
                        <Avatar nombre={x.cita.mascota.nombre} especie={x.cita.mascota.especie} foto={x.cita.mascota.foto} />
                        <span className="fz-grow" style={{ minWidth: 0 }}>
                          <b>{x.cita.mascota.nombre}</b>
                          <span className="fz-chico fz-tenue">
                            {x.cita.horaInicio} · {x.cita.servicio.nombre}
                            {x.cita.estetica?.nombreTalla ? ` · ${x.cita.estetica.nombreTalla.toLowerCase()}` : ''}
                          </span>
                        </span>
                      </button>
                      {x.cita.estetica && x.cita.estetica.adicionales.length > 0 && <p className="fz-chico">+ {x.cita.estetica.adicionales.map((a) => a.nombre).join(', ')}</p>}
                      {x.cita.mascota.alertas.length > 0 && <p className="cl-alerta fz-chico">{x.cita.mascota.alertas.join(' · ')}</p>}
                      {x.ficha && x.ficha.hallazgos.length > 0 && <p className="fz-chico cl-est-hallazgo">Observado: {x.ficha.hallazgos.join(', ')}</p>}
                      <div className="cl-est-tarjeta__pie">
                        {sig && (
                          <Boton chico tono={sig.a === 'entregada' ? 'teal' : 'navy'} disabled={ocupado === x.cita.id} onClick={() => mover(x, sig.a)}>
                            {sig.texto}
                          </Boton>
                        )}
                        {x.etapa === 'secado' && (
                          <Boton chico disabled={ocupado === x.cita.id} onClick={() => mover(x, 'lista')}>
                            Lista (sin corte)
                          </Boton>
                        )}
                        {x.whatsappLista && (
                          <a href={x.whatsappLista} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro fz-btn--chico">
                            WhatsApp
                          </a>
                        )}
                        <Boton chico onClick={() => setAbierta(x)}>
                          Ficha{x.ficha?.fotos ? ` · ${x.ficha.fotos} foto${x.ficha.fotos === 1 ? '' : 's'}` : ''}
                        </Boton>
                      </div>
                      {x.etapa === 'lista' && <p className="fz-chico fz-tenue">{x.avisoListaEn ? 'Correo «lista» enviado.' : 'Sin correo del tutor: avísale por WhatsApp.'}</p>}
                    </article>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
      {abierta && <FichaModal tarjeta={abierta} onCerrar={() => setAbierta(null)} onGuardado={() => t.recargar()} />}
    </div>
  )
}

function FichaModal({ tarjeta, onCerrar, onGuardado }: { tarjeta: TarjetaEstetica; onCerrar: () => void; onGuardado: () => void }) {
  const { base } = useClinica()
  const c = tarjeta.cita
  const f = useCarga(() => api.get<FichaVista & { opciones: OpcionesFicha }>(`estetica/citas/${c.id}/ficha`), [c.id])
  return (
    <Modal titulo={`${c.mascota.nombre} · ${c.servicio.nombre}`} onCerrar={onCerrar} ancho="ancho">
      <div className="fz-stack fz-stack--chico">
        <p className="fz-chico fz-tenue">
          {c.folio} · {c.horaInicio}
          {c.estetica?.nombreTalla ? ` · talla ${c.estetica.nombreTalla.toLowerCase()}` : ''}
          {c.estetica?.total != null ? ` · ${pesos(c.estetica.total)}` : ''}
          {c.cliente ? ` · ${c.cliente.nombre}${c.cliente.telefono ? ` · ${telefonoBonito(c.cliente.telefono)}` : ''}` : ''} · <Link href={`${base}/mascotas/${c.mascota.id}`}>Expediente</Link>
        </p>
        {c.notasTutor && <Aviso tono="info">Nota del tutor: {c.notasTutor}</Aviso>}
        {f.error && <ErrorForm error={f.error} />}
        {f.datos && <FormFicha key={f.datos.actualizadoEn ?? 'nueva'} ficha={f.datos} opciones={f.datos.opciones} citaId={c.id} onGuardado={(n) => { f.poner({ ...n, opciones: f.datos!.opciones }); onGuardado() }} />}
      </div>
    </Modal>
  )
}

function Chips({ opciones, valor, onCambio, uno }: { opciones: readonly { label: string; value: string }[]; valor: string[]; onCambio: (v: string[]) => void; uno?: boolean }) {
  return (
    <div className="cl-chips">
      {opciones.map((o) => {
        const on = valor.includes(o.value)
        return (
          <button key={o.value} type="button" aria-pressed={on} className={`cl-chip${on ? ' is-on' : ''}`} onClick={() => onCambio(uno ? (on ? [] : [o.value]) : on ? valor.filter((x) => x !== o.value) : [...valor, o.value])}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FormFicha({ ficha, opciones, citaId, onGuardado }: { ficha: FichaVista; opciones: OpcionesFicha; citaId: number; onGuardado: (f: FichaVista) => void }) {
  const [d, setD] = useState({
    queSeHizo: ficha.queSeHizo,
    corte: ficha.corte ?? '',
    productos: ficha.productos ?? '',
    comportamiento: ficha.comportamiento ? [ficha.comportamiento] : [],
    hallazgos: ficha.hallazgos,
    hallazgosNota: ficha.hallazgosNota ?? '',
    notaTutor: ficha.notaTutor ?? '',
    notaInterna: ficha.notaInterna ?? '',
    proximaSemanas: ficha.proximaSemanas ? String(ficha.proximaSemanas) : '',
  })
  const [fotos, setFotos] = useState(ficha.fotos)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => {
    setOk(false)
    setD({ ...d, [k]: v })
  }
  const guardar = async () => {
    setOcupado(true)
    setError(null)
    try {
      const n = await api.post<FichaVista>(`estetica/citas/${citaId}/ficha`, { ...d, comportamiento: d.comportamiento[0] ?? null, proximaSemanas: d.proximaSemanas ? Number(d.proximaSemanas) : null })
      setOk(true)
      onGuardado(n)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }
  return (
    <div className="fz-stack fz-stack--chico">
      <Campo etiqueta="Qué se hizo">
        <Chips opciones={opciones.queSeHizo} valor={d.queSeHizo} onCambio={(v) => set('queSeHizo', v)} />
      </Campo>
      <div className="cl-grid cl-grid--2">
        <Campo etiqueta="Corte o estilo">
          <input className="fz-input" value={d.corte} onChange={(e) => set('corte', e.target.value)} placeholder="Ej. corte cachorro, 1 cm" />
        </Campo>
        <Campo etiqueta="Productos usados">
          <input className="fz-input" value={d.productos} onChange={(e) => set('productos', e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Comportamiento" ayuda="«Necesitó bozal» y «agresiva» quedan como alerta de manejo en el expediente.">
        <Chips uno opciones={opciones.comportamiento} valor={d.comportamiento} onCambio={(v) => set('comportamiento', v)} />
      </Campo>
      <Campo etiqueta="Lo que observaste" ayuda="No es diagnóstico: le llega al equipo médico por correo y el tutor lo verá en su portal.">
        <Chips opciones={opciones.hallazgos} valor={d.hallazgos} onCambio={(v) => set('hallazgos', v)} />
      </Campo>
      {d.hallazgos.length > 0 && (
        <Campo etiqueta="Detalle de lo observado">
          <input className="fz-input" value={d.hallazgosNota} onChange={(e) => set('hallazgosNota', e.target.value)} placeholder="Ej. costra detrás de la oreja izquierda" />
        </Campo>
      )}
      <Campo etiqueta="Nota para el tutor">
        <textarea className="fz-input" rows={2} value={d.notaTutor} onChange={(e) => set('notaTutor', e.target.value)} />
      </Campo>
      <div className="cl-grid cl-grid--2">
        <Campo etiqueta="Nota interna" ayuda="El tutor no la ve.">
          <input className="fz-input" value={d.notaInterna} onChange={(e) => set('notaInterna', e.target.value)} />
        </Campo>
        <Campo etiqueta="Próximo baño sugerido (semanas)">
          <input className="fz-input" inputMode="numeric" value={d.proximaSemanas} onChange={(e) => set('proximaSemanas', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ej. 4" />
        </Campo>
      </div>
      <FotosEstetica citaId={citaId} fotos={fotos} onCambio={setFotos} />
      <ErrorForm error={error} />
      {ok && <Aviso tono="ok">Ficha guardada.</Aviso>}
      <div className="fz-acciones-fin">
        <Boton tono="teal" disabled={ocupado} onClick={guardar}>
          {ocupado ? 'Guardando…' : 'Guardar ficha'}
        </Boton>
      </div>
    </div>
  )
}

function FotosEstetica({ citaId, fotos, onCambio }: { citaId: number; fotos: FichaVista['fotos']; onCambio: (f: FichaVista['fotos']) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const entradas = { antes: useRef<HTMLInputElement>(null), despues: useRef<HTMLInputElement>(null) }
  const subir = async (momento: 'antes' | 'despues', archivo: File) => {
    setOcupado(true)
    setError(null)
    try {
      const foto = await reducirImagen(archivo, { lado: 1080 })
      onCambio((await api.subir<FichaVista>(`estetica/citas/${citaId}/fotos`, new File([foto], 'foto.jpg', { type: 'image/jpeg' }), { momento })).fotos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setOcupado(false)
      const r = entradas[momento].current
      if (r) r.value = ''
    }
  }
  const quitar = async (id: number) => {
    setOcupado(true)
    try {
      onCambio((await api.post<FichaVista>(`estetica/fotos/${id}/quitar`)).fotos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar.')
    }
    setOcupado(false)
  }
  return (
    <div className="cl-grid cl-grid--2">
      {(['antes', 'despues'] as const).map((m) => {
        const lista = fotos.filter((x) => x.momento === m)
        return (
          <Campo key={m} etiqueta={m === 'antes' ? 'Fotos de antes' : 'Fotos de después'}>
            <div className="cl-est-fotos">
              {lista.map((x) => (
                <span key={x.id} className="cl-est-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.url} alt={m === 'antes' ? 'Antes' : 'Después'} loading="lazy" />
                  <button type="button" aria-label="Quitar foto" disabled={ocupado} onClick={() => quitar(x.id)}>
                    ×
                  </button>
                </span>
              ))}
              {lista.length < 3 && (
                <button type="button" className="cl-est-foto cl-est-foto--mas" disabled={ocupado} onClick={() => entradas[m].current?.click()}>
                  + Foto
                </button>
              )}
              <input ref={entradas[m]} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && subir(m, e.target.files[0])} />
            </div>
          </Campo>
        )
      })}
      {error && <ErrorForm error={error} />}
    </div>
  )
}

/** Expediente → Resumen: últimas estéticas (qué se hizo, observaciones y fotos). */
export function EsteticaExpediente({ mascotaId }: { mascotaId: number }) {
  const r = useCarga(() => api.get<{ marca: string; activa: boolean; lista: import('../../../lib/clinica/esteticaDia').EsteticaDeMascota[] }>(`mascotas/${mascotaId}/estetica`), [mascotaId])
  if (!r.datos || !r.datos.lista.length) return null
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
      <h3 className="fz-h3">{r.datos.marca}</h3>
      {r.datos.lista.slice(0, 3).map((x) => (
        <div key={x.citaId} className="fz-stack fz-stack--chico cl-est-hist">
          <p className="fz-chico">
            <b>{fecha(x.dia)}</b> · {x.servicio}
            {x.queSeHizo.length ? ` · ${x.queSeHizo.join(', ')}` : ''}
            {x.comportamiento ? ` · ${x.comportamiento}` : ''}
          </p>
          {x.hallazgos.length > 0 && (
            <p className="fz-chico cl-est-hallazgo">
              Observado: {x.hallazgos.join(', ')}
              {x.hallazgosNota ? `. ${x.hallazgosNota}` : ''}
            </p>
          )}
          {x.notaInterna && <p className="fz-chico fz-tenue">{x.notaInterna}</p>}
          {x.fotos.length > 0 && (
            <div className="cl-est-fotos">
              {x.fotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} className="cl-est-foto" src={p.url} alt={p.momento === 'antes' ? 'Antes' : 'Después'} loading="lazy" />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
