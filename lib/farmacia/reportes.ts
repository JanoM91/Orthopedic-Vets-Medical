import type { Where } from 'payload'

import type { FarLote, FarPlan, FarProducto, FarVenta } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { diaLocal } from '../localTime'
import { resumenAnticipos } from './planes'
import { type Ctx, diasAvisoDe, diasHasta, ErrorFarmacia, idDe, leerConfiguracion } from './servicio'
import { esFecha, invalido, n0, prohibido, r3, sumarDias, t } from './util'
import { libroControl } from './ventas'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Reportes de la farmacia (fase 7, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todos piden «Reportes» en el rol. Lo que lleva costo (margen, valor del
 * inventario, valor en riesgo por caducidad) además pide «Ver costos»: sin esa
 * casilla, ninguna respuesta trae costos (regla de la fase 1).
 *
 * Forma única: columnas + filas + indicadores. La pantalla y el CSV salen de
 * la misma respuesta, así lo que se ve es lo que se descarga.
 *
 * Ventas anuladas no cuentan. Las ventas cubiertas por un plan anual (fase 6b)
 * sí cuentan como venta (el producto salió); su dinero entró antes como
 * anticipo y se ve en «Planes».
 */

export type TipoReporte = 'ventas' | 'productos' | 'rotacion' | 'caducidades' | 'inventario' | 'libro' | 'planes'
export const TIPOS_REPORTE: TipoReporte[] = ['ventas', 'productos', 'rotacion', 'caducidades', 'inventario', 'libro', 'planes']

export type FormatoColumna = 'texto' | 'dinero' | 'numero' | 'porciento' | 'fecha'
export type Columna = { clave: string; etiqueta: string; formato: FormatoColumna }
export type Indicador = { etiqueta: string; valor: number | string; formato: FormatoColumna }
export type Reporte = { tipo: TipoReporte; titulo: string; desde: string; hasta: string; columnas: Columna[]; filas: Record<string, string | number | null>[]; indicadores: Indicador[]; nota: string | null }

const MAX_DIAS = 400

function rango(ctx: Ctx, f: { desde?: string | null; hasta?: string | null }, tipo: TipoReporte): { desde: string; hasta: string } {
  const hoy = ctx.hoy
  const inicioMes = `${hoy.slice(0, 8)}01`
  const hasta = f.hasta && esFecha(f.hasta) ? f.hasta : tipo === 'caducidades' ? sumarDias(hoy, 90) : hoy
  const desde = f.desde && esFecha(f.desde) ? f.desde : tipo === 'caducidades' ? hoy : inicioMes
  if (desde > hasta) throw invalido('«Desde» va antes de «Hasta».')
  if (tipo !== 'caducidades' && tipo !== 'planes' && diasHasta(hasta, desde) > MAX_DIAS) throw invalido(`El periodo máximo es de ${MAX_DIAS} días.`)
  return { desde, hasta }
}

function exigir(ctx: Ctx, conCostos = false) {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.reportes) throw prohibido('Los reportes los consultan el encargado y el dueño.')
  if (conCostos && !ctx.p.farmacia.verCostos) throw prohibido('Este reporte lleva costos: tu rol no incluye «Ver costos».')
}

const c = (x: unknown) => aCentavos(n0(x)) || 0

async function ventasDelRango(ctx: Ctx, desde: string, hasta: string): Promise<FarVenta[]> {
  const r = await ctx.payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, sort: 'dia', where: { and: [{ estado: { not_equals: 'anulada' } }, { dia: { greater_than_equal: desde } }, { dia: { less_than_equal: hasta } }] } })
  return r.docs
}

async function productosPorId(ctx: Ctx, ids: number[]): Promise<Map<number, FarProducto>> {
  if (!ids.length) return new Map()
  const r = await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } })
  return new Map(r.docs.map((p) => [p.id, p]))
}

async function lotesConExistencia(ctx: Ctx, extra: Where[] = []): Promise<FarLote[]> {
  const r = await ctx.payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ existencia: { greater_than: 0 } }, ...extra] } })
  return r.docs
}

/* ───────────────────────────── ventas por día ───────────────────────────── */

