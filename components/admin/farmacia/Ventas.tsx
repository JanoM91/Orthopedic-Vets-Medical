'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { VentaBreve, VentaVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, cantidad, dinero, ErrorForm, fecha, GrupoPastilla, hoyISO, Icono, InputFecha, Modal, momento, Pastilla, Select, useCarga, useFarmacia, Volver } from './comun'

/** Ventas (fase 3): historial del día y detalle con ticket, transferencias por confirmar, Finanzas y anulación. */

const ESTADO: Record<VentaVista['estado'], { l: string; t: 'ok' | 'aviso' | 'gris' }> = { pagada: { l: 'Pagada', t: 'ok' }, por_confirmar: { l: 'Pago por confirmar', t: 'aviso' }, anulada: { l: 'Anulada', t: 'gris' } }

export function Ventas({ dia: diaInicial, estado: estadoInicial }: { dia: string | null; estado: string | null }) {
  const { base } = useFarmacia()
  const [dia, setDia] = useState(diaInicial ?? hoyISO())
  const [estado, setEstado] = useState(estadoInicial ?? '')
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<{ ventas: VentaBreve[]; total: number; suma: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      api.get<{ ventas: VentaBreve[]; total: number; suma: number }>('ventas', { dia: estado === 'por_confirmar' ? null : dia, estado, q }).then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [dia, estado, q])
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Ventas</h1>
          {datos && (
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              {datos.ventas.filter((v) => v.estado !== 'anulada').length} ventas · {dinero(datos.suma, true)}
            </p>
          )}
        </div>
        <div className="fz-acciones-fin">
          <Link href={`${base}/vender`} className="fz-btn fz-btn--navy">
            <Icono n="mas" chico /> Vender
          </Link>
        </div>
      </div>
      <div className="fa-filtros">
        <InputFecha valor={dia} onChange={setDia} max={hoyISO()} />
        <Select valor={estado} onChange={setEstado} ancho="auto">
          <option value="">Todas</option>
          <option value="pagada">Pagadas</option>
          <option value="por_confirmar">Pago por confirmar (todas las fechas)</option>
          <option value="anulada">Anuladas</option>
        </Select>
        <div className="fz-buscar" style={{ flex: '1 1 200px' }}>
          <Icono n="buscar" />
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="VTA-12 o producto" autoComplete="off" />
        </div>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {datos && (
        <div className="fz-tarjeta fz-lista">
          {datos.ventas.length === 0 && (
            <p className="fz-tenue" style={{ padding: 14 }}>
              Sin ventas con ese filtro.
            </p>
          )}
          {datos.ventas.map((v) => (
            <Link key={v.id} href={`${base}/ventas/${v.id}`} className={`fz-fila${v.estado === 'anulada' ? ' fa-inactiva' : ''}`}>
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {v.folio} <Pastilla tono={ESTADO[v.estado].t}>{ESTADO[v.estado].l}</Pastilla>
                </span>
                <span className="fz-fila__t2">
                  {momento(v.creadoEn)} · {v.renglones} producto{v.renglones === 1 ? '' : 's'} · {v.metodos.join(' + ')}
                  {v.mascota ? ` · ${v.mascota.nombre}` : ''}
                  {v.vendedor ? ` · ${v.vendedor.nombre}` : ''}
                </span>
              </span>
              <b className="fz-num">{dinero(v.total, true)}</b>
              <Icono n="flecha" chico />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function FichaVenta({ id }: { id: number }) {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const ficha = useCarga(() => api.get<VentaVista>(`ventas/${id}`), [id])
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [anular, setAnular] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [correo, setCorreo] = useState('')
  if (ficha.error) return <Aviso tono="malo">{ficha.error}</Aviso>
  if (!ficha.datos) return <p className="fz-tenue">Cargando…</p>
  const v = ficha.datos
  const hacer = async (fn: () => Promise<VentaVista>, ok: string) => {
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      ficha.poner(await fn())
      setMsg(ok)
      recargarCatalogo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.')
    }
    setOcupado(false)
  }
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <Volver a={`${base}/ventas`} etiqueta="Ventas" />
        <div className="fz-entre">
          <div>
            <p className="fz-eyebrow">
              {v.folio} · {v.canal} · {fecha(v.dia)}
            </p>
            <h1 className="fz-h1">
              {dinero(v.total, true)} <Pastilla tono={ESTADO[v.estado].t}>{ESTADO[v.estado].l}</Pastilla>
            </h1>
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              {momento(v.creadoEn)}
              {v.vendedor ? ` · vendió ${v.vendedor.nombre}` : ''}
              {v.autorizoDescuento ? ` · descuento autorizado por ${v.autorizoDescuento.nombre}` : ''}
              {v.autorizo ? ` · autorizó ${v.autorizo.nombre}` : ''}
            </p>
          </div>
          <div className="fz-acciones-fin">
            <a href={`/api/farmacia/ventas/${v.id}/ticket`} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro fz-btn--chico">
              Ticket
            </a>
            {p.ajustes && v.estado !== 'anulada' && v.dia === hoyISO() && (
              <Boton tono="peligro" chico onClick={() => setAnular(true)}>
                Anular
              </Boton>
            )}
          </div>
        </div>
      </div>
      {msg && <Aviso tono="ok">{msg}</Aviso>}
      <ErrorForm error={error} />
      {v.estado === 'anulada' && <Aviso tono="gris">Anulada{v.anuladaPor ? ` por ${v.anuladaPor.nombre}` : ''} · {momento(v.anuladaEn)} · {v.motivoAnulacion}</Aviso>}
      {v.estado !== 'anulada' && !v.ingresoFinanzasId && v.total > 0 && (
        <Aviso tono="aviso">
          Esta venta no tiene entrada en Finanzas.{' '}
          <button type="button" className="fz-link" disabled={ocupado} onClick={() => void hacer(() => api.post<VentaVista>(`ventas/${v.id}/finanzas`), 'Entrada registrada en Finanzas.')}>
            Reintentar Finanzas
          </button>
        </Aviso>
      )}

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Productos</h2>
        {(v.cliente || v.mascota) && (
          <p className="fz-chico">
            {v.cliente ? `Cliente: ${v.cliente.nombre}` : ''}
            {v.mascota ? ` · Mascota: ${v.mascota.nombre} (${v.mascota.folio})` : ''}
            {v.pesoUsadoKg != null ? ` · peso usado ${v.pesoUsadoKg} kg` : ''}
          </p>
        )}
        <div className="fz-lista">
          {v.renglones.map((r, i) => (
            <div key={r.id ?? i} className="fz-fila" style={{ alignItems: 'flex-start' }}>
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {r.cantidad} × {r.descripcion} {r.grupo && (r.grupo === 'I' || r.grupo === 'II' || r.grupo === 'III' || r.grupo === 'desregulado') && <GrupoPastilla grupo={r.grupo} />}
                </span>
                <span className="fz-fila__t2">
                  {cantidad(r.unidades)} unidades · lotes {r.lotes.map((l) => `${l.numeroLote} (${cantidad(l.unidades)}, cad. ${l.caducidad})`).join(', ')}
                  {r.descuentoPorciento ? ` · −${r.descuentoPorciento}%` : ''}
                  {r.recetaFolio ? ` · receta ${r.recetaFolio}` : ''}
                  {r.folioCuantificado ? ` · folio ${r.folioCuantificado}` : ''}
                  {r.costo != null ? ` · costo ${dinero(r.costo, true)}` : ''}
                </span>
                {r.autorizacionMascota && <span className="fz-chico fa-sale">Autorizado: {r.autorizacionMascota}</span>}
              </span>
              <b className="fz-num">{dinero(r.importe, true)}</b>
            </div>
          ))}
        </div>
        <div className="fa-totales">
          {v.descuento > 0 && <span>Subtotal {dinero(v.subtotal, true)}</span>}
          {v.descuento > 0 && <span>Descuento −{dinero(v.descuento, true)}</span>}
          {v.costoTotal != null && <span>Costo {dinero(v.costoTotal, true)} · margen {dinero(v.margen ?? null, true)}</span>}
          <b>Total {dinero(v.total, true)}</b>
        </div>
      </section>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Pagos</h2>
        {v.pagos.map((x) => (
          <div key={x.indice} className="fz-entre">
            <span>
              <b>{x.etiqueta}</b> {dinero(x.monto, true)}
              {x.recibido != null ? ` · recibió ${dinero(x.recibido, true)} · cambio ${dinero(x.cambio ?? 0, true)}` : ''}
              {x.referencia ? ` · ref. ${x.referencia}` : ''}{' '}
              {x.estado === 'por_confirmar' ? <Pastilla tono="aviso">Por confirmar</Pastilla> : <span className="fz-chico fz-tenue">{x.confirmadoPor ? `confirmó ${x.confirmadoPor.nombre}` : ''}</span>}
            </span>
            {x.estado === 'por_confirmar' && p.aprobar && v.estado !== 'anulada' && (
              <Boton chico tono="teal" disabled={ocupado} onClick={() => void hacer(() => api.post<VentaVista>(`ventas/${v.id}/pagos/${x.indice}/confirmar`, {}), 'Pago confirmado: el cobro entró a Finanzas.')}>
                Confirmar
              </Boton>
            )}
          </div>
        ))}
        <p className="fz-chico fz-tenue">
          Finanzas: {v.ingresoFolio ? `entrada ${v.ingresoFolio}` : v.total > 0 ? 'pendiente' : 'sin importe'}
          {v.estado === 'por_confirmar' && !p.aprobar ? ' · La transferencia la confirma el encargado al verla en el banco.' : ''}
        </p>
      </section>

      {v.estado !== 'anulada' && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Ticket por correo</h2>
          <form
            className="fa-filtros"
            onSubmit={(e) => {
              e.preventDefault()
              void hacer(() => api.post<VentaVista>(`ventas/${v.id}/ticket`, { correo }), `Ticket enviado a ${correo}.`)
            }}
          >
            <input className="fz-input" type="email" style={{ flex: '1 1 220px' }} value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder={v.correoTicket ?? v.cliente?.email ?? 'correo@cliente.mx'} />
            <button type="submit" className="fz-btn fz-btn--claro" disabled={!correo || ocupado}>
              Enviar
            </button>
          </form>
          {v.correoTicket && <p className="fz-chico fz-tenue">Último envío: {v.correoTicket}</p>}
        </section>
      )}

      {anular && (
        <Modal titulo={`Anular ${v.folio}`} onCerrar={() => setAnular(false)}>
          <div className="fz-stack fz-stack--chico">
            <p className="fz-chico">El inventario regresa a sus lotes, los surtidos de receta se devuelven, el libro de control recibe un asiento de cancelación y la entrada de Finanzas se anula. Solo ventas del día.</p>
            <Campo etiqueta="Motivo *">
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </Campo>
            <div className="fz-acciones-fin">
              <Boton onClick={() => setAnular(false)}>Cancelar</Boton>
              <Boton
                tono="peligro"
                disabled={ocupado || motivo.trim().length < 5}
                onClick={() =>
                  void hacer(async () => {
                    const r = await api.post<VentaVista>(`ventas/${v.id}/anular`, { motivo })
                    setAnular(false)
                    return r
                  }, 'Venta anulada.')
                }
              >
                Anular venta
              </Boton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
