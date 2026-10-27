'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { AsientoLibroVista, PacienteVenta, RecetaVista } from '../../../lib/farmacia/tipos'
import type { PresentacionVenta } from '../../../lib/farmacia/ventas'
import { api, Aviso, Boton, Campo, ErrorForm, fecha, GrupoPastilla, hoyISO, Icono, InputFecha, Modal, momento, Pastilla, useCarga, useFarmacia, Volver } from './comun'

/**
 * Recetas (fase 3): bandeja por validar, originales pendientes, historial,
 * captura de receta externa, ficha con validación y libro de control Grupo I.
 * `EditorMedicamentos` lo usa también el expediente (receta interna).
 */

export const ESTADO_RECETA: Record<RecetaVista['estado'], { l: string; t: 'ok' | 'aviso' | 'malo' | 'info' | 'gris' }> = {
  borrador: { l: 'Borrador', t: 'gris' },
  por_validar: { l: 'Por validar', t: 'aviso' },
  valida: { l: 'Válida', t: 'ok' },
  rechazada: { l: 'Rechazada', t: 'malo' },
  cancelada: { l: 'Cancelada', t: 'gris' },
}

export function PastillaReceta({ r }: { r: RecetaVista }) {
  const e = ESTADO_RECETA[r.estado]
  return (
    <>
      <Pastilla tono={e.t}>{r.estado === 'valida' && !r.vigente ? 'Vencida' : e.l}</Pastilla>
      {r.estado === 'valida' && !r.originalRecibido && (r.origen === 'externa' || r.folioCuantificado) && <Pastilla tono="aviso">Original pendiente</Pastilla>}
    </>
  )
}

type Pestana = 'por_validar' | 'originales' | 'todas' | 'libro'