async function ventas(ctx: Ctx, desde: string, hasta: string): Promise<Reporte> {
  const vs = await ventasDelRango(ctx, desde, hasta)
  const dias = new Map<string, { n: number; mostrador: number; tienda: number; descuento: number; envio: number; total: number }>()
  const metodos = new Map<string, number>()
  let totalC = 0
  let planC = 0
  for (const v of vs) {
    const d = dias.get(v.dia) ?? { n: 0, mostrador: 0, tienda: 0, descuento: 0, envio: 0, total: 0 }
    d.n++
    d[v.canal === 'tienda' ? 'tienda' : 'mostrador'] += c(v.total)
    d.descuento += c(v.descuento)
    d.envio += c(v.envio)
    d.total += c(v.total)
    dias.set(v.dia, d)
    totalC += c(v.total)
    if (idDe(v.plan) && !(v.pagos ?? []).length) planC += c(v.total)
    for (const p of v.pagos ?? []) metodos.set(p.etiqueta || p.metodo, (metodos.get(p.etiqueta || p.metodo) ?? 0) + c(p.monto))
  }
  const filas = [...dias.entries()].map(([dia, d]) => ({ dia, ventas: d.n, mostrador: aPesos(d.mostrador), tienda: aPesos(d.tienda), descuento: aPesos(d.descuento), envio: aPesos(d.envio), total: aPesos(d.total) }))
  return {
    tipo: 'ventas',
    titulo: 'Ventas por día',
    desde,
    hasta,
    columnas: [
      { clave: 'dia', etiqueta: 'Día', formato: 'fecha' },
      { clave: 'ventas', etiqueta: 'Ventas', formato: 'numero' },
      { clave: 'mostrador', etiqueta: 'Mostrador', formato: 'dinero' },
      { clave: 'tienda', etiqueta: 'Tienda', formato: 'dinero' },
      { clave: 'descuento', etiqueta: 'Descuentos', formato: 'dinero' },
      { clave: 'envio', etiqueta: 'Envíos', formato: 'dinero' },
      { clave: 'total', etiqueta: 'Total', formato: 'dinero' },
    ],
    filas,
    indicadores: [
      { etiqueta: 'Total vendido', valor: aPesos(totalC), formato: 'dinero' },
      { etiqueta: 'Ventas', valor: vs.length, formato: 'numero' },
      { etiqueta: 'Ticket promedio', valor: vs.length ? aPesos(Math.round(totalC / vs.length)) : 0, formato: 'dinero' },
      ...(planC ? [{ etiqueta: 'Entregas de planes anuales (cobradas antes)', valor: aPesos(planC), formato: 'dinero' as const }] : []),
      ...[...metodos.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => ({ etiqueta: `Cobrado · ${m}`, valor: aPesos(v), formato: 'dinero' as const })),
    ],
    nota: 'Sin ventas anuladas. «Cobrado» suma los pagos de las ventas del periodo (también los que siguen por confirmar).',
  }
}

/* ───────────────────────────── productos y margen ───────────────────────────── */

async function productos(ctx: Ctx, desde: string, hasta: string): Promise<Reporte> {
  const conCostos = ctx.p.farmacia.verCostos
  const vs = await ventasDelRango(ctx, desde, hasta)
  const acc = new Map<number, { nombre: string; unidades: number; piezas: number; importe: number; costo: number }>()
  for (const v of vs)
    for (const r of v.renglones ?? []) {
      const id = idDe(r.producto)
      if (!id) continue
      const a = acc.get(id) ?? { nombre: r.descripcion.split(' · ')[0], unidades: 0, piezas: 0, importe: 0, costo: 0 }
      a.unidades = r3(a.unidades + n0(r.unidades))
      a.piezas = r3(a.piezas + n0(r.cantidad))
      a.importe += c(r.importe)
      a.costo += c(r.costo)
      acc.set(id, a)
    }
  const prods = await productosPorId(ctx, [...acc.keys()])
  const filas = [...acc.entries()]
    .sort((a, b) => b[1].importe - a[1].importe)
    .map(([id, a]) => {
      const p = prods.get(id)
      const fila: Record<string, string | number | null> = { producto: p?.nombre ?? a.nombre, grupo: t(p?.grupo), unidades: a.unidades, unidad: t(p?.unidadBase), importe: aPesos(a.importe) }
      if (conCostos) {
        fila.costo = aPesos(a.costo)
        fila.margen = aPesos(a.importe - a.costo)
        fila.margenPorciento = a.importe > 0 ? Math.round(((a.importe - a.costo) / a.importe) * 1000) / 10 : null
      }
      return fila
    })
  const importe = [...acc.values()].reduce((s, a) => s + a.importe, 0)
  const costo = [...acc.values()].reduce((s, a) => s + a.costo, 0)
  return {
    tipo: 'productos',
    titulo: conCostos ? 'Productos vendidos y margen' : 'Productos vendidos',
    desde,
    hasta,
    columnas: [
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'grupo', etiqueta: 'Grupo', formato: 'texto' },
      { clave: 'unidades', etiqueta: 'Unidades', formato: 'numero' },
      { clave: 'unidad', etiqueta: 'Unidad', formato: 'texto' },
      { clave: 'importe', etiqueta: 'Vendido', formato: 'dinero' },
      ...(conCostos
        ? ([
            { clave: 'costo', etiqueta: 'Costo', formato: 'dinero' },
            { clave: 'margen', etiqueta: 'Margen', formato: 'dinero' },
            { clave: 'margenPorciento', etiqueta: 'Margen %', formato: 'porciento' },
          ] as Columna[])
        : []),
    ],
    filas,
    indicadores: [
      { etiqueta: 'Vendido en productos', valor: aPesos(importe), formato: 'dinero' },
      { etiqueta: 'Productos distintos', valor: acc.size, formato: 'numero' },
      ...(conCostos
        ? ([
            { etiqueta: 'Costo de lo vendido', valor: aPesos(costo), formato: 'dinero' },
            { etiqueta: 'Margen', valor: aPesos(importe - costo), formato: 'dinero' },
            { etiqueta: 'Margen %', valor: importe > 0 ? Math.round(((importe - costo) / importe) * 1000) / 10 : 0, formato: 'porciento' },
          ] as Indicador[])
        : []),
    ],
    nota: conCostos ? 'Vendido = importe con descuentos, sin envíos. Costo = unidades × costo del lote que salió (FEFO).' : 'Vendido = importe con descuentos, sin envíos.',
  }
}

