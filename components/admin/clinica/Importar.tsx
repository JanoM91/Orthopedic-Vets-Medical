'use client'

import React, { useState } from 'react'
import { CAMPOS_IMPORTACION, type ArchivoCargado, type MapeoImportacion, type PlanImportacion, type ResumenImportacion } from '../../../lib/clinica/tipos'
import { api, Aviso, Boton, Campo, ErrorForm, momento, Pastilla, useCarga, useClinica } from './comun'

/**
 * Importación en tres pasos: (1) cargar el archivo, (2) decir qué columna es
 * qué y ver qué pasaría, (3) aplicar. Nada toca la base hasta el paso 3.
 */
export default function Importar() {
  const { recargarCatalogo } = useClinica()
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cargado, setCargado] = useState<ArchivoCargado | null>(null)
  const [mapeo, setMapeo] = useState<MapeoImportacion>({})
  const [plan, setPlan] = useState<PlanImportacion | null>(null)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const historial = useCarga(() => api.get<{ id: number; archivo: string; estado: string; fecha: string; resumen: ResumenImportacion | null; por: string | null }[]>('importaciones'), [paso])

  const cargar = async () => {
    if (!archivo) return
    setOcupado(true)
    setError(null)
    try {
      const r = await api.subir<ArchivoCargado>('importaciones', archivo)
      setCargado(r)
      setMapeo(r.mapeoSugerido)
      setPlan(null)
      setPaso(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
    setOcupado(false)
  }
  const planear = async () => {
    if (!cargado) return
    setOcupado(true)
    setError(null)
    try {
      setPlan(await api.post<PlanImportacion>(`importaciones/${cargado.id}/plan`, { mapeo }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular.')
    }
    setOcupado(false)
  }
  const aplicar = async () => {
    if (!cargado) return
    setOcupado(true)
    setError(null)
    try {
      setResumen(await api.post<ResumenImportacion>(`importaciones/${cargado.id}/aplicar`, { mapeo }))
      recargarCatalogo()
      setPaso(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.')
    }
    setOcupado(false)
  }
  const descartar = async () => {
    if (cargado) await api.post(`importaciones/${cargado.id}/descartar`).catch(() => undefined)
    setCargado(null)
    setPlan(null)
    setArchivo(null)
    setPaso(1)
  }

  const usados = new Set(Object.values(mapeo).filter(Boolean))
  const faltan = CAMPOS_IMPORTACION.filter((c) => 'requerido' in c && c.requerido && !usados.has(c.clave))

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Clínica</p>
        <h1 className="fz-h1">Importar clientes y mascotas</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          Paso {paso} de 3 · {paso === 1 ? 'Elegir el archivo' : paso === 2 ? 'Decir qué columna es qué y revisar' : 'Resultado'}
        </p>
      </div>

      {paso === 1 && (
        <div className="cl-dos">
          <form
            className="fz-tarjeta cl-caja fz-stack fz-stack--chico"
            onSubmit={(e) => {
              e.preventDefault()
              void cargar()
            }}
          >
            <h2 className="fz-h2">1 · Archivo</h2>
            <p className="fz-chico">Acepta <b>.xlsx</b> (Excel) o <b>.csv</b>. Una fila por mascota con su tutor; si una mascota tiene varias vacunas, se repite la fila cambiando solo las columnas de cartilla. Puedes usar tus propios encabezados: en el siguiente paso se indica qué columna es qué.</p>
            <Campo etiqueta="Archivo *">
              <input className="fz-input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
            </Campo>
            <ErrorForm error={error} />
            <div className="fz-acciones-fin">
              <button type="submit" className="fz-btn fz-btn--navy" disabled={!archivo || ocupado}>
                {ocupado ? 'Leyendo…' : 'Leer archivo'}
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- es una descarga de la API, no una página */}
              <a className="fz-btn fz-btn--claro" href="/api/clinica/importaciones/plantilla" download>
                Descargar plantilla .xlsx
              </a>
            </div>
          </form>
          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <h2 className="fz-h2">Importaciones anteriores</h2>
            {historial.datos?.length ? (
              historial.datos.map((h) => (
                <div key={h.id} className="fz-chico">
                  <Pastilla tono={h.estado === 'aplicada' ? 'ok' : 'gris'}>{h.estado}</Pastilla> <b>{h.archivo}</b> · {momento(h.fecha)}
                  {h.por ? ` · ${h.por}` : ''}
                  {h.resumen ? ` · ${h.resumen.clientesCreados} clientes y ${h.resumen.mascotasCreadas} mascotas creadas` : ''}
                </div>
              ))
            ) : (
              <p className="fz-tenue fz-chico">Ninguna todavía.</p>
            )}
          </div>
        </div>
      )}

      {paso === 2 && cargado && (
        <div className="fz-stack">
          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <div className="fz-entre">
              <h2 className="fz-h2">
                2 · {cargado.archivo} <span className="fz-tenue fz-chico">· {cargado.totalFilas} filas · {cargado.columnas.length} columnas</span>
              </h2>
              <Boton chico onClick={() => void descartar()}>
                Elegir otro archivo
              </Boton>
            </div>
            <p className="fz-chico fz-tenue">Para cada columna del archivo, elige a qué dato corresponde. Las que se dejen en «ignorar» no se importan. Obligatorias: nombre del tutor y nombre de la mascota.</p>
            <div className="fz-tarjeta" style={{ overflowX: 'auto' }}>
              <table className="cl-tabla">
                <thead>
                  <tr>
                    <th>Columna del archivo</th>
                    <th>Ejemplo (1.ª fila)</th>
                    <th>Es…</th>
                  </tr>
                </thead>
                <tbody>
                  {cargado.columnas.map((col) => (
                    <tr key={col}>
                      <td>
                        <b>{col}</b>
                      </td>
                      <td className="fz-tenue">{cargado.muestra[0]?.[col] || '—'}</td>
                      <td>
                        <select
                          className="fz-input fz-input--compacto"
                          value={mapeo[col] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value as MapeoImportacion[string]
                            setMapeo((m) => {
                              const n: MapeoImportacion = { ...m, [col]: v }
                              /* Un campo solo puede venir de una columna. */
                              for (const k of Object.keys(n)) if (k !== col && v && n[k] === v) n[k] = ''
                              return n
                            })
                            setPlan(null)
                          }}
                        >
                          <option value="">— ignorar —</option>
                          {['Tutor', 'Mascota', 'Cartilla'].map((g) => (
                            <optgroup key={g} label={g}>
                              {CAMPOS_IMPORTACION.filter((c) => c.grupo === g).map((c) => (
                                <option key={c.clave} value={c.clave}>
                                  {c.etiqueta}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {faltan.length > 0 && <Aviso tono="aviso">Falta indicar: {faltan.map((c) => c.etiqueta).join(' y ')}.</Aviso>}
            <ErrorForm error={error} />
            <div>
              <Boton tono="navy" disabled={ocupado || faltan.length > 0} onClick={() => void planear()}>
                {ocupado ? 'Calculando…' : plan ? 'Volver a revisar' : 'Revisar qué pasaría'}
              </Boton>
            </div>
          </div>

          {plan && (
            <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
              <h2 className="fz-h2">Qué pasaría</h2>
              <div className="cl-kpis">
                <Kpi n={plan.tutores.nuevos} l="tutores nuevos" />
                <Kpi n={plan.tutores.existentes} l="tutores ya registrados (se reutilizan)" />
                <Kpi n={plan.mascotas.nuevas} l="mascotas nuevas" />
                <Kpi n={plan.mascotas.existentes} l="mascotas ya registradas" />
                <Kpi n={plan.cartilla} l="registros de cartilla" />
                <Kpi n={plan.pesos} l="pesos" />
              </div>
              {plan.errores.length > 0 && (
                <Aviso tono="malo">
                  <b>{plan.errores.length} fila(s) con error</b> — corrige el archivo o el mapeo; con errores no se importa.
                  <ul className="cl-ul">
                    {plan.errores.slice(0, 15).map((e, i) => (
                      <li key={i}>
                        {e.fila ? `Fila ${e.fila}: ` : ''}
                        {e.mensaje}
                      </li>
                    ))}
                    {plan.errores.length > 15 && <li>… y {plan.errores.length - 15} más.</li>}
                  </ul>
                </Aviso>
              )}
              {plan.avisos.length > 0 && (
                <Aviso tono="aviso">
                  <b>{plan.avisos.length} aviso(s)</b> — se importa igual, pero conviene revisarlos.
                  <ul className="cl-ul">
                    {plan.avisos.slice(0, 15).map((e, i) => (
                      <li key={i}>
                        Fila {e.fila}: {e.mensaje}
                      </li>
                    ))}
                    {plan.avisos.length > 15 && <li>… y {plan.avisos.length - 15} más.</li>}
                  </ul>
                </Aviso>
              )}
              {plan.ejemplos.length > 0 && (
                <div className="fz-tarjeta" style={{ overflowX: 'auto' }}>
                  <table className="cl-tabla">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Tutor</th>
                        <th>Mascota</th>
                        <th>Cartilla</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.ejemplos.map((e) => (
                        <tr key={e.fila}>
                          <td>{e.fila}</td>
                          <td>
                            {e.tutor} <Pastilla tono={e.tutorEstado === 'nuevo' ? 'ok' : 'info'}>{e.tutorEstado}</Pastilla>
                          </td>
                          <td>
                            {e.mascota} <Pastilla tono={e.mascotaEstado === 'nueva' ? 'ok' : 'info'}>{e.mascotaEstado}</Pastilla>
                          </td>
                          <td className="fz-tenue">{e.cartilla ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fz-chico fz-tenue" style={{ padding: '8px 12px' }}>Se muestran las primeras {plan.ejemplos.length} mascotas interpretadas.</p>
                </div>
              )}
              <div className="fz-acciones-fin">
                <Boton tono="teal" disabled={ocupado || plan.errores.length > 0} onClick={() => void aplicar()}>
                  {ocupado ? 'Importando…' : `Importar ${plan.tutores.nuevos} tutores y ${plan.mascotas.nuevas} mascotas`}
                </Boton>
                <Boton onClick={() => void descartar()}>Cancelar</Boton>
              </div>
            </div>
          )}
        </div>
      )}

      {paso === 3 && resumen && (
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">3 · Listo</h2>
          <Aviso tono="ok">
            Se crearon <b>{resumen.clientesCreados}</b> clientes y <b>{resumen.mascotasCreadas}</b> mascotas; {resumen.cartilla} registros de cartilla y {resumen.pesos} pesos leídos. {resumen.tutores.existentes} tutores y {resumen.mascotas.existentes} mascotas ya existían y se reutilizaron.
          </Aviso>
          {resumen.avisos.length > 0 && (
            <Aviso tono="aviso">
              Avisos:
              <ul className="cl-ul">
                {resumen.avisos.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          <div>
            <Boton tono="navy" onClick={() => void descartar()}>
              Importar otro archivo
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ n, l }: { n: number; l: string }) {
  return (
    <div className="cl-kpi">
      <b>{n}</b>
      <span>{l}</span>
    </div>
  )
}
