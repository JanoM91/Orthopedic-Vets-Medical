'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { CartillaVista, ClienteVista, DocumentoVista, Expediente as Exp, MascotaVista, NotaVista, PesoVista, ResultadoBusqueda } from '../../../lib/clinica/tipos'
import { FormularioCliente } from './Cliente'
import {
  api, Avatar, Aviso, Boton, Campo, ErrorForm, ESPECIE_LABEL, ESTERIL_LABEL, etiquetaDe, fecha, hoyISO, Icono, InputFecha, Modal, momento, Pastilla, SEXO_LABEL, telefonoBonito,
  TIPO_CARTILLA_LABEL, useCarga, useClinica,
} from './comun'

/* ═══════════════════════════ formulario de mascota ═══════════════════════════ */

type TutorSel = { clienteId: number; nombre: string; telefono: string | null; principal: boolean; parentesco: string }
type Datos = {
  nombre: string
  especie: string
  especieOtra: string
  raza: string
  sexo: 'macho' | 'hembra' | 'desconocido'
  esterilizado: 'si' | 'no' | 'desconocido'
  color: string
  fechaNacimiento: string
  nacimientoEstimado: boolean
  microchip: string
  alergias: string
  alertasManejo: string
  medicoTratante: number | null
  tutores: TutorSel[]
  estado: 'activo' | 'inactivo' | 'fallecido'
  notasInternas: string
  pesoKg: string
}
const vacio = (): Datos => ({
  nombre: '', especie: 'perro', especieOtra: '', raza: '', sexo: 'desconocido', esterilizado: 'desconocido', color: '', fechaNacimiento: '', nacimientoEstimado: false,
  microchip: '', alergias: '', alertasManejo: '', medicoTratante: null, tutores: [], estado: 'activo', notasInternas: '', pesoKg: '',
})
const desde = (m: MascotaVista): Datos => ({
  nombre: m.nombre, especie: m.especie, especieOtra: m.especieOtra ?? '', raza: m.raza ?? '', sexo: m.sexo, esterilizado: m.esterilizado, color: m.color ?? '',
  fechaNacimiento: m.fechaNacimiento ?? '', nacimientoEstimado: m.nacimientoEstimado, microchip: m.microchip ?? '', alergias: m.alergias ?? '', alertasManejo: m.alertasManejo.join('\n'),
  medicoTratante: m.medicoTratante?.id ?? null, tutores: m.tutores.map((t) => ({ clienteId: t.clienteId, nombre: t.nombre, telefono: t.telefono, principal: t.principal, parentesco: t.parentesco ?? '' })),
  estado: m.estado, notasInternas: m.notasInternas ?? '', pesoKg: '',
})

/** Buscar un cliente existente para hacerlo tutor, o crear uno nuevo sin salir de la pantalla. */
function BuscadorTutor({ onElegir, excluir }: { onElegir: (c: ClienteVista) => void; excluir: number[] }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ClienteVista[]>([])
  const [nuevo, setNuevo] = useState(false)
  useEffect(() => {
    if (!q.trim()) {
      setRes([])
      return
    }
    const t = setTimeout(() => api.get<ResultadoBusqueda>('buscar', { q }).then((r) => setRes(r.clientes.filter((c) => !excluir.includes(c.id))), () => setRes([])), 250)
    return () => clearTimeout(t)
  }, [q, excluir])
  return (
    <div className="fz-stack fz-stack--chico">
      <div className="fz-entre">
        <div className="fz-buscar fz-grow">
          <Icono n="buscar" />
          <input className="fz-input" placeholder="Buscar tutor por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Boton chico onClick={() => setNuevo(true)}>
          <Icono n="mas" chico /> Cliente nuevo
        </Boton>
      </div>
      {res.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {res.map((c) => (
            <button
              key={c.id}
              type="button"
              className="fz-fila cl-fila-boton"
              onClick={() => {
                onElegir(c)
                setQ('')
              }}
            >
              <Avatar nombre={c.nombreCompleto} />
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{c.nombreCompleto}</span>
                <span className="fz-fila__t2">
                  {c.folio} · {telefonoBonito(c.telefono)}
                </span>
              </span>
              <span className="fz-chico">Elegir</span>
            </button>
          ))}
        </div>
      )}
      {nuevo && (
        <Modal titulo="Nuevo cliente (tutor)" onCerrar={() => setNuevo(false)}>
          <FormularioCliente
            compacto
            onGuardado={(c) => {
              onElegir(c)
              setNuevo(false)
            }}
            onCancelar={() => setNuevo(false)}
          />
        </Modal>
      )}
    </div>
  )
}

