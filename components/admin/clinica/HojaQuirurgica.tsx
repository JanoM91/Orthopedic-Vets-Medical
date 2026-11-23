'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import type { HojaVista, SignoVista } from '../../../lib/clinica/hojaQuirurgica'
import { api, Aviso, Ayuda, Boton, Campo, Confirmar, ErrorForm, fecha, momento, Pastilla, useCarga, useClinica } from './comun'
import { Internar } from './Hospital'

/**
 * Hoja quirúrgica y de anestesia (ruta ortopédica, fase 2, nov-2026). Pensada
 * para usarse en una tableta dentro del quirófano: secciones grandes, botón
 * «Ahora» en cada tiempo y en cada toma de signos, y fármacos y signos que se
 * agregan renglón por renglón. La plataforma solo registra: nunca calcula ni
 * sugiere dosis.
 */

type Hoja = HojaVista & { puedeEscribir: boolean }

const MOMENTOS: [string, string][] = [
  ['premedicacion', 'Premedicación'],
  ['induccion', 'Inducción'],
  ['mantenimiento', 'Mantenimiento'],
  ['analgesia', 'Analgesia'],
  ['antibiotico', 'Antibiótico'],
  ['fluidos', 'Fluidos'],
  ['otro', 'Otro'],
]
const ETIQ_MOMENTO = Object.fromEntries(MOMENTOS)
const TIEMPOS: [keyof HojaVista['tiempos'], string][] = [
  ['entrada', 'Entrada a quirófano'],
  ['inicioAnestesia', 'Inicio de anestesia'],
  ['inicioCirugia', 'Inicio de cirugía'],
  ['finCirugia', 'Fin de cirugía'],
  ['extubacion', 'Extubación'],
  ['salida', 'Salida de quirófano'],
]
const SERIES: [keyof SignoVista, string, string][] = [
  ['fc', 'FC', '#b42330'],
  ['fr', 'FR', '#1f4f7a'],
  ['spo2', 'SpO₂', '#0b6b59'],
  ['temp', 'Temp', '#9a5b00'],
]

/** HH:MM de ahora en la zona de la clínica. */
function ahora(): string {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Mexico_City' }).format(new Date())
}
const num = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

