'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { PedidoVista } from '../../../lib/farmacia/tiposTienda'
import { ESTADO_PEDIDO_LABEL } from '../../../lib/farmacia/tiposTienda'
import { BotonWhatsApp } from '../clinica/comun'
import { api, Aviso, Boton, Campo, dinero, ErrorForm, Icono, Modal, momento, Pastilla, useFarmacia, Volver } from './comun'
import { ModalAutorizacion, ModalPeso } from './Vender'

/**
 * Farmacia → Pedidos (fase 5a): lo que entra por la tienda en línea.
 * Recibido/Pagado → Preparando → Listo para recoger → Entregar (crea la venta
 * con canal «tienda» por las mismas reglas del mostrador). Cancelar pide motivo;
 * si ya estaba pagado en línea queda «reembolso pendiente» en la pasarela.
 */

type Resumen = { pedidos: PedidoVista[]; conteo: Record<'nuevos' | 'preparando' | 'listos' | 'cerrados', number> }
type Grupo = keyof Resumen['conteo']
const GRUPOS: [Grupo, string][] = [
  ['nuevos', 'Nuevos'],
  ['preparando', 'Preparando'],
  ['listos', 'Listos'],
  ['cerrados', 'Cerrados'],
]
const TONO: Record<PedidoVista['estado'], 'ok' | 'aviso' | 'malo' | 'info' | 'gris'> = {
  pago_pendiente: 'aviso',
  creado: 'info',
  pagado: 'ok',
  receta_por_validar: 'aviso',
  preparando: 'info',
  listo_para_recoger: 'ok',
  en_ruta: 'info',
  entregado: 'gris',
  cancelado: 'malo',
  expirado: 'gris',
}

function vence(iso: string | null): string | null {
  if (!iso) return null
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (min <= 0) return 'vencido'
  return min < 60 ? `vence en ${min} min` : `vence en ${Math.round(min / 60)} h`
}

