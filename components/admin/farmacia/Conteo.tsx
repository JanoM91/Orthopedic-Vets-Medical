'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import type { RenglonConteo, ResultadoConteo } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, cantidad, ErrorForm, ESTADO_LOTE_LABEL, ESTADO_LOTE_TONO, fecha, Icono, Pastilla, Select, useFarmacia } from './comun'

/**
 * Conteo físico (fase 2): lista los lotes con existencia, el encargado
 * escribe lo que contó y, al aplicar, cada diferencia se vuelve un ajuste en
 * el kardex (mismo camino que «Ajustes y mermas», con motivo obligatorio).
 * Los lotes sin cambio no generan movimiento.
 */

type Fila = RenglonConteo & { contado: string }

export default function Conteo() {
  const { base, catalogo } = useFarmacia()
  const p = catalogo.permisos
  const [q, setQ] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [motivo, setMotivo] = useState('Conteo físico')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoConteo | null>(null)
  const [soloDiferencias, setSoloDiferencias] = useState(false)

  useEffect(() => {
    if (!p.ajustes) return
    const t = setTimeout(() => {
      api.get<{ renglones: RenglonConteo[] }>('conteo', { q, almacen: almacenId }).then(
        (r) => setFilas(r.renglones.map((x) => ({ ...x, contado: '' }))),
        (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
      )
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, almacenId, p.ajustes])

  const conCambio = useMemo(() => (filas ?? []).filter((f) => f.contado !== '' && Number(f.contado) !== f.existencia), [filas])
  const visibles = useMemo(() => (soloDiferencias ? conCambio : (filas ?? [])), [filas, conCambio, soloDiferencias])

  if (!p.ajustes) return <Aviso>El conteo físico lo hace el encargado o un rol superior.</Aviso>

  const setContado = (loteId: number, v: string) => setFilas((fs) => (fs ? fs.map((f) => (f.loteId === loteId ? { ...f, contado: v } : f)) : fs))
  const igualar = () => setFilas((fs) => (fs ? fs.map((f) => (f.contado === '' ? { ...f, contado: String(f.existencia) } : f)) : fs))

  const aplicar = async () => {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<ResultadoConteo>('conteo', {
        motivo,
        renglones: (filas ?? []).filter((f) => f.contado !== '').map((f) => ({ loteId: f.loteId, contado: Number(f.contado) })),
      })
      setResultado(r)
      setFilas(null)
      api.get<{ renglones: RenglonConteo[] }>('conteo', { q, almacen: almacenId }).then((x) => setFilas(x.renglones.map((y) => ({ ...y, contado: '' }))), () => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el conteo.')
    }
    setOcupado(false)
  }

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Conteo físico</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            Escribe lo que hay por lote. Cada diferencia queda como ajuste.
          </p>
        </div>
      </div>

      {resultado && (
        <Aviso tono={resultado.ajustes.length ? 'ok' : 'info'}>
          Conteo aplicado: {resultado.ajustes.length} ajuste{resultado.ajustes.length === 1 ? '' : 's'} y {resultado.sinCambio} lote{resultado.sinCambio === 1 ? '' : 's'} sin cambio.
          {resultado.ajustes.length > 0 && (
            <ul className="fa-errores" style={{ marginTop: 6 }}>
              {resultado.ajustes.map((a) => (
                <li key={a.loteId}>
                  {a.productoNombre} · lote {a.numeroLote}: {a.antes} → {a.contado} (<span className={a.diferencia > 0 ? 'fa-entra' : 'fa-sale'}>{a.diferencia > 0 ? '+' : ''}{a.diferencia}</span>)
                </li>
              ))}
            </ul>
          )}{' '}
          <Link href={`${base}/inventario`}>Ver inventario</Link>
        </Aviso>
      )}

      <div className="fa-filtros">
        <div className="fz-buscar" style={{ flex: '1 1 260px' }}>
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto o número de lote" autoComplete="off" />
        </div>
        {catalogo.almacenes.length > 1 && (
          <Select valor={almacenId} onChange={setAlmacenId} ancho="auto">
            <option value="">Todos los almacenes</option>
            {catalogo.almacenes.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.nombre}
              </option>
            ))}
          </Select>
        )}
        <label className="cl-check">
          <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
          <span>Solo diferencias ({conCambio.length})</span>
        </label>
      </div>

      {error && <ErrorForm error={error} />}
      {!filas && !error && <p className="fz-tenue">Cargando…</p>}
      {filas && filas.length === 0 && <Aviso>No hay lotes con existencia{q || almacenId ? ' con ese filtro' : ''}.</Aviso>}
      {filas && filas.length > 0 && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <h2 className="fz-h2">
              {visibles.length} lote{visibles.length === 1 ? '' : 's'}
            </h2>
            <Boton chico onClick={igualar} title="Rellena con la existencia del sistema los lotes que no has contado">
              Dar por correctos los vacíos
            </Boton>
          </div>
          <div className="fa-conteo">
            {visibles.map((f) => {
              const dif = f.contado === '' ? null : Number(f.contado) - f.existencia
              return (
                <div key={f.loteId} className={`fa-conteo__fila${dif ? ' is-dif' : ''}`}>
                  <div className="fa-conteo__que">
                    <b>{f.productoNombre}</b>
                    <span className="fz-chico fz-tenue">
                      {f.loteFolio} · lote {f.numeroLote} · cad. {fecha(f.caducidad)} <Pastilla tono={ESTADO_LOTE_TONO[f.estado]}>{ESTADO_LOTE_LABEL[f.estado]}</Pastilla>
                      {catalogo.almacenes.length > 1 ? ` · ${f.almacen.nombre}` : ''}
                    </span>
                  </div>
                  <div className="fa-conteo__sistema">
                    <span className="fz-etiqueta">Sistema</span>
                    <span className="fz-num">{cantidad(f.existencia, f.unidadBase)}</span>
                  </div>
                  <div className="fa-conteo__contado">
                    <span className="fz-etiqueta">Contado</span>
                    <input className="fz-input" type="number" inputMode="decimal" step="0.001" min={0} value={f.contado} onChange={(e) => setContado(f.loteId, e.target.value)} placeholder={String(f.existencia)} aria-label={`Contado de ${f.productoNombre} lote ${f.numeroLote}`} />
                  </div>
                  <div className="fa-conteo__dif">
                    {dif == null ? <span className="fz-tenue">—</span> : dif === 0 ? <span className="fz-tenue">igual</span> : <span className={dif > 0 ? 'fa-entra' : 'fa-sale'}>{dif > 0 ? '+' : ''}{cantidad(dif)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {filas && filas.length > 0 && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="cl-grid cl-grid--2">
            <Campo etiqueta="Motivo *" ayuda="Queda en cada ajuste del kardex.">
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
            </Campo>
            <div className="fz-acciones-fin" style={{ alignSelf: 'end' }}>
              <Boton tono="navy" onClick={() => void aplicar()} disabled={ocupado || conCambio.length === 0 || motivo.trim().length < 3}>
                {ocupado ? 'Aplicando…' : `Aplicar ${conCambio.length} ajuste${conCambio.length === 1 ? '' : 's'}`}
              </Boton>
            </div>
          </div>
          <p className="fz-chico fz-tenue">Solo se registran los lotes cuyo contado difiere del sistema. Un lote vencido o bloqueado también se puede corregir aquí; para darlo de baja usa «Ajustes y mermas».</p>
        </section>
      )}
    </div>
  )
}