/* ───────────────────────────── rotación ───────────────────────────── */

async function rotacion(ctx: Ctx, desde: string, hasta: string): Promise<Reporte> {
  const vs = await ventasDelRango(ctx, desde, hasta)
  const dias = Math.max(1, diasHasta(hasta, desde) + 1)
  const vendidas = new Map<number, number>()
  const ultima = new Map<number, string>()
  for (const v of vs)
    for (const r of v.renglones ?? []) {
      const id = idDe(r.producto)
      if (!id) continue
      vendidas.set(id, r3((vendidas.get(id) ?? 0) + n0(r.unidades)))
      if ((ultima.get(id) ?? '') < v.dia) ultima.set(id, v.dia)
    }
  const lotes = await lotesConExistencia(ctx)
  const existencia = new Map<number, number>()
  for (const l of lotes) existencia.set(idDe(l.producto)!, r3((existencia.get(idDe(l.producto)!) ?? 0) + n0(l.existencia)))
  const activos = await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { activo: { equals: true } } })
  const filas = activos.docs
    .filter((p) => vendidas.has(p.id) || existencia.has(p.id))
    .map((p) => {
      const vend = vendidas.get(p.id) ?? 0
      const ex = existencia.get(p.id) ?? 0
      const diario = vend / dias
      return { producto: p.nombre, unidad: p.unidadBase, vendidas: vend, existencia: ex, porDia: Math.round(diario * 100) / 100, cobertura: diario > 0 ? Math.round(ex / diario) : null, ultimaVenta: ultima.get(p.id) ?? null }
    })
    .sort((a, b) => (b.cobertura ?? Infinity) - (a.cobertura ?? Infinity) || b.existencia - a.existencia)
  const sinMovimiento = filas.filter((f) => f.vendidas === 0 && f.existencia > 0).length
  return {
    tipo: 'rotacion',
    titulo: 'Rotación',
    desde,
    hasta,
    columnas: [
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'unidad', etiqueta: 'Unidad', formato: 'texto' },
      { clave: 'vendidas', etiqueta: 'Vendidas', formato: 'numero' },
      { clave: 'porDia', etiqueta: 'Por día', formato: 'numero' },
      { clave: 'existencia', etiqueta: 'Existencia hoy', formato: 'numero' },
      { clave: 'cobertura', etiqueta: 'Días de cobertura', formato: 'numero' },
      { clave: 'ultimaVenta', etiqueta: 'Última venta', formato: 'fecha' },
    ],
    filas,
    indicadores: [
      { etiqueta: 'Productos con movimiento', valor: filas.filter((f) => f.vendidas > 0).length, formato: 'numero' },
      { etiqueta: 'Con existencia y sin ventas', valor: sinMovimiento, formato: 'numero' },
    ],
    nota: `Unidades base. Días de cobertura = existencia hoy ÷ promedio diario del periodo (${dias} días). Primero lo que más tarda en salir; vacío = sin ventas en el periodo.`,
  }
}

