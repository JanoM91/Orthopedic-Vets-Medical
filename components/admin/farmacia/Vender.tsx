'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PacienteVenta, RecetaVista, VentaVista } from '../../../lib/farmacia/tipos'
import type { PresentacionVenta } from '../../../lib/farmacia/ventas'
import { api, Aviso, Boton, Campo, cantidad as fmtCantidad, dinero, ErrorForm, GrupoPastilla, Icono, Modal, Pastilla, useFarmacia } from './comun'

/**
 * Vender (fase 3): escanear o buscar → carrito → mascota opcional → receta si
 * es Grupo I/II → pagos (mixtos, efectivo con cambio) → cobrar → ticket.
 *
 * La pantalla solo propone: el servidor decide FEFO, permisos, receta y
 * validación por mascota. Cuando el servidor pide algo (contraseña del
 * encargado, confirmar peso, autorizar un choque con la mascota) responde con
 * un `codigo` y aquí se abre el diálogo que lo resuelve y se reintenta con la
 * MISMA clave, para que un doble clic nunca cobre dos veces.
 */

type Linea = {
  p: PresentacionVenta
  cantidad: string
  descuento: string
  recetaId: number | null
  recetaFolio: string | null
  originalRecibido: boolean
  autorizarMascota: string
}

type Pago = { metodo: string; monto: string; recibido: string; referencia: string }

type ErrorApiVenta = Error & { estado?: number; codigo?: string; detalle?: unknown }

const nuevaClave = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const cent = (s: string | number) => Math.round((typeof s === 'number' ? s : Number(s.replace(',', '.')) || 0) * 100)
const pesos = (c: number) => c / 100

async function cobrar(cuerpo: unknown): Promise<VentaVista & { finanzas: string; avisos: string[]; duplicado: boolean }> {
  const r = await fetch('/api/farmacia/ventas', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error((data as { error?: string } | null)?.error || 'No se pudo cobrar. Revisa tu conexión e intenta de nuevo: no se cobra dos veces.') as ErrorApiVenta
    e.estado = r.status
    e.codigo = (data as { codigo?: string } | null)?.codigo
    e.detalle = (data as { detalle?: unknown } | null)?.detalle
    throw e
  }
  return data
}