export function Pedidos({ grupo: grupoInicial }: { grupo: string | null }) {
  const { base, recargarCatalogo } = useFarmacia()
  const [grupo, setGrupo] = useState<Grupo>((GRUPOS.find(([g]) => g === grupoInicial)?.[0] as Grupo) ?? 'nuevos')
  const [datos, setDatos] = useState<{ g: Grupo; r: Resumen } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    api.get<Resumen>('pedidos', { grupo }).then(
      (r) => vivo && setDatos({ g: grupo, r }),
      (e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
    )
    const u = new URL(window.location.href)
    u.searchParams.set('grupo', grupo)
    window.history.replaceState(null, '', u.toString())
    return () => {
      vivo = false
    }
  }, [grupo, vuelta])
  /* Los pedidos llegan solos: se vuelve a consultar cada minuto mientras la pestaña está abierta. */
  useEffect(() => {
    const h = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setVuelta((v) => v + 1)
        recargarCatalogo()
      }
    }, 60000)
    return () => window.clearInterval(h)
  }, [recargarCatalogo])
  const r = datos?.r
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia · tienda en línea</p>
          <h1 className="fz-h1">Pedidos</h1>
        </div>
        <div className="fz-acciones-fin">
          <a href="/tienda" target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro">
            Ver la tienda
          </a>
        </div>
      </div>
      <div className="fz-seg" style={{ maxWidth: 560 }} role="radiogroup" aria-label="Pedidos">
        {GRUPOS.map(([g, l]) => (
          <button key={g} type="button" className={grupo === g ? 'is-on' : ''} onClick={() => setGrupo(g)} aria-pressed={grupo === g}>
            {l}
            {r && g !== 'cerrados' && r.conteo[g] > 0 ? ` (${r.conteo[g]})` : ''}
          </button>
        ))}
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!r && !error && <p className="fz-tenue">Cargando…</p>}
      {r && datos?.g === grupo && r.pedidos.length === 0 && <Aviso tono="ok">{grupo === 'nuevos' ? 'Sin pedidos nuevos.' : 'Nada aquí.'}</Aviso>}
      {r && r.pedidos.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {r.pedidos.map((p) => {
            const v = ['pago_pendiente', 'creado'].includes(p.estado) ? vence(p.expiraEn) : null
            return (
              <Link key={p.id} href={`${base}/pedidos/${p.id}`} className="fz-fila">
                <span className="fz-fila__main">
                  <span className="fz-fila__t1">
                    {p.folio} <Pastilla tono={TONO[p.estado]}>{ESTADO_PEDIDO_LABEL[p.estado]}</Pastilla>
                    {p.renglones.some((x) => x.recetaId) && <Pastilla tono="info">Con receta</Pastilla>}
                    {p.entrega === 'domicilio' && <Pastilla tono="info">A domicilio</Pastilla>}
                  </span>
                  <span className="fz-fila__t2">
                    {p.contacto.nombre} · {momento(p.creadoEn)} · {p.renglones.length} producto{p.renglones.length === 1 ? '' : 's'} · {p.pago.estado === 'pagado' ? 'pagado' : p.pago.forma === 'en_linea' ? 'pago en línea pendiente' : p.pago.forma === 'al_recibir' ? 'paga al recibir' : 'paga al recoger'}
                    {p.repartidor ? ` · ${p.repartidor.nombre}` : ''}
                    {p.mascota ? ` · ${p.mascota.nombre}` : ''}
                    {v ? ` · ${v}` : ''}
                  </span>
                </span>
                <b className="fz-num">{dinero(p.total, true)}</b>
                <Icono n="flecha" chico />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

type ErrorConCodigo = Error & { codigo?: string }

/** Una por pantalla abierta: un doble clic en «Entregar» no vende dos veces. */
const nuevaClaveEntrega = () => `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

async function enviar<T>(ruta: string, cuerpo: unknown): Promise<T> {
  const r = await fetch(`/api/farmacia/${ruta}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const d = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error((d as { error?: string } | null)?.error || 'No se pudo completar. Intenta de nuevo: no se registra dos veces.') as ErrorConCodigo
    e.codigo = (d as { codigo?: string } | null)?.codigo
    throw e
  }
  return d as T
}

export function FichaPedido({ id }: { id: number }) {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const [p, setP] = useState<PedidoVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [modal, setModal] = useState<null | 'cancelar' | 'entregar' | 'enviar' | 'entregado' | 'noEntregado' | { tipo: 'autorizacion' | 'peso'; mensaje: string }>(null)
  const ruta = useRef<'entregar' | 'enviar'>('entregar')
  const [hecho, setHecho] = useState<{ venta: string; finanzas: string; avisos: string[] } | null>(null)
  const [clave] = useState(nuevaClaveEntrega)
  const extra = useRef<{ pesoConfirmadoKg?: number; autorizacion?: { correo: string; contrasena: string }; pagos?: unknown[]; repartidorId?: number }>({})

  const reembolsar = async () => {
    setOcupado(true)
    setError(null)
    try {
      setP(await enviar<PedidoVista>(`pedidos/${id}/reembolsar`, {}))
    } catch (e) {
      setError((e as Error).message)
    }
    setOcupado(false)
  }

  const cargar = useCallback(() => {
    api.get<PedidoVista>(`pedidos/${id}`).then(setP, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [id])
  useEffect(cargar, [cargar])

  const accion = async (a: 'preparar' | 'listo' | 'cancelar', motivo?: string) => {
    setOcupado(true)
    setError(null)
    try {
      setP(await enviar<PedidoVista>(`pedidos/${id}/estado`, { accion: a, motivo }))
      setModal(null)
      recargarCatalogo()
    } catch (e) {
      setError((e as Error).message)
    }
    setOcupado(false)
  }

  const entregar = async () => {
    setOcupado(true)
    setError(null)
    try {
      const r = await enviar<{ pedido: PedidoVista; ventaFolio: string; finanzas?: string; avisos: string[] }>(`pedidos/${id}/${ruta.current}`, { clave, ...extra.current })
      setP(r.pedido)
      setHecho({ venta: r.ventaFolio, finanzas: r.finanzas ?? 'registrado', avisos: r.avisos })
      setModal(null)
      recargarCatalogo()
    } catch (e) {
      const x = e as ErrorConCodigo
      if (x.codigo === 'autorizacion') setModal({ tipo: 'autorizacion', mensaje: x.message })
      else if (x.codigo === 'confirmar_peso') setModal({ tipo: 'peso', mensaje: x.message })
      else {
        setError(x.message)
        setModal(null)
      }
    }
    setOcupado(false)
  }

  if (error && !p) return <Aviso tono="malo">{error}</Aviso>
  if (!p) return <p className="fz-tenue">Cargando…</p>
  const pagado = p.pago.estado === 'pagado'
  const enLineaSinPago = p.pago.forma === 'en_linea' && !pagado
  const puedeVender = catalogo.permisos.vender
  const cerrado = ['entregado', 'cancelado', 'expirado'].includes(p.estado)
  const mensajeWa = `Hola ${p.contacto.nombre.split(' ')[0]}, te escribimos de la farmacia por tu pedido ${p.folio}.`
  const domicilio = p.entrega === 'domicilio'
  const formaTexto = pagado ? (p.pago.forma === 'en_linea' ? 'pagado en línea' : 'pagado') : p.pago.forma === 'en_linea' ? 'pago en línea pendiente' : p.pago.forma === 'al_recibir' ? 'paga al recibir' : 'paga al recoger'
  const puedeEntregaDom = catalogo.permisos.asignarRepartidor || (catalogo.permisos.entregas && p.repartidor?.id === catalogo.usuario.id)
  return (
    <div className="fz-stack fz-stack--grande fa-pedido">
      <Volver a={`${base}/pedidos`} etiqueta="Pedidos" />
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Pedido de la tienda</p>
          <h1 className="fz-h1">
            {p.folio} <Pastilla tono={TONO[p.estado]}>{ESTADO_PEDIDO_LABEL[p.estado]}</Pastilla>
          </h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {momento(p.creadoEn)} · {formaTexto} · {domicilio ? `a domicilio${p.direccion?.zona ? ` (${p.direccion.zona})` : ''}` : 'recoger en farmacia'}
          </p>
        </div>
      </div>
      {hecho && (
        <Aviso tono="ok">
          {p.estado === 'en_ruta' ? 'Salió con el repartidor.' : 'Entregado.'} Venta {hecho.venta}
          {hecho.finanzas === 'pendiente' ? ' · Finanzas quedó pendiente (reintenta desde la venta)' : ''}.{hecho.avisos.length ? ` ${hecho.avisos.join(' ')}` : ''}
          {p.ventaId && (
            <>
              {' '}
              <Link href={`${base}/ventas/${p.ventaId}`}>Ver venta</Link>
            </>
          )}
        </Aviso>
      )}
      {p.pago.estado === 'reembolso_pendiente' && (
        <Aviso tono="aviso">
          Se canceló con el pago hecho: falta reembolsarlo ({p.pago.proveedor}).{' '}
          {catalogo.permisos.aprobar && (
            <Boton chico tono="navy" disabled={ocupado} onClick={() => void reembolsar()}>
              Reembolsar {dinero(p.total, true)}
            </Boton>
          )}
        </Aviso>
      )}
      {p.pago.estado === 'reembolsado' && <Aviso tono="ok">Pago reembolsado al cliente.</Aviso>}
      {p.estado === 'pago_pendiente' && <Aviso tono="aviso">Esperando el pago en línea del cliente. No lo prepares todavía.</Aviso>}
      <ErrorForm error={error} />

      <div className="fa-pedido__cols">
        <section className="fz-tarjeta fz-lista">
          {p.renglones.map((r) => (
            <div key={r.presentacionId} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {r.cantidad} × {r.descripcion}
                </span>
                <span className="fz-fila__t2">
                  {dinero(r.precioUnitario, true)}
                  {r.grupo === 'II' ? ' · Grupo II' : ''}
                  {r.recetaFolio ? ` · receta ${r.recetaFolio}` : ''}
                </span>
              </span>
              <b className="fz-num">{dinero(r.importe, true)}</b>
            </div>
          ))}
          {domicilio && (
            <div className="fz-fila">
              <span className="fz-fila__main">Envío</span>
              <b className="fz-num">{p.envio ? dinero(p.envio, true) : 'Gratis'}</b>
            </div>
          )}
          <div className="fz-fila">
            <span className="fz-fila__main">
              <b>Total</b>
            </span>
            <b className="fz-num">{dinero(p.total, true)}</b>
          </div>
        </section>

        <div className="fz-stack">
          <section className="fz-tarjeta fz-stack fz-stack--chico" style={{ padding: 14 }}>
            <b>{p.contacto.nombre}</b>
            <span className="fz-chico">
              <a href={`mailto:${p.contacto.correo}`}>{p.contacto.correo}</a>
              {p.contacto.telefono ? ` · ${p.contacto.telefono}` : ''}
            </span>
            {p.mascota && <span className="fz-chico">Para {p.mascota.nombre}</span>}
            {p.perfil?.especie && <span className="fz-chico fz-tenue">Perfil: {p.perfil.especie}{p.perfil.pesoKg ? ` · ${p.perfil.pesoKg} kg` : ''}</span>}
            {p.notasCliente && <span className="fz-chico">Nota: {p.notasCliente}</span>}
            {p.direccion && <Direccion d={p.direccion} />}
            {p.repartidor && <span className="fz-chico">Repartidor: {p.repartidor.nombre}</span>}
            {p.entregaDomicilio?.recibio && (
              <span className="fz-chico">
                Recibió {p.entregaDomicilio.recibio}
                {p.entregaDomicilio.entregadoEn ? ` · ${momento(p.entregaDomicilio.entregadoEn)}` : ''}
                {p.entregaDomicilio.conFoto && (
                  <>
                    {' · '}
                    <a href={`/api/farmacia/pedidos/${p.id}/evidencia`} target="_blank" rel="noreferrer">
                      Ver foto
                    </a>
                  </>
                )}
              </span>
            )}
            {(p.entregaDomicilio?.intentos ?? 0) > 0 && p.estado !== 'entregado' && <span className="fz-chico fz-rojo">Intentos fallidos: {p.entregaDomicilio!.intentos} · {p.entregaDomicilio!.nota}</span>}
            <div>
              <BotonWhatsApp telefono={p.contacto.telefono} mensaje={mensajeWa} />
            </div>
          </section>

          {!cerrado && puedeVender && p.estado !== 'en_ruta' && (
            <section className="fz-tarjeta fz-stack fz-stack--chico" style={{ padding: 14 }}>
              {(p.estado === 'creado' || p.estado === 'pagado') && (
                <Boton tono="navy" disabled={ocupado} onClick={() => accion('preparar')}>
                  Empezar a preparar
                </Boton>
              )}
              {p.estado === 'preparando' && (
                <Boton tono="navy" disabled={ocupado} onClick={() => accion('listo')}>
                  {domicilio ? 'Listo para salir' : 'Listo para recoger (avisa al cliente)'}
                </Boton>
              )}
              {domicilio && ['creado', 'pagado', 'preparando', 'listo_para_recoger'].includes(p.estado) && !enLineaSinPago && (
                <Boton tono={p.estado === 'listo_para_recoger' ? 'teal' : 'claro'} disabled={ocupado} onClick={() => setModal('enviar')}>
                  Enviar con repartidor
                </Boton>
              )}
              {!domicilio && ['creado', 'pagado', 'preparando', 'listo_para_recoger'].includes(p.estado) && !enLineaSinPago && (
                <Boton tono={p.estado === 'listo_para_recoger' ? 'teal' : 'claro'} disabled={ocupado} onClick={() => {
                    ruta.current = 'entregar'
                    if (pagado) void entregar()
                    else setModal('entregar')
                  }}
                >
                  {pagado ? 'Entregar (ya pagado)' : `Entregar y cobrar ${dinero(p.total, true)}`}
                </Boton>
              )}
              <Boton tono="peligro" chico disabled={ocupado} onClick={() => setModal('cancelar')}>
                Cancelar pedido
              </Boton>
            </section>
          )}
          {p.estado === 'en_ruta' && puedeEntregaDom && (
            <section className="fz-tarjeta fz-stack fz-stack--chico" style={{ padding: 14 }}>
              <Boton tono="teal" disabled={ocupado} onClick={() => setModal('entregado')}>
                Marcar entregado{pagado ? '' : ` (cobrar ${dinero(p.total, true)})`}
              </Boton>
              <Boton chico disabled={ocupado} onClick={() => setModal('noEntregado')}>
                No se pudo entregar
              </Boton>
            </section>
          )}

          <section className="fz-tarjeta fz-lista">
            {p.historial
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={i} className="fz-fila">
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">{ESTADO_PEDIDO_LABEL[h.estado as PedidoVista['estado']] ?? h.estado}</span>
                    <span className="fz-fila__t2">
                      {momento(h.fecha)}
                      {h.por ? ` · ${h.por}` : ''}
                      {h.detalle ? ` · ${h.detalle}` : ''}
                    </span>
                  </span>
                </div>
              ))}
          </section>
        </div>
      </div>

      {modal === 'enviar' && (
        <ModalEnviar
          ocupado={ocupado}
          onCerrar={() => setModal(null)}
          alEnviar={(repartidorId) => {
            ruta.current = 'enviar'
            extra.current = { ...extra.current, repartidorId }
            void entregar()
          }}
        />
      )}
      {(modal === 'entregado' || modal === 'noEntregado') && (
        <ModalEntrega
          pedido={p}
          modo={modal}
          onCerrar={() => setModal(null)}
          alTerminar={(n) => {
            setP(n)
            setModal(null)
            recargarCatalogo()
          }}
        />
      )}
      {modal === 'cancelar' && <ModalCancelar pagado={pagado} ocupado={ocupado} onCerrar={() => setModal(null)} alCancelar={(m) => accion('cancelar', m)} />}
      {modal === 'entregar' && (
        <ModalCobro
          total={p.total}
          ocupado={ocupado}
          onCerrar={() => setModal(null)}
          alCobrar={(pagos) => {
            ruta.current = 'entregar'
            extra.current = { ...extra.current, pagos }
            void entregar()
          }}
        />
      )}
      {modal && typeof modal === 'object' && modal.tipo === 'autorizacion' && (
        <ModalAutorizacion
          mensaje={modal.mensaje}
          onCerrar={() => setModal(null)}
          alAutorizar={(cred) => {
            extra.current = { ...extra.current, autorizacion: cred }
            void entregar()
          }}
        />
      )}
      {modal && typeof modal === 'object' && modal.tipo === 'peso' && (
        <ModalPeso
          mensaje={modal.mensaje}
          inicial={null}
          onCerrar={() => setModal(null)}
          alConfirmar={(kg) => {
            extra.current = { ...extra.current, pesoConfirmadoKg: kg }
            void entregar()
          }}
        />
      )}
    </div>
  )
}

function ModalCancelar({ pagado, ocupado, onCerrar, alCancelar }: { pagado: boolean; ocupado: boolean; onCerrar: () => void; alCancelar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo="Cancelar pedido" onCerrar={onCerrar}>
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={(e) => {
          e.preventDefault()
          alCancelar(motivo.trim())
        }}
      >
        {pagado && <Aviso tono="aviso">El cliente ya pagó en línea: después de cancelar, haz el reembolso en la pasarela.</Aviso>}
        <Campo etiqueta="Motivo (lo recibe el cliente por correo)">
          <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. se agotó el producto" autoFocus />
        </Campo>
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <button type="submit" className="fz-btn fz-btn--peligro" disabled={ocupado || motivo.trim().length < 3}>
            Cancelar pedido
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Cobro al entregar (pago al recoger): un método, con efectivo recibido para dar cambio. */
function ModalCobro({ total, ocupado, onCerrar, alCobrar }: { total: number; ocupado: boolean; onCerrar: () => void; alCobrar: (pagos: { metodo: string; monto: number; recibido: number | null; referencia: string | null }[]) => void }) {
  const { catalogo } = useFarmacia()
  const metodos = catalogo.configuracion.metodosPago.filter((m) => m.activo && m.cuentaId)
  const [metodo, setMetodo] = useState(metodos[0]?.clave ?? '')
  const [recibido, setRecibido] = useState('')
  const [referencia, setReferencia] = useState('')
  const m = metodos.find((x) => x.clave === metodo)
  const rec = Number(recibido.replace(',', '.')) || 0
  const cambio = m?.tipo === 'efectivo' && rec > total ? rec - total : 0
  return (
    <Modal titulo={`Cobrar ${dinero(total, true)}`} onCerrar={onCerrar}>
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={(e) => {
          e.preventDefault()
          alCobrar([{ metodo, monto: total, recibido: m?.tipo === 'efectivo' && rec > 0 ? rec : null, referencia: referencia.trim() || null }])
        }}
      >
        {!metodos.length && <Aviso tono="malo">No hay métodos de pago con cuenta de Finanzas. Agrégalos en Farmacia → Configuración.</Aviso>}
        <div className="fz-seg" role="radiogroup" aria-label="Método de pago">
          {metodos.map((x) => (
            <button key={x.clave} type="button" className={metodo === x.clave ? 'is-on' : ''} onClick={() => setMetodo(x.clave)} aria-pressed={metodo === x.clave}>
              {x.nombre}
            </button>
          ))}
        </div>
        {m?.tipo === 'efectivo' && (
          <Campo etiqueta="Recibido (opcional, para el cambio)" ayuda={cambio > 0 ? `Cambio: ${dinero(cambio, true)}` : undefined}>
            <input className="fz-input" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={String(total)} />
          </Campo>
        )}
        {m && m.tipo !== 'efectivo' && (
          <Campo etiqueta="Referencia (opcional)">
            <input className="fz-input" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </Campo>
        )}
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--teal" disabled={ocupado || !m || (m.tipo === 'efectivo' && rec > 0 && rec < total)}>
            Cobrar y entregar
          </button>
        </div>
      </form>
    </Modal>
  )
}


/* ═══════════════════════════ a domicilio (fase 5b) ═══════════════════════════ */

function Direccion({ d }: { d: NonNullable<PedidoVista['direccion']> }) {
  const texto = [d.calle, d.colonia, d.codigoPostal].filter(Boolean).join(', ')
  return (
    <span className="fz-chico">
      Entregar en{' '}
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
        {texto}
      </a>
      {d.referencias ? ` · ${d.referencias}` : ''}
    </span>
  )
}

function ModalEnviar({ ocupado, onCerrar, alEnviar }: { ocupado: boolean; onCerrar: () => void; alEnviar: (repartidorId: number) => void }) {
  const [lista, setLista] = useState<{ id: number; nombre: string }[] | null>(null)
  const [elegido, setElegido] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api.get<{ id: number; nombre: string }[]>('repartidores').then(
      (r) => vivo && setLista(r),
      (e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
    )
    return () => {
      vivo = false
    }
  }, [])
  const rep = elegido ?? (lista?.length === 1 ? lista[0].id : null)
  return (
    <Modal titulo="Enviar con repartidor" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <p className="fz-chico">Al enviarlo se registra la venta y sale del inventario. Si paga al recibir, el cobro queda por confirmar hasta que el repartidor lo entregue.</p>
        {error && <Aviso tono="malo">{error}</Aviso>}
        {lista && !lista.length && <Aviso tono="aviso">Nadie tiene «Mis entregas» en su rol. Dalo de alta en Usuarios con el rol «Repartidor».</Aviso>}
        {lista && lista.length > 0 && (
          <div className="fz-seg" role="radiogroup" aria-label="Repartidor">
            {lista.map((r) => (
              <button key={r.id} type="button" className={rep === r.id ? 'is-on' : ''} aria-pressed={rep === r.id} onClick={() => setElegido(r.id)}>
                {r.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="button" className="fz-btn fz-btn--teal" disabled={ocupado || !rep} onClick={() => rep && alEnviar(rep)}>
            Enviar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Entregado (con quién recibió, cobro y foto opcional) o «No se pudo entregar». Lo usan la ficha y «Mis entregas». */
export function ModalEntrega({ pedido, modo, onCerrar, alTerminar }: { pedido: PedidoVista; modo: 'entregado' | 'noEntregado'; onCerrar: () => void; alTerminar: (p: PedidoVista) => void }) {
  const [recibio, setRecibio] = useState(modo === 'entregado' ? pedido.contacto.nombre : '')
  const [nota, setNota] = useState('')
  const [cobrado, setCobrado] = useState(false)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const porCobrar = pedido.pago.estado !== 'pagado'
  const elegirFoto = async (f: File | undefined) => {
    if (!f) return
    try {
      const { reducirImagen } = await import('../../../lib/reducirImagen')
      setFoto(await reducirImagen(f, { lado: 1024, calidad: 0.8 }))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      let r: Response
      if (modo === 'noEntregado') {
        r = await fetch(`/api/farmacia/pedidos/${pedido.id}/no-entregado`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: nota }) })
      } else {
        const fd = new FormData()
        fd.append('recibio', recibio)
        if (nota) fd.append('nota', nota)
        fd.append('cobrado', String(cobrado))
        if (foto) fd.append('foto', foto, 'entrega.jpg')
        r = await fetch(`/api/farmacia/pedidos/${pedido.id}/entregado`, { method: 'POST', credentials: 'same-origin', body: fd })
      }
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error((d as { error?: string } | null)?.error || 'No se pudo guardar.')
      alTerminar(d as PedidoVista)
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }
  return (
    <Modal titulo={modo === 'entregado' ? `Entregar ${pedido.folio}` : 'No se pudo entregar'} onCerrar={onCerrar}>
      <form className="fz-stack fz-stack--chico" onSubmit={(e) => void guardar(e)}>
        {modo === 'entregado' ? (
          <>
            <Campo etiqueta="¿Quién recibió?">
              <input className="fz-input" value={recibio} onChange={(e) => setRecibio(e.target.value)} required minLength={2} />
            </Campo>
            {porCobrar && (
              <label className="fa-cobrado">
                <input type="checkbox" checked={cobrado} onChange={(e) => setCobrado(e.target.checked)} />
                <span>
                  Cobré <b>{dinero(pedido.total, true)}</b>
                </span>
              </label>
            )}
            <Campo etiqueta="Foto de la entrega (opcional)">
              <input className="fz-input" type="file" accept="image/*" capture="environment" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
            </Campo>
            {foto && <span className="fz-chico fz-tenue">Foto lista ({Math.round(foto.size / 1024)} KB)</span>}
            <Campo etiqueta="Nota (opcional)">
              <input className="fz-input" value={nota} onChange={(e) => setNota(e.target.value)} />
            </Campo>
          </>
        ) : (
          <Campo etiqueta="¿Qué pasó?">
            <input className="fz-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. no había nadie, dirección incorrecta" required minLength={3} autoFocus />
          </Campo>
        )}
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className={`fz-btn ${modo === 'entregado' ? 'fz-btn--teal' : 'fz-btn--navy'}`} disabled={ocupado || (modo === 'entregado' && porCobrar && !cobrado)}>
            {modo === 'entregado' ? 'Entregado' : 'Regresa a la farmacia'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** «Mis entregas» del repartidor (rol con `entregas`): lo que lleva y lo entregado hoy. */
export function Entregas() {
  const [datos, setDatos] = useState<{ enRuta: PedidoVista[]; entregadosHoy: PedidoVista[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [modal, setModal] = useState<{ p: PedidoVista; modo: 'entregado' | 'noEntregado' } | null>(null)
  useEffect(() => {
    let vivo = true
    api.get<{ enRuta: PedidoVista[]; entregadosHoy: PedidoVista[] }>('entregas').then(
      (r) => vivo && setDatos(r),
      (e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
    )
    return () => {
      vivo = false
    }
  }, [vuelta])
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Mis entregas</h1>
        {datos && (
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {datos.enRuta.length} por entregar · {datos.entregadosHoy.length} entregadas hoy
          </p>
        )}
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!datos && !error && <p className="fz-tenue">Cargando…</p>}
      {datos && datos.enRuta.length === 0 && <Aviso tono="ok">No llevas pedidos por ahora.</Aviso>}
      {datos?.enRuta.map((p) => (
        <section key={p.id} className="fz-tarjeta fz-stack fz-stack--chico fa-entrega">
          <div className="fz-entre">
            <b>
              {p.folio} · {p.contacto.nombre}
            </b>
            <b className="fz-num">{p.pago.estado === 'pagado' ? 'Pagado' : `Cobrar ${dinero(p.total, true)}`}</b>
          </div>
          {p.direccion && <Direccion d={p.direccion} />}
          <span className="fz-chico fz-tenue">
            {p.renglones.map((r) => `${r.cantidad} × ${r.descripcion}`).join(' · ')}
          </span>
          {p.notasCliente && <span className="fz-chico">Nota: {p.notasCliente}</span>}
          <div className="fa-entrega__acciones">
            {p.contacto.telefono && (
              <a className="fz-btn fz-btn--claro fz-btn--chico" href={`tel:${p.contacto.telefono.replace(/[^0-9+]/g, '')}`}>
                Llamar
              </a>
            )}
            <BotonWhatsApp telefono={p.contacto.telefono} mensaje={`Hola ${p.contacto.nombre.split(' ')[0]}, voy en camino con tu pedido ${p.folio} de la farmacia.`} />
            <Boton chico onClick={() => setModal({ p, modo: 'noEntregado' })}>
              No se pudo
            </Boton>
            <Boton chico tono="teal" onClick={() => setModal({ p, modo: 'entregado' })}>
              Entregado
            </Boton>
          </div>
        </section>
      ))}
      {datos && datos.entregadosHoy.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {datos.entregadosHoy.map((p) => (
            <div key={p.id} className="fz-fila">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {p.folio} · {p.contacto.nombre}
                </span>
                <span className="fz-fila__t2">
                  Recibió {p.entregaDomicilio?.recibio} · {p.entregaDomicilio?.entregadoEn ? momento(p.entregaDomicilio.entregadoEn) : ''}
                </span>
              </span>
              <b className="fz-num">{dinero(p.total, true)}</b>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <ModalEntrega
          pedido={modal.p}
          modo={modal.modo}
          onCerrar={() => setModal(null)}
          alTerminar={() => {
            setModal(null)
            setVuelta((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