/* ───────────────────────────── caducidades ───────────────────────────── */

async function caducidades(ctx: Ctx, hasta: string): Promise<Reporte> {
  const conCostos = ctx.p.farmacia.verCostos
  const cfg = await leerConfiguracion(ctx.payload)
  const lotes = await lotesConExistencia(ctx, [{ caducidad: { less_than_equal: hasta } }])
  const prods = await productosPorId(ctx, [...new Set(lotes.map((l) => idDe(l.producto)!))])
  let vencidos = 0
  let riesgoC = 0
  const filas = lotes
    .slice()
    .sort((a, b) => a.caducidad.localeCompare(b.caducidad))
    .map((l) => {
      const p = prods.get(idDe(l.producto)!)
      const dias = diasHasta(l.caducidad, ctx.hoy)
      const estado = dias < 0 ? 'Vencido' : l.bloqueado ? 'Bloqueado' : dias <= cfg.caducidad.urgente ? 'Urgente' : p && dias <= diasAvisoDe(cfg, p.linea) ? 'Por vencer' : 'Vigente'
      if (dias < 0) vencidos++
      const valorC = (aCentavos(n0(l.existencia) * n0(l.costoUnidad)) || 0)
      riesgoC += valorC
      const fila: Record<string, string | number | null> = { producto: p?.nombre ?? 'Producto', lote: l.numeroLote, caducidad: l.caducidad, dias, existencia: n0(l.existencia), unidad: t(p?.unidadBase), estado }
      if (conCostos) fila.valor = aPesos(valorC)
      return fila
    })
  return {
    tipo: 'caducidades',
    titulo: 'Caducidades',
    desde: ctx.hoy,
    hasta,
    columnas: [
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'lote', etiqueta: 'Lote', formato: 'texto' },
      { clave: 'caducidad', etiqueta: 'Caduca', formato: 'fecha' },
      { clave: 'dias', etiqueta: 'Días', formato: 'numero' },
      { clave: 'existencia', etiqueta: 'Existencia', formato: 'numero' },
      { clave: 'unidad', etiqueta: 'Unidad', formato: 'texto' },
      { clave: 'estado', etiqueta: 'Estado', formato: 'texto' },
      ...(conCostos ? ([{ clave: 'valor', etiqueta: 'Valor al costo', formato: 'dinero' }] as Columna[]) : []),
    ],
    filas,
    indicadores: [
      { etiqueta: 'Lotes con existencia que caducan hasta esa fecha', valor: filas.length, formato: 'numero' },
      { etiqueta: 'Ya vencidos con existencia', valor: vencidos, formato: 'numero' },
      ...(conCostos ? ([{ etiqueta: 'Valor en riesgo (al costo)', valor: aPesos(riesgoC), formato: 'dinero' }] as Indicador[]) : []),
    ],
    nota: 'Lotes con existencia que caducan hasta «Hasta» (por omisión, 90 días), incluidos los ya vencidos.',
  }
}

/* ───────────────────────────── valor del inventario ───────────────────────────── */

async function inventario(ctx: Ctx): Promise<Reporte> {
  exigir(ctx, true)
  const lotes = await lotesConExistencia(ctx)
  const acc = new Map<number, { existencia: number; valor: number; lotes: number }>()
  for (const l of lotes) {
    const id = idDe(l.producto)!
    const a = acc.get(id) ?? { existencia: 0, valor: 0, lotes: 0 }
    a.existencia = r3(a.existencia + n0(l.existencia))
    a.valor += (aCentavos(n0(l.existencia) * n0(l.costoUnidad)) || 0)
    a.lotes++
    acc.set(id, a)
  }
  const prods = await productosPorId(ctx, [...acc.keys()])
  const filas = [...acc.entries()]
    .map(([id, a]) => {
      const p = prods.get(id)
      return { producto: p?.nombre ?? 'Producto', grupo: t(p?.grupo), linea: t(p?.linea), existencia: a.existencia, unidad: t(p?.unidadBase), lotes: a.lotes, costoPromedio: a.existencia > 0 ? aPesos(Math.round(a.valor / a.existencia)) : 0, valor: aPesos(a.valor) }
    })
    .sort((a, b) => b.valor - a.valor)
  const total = [...acc.values()].reduce((s, a) => s + a.valor, 0)
  return {
    tipo: 'inventario',
    titulo: 'Valor del inventario',
    desde: ctx.hoy,
    hasta: ctx.hoy,
    columnas: [
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'grupo', etiqueta: 'Grupo', formato: 'texto' },
      { clave: 'linea', etiqueta: 'Línea', formato: 'texto' },
      { clave: 'existencia', etiqueta: 'Existencia', formato: 'numero' },
      { clave: 'unidad', etiqueta: 'Unidad', formato: 'texto' },
      { clave: 'lotes', etiqueta: 'Lotes', formato: 'numero' },
      { clave: 'costoPromedio', etiqueta: 'Costo promedio', formato: 'dinero' },
      { clave: 'valor', etiqueta: 'Valor', formato: 'dinero' },
    ],
    filas,
    indicadores: [
      { etiqueta: 'Valor del inventario (al costo)', valor: aPesos(total), formato: 'dinero' },
      { etiqueta: 'Productos con existencia', valor: acc.size, formato: 'numero' },
    ],
    nota: 'Hoy, todos los almacenes, incluidos lotes vencidos o bloqueados. Valor = existencia × costo de cada lote.',
  }
}

