'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { Inventario as InventarioVista, LoteVista, ProductoVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, cantidad, dinero, GrupoPastilla, Icono, Pastilla, Select, useFarmacia } from './comun'
import { Kardex, ModalAjuste, TablaLotes } from './Productos'

/**
 * Inventario: existencias por producto y lote, con filtros (por vencer,
 * vencidos, bajo mínimo) y kardex general. Los ajustes y mermas se registran
 * desde cada producto (botón «Ajustar» del lote o «Entrada o ajuste»).
 */
export default function Inventario({ solo: soloInicial, q: qInicial }: { solo: string | null; q: string }) {
  const { catalogo, base, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const [q, setQ] = useState(qInicial)
  const [solo, setSolo] = useState(soloInicial ?? 'con_existencia')
  const [datos, setDatos] = useState<InventarioVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [n, setN] = useState(0)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [verKardex, setVerKardex] = useState(false)
  const [ajuste, setAjuste] = useState<{ producto: ProductoVista & { lotes: LoteVista[] }; lote: LoteVista | null } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true)
      api.get<InventarioVista>('inventario', { q, solo }).then(
        (r) => {
          setDatos(r)
          setError(null)
          setCargando(false)
        },
        (e) => {
          setError(e instanceof Error ? e.message : 'No se pudo cargar.')
          setCargando(false)
        },
      )
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, solo, n])

  const refrescar = () => {
    setN((x) => x + 1)
    recargarCatalogo()
  }

  const abrirAjuste = async (productoId: number, lote: LoteVista | null) => {
    try {
      const pr = await api.get<ProductoVista & { lotes: LoteVista[] }>(`productos/${productoId}`)
      setAjuste({ producto: pr, lote })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir.')
    }
  }

  const totalUnidades = datos?.productos.reduce((a, p) => a + p.lotes.reduce((b, l) => b + l.existencia, 0), 0) ?? 0
  const valor = p.verCostos ? datos?.productos.reduce((a, pr) => a + pr.lotes.reduce((b, l) => b + l.existencia * (l.costoUnidad ?? 0), 0), 0) : null

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Inventario</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {catalogo.totales.lotesConExistencia} lotes con existencia · {catalogo.totales.lotesPorVencer} por vencer · {catalogo.totales.lotesVencidos} vencidos
            {valor != null ? ` · valor a costo ${dinero(valor)}` : ''}
          </p>
        </div>
        <div className="fz-acciones-fin">
          <Boton onClick={() => setVerKardex((v) => !v)}>{verKardex ? 'Ocultar kardex' : 'Kardex general'}</Boton>
        </div>
      </div>

      {msg && <Aviso tono="ok">{msg}</Aviso>}

      <div className="fz-buscar">
        <Icono n="buscar" />
        <label className="cl-sr" htmlFor="fa-inv-q">
          Buscar
        </label>
        <input id="fa-inv-q" className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto, principio activo o código de barras" autoComplete="off" />
      </div>
      <div className="fa-filtros">
        <Select valor={solo} onChange={setSolo} ancho="auto">
          <option value="con_existencia">Con existencia</option>
          <option value="por_vencer">Por vencer</option>
          <option value="vencidos">Vencidos (retirar)</option>
          <option value="bajo_minimo">Bajo mínimo</option>
          <option value="todos">Todos los productos (con y sin lotes)</option>
        </Select>
        <span className="fz-chico fz-tenue">{datos ? `${datos.productos.length} productos · ${cantidad(totalUnidades)} unidades base` : ''}</span>
      </div>

      {verKardex && <Kardex verCostos={Boolean(p.verCostos)} />}

      {error && <Aviso tono="malo">{error}</Aviso>}
      {datos && (
        <div className={`fz-tarjeta fz-lista${cargando ? ' cl-cargando' : ''}`}>
          {datos.productos.length === 0 && (
            <p className="fz-tenue" style={{ padding: 14 }}>
              {solo === 'con_existencia' ? 'Nada en existencia todavía. Las entradas se registran desde cada producto («Entrada o ajuste») o por compras (fase 2).' : 'Ningún producto coincide con el filtro.'}
            </p>
          )}
          {datos.productos.map((pr) => {
            const abiertoAqui = abierto === pr.id
            const ex = pr.lotes.reduce((a, l) => a + l.existencia, 0)
            const peor = pr.lotes.find((l) => l.estado === 'vencido') ? 'vencido' : pr.lotes.find((l) => l.estado === 'urgente') ? 'urgente' : pr.lotes.find((l) => l.estado === 'por_vencer') ? 'por_vencer' : null
            return (
              <div key={pr.id}>
                <button type="button" className="fz-fila cl-fila-boton" onClick={() => setAbierto(abiertoAqui ? null : pr.id)} aria-expanded={abiertoAqui}>
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">
                      {pr.nombre} <GrupoPastilla grupo={pr.grupo} />
                      {pr.bajoMinimo && <Pastilla tono="aviso">bajo mínimo</Pastilla>}
                      {peor === 'vencido' && <Pastilla tono="malo">lote vencido</Pastilla>}
                      {peor === 'urgente' && <Pastilla tono="malo">caduca pronto</Pastilla>}
                      {peor === 'por_vencer' && <Pastilla tono="aviso">por vencer</Pastilla>}
                    </span>
                    <span className="fz-fila__t2">
                      {pr.folio} · existencia <b>{cantidad(ex, pr.unidadBase)}</b> en {pr.lotes.length} lote{pr.lotes.length === 1 ? '' : 's'}
                      {pr.lotes[0] ? ` · próxima caducidad ${pr.lotes[0].caducidad}` : ''}
                    </span>
                  </span>
                  <Icono n={abiertoAqui ? 'x' : 'flecha'} chico />
                </button>
                {abiertoAqui && (
                  <div className="fa-producto-lotes fz-stack fz-stack--chico">
                    <div className="fz-entre">
                      <Link href={`${base}/productos/${pr.id}`} className="fz-chico">
                        Abrir ficha del producto →
                      </Link>
                      {p.ajustes && (
                        <Boton tono="teal" chico onClick={() => void abrirAjuste(pr.id, null)}>
                          <Icono n="mas" chico /> Entrada o ajuste
                        </Boton>
                      )}
                    </div>
                    <TablaLotes lotes={pr.lotes} unidad={pr.unidadBase} verCostos={Boolean(p.verCostos)} puedeAjustar={Boolean(p.ajustes)} alAjustar={(l) => void abrirAjuste(pr.id, l)} alCambiar={refrescar} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ajuste && (
        <ModalAjuste
          producto={ajuste.producto}
          lote={ajuste.lote}
          onCerrar={() => setAjuste(null)}
          alGuardar={(m) => {
            setAjuste(null)
            setMsg(m)
            refrescar()
          }}
        />
      )}
    </div>
  )
}
