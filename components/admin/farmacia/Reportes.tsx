'use client'

import React, { useEffect, useState } from 'react'
import type { FormatoColumna, Reporte, TipoReporte } from '../../../lib/farmacia/reportes'
import { api, Aviso, Campo, dinero, fecha, InputFecha, useFarmacia } from './comun'

/**
 * Farmacia → Reportes (fase 7): ventas, productos y margen, rotación,
 * caducidades, valor del inventario, libro de control y anticipos de planes.
 * Lo que se ve es lo que baja en CSV (la misma respuesta del servidor).
 */

const TIPOS: { tipo: TipoReporte; nombre: string; costos?: boolean; fechas: 'rango' | 'hasta' | 'ninguna'; tienda?: boolean }[] = [
  { tipo: 'ventas', nombre: 'Ventas', fechas: 'rango' },
  { tipo: 'productos', nombre: 'Productos y margen', fechas: 'rango' },
  { tipo: 'rotacion', nombre: 'Rotación', fechas: 'rango' },
  { tipo: 'caducidades', nombre: 'Caducidades', fechas: 'hasta' },
  { tipo: 'inventario', nombre: 'Valor del inventario', costos: true, fechas: 'ninguna' },
  { tipo: 'libro', nombre: 'Libro de control', fechas: 'rango' },
  { tipo: 'planes', nombre: 'Planes anuales', fechas: 'hasta', tienda: true },
]

function formato(v: string | number | null | undefined, f: FormatoColumna): string {
  if (v == null || v === '') return '—'
  if (f === 'dinero') return dinero(Number(v), true)
  if (f === 'porciento') return `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`
  if (f === 'numero') return typeof v === 'number' ? v.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : String(v)
  if (f === 'fecha') return fecha(String(v))
  return String(v)
}

export function Reportes({ tipo: tipoInicial }: { tipo: string | null }) {
  const { catalogo } = useFarmacia()
  const p = catalogo.permisos
  const visibles = TIPOS.filter((x) => (!x.costos || p.verCostos) && (!x.tienda || catalogo.modulos.tienda))
  const [tipo, setTipo] = useState<TipoReporte>((visibles.find((x) => x.tipo === tipoInicial)?.tipo as TipoReporte) ?? 'ventas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [datos, setDatos] = useState<{ clave: string; r: Reporte } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const def = TIPOS.find((x) => x.tipo === tipo)!
  const params = { desde: def.fechas === 'rango' ? desde : '', hasta: def.fechas === 'ninguna' ? '' : hasta }
  const clave = `${tipo}|${params.desde}|${params.hasta}`
  useEffect(() => {
    let vivo = true
    const [t0, d0, h0] = clave.split('|')
    api.get<Reporte>(`reportes/${t0}`, { desde: d0, hasta: h0 }).then(
      (r) => {
        if (!vivo) return
        setDatos({ clave, r })
        setError(null)
      },
      (e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
    )
    const u = new URL(window.location.href)
    u.searchParams.set('tipo', t0)
    window.history.replaceState(null, '', u.toString())
    return () => {
      vivo = false
    }
  }, [clave])
  const r = datos?.clave === clave ? datos.r : null
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  if (!p.reportes) return <Aviso>Los reportes los consultan el encargado y el dueño.</Aviso>
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Reportes</h1>
      </div>
      <div className="fz-seg fa-seg-reportes" role="radiogroup" aria-label="Reporte">
        {visibles.map((x) => (
          <button key={x.tipo} type="button" className={tipo === x.tipo ? 'is-on' : ''} aria-pressed={tipo === x.tipo} onClick={() => setTipo(x.tipo)}>
            {x.nombre}
          </button>
        ))}
      </div>
      <div className="fa-filtros">
        {def.fechas === 'rango' && (
          <Campo etiqueta="Desde">
            <InputFecha valor={desde} onChange={setDesde} />
          </Campo>
        )}
        {def.fechas !== 'ninguna' && (
          <Campo etiqueta={def.tipo === 'caducidades' ? 'Caducan hasta' : 'Hasta'}>
            <InputFecha valor={hasta} onChange={setHasta} />
          </Campo>
        )}
        <a href={`/api/farmacia/reportes/${tipo}/csv${qs ? `?${qs}` : ''}`} className="fz-btn fz-btn--claro" style={{ alignSelf: 'end' }}>
          Descargar CSV
        </a>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!r && !error && <p className="fz-tenue">Cargando…</p>}
      {r && (
        <>
          <p className="fz-tenue">
            {r.titulo}
            {r.tipo === 'inventario' ? ` · hoy (${fecha(r.hasta)})` : r.desde ? ` · ${fecha(r.desde)} a ${fecha(r.hasta)}` : ` · hasta ${fecha(r.hasta)}`}
          </p>
          {r.indicadores.length > 0 && (
            <div className="fz-kpis fa-kpis">
              {r.indicadores.map((k) => (
                <div key={k.etiqueta} className="fz-kpi">
                  <span className="fz-kpi__lbl">{k.etiqueta}</span>
                  <span className="fz-kpi__val">{formato(k.valor, k.formato)}</span>
                </div>
              ))}
            </div>
          )}
          {r.filas.length === 0 ? (
            <Aviso>Nada en ese periodo.</Aviso>
          ) : (
            <div className="fa-tabla-scroll">
              <table className="cl-tabla">
                <thead>
                  <tr>
                    {r.columnas.map((x) => (
                      <th key={x.clave} className={x.formato === 'texto' || x.formato === 'fecha' ? '' : 'fz-num'}>
                        {x.etiqueta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.filas.map((f, i) => (
                    <tr key={i}>
                      {r.columnas.map((x) => (
                        <td key={x.clave} className={x.formato === 'texto' || x.formato === 'fecha' ? '' : 'fz-num'}>
                          {formato(f[x.clave], x.formato)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.nota && <p className="fz-chico fz-tenue">{r.nota}</p>}
        </>
      )}
    </div>
  )
}
