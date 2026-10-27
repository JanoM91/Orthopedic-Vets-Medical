'use client'

import React, { useEffect, useState } from 'react'
import type { CierreVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, dinero, ErrorForm, fecha, hoyISO, InputFecha, momento, useFarmacia } from './comun'

/**
 * Cierre del día (fase 3, activado por omisión): efectivo esperado según
 * Finanzas (saldo de la caja al terminar el día) contra lo contado. La
 * diferencia queda registrada con nota y usuario; uno por caja y día.
 */
export default function Cierre() {
  const { catalogo, recargarCatalogo } = useFarmacia()
  const cfg = catalogo.configuracion
  const [fechaC, setFechaC] = useState(hoyISO())
  const [datos, setDatos] = useState<CierreVista | null>(null)
  const [historial, setHistorial] = useState<CierreVista[]>([])
  const [contado, setContado] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    setError(null)
    api.get<CierreVista>('cierre', { fecha: fechaC }).then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
    api.get<CierreVista[]>('cierres').then(setHistorial, () => undefined)
  }, [fechaC])

  if (!catalogo.permisos.cierreDia) return <Aviso>Tu rol no incluye el cierre del día.</Aviso>
  if (!cfg.cierreDiaActivo) return <Aviso>El cierre del día está apagado en Configuración.</Aviso>

  const difC = datos && contado !== '' ? Math.round(Number(contado) * 100) - Math.round(datos.esperado * 100) : null
  const registrar = async () => {
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      const r = await api.post<CierreVista>('cierre', { fecha: fechaC, cuentaId: datos?.cuenta.id, contado: Number(contado), nota: nota || null })
      setDatos(r)
      setMsg('Cierre registrado.')
      setHistorial(await api.get<CierreVista[]>('cierres'))
      recargarCatalogo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar.')
    }
    setOcupado(false)
  }

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Cierre del día</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          Cuenta el efectivo de la caja y escríbelo. Se compara contra lo que dice Finanzas.
        </p>
      </div>
      <div className="fa-filtros">
        <Campo etiqueta="Día">
          <InputFecha valor={fechaC} onChange={setFechaC} max={hoyISO()} />
        </Campo>
      </div>
      {error && <ErrorForm error={error} />}
      {msg && <Aviso tono="ok">{msg}</Aviso>}
      {datos && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">
            {datos.cuenta.nombre} · {fecha(datos.fecha)}
          </h2>
          <div className="fz-kpis fa-kpis">
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Esperado en caja (Finanzas)</span>
              <span className="fz-kpi__val">{dinero(datos.esperado, true)}</span>
            </div>
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Ventas en efectivo del día</span>
              <span className="fz-kpi__val">{dinero(datos.ventasEfectivo, true)}</span>
            </div>
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Ventas del día</span>
              <span className="fz-kpi__val">{datos.ventas}</span>
            </div>
            {datos.id != null && (
              <div className={`fz-kpi${datos.diferencia ? ' fa-kpi--aviso' : ''}`}>
                <span className="fz-kpi__lbl">Diferencia</span>
                <span className="fz-kpi__val">{dinero(datos.diferencia, true)}</span>
              </div>
            )}
          </div>
          {datos.id != null ? (
            <p className="fz-chico">
              Cerrado por {datos.usuario?.nombre ?? '—'} · {momento(datos.creadoEn)} · contado {dinero(datos.contado, true)}
              {datos.nota ? ` · ${datos.nota}` : ''}
            </p>
          ) : (
            <>
              <div className="cl-grid cl-grid--2">
                <Campo etiqueta="Efectivo contado *" ayuda={difC != null ? (difC === 0 ? 'Cuadra.' : <span className="fa-sale">Diferencia {difC > 0 ? '+' : '−'}{dinero(Math.abs(difC) / 100, true)}</span>) : undefined}>
                  <input className="fz-input" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} />
                </Campo>
                <Campo etiqueta={difC ? 'Nota (obligatoria con diferencia)' : 'Nota'}>
                  <input className="fz-input" value={nota} onChange={(e) => setNota(e.target.value)} />
                </Campo>
              </div>
              <div className="fz-acciones-fin">
                <Boton tono="navy" disabled={ocupado || contado === '' || (difC !== 0 && nota.trim().length < 3)} onClick={() => void registrar()}>
                  {ocupado ? 'Registrando…' : 'Registrar cierre'}
                </Boton>
              </div>
            </>
          )}
          <p className="fz-chico fz-tenue">El esperado es el saldo de la caja en Finanzas al terminar el día: saldo inicial, ventas, gastos y traspasos registrados ahí. Si sacaste efectivo para un gasto, regístralo en Finanzas antes de cerrar.</p>
        </section>
      )}
      {historial.length > 0 && (
        <section className="fz-tarjeta fz-lista">
          {historial.map((x) => (
            <div key={x.id ?? x.fecha} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {fecha(x.fecha)} · {x.cuenta.nombre}
                </span>
                <span className="fz-fila__t2">
                  Esperado {dinero(x.esperado, true)} · contado {dinero(x.contado, true)} · {x.usuario?.nombre ?? ''}
                  {x.nota ? ` · ${x.nota}` : ''}
                </span>
              </span>
              <b className={`fz-num${x.diferencia ? ' fa-sale' : ''}`}>{x.diferencia ? dinero(x.diferencia, true) : 'Cuadra'}</b>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
