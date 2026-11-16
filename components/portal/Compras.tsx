import Link from 'next/link'
import React from 'react'
import type { PlanVista } from '../../lib/farmacia/planes'
import { ESTADO_PEDIDO_LABEL, type EstadoPedido, type PedidoVista, type RecetaTienda } from '../../lib/farmacia/tiposTienda'
import { fecha, Icono, Pill } from './comun'

/**
 * Compras en el portal (UX del cliente, fase 2, nov-2026): recetas para surtir y
 * pedidos de la tienda. Lo usan el inicio («Hoy primero»), Portal → Farmacia y la
 * pestaña «Compras» de la ficha de la mascota. Componentes de servidor, sin estado.
 */
export const TONO_PEDIDO: Record<EstadoPedido, 'ok' | 'warn' | 'bad' | 'info' | 'gris'> = {
  pago_pendiente: 'warn',
  creado: 'info',
  pagado: 'info',
  receta_por_validar: 'warn',
  preparando: 'info',
  listo_para_recoger: 'ok',
  en_ruta: 'info',
  entregado: 'gris',
  cancelado: 'bad',
  expirado: 'gris',
}
export const ESTADOS_CERRADOS: EstadoPedido[] = ['entregado', 'cancelado', 'expirado']
export const pedidoActivo = (p: PedidoVista) => !ESTADOS_CERRADOS.includes(p.estado)
export const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const ligaPedido = (p: PedidoVista) => `/tienda/pedido/${p.folio}?t=${encodeURIComponent(p.token ?? '')}`

/** Recetas con algo que surtir en línea: producto con surtidos y publicado en la tienda. */
export const surtible = (r: RecetaTienda) => Boolean(r.mascotaId && r.productos.some((x) => x.surtidosRestantes > 0 && x.enTienda))

export function FilaPedido({ p }: { p: PedidoVista }) {
  return (
    <Link href={ligaPedido(p)} className="pt-fila">
      <span className="ti-fila-i">
        <Icono n="bolsa" />
      </span>
      <span className="pt-fila__main">
        <span className="pt-fila__t1">
          {p.folio} · {pesos(p.total)}
        </span>
        <span className="pt-fila__t2">
          {fecha(p.creadoEn.slice(0, 10))} · {p.renglones.length} producto{p.renglones.length === 1 ? '' : 's'}
          {p.mascota ? ` · ${p.mascota.nombre}` : ''}
        </span>
      </span>
      <Pill tono={TONO_PEDIDO[p.estado]}>{ESTADO_PEDIDO_LABEL[p.estado]}</Pill>
    </Link>
  )
}

const PLAN_ESTADO: Record<PlanVista['estado'], [string, 'ok' | 'warn' | 'bad' | 'info' | 'gris']> = { por_pagar: ['Falta el pago', 'warn'], activo: ['Activo', 'ok'], detenido: ['En pausa', 'warn'], cancelado: ['Cancelado', 'gris'], terminado: ['Terminado', 'gris'] }

/** Plan de compra (fase 6b) en «Mis pedidos». */
export function FilaPlan({ p }: { p: PlanVista }) {
  const [t, tono] = PLAN_ESTADO[p.estado]
  return (
    <Link href={`/tienda/plan/${p.id}?t=${encodeURIComponent(p.token ?? '')}`} className="pt-fila">
      <span className="ti-fila-i">
        <Icono n="repetir" />
      </span>
      <span className="pt-fila__main">
        <span className="pt-fila__t1">
          {p.producto.nombre} · {p.mascota.nombre}
        </span>
        <span className="pt-fila__t2">
          Cada {p.cadaDias} días · {p.modalidad === 'anual' ? `${p.entregasHechas} de ${p.entregasTotales ?? '?'} entregas` : `${pesos(p.precioEntrega)} por entrega`}
          {p.estado === 'activo' && p.proximaEntrega ? ` · próxima ${fecha(p.proximaEntrega)}` : ''}
        </span>
      </span>
      <Pill tono={tono}>{t}</Pill>
    </Link>
  )
}

export function FilaReceta({ r }: { r: RecetaTienda }) {
  const pendientes = r.productos.filter((x) => x.surtidosRestantes > 0)
  return (
    <div className="pt-fila">
      <span className="ti-fila-i">
        <Icono n="receta" />
      </span>
      <span className="pt-fila__main">
        <span className="pt-fila__t1">
          {r.mascota ?? 'Receta'} · {r.folio}
        </span>
        <span className="pt-fila__t2">
          {pendientes.map((x) => `${x.nombre}${x.enTienda ? '' : ' (en mostrador)'}`).join(', ')} · vence {fecha(r.vigenteHasta)}
        </span>
      </span>
      {surtible(r) && (
        <Link href={`/tienda?para=${r.mascotaId}`} className="pt-btn pt-btn--chico">
          Surtir
        </Link>
      )}
    </div>
  )
}

/** Pestaña «Compras» de la ficha: recetas de esa mascota y sus pedidos (en curso y anteriores). */
export function ComprasMascota({ mascota, pedidos, recetas }: { mascota: { id: number; nombre: string }; pedidos: PedidoVista[]; recetas: RecetaTienda[] }) {
  const activos = pedidos.filter(pedidoActivo)
  const pasados = pedidos.filter((p) => !pedidoActivo(p)).slice(0, 10)
  return (
    <>
      <Link href={`/tienda?para=${mascota.id}`} className="pt-btn pt-btn--acento">
        <Icono n="bolsa" /> Comprar para {mascota.nombre}
      </Link>
      <section className="pt-seccion">
        <h2>Recetas vigentes</h2>
        {recetas.length ? (
          <div className="pt-card pt-lista">
            {recetas.map((r) => (
              <FilaReceta key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <p className="pt-tenue pt-chico">Cuando su veterinario le haga una receta, aparece aquí para surtirla.</p>
        )}
      </section>
      <section className="pt-seccion">
        <h2>Pedidos</h2>
        {activos.length || pasados.length ? (
          <div className="pt-card pt-lista">
            {[...activos, ...pasados].map((p) => (
              <FilaPedido key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <p className="pt-tenue pt-chico">Aún no hay pedidos para {mascota.nombre}.</p>
        )}
      </section>
    </>
  )
}