export function HojaQuirurgica({ id }: { id: number }) {
  const { base, catalogo } = useClinica()
  const { datos: h, error, cargando, poner } = useCarga(() => api.get<Hoja>(`hojas/${id}`), [id])
  const [cerrar, setCerrar] = useState(false)
  const [internar, setInternar] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !h) return <p className="fz-tenue">Cargando…</p>
  const editable = h.puedeEscribir && h.estado === 'abierta'
  const actualizar = (nueva: HojaVista) => poner({ ...nueva, puedeEscribir: h.puedeEscribir })
  const mandar = async (ruta: string, cuerpo: unknown): Promise<boolean> => {
    setErr(null)
    try {
      actualizar(await api.post<HojaVista>(`hojas/${id}${ruta}`, cuerpo))
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    }
  }
  return (
    <div className="fz-stack fz-stack--grande cl-hq">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">
            Hoja quirúrgica · {h.folio} · <Pastilla tono={h.estado === 'cerrada' ? 'gris' : 'ok'}>{h.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}</Pastilla>
            {h.urgencia ? (
              <>
                {' '}
                <Pastilla tono="malo">Urgencia</Pastilla>
              </>
            ) : null}
          </p>
          <h1 className="fz-h1">{h.procedimiento}</h1>
          <p className="fz-chico">
            <Link href={`${base}/mascotas/${h.mascota.id}?ver=cirugia`}>{h.mascota.nombre}</Link> · {h.mascota.especie}
            {h.mascota.raza ? `, ${h.mascota.raza}` : ''} · {fecha(h.fecha)}
            {h.cita ? ` · cita ${h.cita.folio} ${h.cita.hora}` : ''}
          </p>
        </div>
        <div className="cl-pre-acciones">
          <a href={`/api/clinica/hojas/${id}/imprimir`} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro">
            Imprimir
          </a>
          {editable && (
            <Boton tono="teal" onClick={() => setCerrar(true)}>
              Cerrar hoja
            </Boton>
          )}
          {h.puedeEscribir && (
            <Boton onClick={() => setInternar(true)}>
              Internar
            </Boton>
          )}
        </div>
      </div>
      {h.mascota.alergias && (
        <Aviso tono="malo">
          <b>Alergias:</b> {h.mascota.alergias}
        </Aviso>
      )}
      {h.mascota.alertas.map((a, i) => (
        <Aviso key={i} tono="aviso">
          <b>Manejo:</b> {a}
        </Aviso>
      ))}
      {h.presupuesto ? (
        h.presupuesto.consentimiento ? (
          <p className="fz-chico">
            Consentimiento firmado: {h.presupuesto.consentimiento.folio} por {h.presupuesto.consentimiento.nombreFirmante} el {momento(h.presupuesto.consentimiento.firmadoEn)} (presupuesto {h.presupuesto.folio}).
          </p>
        ) : (
          <Aviso tono="aviso">El presupuesto {h.presupuesto.folio} no tiene consentimiento firmado.</Aviso>
        )
      ) : (
        <Aviso tono="aviso">Esta cirugía no tiene presupuesto con consentimiento firmado. Recoge la firma en el expediente → Cirugía si aplica.</Aviso>
      )}
      {h.estado === 'cerrada' && <Aviso tono="info">Cerrada por {h.cerradaPor} el {momento(h.cerradaEn)}. Ya no se puede cambiar.</Aviso>}
      <ErrorForm error={err} />

      <SeccionEquipo h={h} editable={editable} equipo={catalogo.equipo} onGuardar={(c) => mandar('', c)} />
      <SeccionTiempos h={h} editable={editable} onGuardar={(c) => mandar('', { tiempos: c })} />
      <SeccionFarmacos h={h} editable={editable} onAgregar={(c) => mandar('/farmacos', c)} onQuitar={(i) => mandar('/quitar', { lista: 'farmacos', indice: i })} />
      <SeccionSignos h={h} editable={editable} onAgregar={(c) => mandar('/signos', c)} onQuitar={(i) => mandar('/quitar', { lista: 'signos', indice: i })} />
      <SeccionTextos h={h} editable={editable} onGuardar={(c) => mandar('', c)} />

      {internar && <Internar mascota={{ id: h.mascota.id, nombre: h.mascota.nombre }} hojaId={h.id} motivoInicial={`Postoperatorio: ${h.procedimiento}`.slice(0, 200)} onCerrar={() => setInternar(false)} />}
      {cerrar && (
        <Confirmar
          titulo="Cerrar la hoja quirúrgica"
          etiquetaSi="Sí, cerrarla"
          onNo={() => setCerrar(false)}
          onSi={async () => {
            if (await mandar('/cerrar', {})) setCerrar(false)
            else setCerrar(false)
          }}
        >
          <p>Ya no se podrá cambiar nada. Antes revisa que estén el cirujano, lo realizado y el inicio y fin de la cirugía.</p>
        </Confirmar>
      )}
    </div>
  )
}

function Tarjeta({ titulo, children, ayuda }: { titulo: string; children: React.ReactNode; ayuda?: React.ReactNode }) {
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
      <h2 className="fz-h2">{titulo}</h2>
      {ayuda}
      {children}
    </section>
  )
}