/* ───────────────────────────── libro de control ───────────────────────────── */

async function libro(ctx: Ctx, desde: string, hasta: string): Promise<Reporte> {
  const filas = await libroControl(ctx, { desde, hasta })
  return {
    tipo: 'libro',
    titulo: 'Libro de control (Grupo I)',
    desde,
    hasta,
    columnas: [
      { clave: 'tipo', etiqueta: 'Tipo', formato: 'texto' },
      { clave: 'fecha', etiqueta: 'Fecha de salida', formato: 'fecha' },
      { clave: 'laboratorio', etiqueta: 'Laboratorio', formato: 'texto' },
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'registro', etiqueta: 'Número de registro', formato: 'texto' },
      { clave: 'lote', etiqueta: 'Lote', formato: 'texto' },
      { clave: 'compra', etiqueta: 'Fecha de compra', formato: 'fecha' },
      { clave: 'receta', etiqueta: 'Folio de receta', formato: 'texto' },
      { clave: 'mvz', etiqueta: 'MVZ', formato: 'texto' },
      { clave: 'cantidad', etiqueta: 'Cantidad', formato: 'numero' },
      { clave: 'unidad', etiqueta: 'Unidad', formato: 'texto' },
      { clave: 'animal', etiqueta: 'Animal de destino', formato: 'texto' },
      { clave: 'venta', etiqueta: 'Venta', formato: 'texto' },
    ],
    filas: filas
      .slice()
      .reverse()
      .map((a) => ({ tipo: a.tipo === 'salida' ? 'Salida' : 'Cancelación', fecha: a.fechaUso, laboratorio: a.laboratorio, producto: a.producto, registro: a.registroSenasica, lote: a.numeroLote, compra: a.fechaCompra, receta: a.folioReceta, mvz: a.mvz, cantidad: a.cantidad, unidad: a.unidad, animal: a.animal, venta: a.ventaFolio })),
    indicadores: [
      { etiqueta: 'Salidas', valor: filas.filter((a) => a.tipo === 'salida').length, formato: 'numero' },
      { etiqueta: 'Cancelaciones', valor: filas.filter((a) => a.tipo !== 'salida').length, formato: 'numero' },
    ],
    nota: 'Asientos automáticos e inmutables de cada salida de Grupo I (NOM-064-ZOO-2000).',
  }
}

/* ───────────────────────────── planes (anticipos) ───────────────────────────── */