export function FormularioMascota({ existente, clienteInicial, onGuardado, onCancelar }: { existente?: MascotaVista; clienteInicial?: number | null; onGuardado?: (m: MascotaVista) => void; onCancelar?: () => void }) {
  const { base, catalogo, recargarCatalogo } = useClinica()
  const router = useRouter()
  const [d, setD] = useState<Datos>(existente ? desde(existente) : vacio())
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Datos>(k: K, v: Datos[K]) => setD((x) => ({ ...x, [k]: v }))
  const agregarTutor = (c: ClienteVista) =>
    setD((x) => (x.tutores.some((t) => t.clienteId === c.id) ? x : { ...x, tutores: [...x.tutores, { clienteId: c.id, nombre: c.nombreCompleto, telefono: c.telefono, principal: x.tutores.length === 0, parentesco: '' }] }))

  useEffect(() => {
    if (!existente && clienteInicial) {
      api.get<{ cliente: ClienteVista }>(`clientes/${clienteInicial}`).then((f) => agregarTutor(f.cliente), () => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteInicial])

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const cuerpo = {
        ...d,
        alertasManejo: d.alertasManejo.split('\n').map((s) => s.trim()).filter(Boolean),
        tutores: d.tutores.map((t) => ({ clienteId: t.clienteId, principal: t.principal, parentesco: t.parentesco || undefined })),
        pesoKg: d.pesoKg ? Number(d.pesoKg.replace(',', '.')) : null,
      }
      const m = existente ? await api.post<MascotaVista>(`mascotas/${existente.id}`, cuerpo) : await api.post<MascotaVista>('mascotas', cuerpo)
      recargarCatalogo()
      if (onGuardado) onGuardado(m)
      else router.push(`${base}/mascotas/${m.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  return (
    <form
      className="fz-stack"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <div>
        <p className="fz-eyebrow">Mascotas</p>
        <h1 className="fz-h1">{existente ? `Editar a ${existente.nombre}` : 'Nueva mascota (paciente)'}</h1>
      </div>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Tutores *</h2>
        {d.tutores.length === 0 && <p className="fz-chico fz-tenue">Elige al menos un tutor. Busca un cliente ya registrado o crea uno nuevo.</p>}
        {d.tutores.map((t) => (
          <div key={t.clienteId} className="cl-tutor-fila">
            <Avatar nombre={t.nombre} />
            <span className="fz-grow">
              <b>{t.nombre}</b> <span className="fz-tenue fz-chico">{telefonoBonito(t.telefono)}</span>
            </span>
            <label className="cl-check fz-chico">
              <input type="radio" name="principal" checked={t.principal} onChange={() => set('tutores', d.tutores.map((x) => ({ ...x, principal: x.clienteId === t.clienteId })))} /> principal
            </label>
            <input className="fz-input fz-input--compacto" placeholder="relación (opcional)" value={t.parentesco} onChange={(e) => set('tutores', d.tutores.map((x) => (x.clienteId === t.clienteId ? { ...x, parentesco: e.target.value } : x)))} />
            <button type="button" className="cl-cerrar" aria-label={`Quitar a ${t.nombre}`} onClick={() => set('tutores', d.tutores.filter((x) => x.clienteId !== t.clienteId).map((x, i) => ({ ...x, principal: d.tutores.filter((y) => y.clienteId !== t.clienteId).some((y) => y.principal) ? x.principal : i === 0 })))}>
              ×
            </button>
          </div>
        ))}
        <BuscadorTutor onElegir={agregarTutor} excluir={d.tutores.map((t) => t.clienteId)} />
      </section>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Datos de la mascota</h2>
        <div className="cl-grid">
          <Campo etiqueta="Nombre *">
            <input className="fz-input" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Especie *">
            <select className="fz-input" value={d.especie} onChange={(e) => set('especie', e.target.value)}>
              {catalogo.especies.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Campo>
          {d.especie === 'otra' && (
            <Campo etiqueta="¿Cuál?">
              <input className="fz-input" value={d.especieOtra} onChange={(e) => set('especieOtra', e.target.value)} />
            </Campo>
          )}
          <Campo etiqueta="Raza">
            <input className="fz-input" value={d.raza} onChange={(e) => set('raza', e.target.value)} />
          </Campo>
          <Campo etiqueta="Sexo">
            <select className="fz-input" value={d.sexo} onChange={(e) => set('sexo', e.target.value as Datos['sexo'])}>
              <option value="desconocido">Sin registrar</option>
              <option value="macho">Macho</option>
              <option value="hembra">Hembra</option>
            </select>
          </Campo>
          <Campo etiqueta="Esterilización">
            <select className="fz-input" value={d.esterilizado} onChange={(e) => set('esterilizado', e.target.value as Datos['esterilizado'])}>
              <option value="desconocido">Sin registrar</option>
              <option value="si">Esterilizado(a)</option>
              <option value="no">Entero(a)</option>
            </select>
          </Campo>
          <Campo etiqueta="Color y señas">
            <input className="fz-input" value={d.color} onChange={(e) => set('color', e.target.value)} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento">
            <div className="fz-entre" style={{ justifyContent: 'flex-start' }}>
              <InputFecha valor={d.fechaNacimiento} onChange={(v) => set('fechaNacimiento', v)} max={hoyISO()} />
              <label className="cl-check fz-chico">
                <input type="checkbox" checked={d.nacimientoEstimado} onChange={(e) => set('nacimientoEstimado', e.target.checked)} /> estimada
              </label>
            </div>
          </Campo>
          <Campo etiqueta="Microchip">
            <input className="fz-input" value={d.microchip} onChange={(e) => set('microchip', e.target.value)} />
          </Campo>
          <Campo etiqueta="Médico tratante">
            <select className="fz-input" value={d.medicoTratante ?? ''} onChange={(e) => set('medicoTratante', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {catalogo.equipo.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {!existente && (
            <Campo etiqueta="Peso de hoy (kg)" ayuda="Opcional. Queda como primer registro de peso.">
              <input className="fz-input" inputMode="decimal" value={d.pesoKg} onChange={(e) => set('pesoKg', e.target.value)} />
            </Campo>
          )}
          {existente && (
            <Campo etiqueta="Estado">
              <select className="fz-input" value={d.estado} onChange={(e) => set('estado', e.target.value as Datos['estado'])}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo (ya no viene)</option>
                <option value="fallecido">Fallecido</option>
              </select>
            </Campo>
          )}
        </div>
        <Campo etiqueta="Alergias" ayuda="Se muestran como alerta en todo el sistema.">
          <input className="fz-input" value={d.alergias} onChange={(e) => set('alergias', e.target.value)} />
        </Campo>
        <Campo etiqueta="Alertas de manejo" ayuda="Una por línea. Las ven todos, también estética y recepción.">
          <textarea className="fz-input" rows={2} value={d.alertasManejo} onChange={(e) => set('alertasManejo', e.target.value)} placeholder="Ej. Postoperatorio: evitar saltos y escaleras" />
        </Campo>
        <Campo etiqueta="Notas internas" ayuda="El tutor no las ve.">
          <textarea className="fz-input" rows={2} value={d.notasInternas} onChange={(e) => set('notasInternas', e.target.value)} />
        </Campo>
      </section>

      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy" disabled={guardando || d.tutores.length === 0}>
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Crear mascota'}
        </button>
        {onCancelar ? (
          <Boton onClick={onCancelar}>Cancelar</Boton>
        ) : (
          <Link href={base} className="fz-btn fz-btn--claro">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}

/* ═══════════════════════════ expediente ═══════════════════════════ */

type Pestana = 'resumen' | 'cartilla' | 'pesos' | 'notas' | 'documentos'

export function Expediente({ id, pestana }: { id: number; pestana: string | null }) {
  const { base, catalogo } = useClinica()
  const p = catalogo.permisos
  const { datos, error, cargando, recargar, poner } = useCarga(() => api.get<Exp>(`mascotas/${id}`), [id])
  const [tab, setTab] = useState<Pestana>((['resumen', 'cartilla', 'pesos', 'notas', 'documentos'].includes(pestana ?? '') ? pestana : 'resumen') as Pestana)
  const [editando, setEditando] = useState(false)

  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  const m = datos.mascota
  if (editando)
    return (
      <FormularioMascota
        existente={m}
        onGuardado={(nuevo) => {
          poner({ ...datos, mascota: { ...nuevo, ultimoPeso: m.ultimoPeso } })
          setEditando(false)
        }}
        onCancelar={() => setEditando(false)}
      />
    )

  const proxima = datos.cartilla.filter((c) => c.proximaFecha && c.proximaFecha >= hoyISO()).sort((a, b) => a.proximaFecha!.localeCompare(b.proximaFecha!))[0]
  const vencidas = datos.cartilla.filter((c) => c.proximaFecha && c.proximaFecha < hoyISO())
  const pestanas: [Pestana, string, number | null][] = [
    ['resumen', 'Resumen', null],
    ['cartilla', 'Cartilla', datos.cartilla.length],
    ['pesos', 'Peso', datos.pesos.length],
    ['notas', 'Notas clínicas', datos.notas ? datos.notas.length : null],
    ['documentos', 'Documentos', datos.documentos.length],
  ]

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div className="cl-cabecera-ficha">
          <Avatar nombre={m.nombre} especie={m.especie} grande />
          <div>
            <p className="fz-eyebrow">
              Mascota · {m.folio} {m.estado !== 'activo' && <Pastilla tono="gris">{m.estado}</Pastilla>}
            </p>
            <h1 className="fz-h1">{m.nombre}</h1>
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              {m.especie === 'otra' && m.especieOtra ? m.especieOtra : ESPECIE_LABEL[m.especie] ?? m.especie}
              {m.raza ? `, ${m.raza}` : ''} · {SEXO_LABEL[m.sexo]}
              {ESTERIL_LABEL[m.esterilizado] ? `, ${ESTERIL_LABEL[m.esterilizado]}` : ''}
              {m.edad ? ` · ${m.edad}${m.nacimientoEstimado ? ' (estimado)' : ''}` : ''}
              {m.ultimoPeso ? ` · ${m.ultimoPeso.kg} kg` : ''}
            </p>
            <p className="fz-chico" style={{ marginTop: 2 }}>
              Tutor{m.tutores.length > 1 ? 'es' : ''}:{' '}
              {m.tutores.map((t, i) => (
                <React.Fragment key={t.clienteId}>
                  {i > 0 && ', '}
                  <Link href={`${base}/clientes/${t.clienteId}`}>{t.nombre}</Link>
                  {t.principal && m.tutores.length > 1 ? ' (principal)' : ''}
                </React.Fragment>
              ))}
              {m.medicoTratante ? ` · Médico: ${m.medicoTratante.nombre}` : ''}
            </p>
          </div>
        </div>
        {p.editarPacientes && <Boton onClick={() => setEditando(true)}>Editar datos</Boton>}
      </div>

      {(m.alertasManejo.length > 0 || m.alergias) && (
        <div className="cl-alerta">
          <Icono n="alerta" />
          <div>
            {m.alergias && (
              <div>
                <b>Alergia:</b> {m.alergias}
              </div>
            )}
            {m.alertasManejo.map((a, i) => (
              <div key={i}>
                <b>Manejo:</b> {a}
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="fz-subnav" aria-label="Secciones del expediente" style={{ margin: 0 }}>
        {pestanas.map(([k, l, n]) => (
          <a key={k} href={`?ver=${k}`} className={tab === k ? 'is-on' : ''} onClick={(e) => { e.preventDefault(); setTab(k) }}>
            {l}
            {n != null ? <span className="fz-tenue">&nbsp;{n}</span> : ''}
          </a>
        ))}
      </nav>

      {tab === 'resumen' && (
        <div className="cl-dos">
          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <h2 className="fz-h2">Datos</h2>
            <dl className="cl-dl">
              <dt>Nacimiento</dt>
              <dd>{m.fechaNacimiento ? `${fecha(m.fechaNacimiento)}${m.nacimientoEstimado ? ' (estimada)' : ''}` : '—'}</dd>
              <dt>Color y señas</dt>
              <dd>{m.color ?? '—'}</dd>
              <dt>Microchip</dt>
              <dd>{m.microchip ?? 'Sin microchip registrado'}</dd>
              <dt>Origen</dt>
              <dd>{m.origen === 'importacion' ? 'Importación de archivo' : m.origen === 'portal' ? 'Portal del tutor' : 'Captura manual'} · alta {fecha(m.creadoEn)}</dd>
            </dl>
            {m.notasInternas && (
              <div className="fz-aviso fz-aviso--gris">
                <div>
                  <b>Nota interna</b> (el tutor no la ve): {m.notasInternas}
                </div>
              </div>
            )}
          </div>
          <div className="fz-stack fz-stack--chico">
            <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
              <h2 className="fz-h2">Cartilla</h2>
              {vencidas.length > 0 && <Aviso tono="aviso">{vencidas.length === 1 ? 'Hay un refuerzo vencido' : `Hay ${vencidas.length} refuerzos vencidos`}: {vencidas.map((v) => `${v.producto} (${fecha(v.proximaFecha)})`).join(', ')}</Aviso>}
              {proxima ? (
                <p>
                  Próxima fecha indicada: <b>{fecha(proxima.proximaFecha)}</b> · {proxima.producto}
                </p>
              ) : (
                <p className="fz-tenue">Sin próximas fechas indicadas.</p>
              )}
              <p className="fz-chico fz-tenue">{datos.cartilla.length} registro(s). Último: {datos.cartilla[0] ? `${datos.cartilla[0].producto}, ${fecha(datos.cartilla[0].fechaAplicacion)}` : '—'}</p>
            </div>
            <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
              <h2 className="fz-h2">Peso</h2>
              <GraficaPeso pesos={datos.pesos} />
            </div>
          </div>
        </div>
      )}
      {tab === 'cartilla' && <Cartilla mascotaId={m.id} lista={datos.cartilla} onCambio={recargar} />}
      {tab === 'pesos' && <Pesos mascotaId={m.id} lista={datos.pesos} onCambio={recargar} />}
      {tab === 'notas' && <Notas mascotaId={m.id} lista={datos.notas} onCambio={recargar} />}
      {tab === 'documentos' && <Documentos mascotaId={m.id} lista={datos.documentos} onCambio={recargar} />}
    </div>
  )
}

/* ───────────────────────────── peso ───────────────────────────── */

function GraficaPeso({ pesos }: { pesos: PesoVista[] }) {
  if (!pesos.length) return <p className="fz-tenue">Sin registros de peso.</p>
  const serie = pesos.slice().reverse().slice(-24)
  const kgs = serie.map((p) => p.kg)
  const min = Math.min(...kgs), max = Math.max(...kgs)
  const rango = max - min || 1
  const W = 320, H = 90, pad = 8
  const pts = serie.map((p, i) => [pad + (i * (W - 2 * pad)) / Math.max(1, serie.length - 1), H - pad - ((p.kg - min) / rango) * (H - 2 * pad)] as const)
  const ultimo = serie[serie.length - 1], previo = serie[serie.length - 2]
  return (
    <div className="fz-stack fz-stack--chico">
      <p>
        <b style={{ fontSize: 22 }}>{ultimo.kg} kg</b> <span className="fz-tenue fz-chico">{fecha(ultimo.fecha)}</span>
        {previo && (
          <span className={`fz-chico ${ultimo.kg < previo.kg ? 'fz-rojo' : 'fz-tenue'}`}>
            {' '}
            · {ultimo.kg - previo.kg > 0 ? '+' : ''}
            {(ultimo.kg - previo.kg).toFixed(2)} kg desde {fecha(previo.fecha)}
          </span>
        )}
      </p>
      {serie.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="cl-grafica" role="img" aria-label={`Peso: de ${serie[0].kg} kg a ${ultimo.kg} kg`}>
          <polyline fill="none" stroke="var(--mx-teal)" strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
          {pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--mx-navy)" />
          ))}
        </svg>
      )}
    </div>
  )
}

function Pesos({ mascotaId, lista, onCambio }: { mascotaId: number; lista: PesoVista[]; onCambio: () => void }) {
  const { catalogo } = useClinica()
  const [kg, setKg] = useState('')
  const [f, setF] = useState(hoyISO())
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const guardar = async () => {
    setError(null)
    try {
      await api.post(`mascotas/${mascotaId}/pesos`, { kg: Number(kg.replace(',', '.')), fecha: f, nota })
      setKg('')
      setNota('')
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  return (
    <div className="cl-dos">
      <div className="fz-stack fz-stack--chico">
        <div className="fz-tarjeta cl-caja">
          <GraficaPeso pesos={lista} />
        </div>
        <div className="fz-tarjeta fz-lista">
          {lista.map((p) => (
            <div key={p.id} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{p.kg} kg</span>
                <span className="fz-fila__t2">
                  {fecha(p.fecha)}
                  {p.registradoPor ? ` · ${p.registradoPor}` : ''}
                  {p.nota ? ` · ${p.nota}` : ''}
                </span>
              </span>
            </div>
          ))}
          {!lista.length && <p className="fz-tenue" style={{ padding: 14 }}>Sin registros.</p>}
        </div>
      </div>
      {catalogo.permisos.editarPacientes && (
        <form
          className="fz-tarjeta cl-caja fz-stack fz-stack--chico"
          onSubmit={(e) => {
            e.preventDefault()
            void guardar()
          }}
        >
          <h2 className="fz-h2">Registrar peso</h2>
          <Campo etiqueta="Peso (kg) *">
            <input className="fz-input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} required autoFocus />
          </Campo>
          <Campo etiqueta="Fecha">
            <InputFecha valor={f} onChange={setF} max={hoyISO()} />
          </Campo>
          <Campo etiqueta="Nota">
            <input className="fz-input" value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <ErrorForm error={error} />
          <button type="submit" className="fz-btn fz-btn--navy">
            Guardar peso
          </button>
        </form>
      )}
    </div>
  )
}

/* ───────────────────────────── cartilla ───────────────────────────── */

type DatosCartilla = { tipo: string; producto: string; fechaAplicacion: string; proximaFecha: string; lote: string; caducidad: string; aplicadoPor: number | null; aplicadoPorTexto: string; notas: string }
const cartillaVacia = (): DatosCartilla => ({ tipo: 'vacuna', producto: '', fechaAplicacion: hoyISO(), proximaFecha: '', lote: '', caducidad: '', aplicadoPor: null, aplicadoPorTexto: '', notas: '' })

function FormularioCartilla({ mascotaId, existente, onListo, onCancelar }: { mascotaId: number; existente?: CartillaVista; onListo: () => void; onCancelar?: () => void }) {
  const { catalogo } = useClinica()
  const [d, setD] = useState<DatosCartilla>(
    existente
      ? {
          tipo: existente.tipo, producto: existente.producto, fechaAplicacion: existente.fechaAplicacion, proximaFecha: existente.proximaFecha ?? '', lote: existente.lote ?? '', caducidad: existente.caducidad ?? '',
          aplicadoPor: catalogo.equipo.find((u) => u.nombre === existente.aplicadoPor)?.id ?? null, aplicadoPorTexto: catalogo.equipo.some((u) => u.nombre === existente.aplicadoPor) ? '' : existente.aplicadoPor ?? '', notas: existente.notas ?? '',
        }
      : cartillaVacia(),
  )
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof DatosCartilla>(k: K, v: DatosCartilla[K]) => setD((x) => ({ ...x, [k]: v }))
  const guardar = async () => {
    setError(null)
    try {
      if (existente) await api.post(`cartilla/${existente.id}`, d)
      else await api.post(`mascotas/${mascotaId}/cartilla`, d)
      setD(cartillaVacia())
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  return (
    <form
      className="fz-tarjeta cl-caja fz-stack fz-stack--chico"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <h2 className="fz-h2">{existente ? 'Corregir registro' : 'Registrar en la cartilla'}</h2>
      <Campo etiqueta="Tipo">
        <select className="fz-input" value={d.tipo} onChange={(e) => set('tipo', e.target.value)}>
          {catalogo.tiposCartilla.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Producto o biológico *">
        <input className="fz-input" value={d.producto} onChange={(e) => set('producto', e.target.value)} required placeholder="Ej. Múltiple canina, Antirrábica" />
      </Campo>
      <div className="cl-grid">
        <Campo etiqueta="Aplicada el *">
          <InputFecha valor={d.fechaAplicacion} onChange={(v) => set('fechaAplicacion', v)} max={hoyISO()} requerido />
        </Campo>
        <Campo etiqueta="Próxima fecha">
          <InputFecha valor={d.proximaFecha} onChange={(v) => set('proximaFecha', v)} />
        </Campo>
        <Campo etiqueta="Lote">
          <input className="fz-input" value={d.lote} onChange={(e) => set('lote', e.target.value)} />
        </Campo>
        <Campo etiqueta="Caducidad del biológico">
          <input className="fz-input" value={d.caducidad} onChange={(e) => set('caducidad', e.target.value)} placeholder="AAAA-MM" />
        </Campo>
      </div>
      <Campo etiqueta="Aplicó" ayuda="Si fue en otra clínica, deja «—» y escríbelo abajo.">
        <select className="fz-input" value={d.aplicadoPor ?? ''} onChange={(e) => set('aplicadoPor', e.target.value ? Number(e.target.value) : null)}>
          <option value="">— {existente ? '' : '(yo, si no escribes a nadie)'}</option>
          {catalogo.equipo.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </Campo>
      {!d.aplicadoPor && (
        <Campo etiqueta="Aplicó (texto: otra clínica, importado)">
          <input className="fz-input" value={d.aplicadoPorTexto} onChange={(e) => set('aplicadoPorTexto', e.target.value)} />
        </Campo>
      )}
      <Campo etiqueta="Notas">
        <input className="fz-input" value={d.notas} onChange={(e) => set('notas', e.target.value)} />
      </Campo>
      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy">
          {existente ? 'Guardar corrección' : 'Registrar'}
        </button>
        {onCancelar && <Boton onClick={onCancelar}>Cancelar</Boton>}
      </div>
    </form>
  )
}

function Cartilla({ mascotaId, lista, onCambio }: { mascotaId: number; lista: CartillaVista[]; onCambio: () => void }) {
  const { catalogo } = useClinica()
  const [editando, setEditando] = useState<CartillaVista | null>(null)
  const hoy = hoyISO()
  return (
    <div className="cl-dos">
      <div className="fz-tarjeta fz-lista">
        {lista.map((c) => (
          <div key={c.id} className="fz-fila">
            <span className="fz-fila__ico is-entra">
              <Icono n="check" />
            </span>
            <span className="fz-fila__main">
              <span className="fz-fila__t1">
                {c.producto} <Pastilla tono="info">{TIPO_CARTILLA_LABEL[c.tipo] ?? c.tipo}</Pastilla>
              </span>
              <span className="fz-fila__t2">
                Aplicada {fecha(c.fechaAplicacion)}
                {c.aplicadoPor ? ` · ${c.aplicadoPor}` : ''}
                {c.lote ? ` · lote ${c.lote}` : ''}
                {c.caducidad ? ` · cad. ${c.caducidad}` : ''}
              </span>
              <span className={`fz-fila__t2 ${c.proximaFecha && c.proximaFecha < hoy ? 'fz-rojo' : ''}`}>
                {c.proximaFecha ? `Próxima: ${fecha(c.proximaFecha)}${c.proximaFecha < hoy ? ' (vencida)' : ''}` : 'Sin próxima fecha indicada'}
                {c.notas ? ` · ${c.notas}` : ''}
              </span>
            </span>
            {catalogo.permisos.editarPacientes && (
              <Boton chico onClick={() => setEditando(c)}>
                Corregir
              </Boton>
            )}
          </div>
        ))}
        {!lista.length && <p className="fz-tenue" style={{ padding: 14 }}>La cartilla está vacía.</p>}
      </div>
      {catalogo.permisos.editarPacientes && (
        <FormularioCartilla
          key={editando?.id ?? 'nuevo'}
          mascotaId={mascotaId}
          existente={editando ?? undefined}
          onListo={() => {
            setEditando(null)
            onCambio()
          }}
          onCancelar={editando ? () => setEditando(null) : undefined}
        />
      )}
    </div>
  )
}

/* ───────────────────────────── notas clínicas (SOAP) ───────────────────────────── */

type DatosNota = { fecha: string; tipo: string; titulo: string; subjetivo: string; objetivo: string; analisis: string; plan: string }
const notaVacia = (): DatosNota => ({ fecha: hoyISO(), tipo: 'consulta', titulo: '', subjetivo: '', objetivo: '', analisis: '', plan: '' })

function FormularioNota({ mascotaId, existente, onListo, onCancelar }: { mascotaId: number; existente?: NotaVista; onListo: () => void; onCancelar: () => void }) {
  const { catalogo } = useClinica()
  const [d, setD] = useState<DatosNota>(existente ? { fecha: existente.fecha, tipo: existente.tipo, titulo: existente.titulo, subjetivo: existente.subjetivo ?? '', objetivo: existente.objetivo ?? '', analisis: existente.analisis ?? '', plan: existente.plan ?? '' } : notaVacia())
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof DatosNota>(k: K, v: DatosNota[K]) => setD((x) => ({ ...x, [k]: v }))
  const guardar = async (firmar: boolean) => {
    setError(null)
    try {
      const n = existente ? await api.post<NotaVista>(`notas/${existente.id}`, d) : await api.post<NotaVista>(`mascotas/${mascotaId}/notas`, d)
      if (firmar) await api.post(`notas/${n.id}/firma`)
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  const area = (k: keyof DatosNota, l: string, ph: string) => (
    <Campo etiqueta={l}>
      <textarea className="fz-input" rows={3} value={d[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </Campo>
  )
  return (
    <form
      className="fz-tarjeta cl-caja fz-stack fz-stack--chico"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar(false)
      }}
    >
      <h2 className="fz-h2">{existente ? 'Editar borrador' : 'Nueva nota clínica'}</h2>
      <div className="cl-grid">
        <Campo etiqueta="Fecha">
          <InputFecha valor={d.fecha} onChange={(v) => set('fecha', v)} max={hoyISO()} requerido />
        </Campo>
        <Campo etiqueta="Tipo">
          <select className="fz-input" value={d.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {catalogo.tiposNota.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Motivo o título *">
        <input className="fz-input" value={d.titulo} onChange={(e) => set('titulo', e.target.value)} required autoFocus />
      </Campo>
      {area('subjetivo', 'S · Subjetivo', 'Lo que refiere el tutor')}
      {area('objetivo', 'O · Objetivo', 'Hallazgos de la exploración, constantes, estudios')}
      {area('analisis', 'A · Análisis', 'Diagnóstico o impresión diagnóstica')}
      {area('plan', 'P · Plan', 'Tratamiento, dosis, estudios, indicaciones, siguiente cita')}
      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--claro">
          Guardar borrador
        </button>
        <Boton tono="navy" onClick={() => void guardar(true)}>
          Guardar y firmar
        </Boton>
        <Boton onClick={onCancelar}>Cancelar</Boton>
      </div>
      <p className="fz-chico fz-tenue">Al firmar, la nota queda congelada: solo admite adendas (que tampoco se editan ni se borran).</p>
    </form>
  )
}

function Notas({ mascotaId, lista, onCambio }: { mascotaId: number; lista: NotaVista[] | null; onCambio: () => void }) {
  const { catalogo } = useClinica()
  const p = catalogo.permisos
  const [modo, setModo] = useState<'lista' | 'nueva' | number>('lista')
  const [adenda, setAdenda] = useState<NotaVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (lista === null) return <Aviso>Tu rol no incluye leer las notas clínicas. Las alergias y alertas de manejo sí se muestran arriba.</Aviso>

  const accion = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.')
    }
  }
  const editando = typeof modo === 'number' ? lista.find((n) => n.id === modo) : undefined
  return (
    <div className="fz-stack">
      {error && <Aviso tono="malo">{error}</Aviso>}
      {modo === 'lista' && p.escribirExpediente && (
        <div>
          <Boton tono="navy" onClick={() => setModo('nueva')}>
            <Icono n="mas" chico /> Nueva nota clínica
          </Boton>
        </div>
      )}
      {(modo === 'nueva' || editando) && <FormularioNota mascotaId={mascotaId} existente={editando} onListo={() => { setModo('lista'); onCambio() }} onCancelar={() => setModo('lista')} />}
      {lista.length === 0 && modo === 'lista' && <p className="fz-tenue">Sin notas clínicas.</p>}
      {lista.map((n) => (
        <article key={n.id} className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <div>
              <p className="fz-eyebrow">
                {fecha(n.fecha)} · {etiquetaDe(catalogo.tiposNota, n.tipo)}
                {n.autor ? ` · ${n.autor.nombre}` : ''}
              </p>
              <h3 style={{ fontSize: 17 }}>{n.titulo}</h3>
            </div>
            {n.estado === 'firmada' ? <Pastilla tono="ok">Firmada {momento(n.firmadaEn)}{n.firmadaPor ? ` · ${n.firmadaPor}` : ''}</Pastilla> : <Pastilla tono="aviso">Borrador</Pastilla>}
          </div>
          <div className="cl-soap">
            {(
              [
                ['Subjetivo', n.subjetivo],
                ['Objetivo', n.objetivo],
                ['Análisis', n.analisis],
                ['Plan', n.plan],
              ] as [string, string | null][]
            ).map(([l, v]) => (
              <div key={l}>
                <b>{l}</b>
                <p>{v || <span className="fz-tenue">—</span>}</p>
              </div>
            ))}
          </div>
          {n.adendas.map((a, i) => (
            <div key={i} className="cl-adenda">
              <b>
                Adenda · {momento(a.fecha)}
                {a.autor ? ` · ${a.autor}` : ''}
              </b>
              <div className="fz-chico fz-tenue">Motivo: {a.motivo}</div>
              <p>{a.texto}</p>
            </div>
          ))}
          {p.escribirExpediente && modo === 'lista' && (
            <div className="fz-acciones-fin">
              {n.estado === 'borrador' ? (
                <>
                  <Boton chico onClick={() => setModo(n.id)}>
                    Editar
                  </Boton>
                  <Boton chico tono="navy" onClick={() => void accion(() => api.post(`notas/${n.id}/firma`))}>
                    Firmar
                  </Boton>
                  <Boton chico tono="peligro" onClick={() => confirm('¿Borrar este borrador?') && void accion(() => api.post(`notas/${n.id}/borrar`))}>
                    Borrar borrador
                  </Boton>
                </>
              ) : (
                <Boton chico onClick={() => setAdenda(n)}>
                  Agregar adenda
                </Boton>
              )}
            </div>
          )}
        </article>
      ))}
      {adenda && (
        <Modal titulo={`Adenda a «${adenda.titulo}»`} onCerrar={() => setAdenda(null)}>
          <FormularioAdenda
            nota={adenda}
            onListo={() => {
              setAdenda(null)
              onCambio()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function FormularioAdenda({ nota, onListo }: { nota: NotaVista; onListo: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="fz-stack fz-stack--chico"
      onSubmit={(e) => {
        e.preventDefault()
        api.post(`notas/${nota.id}/adendas`, { motivo, texto }).then(onListo, (er) => setError(er instanceof Error ? er.message : 'No se pudo guardar.'))
      }}
    >
      <Campo etiqueta="Motivo *">
        <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required autoFocus placeholder="Ej. Aclaración de dosis" />
      </Campo>
      <Campo etiqueta="Texto *">
        <textarea className="fz-input" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} required />
      </Campo>
      <ErrorForm error={error} />
      <button type="submit" className="fz-btn fz-btn--navy">
        Agregar adenda
      </button>
    </form>
  )
}

/* ───────────────────────────── documentos ───────────────────────────── */

function Documentos({ mascotaId, lista, onCambio }: { mascotaId: number; lista: DocumentoVista[]; onCambio: () => void }) {
  const { catalogo } = useClinica()
  const p = catalogo.permisos
  const [archivo, setArchivo] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('indicaciones')
  const [publicado, setPublicado] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const subir = async () => {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      await api.subir(`mascotas/${mascotaId}/documentos`, archivo, { titulo: titulo || archivo.name, tipo, fecha: hoyISO(), publicadoAlTutor: publicado })
      setArchivo(null)
      setTitulo('')
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir.')
    }
    setSubiendo(false)
  }
  const cambiar = (d: DocumentoVista, cambios: Record<string, unknown>) => api.post(`documentos/${d.id}`, cambios).then(onCambio, (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'))
  return (
    <div className="cl-dos">
      <div className="fz-stack fz-stack--chico">
        {error && <Aviso tono="malo">{error}</Aviso>}
        <div className="fz-tarjeta fz-lista">
          {lista.map((d) => (
            <div key={d.id} className="fz-fila">
              <span className="fz-fila__ico is-neutro">
                <Icono n="archivo" />
              </span>
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  <a href={`/api/clinica/documentos/${d.id}/archivo`} target="_blank" rel="noreferrer">
                    {d.titulo}
                  </a>{' '}
                  <Pastilla tono="gris">{etiquetaDe(catalogo.tiposDocumento, d.tipo)}</Pastilla>
                  {d.origen === 'tutor' && <Pastilla tono={d.revision === 'revisado' ? 'ok' : 'aviso'}>{d.revision === 'revisado' ? 'aportado por el tutor · revisado' : 'aportado por el tutor · pendiente de revisión'}</Pastilla>}
                </span>
                <span className="fz-fila__t2">
                  {fecha(d.fecha)}
                  {d.subidoPor ? ` · ${d.subidoPor}` : ''}
                  {d.tamano ? ` · ${(d.tamano / 1024).toFixed(0)} KB` : ''}
                </span>
              </span>
              {p.editarPacientes && (
                <span className="fz-acciones-fin">
                  {d.origen === 'tutor' && d.revision !== 'revisado' && (
                    <Boton chico onClick={() => void cambiar(d, { revision: 'revisado' })}>
                      Marcar revisado
                    </Boton>
                  )}
                  <Boton chico tono={d.publicadoAlTutor ? 'claro' : 'teal'} onClick={() => void cambiar(d, { publicadoAlTutor: !d.publicadoAlTutor })}>
                    {d.publicadoAlTutor ? 'Publicado al tutor · ocultar' : 'Publicar al tutor'}
                  </Boton>
                </span>
              )}
            </div>
          ))}
          {!lista.length && <p className="fz-tenue" style={{ padding: 14 }}>Sin documentos.</p>}
        </div>
      </div>
      {p.editarPacientes && (
        <form
          className="fz-tarjeta cl-caja fz-stack fz-stack--chico"
          onSubmit={(e) => {
            e.preventDefault()
            void subir()
          }}
        >
          <h2 className="fz-h2">Subir documento</h2>
          {!catalogo.documentosHabilitados && <Aviso tono="aviso">El almacén privado de archivos no está configurado en esta instalación (CLINICA_BLOB_READ_WRITE_TOKEN). Todo lo demás funciona.</Aviso>}
          <Campo etiqueta="Archivo (foto o PDF) *">
            <input className="fz-input" type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
          </Campo>
          <Campo etiqueta="Título">
            <input className="fz-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={archivo?.name ?? 'Ej. Indicaciones postquirúrgicas'} />
          </Campo>
          <Campo etiqueta="Tipo">
            <select className="fz-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {catalogo.tiposDocumento.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Campo>
          <label className="cl-check">
            <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} /> Publicar al tutor (lo ve en el portal)
          </label>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={!archivo || subiendo || !catalogo.documentosHabilitados}>
            {subiendo ? 'Subiendo…' : 'Subir'}
          </button>
        </form>
      )}
    </div>
  )
}