export default function Vender() {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const metodos = catalogo.configuracion.metodosPago.filter((m) => m.activo)
  const sinCuenta = metodos.filter((m) => !m.cuentaId)
  const [clave, setClave] = useState(nuevaClave)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [paciente, setPaciente] = useState<PacienteVenta | null>(null)
  const [pesoConfirmado, setPesoConfirmado] = useState<number | null>(null)
  const [pagos, setPagos] = useState<Pago[]>([{ metodo: metodos[0]?.clave ?? 'efectivo', monto: '', recibido: '', referencia: '' }])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState<(VentaVista & { finanzas: string; avisos: string[] }) | null>(null)
  const [modal, setModal] = useState<null | { tipo: 'mascota' } | { tipo: 'receta'; i: number } | { tipo: 'autorizacion'; mensaje: string } | { tipo: 'peso'; mensaje: string } | { tipo: 'choque'; detalle: { producto: string; problemas: { tipo: string; mensaje: string }[] }[] } | { tipo: 'camara' }>(null)
  const autorizacion = useRef<{ correo: string; contrasena: string } | null>(null)

  /* Totales en centavos */
  const totales = useMemo(() => {
    let sub = 0
    let tot = 0
    for (const l of lineas) {
      const bruto = Math.round(cent(l.p.precio) * (Number(l.cantidad) || 0))
      sub += bruto
      tot += bruto - Math.round((bruto * (Number(l.descuento) || 0)) / 100)
    }
    return { sub, tot, desc: sub - tot }
  }, [lineas])
  const sumaPagos = pagos.reduce((a, x) => a + cent(x.monto), 0)
  const falta = totales.tot - sumaPagos
  const cambio = pagos.reduce((a, x) => (x.recibido && metodos.find((m) => m.clave === x.metodo)?.tipo === 'efectivo' ? a + Math.max(0, cent(x.recibido) - cent(x.monto)) : a), 0)

  /* Con un solo pago, el monto sigue al total (cobro rápido). */
  useEffect(() => {
    setPagos((ps) => (ps.length === 1 ? [{ ...ps[0], monto: totales.tot ? String(pesos(totales.tot)) : '' }] : ps))
  }, [totales.tot])

  const agregar = (pv: PresentacionVenta) => {
    setError(null)
    setHecho(null)
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.p.id === pv.id)
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, cantidad: String((Number(l.cantidad) || 0) + 1) } : l))
      return [...ls, { p: pv, cantidad: '1', descuento: '', recetaId: null, recetaFolio: null, originalRecibido: false, autorizarMascota: '' }]
    })
  }
  const setLinea = (i: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, ...c } : l)))
  const quitar = (i: number) => setLineas((ls) => ls.filter((_, k) => k !== i))
  const reiniciar = () => {
    setLineas([])
    setPaciente(null)
    setPesoConfirmado(null)
    setPagos([{ metodo: metodos[0]?.clave ?? 'efectivo', monto: '', recibido: '', referencia: '' }])
    setError(null)
    autorizacion.current = null
    setClave(nuevaClave())
  }

  const enviar = async (extra: { pesoConfirmadoKg?: number | null } = {}) => {
    setOcupado(true)
    setError(null)
    try {
      const r = await cobrar({
        clave,
        mascotaId: paciente?.mascotaId ?? null,
        clienteId: paciente?.cliente?.id ?? null,
        pesoConfirmadoKg: extra.pesoConfirmadoKg ?? pesoConfirmado,
        renglones: lineas.map((l) => ({
          presentacionId: l.p.id,
          cantidad: Number(l.cantidad) || 0,
          descuentoPorciento: Number(l.descuento) || 0,
          recetaId: l.recetaId,
          originalRecibido: l.originalRecibido || undefined,
          autorizarMascota: l.autorizarMascota || null,
        })),
        pagos: totales.tot > 0 ? pagos.filter((x) => cent(x.monto) > 0).map((x) => ({ metodo: x.metodo, monto: pesos(cent(x.monto)), recibido: x.recibido ? pesos(cent(x.recibido)) : null, referencia: x.referencia || null })) : [],
        autorizacion: autorizacion.current,
      })
      setHecho(r)
      setLineas([])
      setPaciente(null)
      setPesoConfirmado(null)
      setPagos([{ metodo: metodos[0]?.clave ?? 'efectivo', monto: '', recibido: '', referencia: '' }])
      autorizacion.current = null
      setClave(nuevaClave())
      recargarCatalogo()
    } catch (e) {
      const x = e as ErrorApiVenta
      if (x.codigo === 'autorizacion') setModal({ tipo: 'autorizacion', mensaje: x.message })
      else if (x.codigo === 'confirmar_peso') setModal({ tipo: 'peso', mensaje: x.message })
      else if (x.codigo === 'mascota') setModal({ tipo: 'choque', detalle: (x.detalle as never) ?? [] })
      else setError(x.message)
    }
    setOcupado(false)
  }

  const puedeCobrar = lineas.length > 0 && (totales.tot === 0 || falta === 0) && !ocupado

  if (!p.vender) return <Aviso>Tu rol no incluye la venta de mostrador.</Aviso>

  return (
    <div className="fz-stack fz-stack--grande fa-vender">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Vender</h1>
        </div>
        <div className="fz-acciones-fin">
          <Link href={`${base}/ventas`} className="fz-btn fz-btn--claro fz-btn--chico">
            Ventas de hoy
          </Link>
        </div>
      </div>

      {sinCuenta.length > 0 && (
        <Aviso tono="aviso">
          {sinCuenta.map((m) => m.nombre).join(', ')} no {sinCuenta.length === 1 ? 'tiene' : 'tienen'} cuenta de Finanzas.{' '}
          {p.configurar ? <Link href={`${base}/configuracion`}>Elígela en Configuración</Link> : 'Pide al dueño que la elija en Configuración.'}
        </Aviso>
      )}

      {hecho && (
        <div className="fz-tarjeta cl-caja fa-cobrado" role="status">
          <div className="fz-entre">
            <div>
              <p className="fz-eyebrow">Cobrado · {hecho.folio}</p>
              <p className="fa-cobrado__total">{dinero(hecho.total, true)}</p>
              {hecho.cambio > 0 && <p className="fa-cobrado__cambio">Cambio: {dinero(hecho.cambio, true)}</p>}
              {hecho.estado === 'por_confirmar' && <p className="fz-chico">La transferencia queda por confirmar.</p>}
            </div>
            <div className="fz-acciones-fin">
              <a href={`/api/farmacia/ventas/${hecho.id}/ticket`} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro">
                Ticket
              </a>
              <Link href={`${base}/ventas/${hecho.id}`} className="fz-btn fz-btn--claro">
                Ver venta
              </Link>
            </div>
          </div>
          {hecho.finanzas === 'pendiente' && <Aviso tono="aviso">La venta quedó, pero Finanzas no la registró todavía: entra a la venta y usa «Reintentar Finanzas».</Aviso>}
          {hecho.avisos.map((a, i) => (
            <Aviso key={i} tono="info">
              {a}
            </Aviso>
          ))}
        </div>
      )}

      <Buscador alElegir={agregar} abrirCamara={() => setModal({ tipo: 'camara' })} />

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <div className="fz-entre">
          <h2 className="fz-h2">Mascota</h2>
          {catalogo.clinica && (
            <Boton chico onClick={() => setModal({ tipo: 'mascota' })}>
              {paciente ? 'Cambiar' : 'Agregar mascota'}
            </Boton>
          )}
        </div>
        {!paciente && <p className="fz-chico fz-tenue">{catalogo.clinica ? 'Opcional. Con mascota se revisa especie, peso, edad y alergias.' : 'La clínica está apagada: la venta va sin mascota.'}</p>}
        {paciente && (
          <div className="fa-paciente">
            <div>
              <b>{paciente.nombre}</b> <span className="fz-chico fz-tenue">{paciente.folio} · {paciente.especie}{paciente.raza ? ` · ${paciente.raza}` : ''}{paciente.edadMeses != null ? ` · ${paciente.edadMeses} meses` : ''}</span>
              <br />
              <span className="fz-chico">
                Peso: {pesoConfirmado != null ? `${pesoConfirmado} kg (confirmado hoy)` : paciente.pesoKg != null ? `${paciente.pesoKg} kg · hace ${paciente.pesoDias} días` : 'sin registro'}
                {paciente.cliente ? ` · Tutor: ${paciente.cliente.nombre}` : ''}
              </span>
            </div>
            {paciente.alergias && <Aviso tono="malo">Alergias: {paciente.alergias}</Aviso>}
            <button type="button" className="fz-link" onClick={() => { setPaciente(null); setPesoConfirmado(null) }}>
              Quitar
            </button>
          </div>
        )}
      </section>

      <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Carrito</h2>
        {lineas.length === 0 && <p className="fz-chico fz-tenue">Escanea un código o busca un producto.</p>}
        {lineas.map((l, i) => {
          const regulado = l.p.producto.grupo === 'I' || l.p.producto.grupo === 'II'
          const unidades = (Number(l.cantidad) || 0) * l.p.factor
          return (
            <div key={l.p.id} className={`fa-linea${regulado && !l.recetaId ? ' fa-linea--pendiente' : ''}`}>
              <div className="fa-linea__cab">
                <span>
                  <b>{l.p.producto.nombre}</b> · {l.p.nombre} <GrupoPastilla grupo={l.p.producto.grupo} />
                </span>
                <button type="button" className="fz-link" onClick={() => quitar(i)} aria-label={`Quitar ${l.p.producto.nombre}`}>
                  Quitar
                </button>
              </div>
              <div className="fa-linea__campos">
                <Campo etiqueta="Cantidad" ayuda={unidades > l.p.vendible ? <span className="fa-sale">Solo hay {fmtCantidad(l.p.vendible, l.p.producto.unidadBase)}</span> : l.p.factor !== 1 ? fmtCantidad(unidades, l.p.producto.unidadBase) : undefined}>
                  <div className="fa-paso">
                    <button type="button" className="fz-btn fz-btn--claro" onClick={() => setLinea(i, { cantidad: String(Math.max(l.p.fraccionada ? 0.5 : 1, (Number(l.cantidad) || 0) - 1)) })} aria-label="Menos">
                      −
                    </button>
                    <input className="fz-input" inputMode="decimal" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: e.target.value })} aria-label="Cantidad" />
                    <button type="button" className="fz-btn fz-btn--claro" onClick={() => setLinea(i, { cantidad: String((Number(l.cantidad) || 0) + 1) })} aria-label="Más">
                      +
                    </button>
                  </div>
                </Campo>
                <Campo etiqueta="Desc. %" ayuda={!p.descuentos && Number(l.descuento) > 0 ? 'Pedirá al encargado' : undefined}>
                  <input className="fz-input" inputMode="decimal" value={l.descuento} onChange={(e) => setLinea(i, { descuento: e.target.value })} placeholder="0" />
                </Campo>
                <div className="fa-linea__importe">
                  <span className="fz-chico fz-tenue">{dinero(l.p.precio, true)} c/u</span>
                  <b className="fz-num">{dinero(pesos(Math.round(cent(l.p.precio) * (Number(l.cantidad) || 0) * (1 - (Number(l.descuento) || 0) / 100))), true)}</b>
                </div>
              </div>
              {regulado && (
                <div className="fa-linea__receta">
                  {l.recetaId ? (
                    <span className="fz-chico">
                      Receta <b>{l.recetaFolio}</b>{' '}
                      <button type="button" className="fz-link" onClick={() => setModal({ tipo: 'receta', i })}>
                        Cambiar
                      </button>
                    </span>
                  ) : (
                    <Boton chico tono="teal" onClick={() => setModal({ tipo: 'receta', i })}>
                      Ligar receta (Grupo {l.p.producto.grupo})
                    </Boton>
                  )}
                  {l.p.producto.grupo === 'I' && (
                    <label className="cl-check">
                      <input type="checkbox" checked={l.originalRecibido} onChange={(e) => setLinea(i, { originalRecibido: e.target.checked })} />
                      <span>Recibí el original de la receta cuantificada</span>
                    </label>
                  )}
                </div>
              )}
              {l.autorizarMascota && <p className="fz-chico fz-tenue">Autorización solicitada: {l.autorizarMascota}</p>}
            </div>
          )
        })}
        {lineas.length > 0 && (
          <div className="fa-totales">
            {totales.desc > 0 && <span>Subtotal {dinero(pesos(totales.sub), true)}</span>}
            {totales.desc > 0 && <span>Descuento −{dinero(pesos(totales.desc), true)}</span>}
            <b>Total {dinero(pesos(totales.tot), true)}</b>
          </div>
        )}
      </section>

      {lineas.length > 0 && totales.tot > 0 && (
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <h2 className="fz-h2">Pago</h2>
            {pagos.length < metodos.length && (
              <Boton chico onClick={() => setPagos((ps) => [...ps, { metodo: metodos.find((m) => !ps.some((x) => x.metodo === m.clave))?.clave ?? metodos[0].clave, monto: falta > 0 ? String(pesos(falta)) : '', recibido: '', referencia: '' }])}>
                <Icono n="mas" chico /> Otro método
              </Boton>
            )}
          </div>
          {pagos.map((x, i) => {
            const m = metodos.find((y) => y.clave === x.metodo)
            return (
              <div key={i} className="fa-pago">
                <div className="fz-seg" role="radiogroup" aria-label="Método de pago">
                  {metodos.map((y) => (
                    <button key={y.clave} type="button" className={x.metodo === y.clave ? 'is-on' : ''} onClick={() => setPagos((ps) => ps.map((z, k) => (k === i ? { ...z, metodo: y.clave, recibido: y.tipo === 'efectivo' ? z.recibido : '' } : z)))} aria-pressed={x.metodo === y.clave}>
                      {y.nombre}
                    </button>
                  ))}
                </div>
                <div className="cl-grid cl-grid--3">
                  <Campo etiqueta="Monto">
                    <input className="fz-input" inputMode="decimal" value={x.monto} onChange={(e) => setPagos((ps) => ps.map((z, k) => (k === i ? { ...z, monto: e.target.value } : z)))} />
                  </Campo>
                  {m?.tipo === 'efectivo' ? (
                    <Campo etiqueta="Recibido" ayuda={x.recibido && cent(x.recibido) >= cent(x.monto) ? `Cambio ${dinero(pesos(cent(x.recibido) - cent(x.monto)), true)}` : undefined}>
                      <input className="fz-input" inputMode="decimal" value={x.recibido} onChange={(e) => setPagos((ps) => ps.map((z, k) => (k === i ? { ...z, recibido: e.target.value } : z)))} placeholder="Con cuánto paga" />
                    </Campo>
                  ) : (
                    <Campo etiqueta={m?.tipo === 'terminal' ? 'Autorización' : 'Referencia'} ayuda={m?.porConfirmar ? 'Queda por confirmar' : undefined}>
                      <input className="fz-input" value={x.referencia} onChange={(e) => setPagos((ps) => ps.map((z, k) => (k === i ? { ...z, referencia: e.target.value } : z)))} />
                    </Campo>
                  )}
                  {pagos.length > 1 && (
                    <div style={{ alignSelf: 'end' }}>
                      <button type="button" className="fz-link" onClick={() => setPagos((ps) => ps.filter((_, k) => k !== i))}>
                        Quitar pago
                      </button>
                    </div>
                  )}
                </div>
                {m?.tipo === 'efectivo' && (
                  <div className="fa-billetes" aria-label="Billetes rápidos">
                    {[50, 100, 200, 500, 1000].filter((b) => b * 100 >= cent(x.monto)).slice(0, 4).map((b) => (
                      <button key={b} type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setPagos((ps) => ps.map((z, k) => (k === i ? { ...z, recibido: String(b) } : z)))}>
                        ${b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {falta !== 0 && <p className={falta > 0 ? 'fa-sale' : 'fa-sale'}>{falta > 0 ? `Faltan ${dinero(pesos(falta), true)}` : `Sobran ${dinero(pesos(-falta), true)}: en efectivo escribe lo recibido aparte`}</p>}
        </section>
      )}

      <ErrorForm error={error} />
      <div className="fa-cobrar">
        <div>
          <span className="fz-chico fz-tenue">{lineas.length} producto{lineas.length === 1 ? '' : 's'}</span>
          <b className="fa-cobrar__total">{dinero(pesos(totales.tot), true)}</b>
          {cambio > 0 && <span className="fz-chico">Cambio {dinero(pesos(cambio), true)}</span>}
        </div>
        <div className="fz-acciones-fin">
          {lineas.length > 0 && (
            <Boton onClick={reiniciar} disabled={ocupado}>
              Vaciar
            </Boton>
          )}
          <Boton tono="navy" onClick={() => void enviar()} disabled={!puedeCobrar}>
            {ocupado ? 'Cobrando…' : 'Cobrar'}
          </Boton>
        </div>
      </div>

      {modal?.tipo === 'mascota' && (
        <ModalMascota
          onCerrar={() => setModal(null)}
          alElegir={(x) => {
            setPaciente(x)
            setPesoConfirmado(null)
            setModal(null)
          }}
        />
      )}
      {modal?.tipo === 'receta' && lineas[modal.i] && (
        <ModalReceta
          linea={lineas[modal.i]}
          paciente={paciente}
          onCerrar={() => setModal(null)}
          alElegir={(r) => {
            setLinea(modal.i, { recetaId: r.id, recetaFolio: r.folio, originalRecibido: lineas[modal.i].originalRecibido || r.originalRecibido })
            setModal(null)
          }}
        />
      )}
      {modal?.tipo === 'autorizacion' && (
        <ModalAutorizacion
          mensaje={modal.mensaje}
          onCerrar={() => setModal(null)}
          alAutorizar={(cred) => {
            autorizacion.current = cred
            setModal(null)
            void enviar()
          }}
        />
      )}
      {modal?.tipo === 'peso' && (
        <ModalPeso
          mensaje={modal.mensaje}
          inicial={paciente?.pesoKg ?? null}
          onCerrar={() => setModal(null)}
          alConfirmar={(kg) => {
            setPesoConfirmado(kg)
            setModal(null)
            void enviar({ pesoConfirmadoKg: kg })
          }}
        />
      )}
      {modal?.tipo === 'choque' && (
        <ModalChoque
          detalle={modal.detalle}
          onCerrar={() => setModal(null)}
          alAutorizar={(motivo) => {
            const afectados = new Set(modal.detalle.map((d) => d.producto))
            setLineas((ls) => ls.map((l) => (afectados.has(`${l.p.producto.nombre} · ${l.p.nombre}`) ? { ...l, autorizarMascota: motivo } : l)))
            setModal(null)
          }}
        />
      )}
      {modal?.tipo === 'camara' && (
        <ModalCamara
          onCerrar={() => setModal(null)}
          alLeer={async (codigo) => {
            setModal(null)
            const r = await api.get<PresentacionVenta[]>('vender/buscar', { q: codigo }).catch(() => [])
            const exacta = r.find((x) => x.codigoBarras === codigo)
            if (exacta) agregar(exacta)
            else setError(`Ningún producto tiene el código ${codigo}.`)
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════ buscador / escaneo ═══════════════════════════ */

function Buscador({ alElegir, abrirCamara }: { alElegir: (p: PresentacionVenta) => void; abrirCamara: () => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<PresentacionVenta[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const [hayCamara, setHayCamara] = useState(false)
  useEffect(() => {
    ref.current?.focus()
    setHayCamara(typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia))
  }, [])
  useEffect(() => {
    const texto = q.trim()
    if (texto.length < 2 || /^\d{6,}$/.test(texto)) {
      setRes(null)
      return
    }
    const t = setTimeout(() => {
      api.get<PresentacionVenta[]>('vender/buscar', { q: texto }).then(setRes, () => setRes([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q])
  const elegir = (p: PresentacionVenta) => {
    alElegir(p)
    setQ('')
    setRes(null)
    setAviso(null)
    ref.current?.focus()
  }
  /* El lector USB escribe el código y manda Enter. */
  const alEnter = async () => {
    const texto = q.trim()
    if (!texto) return
    const r = await api.get<PresentacionVenta[]>('vender/buscar', { q: texto }).catch(() => [] as PresentacionVenta[])
    const exacta = r.find((x) => x.codigoBarras === texto.replace(/\s+/g, ''))
    if (exacta) return elegir(exacta)
    if (r.length === 1) return elegir(r[0])
    if (!r.length) setAviso(`Nada coincide con «${texto}».`)
    setRes(r)
  }
  return (
    <div className="fz-stack fz-stack--chico">
      <div className="fa-filtros">
        <div className="fz-buscar" style={{ flex: '1 1 260px' }}>
          <Icono n="buscar" />
          <input
            ref={ref}
            className="fz-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAviso(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void alEnter()
              }
            }}
            placeholder="Escanea o busca: nombre, principio activo, código"
            autoComplete="off"
            aria-label="Escanear o buscar producto"
          />
        </div>
        {hayCamara && (
          <Boton onClick={abrirCamara}>
            <Icono n="camara" chico /> Cámara
          </Boton>
        )}
      </div>
      {aviso && <p className="fz-chico fz-tenue">{aviso}</p>}
      {res && res.length > 0 && (
        <div className="fz-resultados">
          {res.map((x) => (
            <button key={x.id} type="button" onClick={() => elegir(x)} disabled={x.vendible <= 0}>
              <span style={{ flex: 1 }}>
                <b>{x.producto.nombre}</b> · {x.nombre} <GrupoPastilla grupo={x.producto.grupo} />
                <br />
                <span className="fz-chico fz-tenue">
                  {x.producto.principioActivo ? `${x.producto.principioActivo} · ` : ''}
                  {x.vendible > 0 ? `${fmtCantidad(x.vendible, x.producto.unidadBase)} vendibles` : 'Sin existencia vendible'}
                  {x.codigoBarras ? ` · ${x.codigoBarras}` : ''}
                </span>
              </span>
              <b className="fz-num">{dinero(x.precio, true)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════ diálogos ═══════════════════════════ */

function ModalMascota({ onCerrar, alElegir }: { onCerrar: () => void; alElegir: (p: PacienteVenta) => void }) {
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
          <input className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o folio de la mascota, nombre o teléfono del tutor" autoFocus autoComplete="off" />
        </div>
        <div className="fz-resultados">
          {res.map((x) => (
            <button key={x.mascotaId} type="button" onClick={() => alElegir(x)}>
              <span style={{ flex: 1 }}>
                <b>{x.nombre}</b> · {x.especie} <span className="fz-chico fz-tenue">{x.folio}</span>
                <br />
                <span className="fz-chico fz-tenue">
                  {x.cliente?.nombre ?? 'Sin tutor'}
                  {x.pesoKg != null ? ` · ${x.pesoKg} kg` : ''}
                  {x.alergias ? ` · alergias: ${x.alergias}` : ''}
                </span>
              </span>
              <Icono n="flecha" chico />
            </button>
          ))}
        </div>
        {q.trim().length >= 2 && res.length === 0 && <p className="fz-chico fz-tenue">Nada coincide. Da de alta la mascota en Clínica.</p>}
      </div>
    </Modal>
  )
}

function ModalReceta({ linea, paciente, onCerrar, alElegir }: { linea: Linea; paciente: PacienteVenta | null; onCerrar: () => void; alElegir: (r: RecetaVista) => void }) {
  const { base } = useFarmacia()
  const [lista, setLista] = useState<RecetaVista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.get<RecetaVista[]>('recetas/para', { producto: linea.p.producto.id, mascota: paciente?.mascotaId ?? null }).then(setLista, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [linea.p.producto.id, paciente?.mascotaId])
  return (
    <Modal titulo={`Receta para ${linea.p.producto.nombre}`} onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <p className="fz-chico">
          Grupo {linea.p.producto.grupo}: {linea.p.producto.grupo === 'I' ? 'receta cuantificada con folio SENASICA; la farmacia conserva el original.' : 'receta válida y vigente con surtidos disponibles.'}
          {!paciente && ' Sin mascota se muestran todas las recetas vigentes.'}
        </p>
        {error && <Aviso tono="malo">{error}</Aviso>}
        {lista && lista.length === 0 && <Aviso tono="aviso">No hay recetas vigentes que cubran este producto{paciente ? ` para ${paciente.nombre}` : ''}.</Aviso>}
        <div className="fz-resultados">
          {(lista ?? []).map((r) => (
            <button key={r.id} type="button" onClick={() => alElegir(r)}>
              <span style={{ flex: 1 }}>
                <b>{r.folio}</b> · {r.origen === 'interna' ? 'interna' : 'externa'} · {r.mascota?.nombre ?? r.pacienteTexto ?? ''}
                <br />
                <span className="fz-chico fz-tenue">
                  {r.mvzNombre} · vigente al {r.vigenteHasta}
                  {r.folioCuantificado ? ` · folio ${r.folioCuantificado}` : ''}
                  {r.origen === 'externa' && !r.originalRecibido ? ' · original pendiente' : ''}
                </span>
              </span>
              <Icono n="flecha" chico />
            </button>
          ))}
        </div>
        <Link href={`${base}/recetas/nueva${paciente ? `?mascota=${paciente.mascotaId}` : ''}`} className="fz-btn fz-btn--claro" target="_blank">
          Capturar receta externa
        </Link>
        <p className="fz-chico fz-tenue">La receta externa la valida el encargado antes de surtir.</p>
      </div>
    </Modal>
  )
}

function ModalAutorizacion({ mensaje, onCerrar, alAutorizar }: { mensaje: string; onCerrar: () => void; alAutorizar: (c: { correo: string; contrasena: string }) => void }) {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  return (
    <Modal titulo="Autorización del encargado" onCerrar={onCerrar}>
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={(e) => {
          e.preventDefault()
          alAutorizar({ correo, contrasena })
        }}
      >
        <Aviso tono="aviso">{mensaje}</Aviso>
        <p className="fz-chico">El encargado escribe su correo y contraseña en este dispositivo. No se guarda: solo autoriza esta venta.</p>
        <Campo etiqueta="Correo del encargado">
          <input className="fz-input" type="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña">
          <input className="fz-input" type="password" autoComplete="off" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </Campo>
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={!correo || !contrasena}>
            Autorizar y cobrar
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ModalPeso({ mensaje, inicial, onCerrar, alConfirmar }: { mensaje: string; inicial: number | null; onCerrar: () => void; alConfirmar: (kg: number) => void }) {
  const [kg, setKg] = useState(inicial != null ? String(inicial) : '')
  return (
    <Modal titulo="Confirma el peso" onCerrar={onCerrar}>
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={(e) => {
          e.preventDefault()
          if (Number(kg) > 0) alConfirmar(Number(kg))
        }}
      >
        <Aviso tono="aviso">{mensaje}</Aviso>
        <Campo etiqueta="Peso de hoy (kg)">
          <input className="fz-input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus />
        </Campo>
        <p className="fz-chico fz-tenue">Pésala en la báscula o pregunta al tutor. El peso queda en la venta.</p>
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={!(Number(kg) > 0)}>
            Confirmar y cobrar
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ModalChoque({ detalle, onCerrar, alAutorizar }: { detalle: { producto: string; problemas: { tipo: string; mensaje: string }[] }[]; onCerrar: () => void; alAutorizar: (motivo: string) => void }) {
  const { catalogo } = useFarmacia()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo="No compatible con la mascota" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        {detalle.map((d) => (
          <Aviso key={d.producto} tono="malo">
            <b>{d.producto}</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {d.problemas.map((x, i) => (
                <li key={i}>{x.mensaje}</li>
              ))}
            </ul>
          </Aviso>
        ))}
        <p className="fz-chico">Cambia a la presentación correcta o quita el producto. Si el médico lo indicó, el encargado puede autorizar con motivo.</p>
        <Campo etiqueta="Motivo de la autorización" ayuda={catalogo.permisos.recetas ? 'Quedará registrado en la venta.' : 'Después se pedirá la contraseña del encargado.'}>
          <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. indicación del MVZ en nota de hoy" />
        </Campo>
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Corregir el carrito</Boton>
          <Boton tono="peligro" onClick={() => alAutorizar(motivo.trim())} disabled={motivo.trim().length < 5}>
            Autorizar con motivo
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

/** Lectura con la cámara (API BarcodeDetector). Si el navegador no la tiene, el botón no aparece y queda la captura manual. */
function ModalCamara({ onCerrar, alLeer }: { onCerrar: () => void; alLeer: (codigo: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const leer = useRef(alLeer)
  useEffect(() => {
    leer.current = alLeer
  }, [alLeer])
  useEffect(() => {
    let vivo = true
    let stream: MediaStream | null = null
    let raf = 0
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!Detector) {
      setError('Este navegador no lee códigos con la cámara. Escribe el código.')
      return
    }
    const det = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s
        if (!video.current || !vivo) return
        video.current.srcObject = s
        await video.current.play()
        const ciclo = async () => {
          if (!vivo || !video.current) return
          try {
            const r = await det.detect(video.current)
            if (r[0]?.rawValue) {
              vivo = false
              leer.current(r[0].rawValue)
              return
            }
          } catch {
            /* cuadro sin código */
          }
          raf = requestAnimationFrame(() => void ciclo())
        }
        void ciclo()
      })
      .catch(() => setError('No se pudo abrir la cámara. Revisa el permiso del navegador.'))
    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  return (
    <Modal titulo="Escanear con la cámara" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        {error ? <Aviso tono="aviso">{error}</Aviso> : <video ref={video} className="fa-camara" muted playsInline />}
        <p className="fz-chico fz-tenue">Apunta al código de barras del empaque.</p>
        <Pastilla tono="info">Lector USB: también funciona escribiendo en el buscador</Pastilla>
      </div>
    </Modal>
  )
}
