'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import type { ResumenImportacionProductos } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, ErrorForm, Pastilla, useFarmacia } from './comun'

/**
 * Importación del catálogo con la plantilla del sistema, en dos pasos con el
 * mismo archivo: «Revisar» (no toca la base) e «Importar». Las filas con
 * error se reportan y no se importan; las demás sí.
 */
export default function Importar() {
  const { base, recargarCatalogo } = useFarmacia()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [plan, setPlan] = useState<ResumenImportacionProductos | null>(null)
  const [resultado, setResultado] = useState<ResumenImportacionProductos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const revisar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo) return
    setOcupado(true)
    setError(null)
    setResultado(null)
    try {
      setPlan(await api.subir<ResumenImportacionProductos>('productos/importar', archivo, { aplicar: false }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    }
    setOcupado(false)
  }
  const aplicar = async () => {
    if (!archivo) return
    setOcupado(true)
    setError(null)
    try {
      setResultado(await api.subir<ResumenImportacionProductos>('productos/importar', archivo, { aplicar: true }))
      setPlan(null)
      recargarCatalogo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar.')
    }
    setOcupado(false)
  }

  const r = resultado ?? plan
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Importar catálogo</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          Plantilla propia del sistema: una fila por presentación de producto. Lotes y existencias no van aquí.
        </p>
      </div>

      <div className="cl-dos">
        <form className="fz-tarjeta cl-caja fz-stack fz-stack--chico" onSubmit={(e) => void revisar(e)}>
          <h2 className="fz-h2">1 · Archivo</h2>
          <p className="fz-chico">
            Descarga la plantilla, llénala (borra las filas de ejemplo) y súbela. Acepta <b>.xlsx</b> o <b>.csv</b> con los encabezados de la plantilla. Para probar el sistema, la plantilla con 50 productos de ejemplo se importa tal cual.
          </p>
          <Campo etiqueta="Archivo *">
            <input className="fz-input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setPlan(null); setResultado(null) }} required />
          </Campo>
          <ErrorForm error={error} />
          <div className="fz-acciones-fin">
            <button type="submit" className="fz-btn fz-btn--navy" disabled={!archivo || ocupado}>
              {ocupado && !plan ? 'Leyendo…' : 'Revisar qué pasaría'}
            </button>
            <a className="fz-btn fz-btn--claro" href="/api/farmacia/productos/plantilla" download>
              Plantilla .xlsx
            </a>
            <a className="fz-btn fz-btn--claro" href="/api/farmacia/productos/plantilla?ejemplo=50" download>
              Plantilla con 50 ejemplos
            </a>
          </div>
        </form>
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Cómo se llena</h2>
          <ul className="cl-ul fz-chico">
            <li><b>Una fila = una presentación.</b> «Caja 30 tabletas» (factor 30) y «Tableta suelta» (factor 1, fraccionada = Sí) son dos filas con el mismo nombre comercial.</li>
            <li><b>Grupo NOM-064:</b> I controlado, II con receta, III venta libre, desregulado para alimento, accesorio e higiene. Grupo I y II llevan registro SENASICA.</li>
            <li><b>Especies</b> separadas por coma; vacío = todas. Peso mínimo y máximo en kg; edad mínima en meses.</li>
            <li>Un producto que ya existe (mismo nombre) se reutiliza sin cambiarle datos; solo se le agregan presentaciones nuevas.</li>
            <li>Los proveedores que no existan se crean con 3 días de entrega; se ajustan en Configuración.</li>
          </ul>
        </div>
      </div>

      {r && (
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <h2 className="fz-h2">
              {resultado ? '3 · Resultado' : '2 · Qué pasaría'} <span className="fz-tenue fz-chico">· {r.filasLeidas} filas leídas</span>
            </h2>
            {resultado ? <Pastilla tono="ok">importado</Pastilla> : <Pastilla tono="info">sin tocar la base</Pastilla>}
          </div>
          <div className="fa-resumen-import">
            <div>
              <b>{r.productosNuevos}</b> productos nuevos
            </div>
            <div>
              <b>{r.productosExistentes}</b> ya existían
            </div>
            <div>
              <b>{r.presentacionesNuevas}</b> presentaciones nuevas
            </div>
            <div>
              <b>{r.presentacionesExistentes}</b> presentaciones ya existían
            </div>
            <div>
              <b>{r.proveedoresNuevos}</b> proveedores nuevos
            </div>
            <div>
              <b>{r.errores.length}</b> filas con error
            </div>
          </div>
          {r.errores.length > 0 && (
            <div>
              <p className="fz-chico">
                <b>Filas con error</b> (no se importan; las demás sí):
              </p>
              <ul className="fa-errores cl-ul">
                {r.errores.map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.avisos.length > 0 && (
            <div>
              <p className="fz-chico">
                <b>Avisos</b> (se importa igual):
              </p>
              <ul className="fa-errores cl-ul">
                {r.avisos.map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.productos.length > 0 && (
            <details>
              <summary className="fz-chico">Productos ({r.productos.length}{r.productos.length === 100 ? '+' : ''})</summary>
              <ul className="fa-errores cl-ul">
                {r.productos.map((p, i) => (
                  <li key={i}>
                    {p.folio ? <span className="fz-tenue">{p.folio} · </span> : null}
                    {p.nombre} · {p.presentaciones} presentación{p.presentaciones === 1 ? '' : 'es'} {p.nuevo ? <Pastilla tono="ok">nuevo</Pastilla> : <Pastilla tono="gris">existía</Pastilla>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!resultado && (
            <div className="fz-acciones-fin">
              <Boton onClick={() => setPlan(null)}>Cancelar</Boton>
              <Boton tono="navy" disabled={ocupado || r.productosNuevos + r.presentacionesNuevas === 0} onClick={() => void aplicar()}>
                {ocupado ? 'Importando…' : `Importar ${r.productosNuevos} productos y ${r.presentacionesNuevas} presentaciones`}
              </Boton>
            </div>
          )}
          {resultado && (
            <div className="fz-acciones-fin">
              <Link href={`${base}/productos`} className="fz-btn fz-btn--navy">
                Ver productos
              </Link>
            </div>
          )}
          {!resultado && r.productosNuevos + r.presentacionesNuevas === 0 && <Aviso tono="aviso">No hay nada nuevo que importar.</Aviso>}
        </div>
      )}
    </div>
  )
}
