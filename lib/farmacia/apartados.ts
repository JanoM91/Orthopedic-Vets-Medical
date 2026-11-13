import type { Payload, PayloadRequest, Where } from 'payload'

import type { FarPedido } from '../../payload-types'
import { idDe } from './servicio'
import { n0, r3 } from './util'

/**
 * Apartados de la tienda (Farmacia, fase 5a). Un pedido vigente aparta
 * unidades base por producto sin mover el kardex; el mostrador y la tienda
 * descuentan lo apartado de lo vendible. Vive aparte de `tienda.ts` para que
 * `ventas.ts` lo use sin importar la tienda (y sin ciclos).
 *
 * Candados: tienda y mostrador toman `pg_advisory_xact_lock(9 000 000 + producto)`
 * en orden de id ANTES de los candados por lote (8 000 000 + lote), así un
 * pedido y una venta simultáneos del mismo producto se esperan entre sí.
 */

export const ESTADOS_QUE_APARTAN = ['pago_pendiente', 'creado', 'pagado', 'receta_por_validar', 'preparando', 'listo_para_recoger', 'en_ruta'] as const

/** ¿Este pedido sigue apartando inventario? Pagado nunca vence; sin pago, hasta `expiraEn`; ya vendido, no. */
export function apartaInventario(p: Pick<FarPedido, 'estado' | 'expiraEn' | 'pago'> & { venta?: FarPedido['venta'] }, ahora = Date.now()): boolean {
  if (!(ESTADOS_QUE_APARTAN as readonly string[]).includes(p.estado)) return false
  /* Con venta (a domicilio, al salir con el repartidor) la mercancía ya salió del kardex: no se aparta dos veces. */
  if (p.venta) return false
  if (p.pago?.estado === 'pagado') return true
  return !(p.expiraEn && Date.parse(p.expiraEn) < ahora)
}

/** Unidades base apartadas por producto en pedidos vigentes (opcionalmente sin contar uno). */
export async function apartadas(payload: Payload, productoIds: number[] | null, opciones: { excluirPedido?: number | null; req?: PayloadRequest } = {}): Promise<Map<number, number>> {
  const m = new Map<number, number>()
  if (productoIds && !productoIds.length) return m
  const where: Where[] = [{ estado: { in: [...ESTADOS_QUE_APARTAN] } }]
  if (opciones.excluirPedido) where.push({ id: { not_equals: opciones.excluirPedido } })
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, req: opciones.req, where: { and: where } })
  const ahora = Date.now()
  for (const p of r.docs) {
    if (!apartaInventario(p, ahora)) continue
    for (const x of p.renglones ?? []) {
      const pid = idDe(x.producto)
      if (!pid || (productoIds && !productoIds.includes(pid))) continue
      m.set(pid, r3((m.get(pid) ?? 0) + n0(x.unidades)))
    }
  }
  return m
}