async function planes(ctx: Ctx, hasta: string): Promise<Reporte> {
  const r = await ctx.payload.find({ collection: 'far-planes', depth: 1, pagination: false, overrideAccess: true, sort: '-createdAt', where: { modalidad: { equals: 'anual' } } })
  const pagados = (r.docs as FarPlan[]).filter((p) => p.pago?.pagadoEn && diaLocal(new Date(p.pago.pagadoEn)) <= hasta)
  const ventas = pagados.length ? await ctx.payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ plan: { in: pagados.map((p) => p.id) } }, { estado: { not_equals: 'anulada' } }, { dia: { less_than_equal: hasta } }] }, select: { plan: true, total: true, pagos: true } }) : { docs: [] }
  const entregado = new Map<number, number>()
  for (const v of ventas.docs) if (!(v.pagos ?? []).length) entregado.set(idDe(v.plan)!, (entregado.get(idDe(v.plan)!) ?? 0) + c(v.total))
  const nombre = (x: unknown, campo = 'nombre') => (typeof x === 'object' && x ? (t((x as Record<string, unknown>)[campo]) ?? '') : '')
  const filas = pagados.map((p) => {
    const tot = c(p.total)
    const ent = entregado.get(p.id) ?? 0
    return { plan: folioParaId('PLN', p.id), tutor: nombre(p.tutor), mascota: nombre(p.mascota), producto: nombre(p.producto), pagado: diaLocal(new Date(p.pago!.pagadoEn!)), estado: p.estado, entregas: `${n0(p.entregasHechas)}/${n0(p.entregasTotales)}`, cobrado: aPesos(tot), entregado: aPesos(ent), porEntregar: aPesos(Math.max(0, tot - ent)) }
  })
  const res = await resumenAnticipos(ctx.payload, hasta)
  return {
    tipo: 'planes',
    titulo: 'Anticipos de planes anuales',
    desde: '',
    hasta,
    columnas: [
      { clave: 'plan', etiqueta: 'Plan', formato: 'texto' },
      { clave: 'tutor', etiqueta: 'Tutor', formato: 'texto' },
      { clave: 'mascota', etiqueta: 'Mascota', formato: 'texto' },
      { clave: 'producto', etiqueta: 'Producto', formato: 'texto' },
      { clave: 'pagado', etiqueta: 'Pagado el', formato: 'fecha' },
      { clave: 'estado', etiqueta: 'Estado', formato: 'texto' },
      { clave: 'entregas', etiqueta: 'Entregas', formato: 'texto' },
      { clave: 'cobrado', etiqueta: 'Cobrado', formato: 'dinero' },
      { clave: 'entregado', etiqueta: 'Entregado', formato: 'dinero' },
      { clave: 'porEntregar', etiqueta: 'Por entregar', formato: 'dinero' },
    ],
    filas,
    indicadores: [
      { etiqueta: 'Cobrado por adelantado', valor: res.cobrado, formato: 'dinero' },
      { etiqueta: 'Ya entregado', valor: res.reconocido, formato: 'dinero' },
      { etiqueta: 'Por entregar (lo que se debe)', valor: res.porReconocer, formato: 'dinero' },
    ],
    nota: 'Planes anuales pagados hasta «Hasta». «Por entregar» es mercancía que la farmacia ya cobró y debe; si un plan se cancela, el reembolso sigue la política de la farmacia.',
  }
}

/* ───────────────────────────── entrada ───────────────────────────── */

export async function reporte(ctx: Ctx, tipo: string, f: { desde?: string | null; hasta?: string | null }): Promise<Reporte> {
  exigir(ctx)
  if (!TIPOS_REPORTE.includes(tipo as TipoReporte)) throw new ErrorFarmacia(404, 'Ese reporte no existe.')
  const { desde, hasta } = rango(ctx, f, tipo as TipoReporte)
  switch (tipo as TipoReporte) {
    case 'ventas':
      return ventas(ctx, desde, hasta)
    case 'productos':
      return productos(ctx, desde, hasta)
    case 'rotacion':
      return rotacion(ctx, desde, hasta)
    case 'caducidades':
      return caducidades(ctx, hasta)
    case 'inventario':
      return inventario(ctx)
    case 'libro':
      return libro(ctx, desde, hasta)
    case 'planes':
      return planes(ctx, hasta)
  }
}

const escCsv = (x: unknown) => {
  const s = x == null ? '' : String(x)
  /* Evita que una hoja de cálculo interprete fórmulas («=», «+», «-», «@») en texto libre. */
  const seguro = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/** El mismo reporte en CSV (UTF-8 con BOM, para que Excel lea los acentos). */
export async function reporteCsv(ctx: Ctx, tipo: string, f: { desde?: string | null; hasta?: string | null }): Promise<{ nombre: string; csv: string }> {
  const r = await reporte(ctx, tipo, f)
  const cab = r.columnas.map((x) => escCsv(x.etiqueta)).join(',')
  const lineas = r.filas.map((fila) => r.columnas.map((x) => escCsv(fila[x.clave])).join(','))
  const periodo = r.tipo === 'inventario' ? r.hasta : r.desde ? `${r.desde}_${r.hasta}` : r.hasta
  return { nombre: `farmacia-${r.tipo}-${periodo}.csv`, csv: '﻿' + [cab, ...lineas].join('\n') }
}
