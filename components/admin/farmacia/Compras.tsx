'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { CompraBreve, CompraVista, RenglonCompraVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, cantidad, dinero, ErrorForm, fecha, Icono, InputFecha, Modal, momento, Pastilla, Select, useCarga, useFarmacia, Volver } from './comun'

/**
 * Compras (fase 2): historial, nueva compra desde el XML de la factura o a
 * mano, y pantalla de recepción: cada renglón pide presentación del catálogo,
 * lote y caducidad; con todo completo, «Recibir» crea lotes, kardex y el
 * gasto en Finanzas.
 */

const ESTADO_LABEL: Record<string, string> = { borrador: 'Borrador', recibida: 'Recibida', anulada: 'Anulada' }
const ESTADO_TONO: Record<string, 'ok' | 'aviso' | 'malo' | 'info' | 'gris'> = { borrador: 'aviso', recibida: 'ok', anulada: 'gris' }

export function Compras({ estado: estadoInicial }: { estado: string | null }) {
  const { base, catalogo } = useFarmacia()
  const verCostos = Boolean(catalogo.permisos.verCostos)
  const [estado, setEstado] = useState(estadoInicial ?? '')
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<{ compras: CompraBreve[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      api.get<{ compras: CompraBreve[]; total: number }>('compras', { estado, q }).then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [estado, q])

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Compras</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            Del XML de la factura o a mano. Lote y caducidad siempre se capturan al recibir.
          </p>
        </div>
        <div className="fz-acciones-fin">
          <Link href={`${base}/compras/nueva`} className="fz-btn fz-btn--navy">
            <Icono n="mas" chico /> Nueva compra
          </Link>
        </div>
      </div>
      <div className="fa-filtros">
        <div className="fz-buscar" style={{ flex: '1 1 280px' }}>
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Proveedor, folio de factura, UUID o COM-12" autoComplete="off" />
        </div>
        <Select valor={estado} onChange={setEstado} ancho="auto">
          <option value="">Todas</option>
          <option value="borrador">Borradores</option>
          <option value="recibida">Recibidas</option>
          <option value="anulada">Anuladas</option>
        </Select>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {datos && (
        <div className="fz-tarjeta fz-lista">
          {datos.compras.length === 0 && (
            <p className="fz-tenue" style={{ padding: 14 }}>
              Ninguna compra todavía. Sube el XML de una factura o captura una a mano.
            </p>
          )}
          {datos.compras.map((c) => (
            <Link key={c.id} href={`${base}/compras/${c.id}`} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {c.proveedor.nombre} <Pastilla tono={ESTADO_TONO[c.estado]}>{ESTADO_LABEL[c.estado]}</Pastilla> {c.origen === 'xml' && <Pastilla tono="info">XML</Pastilla>}
                </span>
                <span className="fz-fila__t2">
                  {c.folio} · {fecha(c.fecha)}
                  {c.folioFactura ? ` · factura ${c.folioFactura}` : ''} · {c.renglones} renglón{c.renglones === 1 ? '' : 'es'} · {c.condicion === 'contado' ? 'contado' : 'crédito'}
                  {c.gastoFolio ? ` · gasto ${c.gastoFolio}` : ''}
                </span>
              </span>
              {verCostos && c.total != null && <b className="fz-num">{dinero(c.total, true)}</b>}
              <Icono n="flecha" chico />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════ nueva ═══════════════════════════ */

export function NuevaCompra() {
  const { base, catalogo } = useFarmacia()
  const router = useRouter()
  const [modo, setModo] = useState<'xml' | 'manual'>('xml')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [proveedorId, setProveedorId] = useState('')
  const [fechaF, setFechaF] = useState('')
  const [folioFactura, setFolioFactura] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      let r: CompraVista & { avisos?: string[] }
      if (modo === 'xml') {
        if (!archivo) throw new Error('Elige el XML de la factura.')
        r = await api.subir<CompraVista & { avisos: string[] }>('compras/xml', archivo)
        try {
          sessionStorage.setItem(`fa-compra-avisos-${r.id}`, JSON.stringify(r.avisos ?? []))
        } catch {
          /* sin almacenamiento, sin avisos */
        }
      } else {
        r = await api.post<CompraVista>('compras', { proveedorId: Number(proveedorId), fecha: fechaF || undefined, folioFactura: folioFactura || null, renglones: [] })
      }
      router.push(`${base}/compras/${r.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la compra.')
      setOcupado(false)
    }
  }

  return (
    <form className="fz-stack fz-stack--grande" onSubmit={(e) => void crear(e)}>
      <div>
        <Volver a={`${base}/compras`} etiqueta="Compras" />
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Nueva compra</h1>
      </div>
      <div className="fz-seg" role="radiogroup" aria-label="Origen de la compra" style={{ maxWidth: 420 }}>
        <button type="button" className={modo === 'xml' ? 'is-on' : ''} onClick={() => setModo('xml')} aria-pressed={modo === 'xml'}>
          XML de la factura (CFDI)
        </button>
        <button type="button" className={modo === 'manual' ? 'is-on' : ''} onClick={() => setModo('manual')} aria-pressed={modo === 'manual'}>
          Captura manual
        </button>
      </div>
      <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico" style={{ maxWidth: 640 }}>
        {modo === 'xml' ? (
          <>
            <p className="fz-chico">El XML trae proveedor, folio, conceptos e importes. El sistema reconoce las claves del proveedor que ya haya visto; las demás se ligan una vez. Lote y caducidad se capturan en el siguiente paso.</p>
            <Campo etiqueta="Archivo XML *">
              <input className="fz-input" type="file" accept=".xml,text/xml,application/xml" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
            </Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="Proveedor *">
              <Select valor={proveedorId} onChange={setProveedorId}>
                <option value="">Elige…</option>
                {catalogo.proveedores.filter((p) => p.activo).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            {catalogo.proveedores.length === 0 && <Aviso tono="aviso">No hay proveedores. Dalos de alta en Configuración o sube un XML (se crea solo con el RFC).</Aviso>}
            <div className="cl-grid cl-grid--2">
              <Campo etiqueta="Fecha de la factura">
                <InputFecha valor={fechaF} onChange={setFechaF} />
              </Campo>
              <Campo etiqueta="Folio de la factura o remisión">
                <input className="fz-input" value={folioFactura} onChange={(e) => setFolioFactura(e.target.value)} />
              </Campo>
            </div>
            <p className="fz-chico fz-tenue">Los renglones se capturan en el siguiente paso.</p>
          </>
        )}
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado || (modo === 'xml' ? !archivo : !proveedorId)}>
            {ocupado ? 'Creando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ═══════════════════════════ detalle / recepción ═══════════════════════════ */

type RenglonEdit = {
  id: string | null
  claveProveedor: string
  descripcion: string
  presentacionId: number | null
  presentacionNombre: string
  productoNombre: string
  unidadBase: string
  factor: number | null
  cantidad: string
  valorUnitario: string
  numeroLote: string
  caducidad: string
  loteId: number | null
}

function desdeVista(r: RenglonCompraVista): RenglonEdit {
  return {
    id: r.id,
    claveProveedor: r.claveProveedor ?? '',
    descripcion: r.descripcion ?? '',
    presentacionId: r.presentacionId,
    presentacionNombre: r.presentacionNombre ?? '',
    productoNombre: r.productoNombre ?? '',
    unidadBase: r.unidadBase ?? '',
    factor: r.factor,
    cantidad: String(r.cantidad),
    valorUnitario: r.valorUnitario != null ? String(r.valorUnitario) : '',
    numeroLote: r.numeroLote ?? '',
    caducidad: r.caducidad ?? '',
    loteId: r.loteId,
  }
}

export function FichaCompra({ id }: { id: number }) {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const verCostos = Boolean(p.verCostos)
  const ficha = useCarga(() => api.get<CompraVista>(`compras/${id}`), [id])
  const [filas, setFilas] = useState<RenglonEdit[] | null>(null)
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado')
  const [cuentaId, setCuentaId] = useState('')
  const [venceEl, setVenceEl] = useState('')
  const [notas, setNotas] = useState('')
  const [iva, setIva] = useState('')
  const [avisos, setAvisos] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [buscando, setBuscando] = useState<number | null>(null)
  const [anular, setAnular] = useState(false)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    const c = ficha.datos
    if (!c) return
    setFilas(c.renglones.map(desdeVista))
    setCondicion(c.condicion)
    setCuentaId(c.cuentaId ? String(c.cuentaId) : '')
    setVenceEl(c.venceEl ?? '')
    setNotas(c.notas ?? '')
    setIva(c.iva != null ? String(c.iva) : '')
    try {
      const a = sessionStorage.getItem(`fa-compra-avisos-${c.id}`)
      if (a) {
        setAvisos(JSON.parse(a) as string[])
        sessionStorage.removeItem(`fa-compra-avisos-${c.id}`)
      }
    } catch {
      /* nada */
    }
  }, [ficha.datos])

  if (ficha.error) return <Aviso tono="malo">{ficha.error}</Aviso>
  if (!ficha.datos || !filas) return <p className="fz-tenue">Cargando…</p>
  const c = ficha.datos
  const editable = c.estado === 'borrador'
  const esManual = c.origen === 'manual'

  const cuerpo = () => ({
    condicion,
    cuentaId: cuentaId ? Number(cuentaId) : null,
    venceEl: venceEl || null,
    notas: notas || null,
    ...(esManual && verCostos ? { iva: iva === '' ? null : Number(iva) } : {}),
    renglones: filas.map((f) => ({
      id: f.id,
      claveProveedor: f.claveProveedor || null,
      descripcion: f.descripcion || null,
      presentacionId: f.presentacionId,
      cantidad: Number(f.cantidad) || 0,
      valorUnitario: f.valorUnitario === '' ? null : Number(f.valorUnitario),
      numeroLote: f.numeroLote || null,
      caducidad: f.caducidad || null,
    })),
  })
  const guardar = async (): Promise<CompraVista> => {
    const r = await api.post<CompraVista>(`compras/${c.id}`, cuerpo())
    ficha.poner(r)
    return r
  }
  const alGuardar = async () => {
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      await guardar()
      setMsg('Borrador guardado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }
  const alRecibir = async () => {
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      const g = await guardar()
      if (g.faltantes.length) throw new Error(g.faltantes[0])
      const r = await api.post<CompraVista & { gasto: 'registrado' | 'pendiente' | 'sin_importe' }>(`compras/${c.id}/recibir`)
      ficha.poner(r)
      recargarCatalogo()
      setMsg(r.gasto === 'registrado' ? `Compra recibida: ${r.renglones.length} lotes en inventario y gasto ${r.gastoFolio ?? ''} en Finanzas.` : r.gasto === 'pendiente' ? 'Compra recibida en inventario, pero el gasto en Finanzas no se pudo registrar: usa «Reintentar gasto».' : 'Compra recibida en inventario (sin importe, no genera gasto).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recibir.')
    }
    setOcupado(false)
  }
  const alAnular = async () => {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<CompraVista>(`compras/${c.id}/anular`, { motivo })
      ficha.poner(r)
      recargarCatalogo()
      setAnular(false)
      setMsg('Compra anulada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular.')
    }
    setOcupado(false)
  }
  const alReintentar = async () => {
    setOcupado(true)
    setError(null)
    try {
      ficha.poner(await api.post<CompraVista>(`compras/${c.id}/gasto`))
      setMsg('Gasto registrado en Finanzas.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el gasto.')
    }
    setOcupado(false)
  }
  const setFila = (i: number, cambio: Partial<RenglonEdit>) => setFilas((fs) => (fs ? fs.map((f, k) => (k === i ? { ...f, ...cambio } : f)) : fs))
  const quitar = (i: number) => setFilas((fs) => (fs ? fs.filter((_, k) => k !== i) : fs))
  const agregar = () => setFilas((fs) => [...(fs ?? []), { id: null, claveProveedor: '', descripcion: '', presentacionId: null, presentacionNombre: '', productoNombre: '', unidadBase: '', factor: null, cantidad: '1', valorUnitario: '', numeroLote: '', caducidad: '', loteId: null }])

  const subtotal = verCostos ? filas.reduce((a, f) => a + (Number(f.cantidad) || 0) * (Number(f.valorUnitario) || 0), 0) : null

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <Volver a={`${base}/compras`} etiqueta="Compras" />
        <div className="fz-entre">
          <div>
            <p className="fz-eyebrow">
              {c.folio} · {c.origen === 'xml' ? 'XML CFDI' : 'captura manual'}
            </p>
            <h1 className="fz-h1">
              {c.proveedor.nombre} <Pastilla tono={ESTADO_TONO[c.estado]}>{ESTADO_LABEL[c.estado]}</Pastilla>
            </h1>
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              Factura {[c.serieFactura, c.folioFactura].filter(Boolean).join('-') || 'sin folio'} · {fecha(c.fecha)}
              {c.proveedor.rfc ? ` · RFC ${c.proveedor.rfc}` : ''}
              {c.uuid ? ` · UUID ${c.uuid}` : ''}
            </p>
          </div>
          <div className="fz-acciones-fin">
            {c.tieneXml && (
              <a href={`/api/farmacia/compras/${c.id}/xml`} className="fz-btn fz-btn--claro fz-btn--chico" download>
                Descargar XML
              </a>
            )}
            {c.estado !== 'anulada' && (
              <Boton tono="peligro" chico onClick={() => setAnular(true)}>
                Anular
              </Boton>
            )}
          </div>
        </div>
      </div>

      {avisos.map((a, i) => (
        <Aviso key={i} tono="info">
          {a}
        </Aviso>
      ))}
      {msg && <Aviso tono="ok">{msg}</Aviso>}
      {c.estado === 'recibida' && !c.gastoFinanzasId && (
        <Aviso tono="aviso">
          Esta compra está en inventario pero no tiene gasto en Finanzas.{' '}
          <button type="button" className="fz-link" onClick={() => void alReintentar()} disabled={ocupado}>
            Reintentar gasto
          </button>
        </Aviso>
      )}
      {c.estado === 'anulada' && <Aviso tono="gris">Anulada{c.anuladaPor ? ` por ${c.anuladaPor.nombre}` : ''} · {momento(c.anuladaEn)} · {c.motivoAnulacion}</Aviso>}

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <div className="fz-entre">
          <h2 className="fz-h2">Renglones</h2>
          {editable && (
            <Boton chico onClick={agregar}>
              <Icono n="mas" chico /> Agregar renglón
            </Boton>
          )}
        </div>
        {filas.length === 0 && <p className="fz-tenue fz-chico">Sin renglones. Agrega uno por cada presentación comprada.</p>}
        <div className="fz-stack fz-stack--chico">
          {filas.map((f, i) => (
            <div key={f.id ?? `n${i}`} className={`fa-renglon${!f.presentacionId && editable ? ' fa-renglon--pendiente' : ''}`}>
              <div className="fa-renglon__cab">
                <span className="fz-chico fz-tenue">
                  {i + 1}.{f.claveProveedor ? ` clave ${f.claveProveedor} ·` : ''} {f.descripcion || 'sin descripción'}
                </span>
                {editable && (
                  <button type="button" className="fz-link" onClick={() => quitar(i)}>
                    Quitar
                  </button>
                )}
              </div>
              <div className="fa-renglon__campos">
                <Campo etiqueta="Presentación del catálogo *">
                  {editable ? (
                    <button type="button" className={`fz-input fa-elegir${f.presentacionId ? '' : ' fa-elegir--vacio'}`} onClick={() => setBuscando(i)}>
                      {f.presentacionId ? `${f.productoNombre} · ${f.presentacionNombre}` : 'Elegir…'}
                    </button>
                  ) : (
                    <span className="fz-input fa-elegir" style={{ cursor: 'default' }}>
                      {f.productoNombre} · {f.presentacionNombre}
                    </span>
                  )}
                </Campo>
                <Campo etiqueta="Cantidad *" ayuda={f.factor ? `× ${cantidad(f.factor, f.unidadBase)} = ${cantidad((Number(f.cantidad) || 0) * f.factor, f.unidadBase)}` : undefined}>
                  <input className="fz-input" type="number" step="0.001" min={0} value={f.cantidad} onChange={(e) => setFila(i, { cantidad: e.target.value })} disabled={!editable} />
                </Campo>
                {verCostos && (
                  <Campo etiqueta="Valor unitario sin IVA" ayuda={f.factor && f.valorUnitario ? `${dinero(Number(f.valorUnitario) / f.factor, true)} por ${f.unidadBase}` : undefined}>
                    <input className="fz-input" type="number" step="0.01" min={0} value={f.valorUnitario} onChange={(e) => setFila(i, { valorUnitario: e.target.value })} disabled={!editable || !esManual} />
                  </Campo>
                )}
                <Campo etiqueta="Lote *">
                  <input className="fz-input" value={f.numeroLote} onChange={(e) => setFila(i, { numeroLote: e.target.value })} disabled={!editable} placeholder="Del empaque" />
                </Campo>
                <Campo etiqueta="Caducidad *">
                  {editable ? <InputFecha valor={f.caducidad} onChange={(v) => setFila(i, { caducidad: v })} /> : <span className="fz-input fa-elegir" style={{ cursor: 'default' }}>{f.caducidad ? fecha(f.caducidad) : '—'}</span>}
                </Campo>
                {f.loteId && (
                  <Campo etiqueta="Lote en inventario">
                    <Link href={`${base}/productos/${c.renglones[i]?.productoId ?? ''}`} className="fz-input fa-elegir" style={{ textDecoration: 'none' }}>
                      LOT-{String(f.loteId).padStart(5, '0')} →
                    </Link>
                  </Campo>
                )}
              </div>
            </div>
          ))}
        </div>
        {verCostos && (
          <div className="fa-totales">
            <span>Subtotal {dinero(esManual ? subtotal : (c.subtotal ?? null), true)}</span>
            {esManual && editable ? (
              <span className="fa-totales__iva">
                IVA{' '}
                <input className="fz-input fz-input--compacto" type="number" step="0.01" min={0} value={iva} onChange={(e) => setIva(e.target.value)} placeholder="16 %" aria-label="IVA de la compra" />{' '}
                <button type="button" className="fz-link" onClick={() => setIva(String(Math.round((subtotal ?? 0) * 16) / 100))}>
                  16 %
                </button>{' '}
                <button type="button" className="fz-link" onClick={() => setIva('0')}>
                  0 %
                </button>
              </span>
            ) : (
              <span>IVA {dinero(c.iva ?? null, true)}</span>
            )}
            <b>Total {dinero(esManual ? (subtotal ?? 0) + (iva === '' ? Math.round((subtotal ?? 0) * 16) / 100 : Number(iva) || 0) : (c.total ?? null), true)}</b>
          </div>
        )}
        {!esManual && editable && filas.length < c.renglones.length && (
          <p className="fz-chico fz-tenue">Quitaste renglones de la factura: no entran al inventario, pero el gasto en Finanzas sigue siendo el total del XML.</p>
        )}
      </section>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Pago</h2>
        <div className="cl-grid cl-grid--3">
          <Campo etiqueta="Condición">
            <Select valor={condicion} onChange={(v) => setCondicion(v as 'contado' | 'credito')} deshabilitado={!editable}>
              <option value="contado">Contado (ya pagada)</option>
              <option value="credito">Crédito (por pagar)</option>
            </Select>
          </Campo>
          {condicion === 'contado' ? (
            <Campo etiqueta="Cuenta o caja con la que se pagó *">
              <Select valor={cuentaId} onChange={setCuentaId} deshabilitado={!editable}>
                <option value="">Elige…</option>
                {catalogo.finanzas.cuentas.map((x) => (
                  <option key={x.id} value={String(x.id)}>
                    {x.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          ) : (
            <Campo etiqueta="Vence el">
              {editable ? <InputFecha valor={venceEl} onChange={setVenceEl} /> : <span className="fz-input fa-elegir" style={{ cursor: 'default' }}>{venceEl ? fecha(venceEl) : '—'}</span>}
            </Campo>
          )}
          <Campo etiqueta="Gasto en Finanzas">
            <span className="fz-input fa-elegir" style={{ cursor: 'default' }}>
              {c.gastoFolio ?? (c.estado === 'recibida' ? 'pendiente' : 'se crea al recibir')}
            </span>
          </Campo>
        </div>
        <Campo etiqueta="Notas">
          <textarea className="fz-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={!editable} />
        </Campo>
      </section>

      {editable && c.faltantes.length > 0 && (
        <Aviso tono="aviso">
          Para recibir falta: {c.faltantes.slice(0, 3).join(' ')}
          {c.faltantes.length > 3 ? ` (+${c.faltantes.length - 3})` : ''}
        </Aviso>
      )}
      <ErrorForm error={error} />
      {editable && (
        <div className="fz-acciones-fin">
          <Boton onClick={() => void alGuardar()} disabled={ocupado}>
            Guardar borrador
          </Boton>
          <Boton tono="navy" onClick={() => void alRecibir()} disabled={ocupado || filas.length === 0}>
            {ocupado ? 'Procesando…' : 'Recibir en inventario'}
          </Boton>
        </div>
      )}
      {c.estado === 'recibida' && <p className="fz-chico fz-tenue">Recibida{c.recibidaPor ? ` por ${c.recibidaPor.nombre}` : ''} · {momento(c.recibidaEn)}. Para corregirla, anúlala (solo si sus lotes no han tenido salidas) y captúrala de nuevo.</p>}

      {buscando != null && (
        <ModalPresentacion
          onCerrar={() => setBuscando(null)}
          alElegir={(pr) => {
            setFila(buscando, { presentacionId: pr.id, presentacionNombre: pr.nombre, productoNombre: pr.productoNombre, unidadBase: pr.unidadBase, factor: pr.factor })
            setBuscando(null)
          }}
        />
      )}
      {anular && (
        <Modal titulo={`Anular ${c.folio}`} onCerrar={() => setAnular(false)}>
          <div className="fz-stack fz-stack--chico">
            <p className="fz-chico">{c.estado === 'recibida' ? 'Se generan movimientos inversos en los lotes y se anula el gasto en Finanzas. Solo es posible si ningún lote tuvo salidas.' : 'El borrador queda anulado.'}</p>
            <Campo etiqueta="Motivo *">
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} autoFocus />
            </Campo>
            <div className="fz-acciones-fin">
              <Boton onClick={() => setAnular(false)}>Cancelar</Boton>
              <Boton tono="peligro" onClick={() => void alAnular()} disabled={ocupado || motivo.trim().length < 5}>
                Anular compra
              </Boton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

type PresentacionElegible = { id: number; nombre: string; productoId: number; productoNombre: string; factor: number; unidadBase: string; codigoBarras: string | null }

function ModalPresentacion({ onCerrar, alElegir }: { onCerrar: () => void; alElegir: (p: PresentacionElegible) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<PresentacionElegible[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!q.trim()) {
      setRes([])
      return
    }
    const t = setTimeout(() => {
      api.get<PresentacionElegible[]>('presentaciones', { q }).then(setRes, (e) => setError(e instanceof Error ? e.message : 'No se pudo buscar.'))
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal titulo="Elegir presentación del catálogo" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <div className="fz-buscar">
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, principio activo o código de barras" autoFocus autoComplete="off" />
        </div>
        {error && <Aviso tono="malo">{error}</Aviso>}
        <div className="fz-resultados">
          {res.map((p) => (
            <button key={p.id} type="button" onClick={() => alElegir(p)}>
              <span style={{ flex: 1 }}>
                <b>{p.productoNombre}</b> · {p.nombre}
                <br />
                <span className="fz-chico fz-tenue">
                  {cantidad(p.factor, p.unidadBase)}
                  {p.codigoBarras ? ` · ${p.codigoBarras}` : ''}
                </span>
              </span>
              <Icono n="flecha" chico />
            </button>
          ))}
        </div>
        {q && res.length === 0 && <p className="fz-chico fz-tenue">Nada coincide. Si el producto no existe, créalo en Productos y vuelve aquí.</p>}
      </div>
    </Modal>
  )
}