export function Recetas({ ver }: { ver: string | null }) {
  const { base, catalogo } = useFarmacia()
  const p = catalogo.permisos
  const [tab, setTab] = useState<Pestana>((['por_validar', 'originales', 'todas', 'libro'].includes(ver ?? '') ? ver : p.recetas ? 'por_validar' : 'todas') as Pestana)
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<{ recetas: RecetaVista[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (tab === 'libro') return
    const t = setTimeout(() => {
      api.get<{ recetas: RecetaVista[]; total: number }>('recetas', { estado: tab === 'por_validar' ? 'por_validar' : null, original: tab === 'originales', q }).then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [tab, q])
  const pestanas: [Pestana, string, boolean][] = [
    ['por_validar', `Por validar${catalogo.hoy.recetasPorValidar ? ` (${catalogo.hoy.recetasPorValidar})` : ''}`, p.recetas],
    ['originales', `Originales pendientes${catalogo.hoy.originalesPendientes ? ` (${catalogo.hoy.originalesPendientes})` : ''}`, p.recetas],
    ['todas', 'Historial', true],
    ['libro', 'Libro de control', p.reportes],
  ]
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Recetas</h1>
        </div>
        <div className="fz-acciones-fin">
          <Link href={`${base}/recetas/nueva`} className="fz-btn fz-btn--navy">
            <Icono n="mas" chico /> Receta externa
          </Link>
        </div>
      </div>
      <nav className="fz-subnav" aria-label="Recetas" style={{ margin: 0 }}>
        {pestanas
          .filter(([, , v]) => v)
          .map(([k, l]) => (
            <a key={k} href={`?ver=${k}`} className={tab === k ? 'is-on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); setDatos(null) }}>
              {l}
            </a>
          ))}
      </nav>
      {tab === 'libro' ? (
        <LibroControl />
      ) : (
        <>
          <div className="fz-buscar">
            <Icono n="buscar" />
            <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="REC-12, mascota, MVZ o folio cuantificado" autoComplete="off" />
          </div>
          {error && <Aviso tono="malo">{error}</Aviso>}
          {!datos && !error && <p className="fz-tenue">Cargando…</p>}
          {datos && (
            <div className="fz-tarjeta fz-lista">
              {datos.recetas.length === 0 && (
                <p className="fz-tenue" style={{ padding: 14 }}>
                  {tab === 'por_validar' ? 'Nada por validar.' : tab === 'originales' ? 'No hay originales pendientes.' : 'Sin recetas.'}
                </p>
              )}
              {datos.recetas.map((r) => (
                <Link key={r.id} href={`${base}/recetas/${r.id}`} className="fz-fila">
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">
                      {r.folio} · {r.mascota?.nombre ?? r.pacienteTexto ?? 'Sin paciente'} <PastillaReceta r={r} />
                    </span>
                    <span className="fz-fila__t2">
                      {r.origen === 'interna' ? 'Interna' : 'Externa'} · {r.mvzNombre} · emitida {fecha(r.fechaEmision)} · vigente al {fecha(r.vigenteHasta)} · {r.renglones.map((x) => x.productoNombre ?? x.principio).join(', ')}
                    </span>
                  </span>
                  <Icono n="flecha" chico />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════ ficha ═══════════════════════════ */

export function FichaReceta({ id }: { id: number }) {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const ficha = useCarga(() => api.get<RecetaVista>(`recetas/${id}`), [id])
  const [modal, setModal] = useState<null | 'rechazar' | 'cancelar'>(null)
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (ficha.error) return <Aviso tono="malo">{ficha.error}</Aviso>
  if (!ficha.datos) return <p className="fz-tenue">Cargando…</p>
  const r = ficha.datos
  const hacer = async (ruta: string, cuerpo: unknown, ok: string) => {
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      ficha.poner(await api.post<RecetaVista>(ruta, cuerpo))
      setMsg(ok)
      setModal(null)
      setMotivo('')
      recargarCatalogo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.')
    }
    setOcupado(false)
  }
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <Volver a={`${base}/recetas`} etiqueta="Recetas" />
        <p className="fz-eyebrow">
          {r.folio} · {r.origen === 'interna' ? 'interna (expediente)' : 'externa'}
        </p>
        <h1 className="fz-h1">
          {r.mascota?.nombre ?? r.pacienteTexto ?? 'Sin paciente'} <PastillaReceta r={r} />
        </h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          {r.mvzNombre}
          {r.mvzCedula ? ` · céd. ${r.mvzCedula}` : ' · sin cédula'} · emitida {fecha(r.fechaEmision)} · vigente al {fecha(r.vigenteHasta)}
          {r.folioCuantificado ? ` · folio cuantificado ${r.folioCuantificado}` : ''}
          {r.pesoKg != null ? ` · peso ${r.pesoKg} kg` : ''}
        </p>
      </div>
      {msg && <Aviso tono="ok">{msg}</Aviso>}
      <ErrorForm error={error} />
      {r.estado === 'rechazada' && <Aviso tono="malo">Rechazada{r.validadaPor ? ` por ${r.validadaPor.nombre}` : ''}: {r.motivoRechazo}</Aviso>}
      {r.estado === 'cancelada' && <Aviso tono="gris">Cancelada: {r.motivoRechazo}</Aviso>}

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Medicamentos</h2>
        <div className="fz-lista">
          {r.renglones.map((x, i) => (
            <div key={x.id ?? i} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{x.productoNombre ?? x.principio}</span>
                <span className="fz-fila__t2">
                  {[x.dosis, x.frecuencia, x.duracion].filter(Boolean).join(' · ') || 'Sin posología escrita'} · surtidos {x.surtidosUsados} de {x.surtidosPermitidos}
                </span>
              </span>
            </div>
          ))}
        </div>
        {r.indicaciones && <p className="fz-chico">{r.indicaciones}</p>}
        {r.tieneArchivo && (
          <a href={`/api/farmacia/recetas/${r.id}/archivo`} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro fz-btn--chico" style={{ alignSelf: 'flex-start' }}>
            Ver foto de la receta
          </a>
        )}
      </section>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Bitácora</h2>
        <ul className="fa-bitacora">
          <li>Capturada{r.capturadaPor ? ` por ${r.capturadaPor.nombre}` : ''} · {momento(r.creadoEn)}</li>
          {r.firmadaEn && <li>Firmada por {r.firmadaPor?.nombre} · {momento(r.firmadaEn)}</li>}
          {r.validadaEn && <li>{r.estado === 'rechazada' ? 'Rechazada' : 'Validada'} por {r.validadaPor?.nombre} · {momento(r.validadaEn)}</li>}
          {r.originalRecibido && <li>Original recibido por {r.originalRecibidoPor?.nombre} · {momento(r.originalRecibidoEn)}</li>}
        </ul>
      </section>

      <div className="fz-acciones-fin">
        {r.estado === 'por_validar' && p.recetas && (
          <>
            <Boton tono="peligro" onClick={() => setModal('rechazar')} disabled={ocupado}>
              Rechazar
            </Boton>
            <Boton tono="navy" onClick={() => void hacer(`recetas/${r.id}/validar`, { decision: 'valida' }, 'Receta válida: ya puede surtir.')} disabled={ocupado}>
              Validar
            </Boton>
          </>
        )}
        {r.estado === 'valida' && !r.originalRecibido && p.recetas && (
          <Boton tono="teal" onClick={() => void hacer(`recetas/${r.id}/original`, undefined, 'Original físico recibido.')} disabled={ocupado}>
            Recibí el original
          </Boton>
        )}
        {(r.estado === 'valida' || r.estado === 'por_validar') && p.recetas && (
          <Boton onClick={() => setModal('cancelar')} disabled={ocupado}>
            Cancelar receta
          </Boton>
        )}
      </div>
      {r.estado === 'por_validar' && p.recetas && <p className="fz-chico fz-tenue">Revisa MVZ, cédula, fecha, producto y dosis contra la foto. Si la rechazas, el tutor recibe el motivo por correo.</p>}

      {modal && (
        <Modal titulo={modal === 'rechazar' ? 'Rechazar receta' : 'Cancelar receta'} onCerrar={() => setModal(null)}>
          <div className="fz-stack fz-stack--chico">
            <Campo etiqueta="Motivo *" ayuda={modal === 'rechazar' ? 'Se manda al tutor por correo.' : undefined}>
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder={modal === 'rechazar' ? 'Ej. falta la cédula del MVZ' : ''} />
            </Campo>
            <div className="fz-acciones-fin">
              <Boton onClick={() => setModal(null)}>Volver</Boton>
              <Boton
                tono="peligro"
                disabled={ocupado || motivo.trim().length < 5}
                onClick={() => void (modal === 'rechazar' ? hacer(`recetas/${r.id}/validar`, { decision: 'rechazada', motivo }, 'Receta rechazada.') : hacer(`recetas/${r.id}/cancelar`, { motivo }, 'Receta cancelada.'))}
              >
                {modal === 'rechazar' ? 'Rechazar' : 'Cancelar receta'}
              </Boton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════════════════ editor de medicamentos (también en el expediente) ═══════════════════════════ */

export type MedicamentoEdit = { productoId: number | null; productoNombre: string; grupo: string | null; principio: string; dosis: string; frecuencia: string; duracion: string; surtidosPermitidos: string }
export const medicamentoVacio = (): MedicamentoEdit => ({ productoId: null, productoNombre: '', grupo: null, principio: '', dosis: '', frecuencia: '', duracion: '', surtidosPermitidos: '1' })
export const medicamentosParaApi = (ms: MedicamentoEdit[]) =>
  ms.map((m) => ({ productoId: m.productoId, principio: m.principio || null, dosis: m.dosis || null, frecuencia: m.frecuencia || null, duracion: m.duracion || null, surtidosPermitidos: Number(m.surtidosPermitidos) || 1 }))

export function EditorMedicamentos({ valor, onChange }: { valor: MedicamentoEdit[]; onChange: (v: MedicamentoEdit[]) => void }) {
  const [buscando, setBuscando] = useState<number | null>(null)
  const set = (i: number, c: Partial<MedicamentoEdit>) => onChange(valor.map((m, k) => (k === i ? { ...m, ...c } : m)))
  return (
    <div className="fz-stack fz-stack--chico">
      {valor.map((m, i) => (
        <div key={i} className="fa-renglon">
          <div className="fa-renglon__cab">
            <span className="fz-chico fz-tenue">Medicamento {i + 1}</span>
            {valor.length > 1 && (
              <button type="button" className="fz-link" onClick={() => onChange(valor.filter((_, k) => k !== i))}>
                Quitar
              </button>
            )}
          </div>
          <div className="cl-grid cl-grid--2">
            <Campo etiqueta="Producto del catálogo">
              <button type="button" className={`fz-input fa-elegir${m.productoId ? '' : ' fa-elegir--vacio'}`} onClick={() => setBuscando(i)}>
                {m.productoId ? m.productoNombre : 'Elegir… (opcional)'}
              </button>
            </Campo>
            <Campo etiqueta="Principio activo o descripción" ayuda={m.productoId ? undefined : 'Si no eliges producto, escribe el principio activo.'}>
              <input className="fz-input" value={m.principio} onChange={(e) => set(i, { principio: e.target.value })} />
            </Campo>
          </div>
          <div className="cl-grid cl-grid--3">
            <Campo etiqueta="Dosis (la escribe el MVZ)">
              <input className="fz-input" value={m.dosis} onChange={(e) => set(i, { dosis: e.target.value })} placeholder="Ej. 1 tableta" />
            </Campo>
            <Campo etiqueta="Frecuencia">
              <input className="fz-input" value={m.frecuencia} onChange={(e) => set(i, { frecuencia: e.target.value })} placeholder="Ej. cada 12 h" />
            </Campo>
            <Campo etiqueta="Duración">
              <input className="fz-input" value={m.duracion} onChange={(e) => set(i, { duracion: e.target.value })} placeholder="Ej. 7 días" />
            </Campo>
          </div>
          <Campo etiqueta="Surtidos permitidos" ancho="corto">
            <input className="fz-input" type="number" min={1} max={24} value={m.surtidosPermitidos} onChange={(e) => set(i, { surtidosPermitidos: e.target.value })} />
          </Campo>
          {(m.grupo === 'I' || m.grupo === 'II') && <p className="fz-chico fz-tenue">Grupo {m.grupo}{m.grupo === 'I' ? ': exige folio de receta cuantificada (SENASICA).' : '.'}</p>}
        </div>
      ))}
      <Boton chico onClick={() => onChange([...valor, medicamentoVacio()])}>
        <Icono n="mas" chico /> Otro medicamento
      </Boton>
      {buscando != null && (
        <ModalProducto
          onCerrar={() => setBuscando(null)}
          alElegir={(x) => {
            set(buscando, { productoId: x.producto.id, productoNombre: x.producto.nombre, grupo: x.producto.grupo, principio: valor[buscando].principio || x.producto.principioActivo || '' })
            setBuscando(null)
          }}
        />
      )}
    </div>
  )
}

function ModalProducto({ onCerrar, alElegir }: { onCerrar: () => void; alElegir: (p: PresentacionVenta) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<PresentacionVenta[]>([])
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([])
      return
    }
    const t = setTimeout(() => {
      api.get<PresentacionVenta[]>('vender/buscar', { q }).then((r) => {
        /* Un renglón por producto: la receta se liga al producto, no a la presentación. */
        const vistos = new Set<number>()
        setRes(r.filter((x) => (vistos.has(x.producto.id) ? false : (vistos.add(x.producto.id), true))))
      }, () => setRes([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal titulo="Producto de la receta" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <div className="fz-buscar">
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o principio activo" autoFocus autoComplete="off" />
        </div>
        <div className="fz-resultados">
          {res.map((x) => (
            <button key={x.producto.id} type="button" onClick={() => alElegir(x)}>
              <span style={{ flex: 1 }}>
                <b>{x.producto.nombre}</b> <GrupoPastilla grupo={x.producto.grupo} />
                <br />
                <span className="fz-chico fz-tenue">{x.producto.principioActivo ?? ''}</span>
              </span>
              <Icono n="flecha" chico />
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════ receta externa ═══════════════════════════ */

export function NuevaRecetaExterna({ mascotaInicial }: { mascotaInicial: number | null }) {
  const { base, catalogo } = useFarmacia()
  const router = useRouter()
  const [paciente, setPaciente] = useState<PacienteVenta | null>(null)
  const [buscarMascota, setBuscarMascota] = useState(false)
  const [pacienteTexto, setPacienteTexto] = useState('')
  const [mvzNombre, setMvzNombre] = useState('')
  const [mvzCedula, setMvzCedula] = useState('')
  const [fechaEmision, setFechaEmision] = useState(hoyISO())
  const [vigenteHasta, setVigenteHasta] = useState('')
  const [folio, setFolio] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const [meds, setMeds] = useState<MedicamentoEdit[]>([medicamentoVacio()])
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (mascotaInicial) api.get<PacienteVenta>(`pacientes/${mascotaInicial}`).then(setPaciente, () => undefined)
  }, [mascotaInicial])
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const datos = { mascotaId: paciente?.mascotaId ?? null, pacienteTexto: paciente ? null : pacienteTexto || null, mvzNombre, mvzCedula: mvzCedula || null, fechaEmision, vigenteHasta, folioCuantificado: folio || null, indicaciones: indicaciones || null, renglones: medicamentosParaApi(meds) }
    try {
      let r: RecetaVista
      if (archivo) {
        const fd = new FormData()
        fd.append('datos', JSON.stringify(datos))
        fd.append('archivo', archivo)
        const res = await fetch('/api/farmacia/recetas/externa', { method: 'POST', credentials: 'same-origin', body: fd })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error((data as { error?: string } | null)?.error || 'No se pudo guardar.')
        r = data as RecetaVista
      } else r = await api.post<RecetaVista>('recetas/externa', datos)
      router.push(`${base}/recetas/${r.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setOcupado(false)
    }
  }
  return (
    <form className="fz-stack fz-stack--grande" onSubmit={(e) => void guardar(e)}>
      <div>
        <Volver a={`${base}/recetas`} etiqueta="Recetas" />
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Receta externa</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          Queda por validar hasta que el encargado la revise.
        </p>
      </div>
      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Paciente</h2>
        {paciente ? (
          <p>
            <b>{paciente.nombre}</b> · {paciente.especie} · {paciente.folio}
            {paciente.cliente ? ` · ${paciente.cliente.nombre}` : ''}{' '}
            <button type="button" className="fz-link" onClick={() => setPaciente(null)}>
              Cambiar
            </button>
          </p>
        ) : (
          <div className="cl-grid cl-grid--2">
            {catalogo.clinica && (
              <Boton onClick={() => setBuscarMascota(true)}>
                <Icono n="buscar" chico /> Buscar mascota
              </Boton>
            )}
            <Campo etiqueta={catalogo.clinica ? 'O nombre del paciente (si no está en el sistema)' : 'Nombre del paciente'}>
              <input className="fz-input" value={pacienteTexto} onChange={(e) => setPacienteTexto(e.target.value)} />
            </Campo>
          </div>
        )}
      </section>
      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Receta</h2>
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta="MVZ que firma *">
            <input className="fz-input" value={mvzNombre} onChange={(e) => setMvzNombre(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Cédula profesional">
            <input className="fz-input" value={mvzCedula} onChange={(e) => setMvzCedula(e.target.value)} />
          </Campo>
          <Campo etiqueta="Fecha de emisión *">
            <InputFecha valor={fechaEmision} onChange={setFechaEmision} max={hoyISO()} requerido />
          </Campo>
          <Campo etiqueta="Vigente hasta *" ayuda="La fija el MVZ en la receta.">
            <InputFecha valor={vigenteHasta} onChange={setVigenteHasta} requerido />
          </Campo>
          <Campo etiqueta="Folio cuantificado (solo Grupo I)">
            <input className="fz-input" value={folio} onChange={(e) => setFolio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Foto o PDF de la receta">
            <input className="fz-input" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </Campo>
        </div>
        <Campo etiqueta="Indicaciones">
          <textarea className="fz-input" rows={2} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
        </Campo>
      </section>
      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Medicamentos</h2>
        <EditorMedicamentos valor={meds} onChange={setMeds} />
      </section>
      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado || !mvzNombre || !vigenteHasta}>
          {ocupado ? 'Guardando…' : 'Guardar para validar'}
        </button>
      </div>
      {buscarMascota && <BuscarMascota onCerrar={() => setBuscarMascota(false)} alElegir={(x) => { setPaciente(x); setBuscarMascota(false) }} />}
    </form>
  )
}

function BuscarMascota({ onCerrar, alElegir }: { onCerrar: () => void; alElegir: (p: PacienteVenta) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<PacienteVenta[]>([])
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([])
      return
    }
    const t = setTimeout(() => {
      api.get<PacienteVenta[]>('pacientes', { q }).then(setRes, () => setRes([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal titulo="Mascota" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <div className="fz-buscar">
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mascota o tutor" autoFocus autoComplete="off" />
        </div>
        <div className="fz-resultados">
          {res.map((x) => (
            <button key={x.mascotaId} type="button" onClick={() => alElegir(x)}>
              <span style={{ flex: 1 }}>
                <b>{x.nombre}</b> · {x.especie} <span className="fz-chico fz-tenue">{x.cliente?.nombre ?? ''}</span>
              </span>
              <Icono n="flecha" chico />
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════ libro de control ═══════════════════════════ */

function LibroControl() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filas, setFilas] = useState<AsientoLibroVista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.get<AsientoLibroVista[]>('libro', { desde, hasta }).then(setFilas, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [desde, hasta])
  const qs = [desde && `desde=${desde}`, hasta && `hasta=${hasta}`].filter(Boolean).join('&')
  return (
    <div className="fz-stack fz-stack--chico">
      <p className="fz-chico">Asiento automático e inmutable por cada salida de Grupo I (NOM-064-ZOO-2000). Una venta anulada agrega un asiento de cancelación.</p>
      <div className="fa-filtros">
        <Campo etiqueta="Desde">
          <InputFecha valor={desde} onChange={setDesde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <InputFecha valor={hasta} onChange={setHasta} />
        </Campo>
        <a href={`/api/farmacia/libro/csv${qs ? `?${qs}` : ''}`} className="fz-btn fz-btn--claro" style={{ alignSelf: 'end' }}>
          Descargar CSV
        </a>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {filas && filas.length === 0 && <Aviso>Sin salidas de Grupo I en ese periodo.</Aviso>}
      {filas && filas.length > 0 && (
        <div className="fa-tabla-scroll">
          <table className="cl-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Registro</th>
                <th>Lote</th>
                <th>Compra</th>
                <th>Folio receta</th>
                <th>Cantidad</th>
                <th>Animal</th>
                <th>MVZ</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => (
                <tr key={a.id} className={a.tipo === 'cancelacion' ? 'fa-inactiva' : ''}>
                  <td>{a.fechaUso}</td>
                  <td>
                    {a.producto}
                    {a.laboratorio ? <span className="fz-tenue"> · {a.laboratorio}</span> : null}
                    {a.tipo === 'cancelacion' ? <span className="fa-sale"> · cancelación</span> : null}
                  </td>
                  <td>{a.registroSenasica}</td>
                  <td>{a.numeroLote}</td>
                  <td>{a.fechaCompra}</td>
                  <td>{a.folioReceta}</td>
                  <td className="fz-num">
                    {a.cantidad} {a.unidad}
                  </td>
                  <td>{a.animal}</td>
                  <td>{a.mvz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