function SeccionEquipo({ h, editable, equipo, onGuardar }: { h: HojaVista; editable: boolean; equipo: { id: number; nombre: string }[]; onGuardar: (c: unknown) => Promise<boolean> }) {
  const [d, setD] = useState<{ cirujanoId: number | ''; anestesistaId: number | ''; ayudantes: string; asa: string; urgencia: boolean; pesoKg: string; ayunoHoras: string; valoracion: string }>({ cirujanoId: h.cirujano?.id ?? '', anestesistaId: h.anestesista?.id ?? '', ayudantes: h.ayudantes ?? '', asa: h.asa ?? '', urgencia: h.urgencia, pesoKg: h.pesoKg != null ? String(h.pesoKg) : '', ayunoHoras: h.ayunoHoras != null ? String(h.ayunoHoras) : '', valoracion: h.valoracion ?? '' })
  const [ok, setOk] = useState(false)
  const persona = (v: number | '', set: (n: number | '') => void, etiqueta: string) => (
    <Campo etiqueta={etiqueta}>
      <select className="fz-input" value={v} disabled={!editable} onChange={(e) => set(e.target.value ? Number(e.target.value) : '')}>
        <option value="">—</option>
        {equipo.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>
    </Campo>
  )
  return (
    <Tarjeta titulo="Equipo y valoración preanestésica">
      <div className="cl-hq-rejilla">
        {persona(d.cirujanoId, (n) => setD({ ...d, cirujanoId: n }), 'Cirujano')}
        {persona(d.anestesistaId, (n) => setD({ ...d, anestesistaId: n }), 'Anestesia')}
        <Campo etiqueta="Ayudantes">
          <input className="fz-input" value={d.ayudantes} disabled={!editable} maxLength={200} onChange={(e) => setD({ ...d, ayudantes: e.target.value })} />
        </Campo>
        <Campo etiqueta="Riesgo anestésico (ASA)">
          <select className="fz-input" value={d.asa} disabled={!editable} onChange={(e) => setD({ ...d, asa: e.target.value })}>
            <option value="">—</option>
            {['I', 'II', 'III', 'IV', 'V'].map((x) => (
              <option key={x} value={x}>
                ASA {x}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Peso hoy (kg)" ayuda={h.mascota.ultimoPesoKg != null ? `Último registrado: ${h.mascota.ultimoPesoKg} kg` : undefined}>
          <input className="fz-input" inputMode="decimal" value={d.pesoKg} disabled={!editable} onChange={(e) => setD({ ...d, pesoKg: e.target.value })} />
        </Campo>
        <Campo etiqueta="Horas de ayuno">
          <input className="fz-input" inputMode="decimal" value={d.ayunoHoras} disabled={!editable} onChange={(e) => setD({ ...d, ayunoHoras: e.target.value })} />
        </Campo>
      </div>
      <label className="cl-check">
        <input type="checkbox" checked={d.urgencia} disabled={!editable} onChange={(e) => setD({ ...d, urgencia: e.target.checked })} /> Cirugía de urgencia
      </label>
      <Campo etiqueta="Valoración preanestésica (exploración, estudios, observaciones)">
        <textarea className="fz-input" rows={3} maxLength={3000} value={d.valoracion} disabled={!editable} onChange={(e) => setD({ ...d, valoracion: e.target.value })} />
      </Campo>
      {editable && (
        <div className="fz-acciones-fin">
          {ok && <span className="fz-chico fz-tenue">Guardado</span>}
          <Boton
            tono="navy"
            onClick={async () => {
              setOk(false)
              const r = await onGuardar({ cirujanoId: d.cirujanoId || null, anestesistaId: d.anestesistaId || null, ayudantes: d.ayudantes, asa: d.asa || null, urgencia: d.urgencia, pesoKg: num(d.pesoKg), ayunoHoras: num(d.ayunoHoras), valoracion: d.valoracion })
              setOk(r)
            }}
          >
            Guardar
          </Boton>
        </div>
      )}
    </Tarjeta>
  )
}

function SeccionTiempos({ h, editable, onGuardar }: { h: HojaVista; editable: boolean; onGuardar: (c: Record<string, string>) => Promise<boolean> }) {
  return (
    <Tarjeta titulo="Tiempos">
      <div className="cl-hq-tiempos">
        {TIEMPOS.map(([k, et]) => (
          <div key={k} className="cl-hq-tiempo">
            <span className="fz-etiqueta">{et}</span>
            <b>{h.tiempos[k] ?? '—'}</b>
            {editable && (
              <div className="cl-hq-tiempo__btns">
                <Boton chico onClick={() => onGuardar({ [k]: ahora() })}>
                  Ahora
                </Boton>
                <input
                  className="fz-input cl-hq-hora"
                  type="time"
                  aria-label={`${et}: otra hora`}
                  defaultValue={h.tiempos[k] ?? ''}
                  key={h.tiempos[k] ?? 'v'}
                  onBlur={(e) => e.target.value && e.target.value !== h.tiempos[k] && onGuardar({ [k]: e.target.value })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Tarjeta>
  )
}

function SeccionFarmacos({ h, editable, onAgregar, onQuitar }: { h: HojaVista; editable: boolean; onAgregar: (c: unknown) => Promise<boolean>; onQuitar: (i: number) => Promise<boolean> }) {
  const vacio = { momento: 'premedicacion', medicamento: '', dosis: '', via: '', hora: '' }
  const [f, setF] = useState(vacio)
  const [quitar, setQuitar] = useState<number | null>(null)
  return (
    <Tarjeta titulo="Fármacos aplicados" ayuda={<p className="fz-chico fz-tenue">Escribe el medicamento y la dosis tal como los indicó el médico. La plataforma solo los registra: no calcula ni sugiere dosis.</p>}>
      {h.farmacos.length ? (
        <div className="cl-hq-tabla" role="table" aria-label="Fármacos aplicados">
          {h.farmacos.map((x) => (
            <div key={x.indice} className="cl-hq-fila" role="row">
              <b>{x.hora}</b>
              <span>{ETIQ_MOMENTO[x.momento] ?? x.momento}</span>
              <span>
                <b>{x.medicamento}</b> · {x.dosis}
                {x.via ? ` · ${x.via}` : ''}
              </span>
              <span className="fz-chico fz-tenue">{x.por}</span>
              {editable && (
                <button type="button" className="cl-cerrar" aria-label="Quitar este renglón" onClick={() => setQuitar(x.indice)}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="fz-tenue fz-chico">Sin registros.</p>
      )}
      {editable && (
        <form
          className="cl-hq-agregar"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await onAgregar({ ...f, hora: f.hora || ahora() })) setF({ ...vacio, momento: f.momento })
          }}
        >
          <select className="fz-input" aria-label="Momento" value={f.momento} onChange={(e) => setF({ ...f, momento: e.target.value })}>
            {MOMENTOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input className="fz-input" aria-label="Medicamento" placeholder="Medicamento" maxLength={120} value={f.medicamento} onChange={(e) => setF({ ...f, medicamento: e.target.value })} required />
          <input className="fz-input" aria-label="Dosis indicada" placeholder="Dosis indicada" maxLength={80} value={f.dosis} onChange={(e) => setF({ ...f, dosis: e.target.value })} required />
          <input className="fz-input" aria-label="Vía" placeholder="Vía" maxLength={40} value={f.via} onChange={(e) => setF({ ...f, via: e.target.value })} />
          <input className="fz-input cl-hq-hora" type="time" aria-label="Hora (vacío = ahora)" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
          <button type="submit" className="fz-btn fz-btn--teal">
            Agregar
          </button>
        </form>
      )}
      {quitar != null && (
        <Confirmar titulo="Quitar renglón" etiquetaSi="Sí, quitarlo" tono="peligro" onNo={() => setQuitar(null)} onSi={async () => (await onQuitar(quitar), setQuitar(null))}>
          <p>Solo si se capturó por error. Esta acción no se puede deshacer.</p>
        </Confirmar>
      )}
    </Tarjeta>
  )
}

function Serie({ puntos, color, etiqueta }: { puntos: { hora: string; valor: number }[]; color: string; etiqueta: string }) {
  const ancho = 300
  const alto = 80
  if (puntos.length < 2) return null
  const xs = puntos.map((p) => minutos(p.hora))
  const ys = puntos.map((p) => p.valor)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x: number) => 6 + ((x - x0) / Math.max(1, x1 - x0)) * (ancho - 12)
  const py = (y: number) => alto - 8 - ((y - y0) / Math.max(1, y1 - y0)) * (alto - 16)
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${px(minutos(p.hora)).toFixed(1)},${py(p.valor).toFixed(1)}`).join(' ')
  const ult = puntos[puntos.length - 1]
  return (
    <figure className="cl-hq-serie">
      <figcaption>
        <b style={{ color }}>{etiqueta}</b> {ult.valor} <span className="fz-tenue">({ult.hora}; mín {y0}, máx {y1})</span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${etiqueta}: ${puntos.map((p) => `${p.hora} ${p.valor}`).join(', ')}`}>
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {puntos.map((p, i) => (
          <circle key={i} cx={px(minutos(p.hora))} cy={py(p.valor)} r={2.5} fill={color} />
        ))}
      </svg>
    </figure>
  )
}

function SeccionSignos({ h, editable, onAgregar, onQuitar }: { h: HojaVista; editable: boolean; onAgregar: (c: unknown) => Promise<boolean>; onQuitar: (i: number) => Promise<boolean> }) {
  const vacio = { hora: '', fc: '', fr: '', spo2: '', etco2: '', temp: '', pas: '', pad: '', pam: '', notas: '' }
  const [s, setS] = useState(vacio)
  const [quitar, setQuitar] = useState<number | null>(null)
  const campos: [keyof typeof vacio, string][] = [
    ['fc', 'FC'],
    ['fr', 'FR'],
    ['spo2', 'SpO₂'],
    ['etco2', 'EtCO₂'],
    ['temp', 'Temp °C'],
    ['pas', 'PAS'],
    ['pad', 'PAD'],
    ['pam', 'PAM'],
  ]
  return (
    <Tarjeta titulo="Monitoreo de signos">
      <div className="cl-hq-series">
        {SERIES.map(([k, et, color]) => (
          <Serie key={k} etiqueta={et} color={color} puntos={h.signos.filter((x) => x[k] != null).map((x) => ({ hora: x.hora, valor: x[k] as number }))} />
        ))}
      </div>
      {editable && (
        <form
          className="cl-hq-signos"
          onSubmit={async (e) => {
            e.preventDefault()
            const cuerpo: Record<string, unknown> = { hora: s.hora || ahora(), notas: s.notas }
            for (const [k] of campos) cuerpo[k] = num(s[k])
            if (await onAgregar(cuerpo)) setS(vacio)
          }}
        >
          <label className="fz-campo">
            <span className="fz-etiqueta">Hora</span>
            <input className="fz-input cl-hq-hora" type="time" value={s.hora} onChange={(e) => setS({ ...s, hora: e.target.value })} aria-describedby="hq-ahora" />
          </label>
          {campos.map(([k, et]) => (
            <label key={k} className="fz-campo">
              <span className="fz-etiqueta">{et}</span>
              <input className="fz-input" inputMode="decimal" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            </label>
          ))}
          <label className="fz-campo cl-hq-signos__nota">
            <span className="fz-etiqueta">Nota</span>
            <input className="fz-input" maxLength={200} value={s.notas} onChange={(e) => setS({ ...s, notas: e.target.value })} />
          </label>
          <button type="submit" className="fz-btn fz-btn--teal">
            Agregar toma
          </button>
          <span id="hq-ahora" className="fz-chico fz-tenue cl-hq-signos__ayuda">
            Sin hora se usa la de ahora.
          </span>
        </form>
      )}
      {h.signos.length ? (
        <div className="cl-hq-scroll">
          <table className="cl-hq-tabla-signos">
            <thead>
              <tr>
                <th>Hora</th>
                <th>FC</th>
                <th>FR</th>
                <th>SpO₂</th>
                <th>EtCO₂</th>
                <th>Temp</th>
                <th>PAS/PAD (PAM)</th>
                <th>Nota</th>
                {editable && <th aria-label="Quitar" />}
              </tr>
            </thead>
            <tbody>
              {h.signos.map((x) => (
                <tr key={x.indice}>
                  <td>
                    <b>{x.hora}</b>
                  </td>
                  <td>{x.fc ?? ''}</td>
                  <td>{x.fr ?? ''}</td>
                  <td>{x.spo2 ?? ''}</td>
                  <td>{x.etco2 ?? ''}</td>
                  <td>{x.temp ?? ''}</td>
                  <td>
                    {x.pas ?? ''}
                    {x.pad != null ? `/${x.pad}` : ''}
                    {x.pam != null ? ` (${x.pam})` : ''}
                  </td>
                  <td>{x.notas ?? ''}</td>
                  {editable && (
                    <td>
                      <button type="button" className="cl-cerrar" aria-label={`Quitar la toma de las ${x.hora}`} onClick={() => setQuitar(x.indice)}>
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="fz-tenue fz-chico">Sin tomas registradas.</p>
      )}
      {quitar != null && (
        <Confirmar titulo="Quitar toma" etiquetaSi="Sí, quitarla" tono="peligro" onNo={() => setQuitar(null)} onSi={async () => (await onQuitar(quitar), setQuitar(null))}>
          <p>Solo si se capturó por error. Esta acción no se puede deshacer.</p>
        </Confirmar>
      )}
    </Tarjeta>
  )
}

function SeccionTextos({ h, editable, onGuardar }: { h: HojaVista; editable: boolean; onGuardar: (c: unknown) => Promise<boolean> }) {
  const [d, setD] = useState({ realizado: h.realizado ?? '', hallazgos: h.hallazgos ?? '', implantes: h.implantes ?? '', complicaciones: h.complicaciones ?? '', recuperacion: h.recuperacion ?? '', indicacionesPost: h.indicacionesPost ?? '' })
  const [ok, setOk] = useState(false)
  const campos: [keyof typeof d, string, number, string?][] = [
    ['realizado', 'Procedimiento realizado *', 4000],
    ['hallazgos', 'Hallazgos', 3000],
    ['implantes', 'Implantes (tipo, medida, lote)', 1500, 'Ej. placa LCP 3.5 de 8 orificios, lote …'],
    ['complicaciones', 'Complicaciones', 2000],
    ['recuperacion', 'Recuperación anestésica', 2000],
    ['indicacionesPost', 'Indicaciones postoperatorias', 3000],
  ]
  return (
    <Tarjeta titulo="Procedimiento y recuperación" ayuda={<Ayuda>Al cerrar la hoja se piden: cirujano, procedimiento realizado e inicio y fin de la cirugía.</Ayuda>}>
      {campos.map(([k, et, max, ph]) => (
        <Campo key={k} etiqueta={et}>
          <textarea className="fz-input" rows={k === 'realizado' ? 4 : 2} maxLength={max} placeholder={ph} value={d[k]} disabled={!editable} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
        </Campo>
      ))}
      {editable && (
        <div className="fz-acciones-fin">
          {ok && <span className="fz-chico fz-tenue">Guardado</span>}
          <Boton
            tono="navy"
            onClick={async () => {
              setOk(false)
              setOk(await onGuardar(d))
            }}
          >
            Guardar
          </Boton>
        </div>
      )}
    </Tarjeta>
  )
}
