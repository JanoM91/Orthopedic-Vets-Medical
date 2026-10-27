import type { Payload, Where } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { FarAlerta, FarLote, FarPresentacion, FarProducto, FarPromocion, FarProveedor, FarReceta, Rol, User } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { diaEnZona } from '../finanzas/reglas'
import { calcularPermisos, type Permisos, type RolGuardado } from '../permisosBase'
import { leerModulos } from '../modulos'
import { site } from '../site'
import { type Ctx, diasAvisoDe, diasHasta, ErrorFarmacia, idDe, leerConfiguracion } from './servicio'
import type { ConfiguracionVista } from './tipos'
import { escapar } from './recetas'
import { invalido, n0, noEncontrado, nOpc, persona, prohibido, sumarDias, t } from './util'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Alertas, punto de reorden, reabasto y promociones por caducidad (fase 4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `recalcular()` revisa todo el inventario y deja las alertas abiertas que
 * correspondan HOY: crea las nuevas, actualiza severidad y mensaje de las que
 * siguen y cierra solas las que ya no aplican. Una sola abierta por objeto y
 * tipo (índice único en `claveAbierta`). Una alerta DESCARTADA a mano no
 * vuelve mientras no cambie su severidad (o, en reorden, el punto propuesto):
 * descartar = «ya lo vi, no me lo repitas».
 *
 * Corre en el cron diario (08:00 de México) y con «Recalcular ahora».
 *
 * PUNTO DE REORDEN (docs/FARMACIA-PROMPT.md):
 *   R = d̄·L + z·σ·√L, z = 1.65 (95 % de servicio)
 *   d̄ y σ = media y desviación estándar muestral (n − 1) de la demanda diaria
 *   en unidades base de las últimas N semanas (8 por omisión), días sin venta
 *   incluidos como cero; demanda = ventas − devoluciones por anulación.
 *   L = días de entrega del proveedor preferente (o el valor por omisión).
 *   Se propone R redondeado hacia arriba a unidad entera si el producto tiene
 *   al menos N semanas de historia y R difiere más de 20 % del vigente
 *   (aceptado o, si no hay, el mínimo). Un humano acepta o corrige: nunca
 *   cambia solo.
 *
 * DESABASTO: disponible (lotes no vencidos ni bloqueados) ≤ punto de reorden
 * aceptado o, si no hay, el mínimo. Un producto que NUNCA ha tenido lote
 * (catálogo recién importado) no levanta alerta: sale en reabasto, sin ruido.
 *
 * REABASTO: disponible ≤ R vigente → cantidad = R + d̄ × días de cobertura −
 * disponible, redondeada hacia arriba a la presentación de compra (la de
 * mayor factor), agrupada por proveedor preferente.
 *
 * PROMOCIONES: solo Grupo III y desregulado, lote con existencia, no vencido
 * ni bloqueado. El escalón de descuento es el mayor cuyo «días antes» alcanza
 * al lote. Queda «propuesta» hasta que el encargado la aprueba; vence antes de
 * la caducidad. Grupo I y II nunca.
 */

export const Z_SERVICIO = 1.65
export const VARIACION_PARA_PROPONER = 0.2

type Sistema = { payload: Payload; hoy: string }

const sistemaDe = (ctx: Ctx): Sistema => ({ payload: ctx.payload, hoy: ctx.hoy })

/* ───────────────────────────── demanda ───────────────────────────── */

type Historia = { primeraVenta: string | null; porDia: Map<string, number> }

/** Demanda diaria por producto en la ventana [desde, hoy) y fecha de la primera venta. Consultas agregadas en SQL. */
async function historiaDeVentas(payload: Payload, desde: string, hoy: string): Promise<Map<number, Historia>> {
  const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> } }).drizzle
  const primeras = await db.execute(sql`select producto_id as p, min(dia) as d from far_movimientos where tipo = 'venta' group by producto_id`)
  const diarias = await db.execute(sql`
    select producto_id as p, dia as d,
      sum(case when tipo = 'venta' then -cantidad else 0 end) - sum(case when tipo = 'devolucion' and referencia like 'VTA-%' then cantidad else 0 end) as u
    from far_movimientos
    where dia >= ${desde} and dia < ${hoy} and (tipo = 'venta' or (tipo = 'devolucion' and referencia like 'VTA-%'))
    group by producto_id, dia`)
  const h = new Map<number, Historia>()
  for (const r of primeras.rows) h.set(Number(r.p), { primeraVenta: String(r.d), porDia: new Map() })
  for (const r of diarias.rows) {
    const x = h.get(Number(r.p)) ?? { primeraVenta: null, porDia: new Map() }
    x.porDia.set(String(r.d), Math.max(0, Number(r.u) || 0))
    h.set(Number(r.p), x)
  }
  return h
}

export type Calculo = { dBarra: number; sigma: number; L: number; R: number; dias: number; suficiente: boolean }

/** La fórmula, pura (también la usan las pruebas). */
export function puntoDeReorden(demandas: number[], L: number): { dBarra: number; sigma: number; R: number } {
  const n = demandas.length
  if (!n) return { dBarra: 0, sigma: 0, R: 0 }
  const dBarra = demandas.reduce((a, x) => a + x, 0) / n
  const varianza = n > 1 ? demandas.reduce((a, x) => a + (x - dBarra) ** 2, 0) / (n - 1) : 0
  const sigma = Math.sqrt(varianza)
  const R = dBarra * L + Z_SERVICIO * sigma * Math.sqrt(L)
  return { dBarra, sigma, R }
}

function calcular(historia: Historia | undefined, desde: string, hoy: string, dias: number, L: number): Calculo {
  const serie: number[] = []
  for (let i = 0; i < dias; i++) serie.push(historia?.porDia.get(sumarDias(desde, i)) ?? 0)
  const { dBarra, sigma, R } = puntoDeReorden(serie, L)
  const suficiente = Boolean(historia?.primeraVenta && historia.primeraVenta <= desde)
  return { dBarra, sigma, L, R: Math.ceil(R - 1e-9), dias, suficiente }
}

/* ───────────────────────────── recalcular ───────────────────────────── */

type Deseada = { tipo: FarAlerta['tipo']; objeto: string; severidad: FarAlerta['severidad']; mensaje: string; producto?: number | null; lote?: number | null; receta?: number | null; valor?: number | null }

export type ResultadoRecalculo = { abiertas: number; nuevas: number; actualizadas: number; cerradas: number; reorden: number; promociones: { nuevas: number; actualizadas: number; vencidas: number } }

const TIPOS_GESTIONADOS: FarAlerta['tipo'][] = ['caducidad', 'desabasto', 'reorden_sugerido', 'sin_rotacion', 'receta_por_validar', 'original_pendiente']

export async function recalcular(sis: Sistema): Promise<ResultadoRecalculo> {
  const { payload, hoy } = sis
  const cfg = await leerConfiguracion(payload)
  const deseadas: Deseada[] = []

  const [productos, lotes, proveedores, conHistoria] = await Promise.all([
    payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { activo: { equals: true } } }),
    payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, where: { existencia: { greater_than: 0 } } }),
    payload.find({ collection: 'far-proveedores', depth: 0, pagination: false, overrideAccess: true }),
    /* Productos que alguna vez tuvieron lote: los que nunca han llegado no levantan «desabasto» (sí salen en reabasto). */
    payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, select: { producto: true } }),
  ])
  const yaTuvo = new Set(conHistoria.docs.map((l) => idDe(l.producto)))
  const prodPorId = new Map(productos.docs.map((p) => [p.id, p]))
  const provPorId = new Map(proveedores.docs.map((p) => [p.id, p]))

  /* Caducidad por lote */
  const disponible = new Map<number, number>()
  const fisica = new Map<number, number>()
  const loteMasViejo = new Map<number, string>()
  for (const l of lotes.docs) {
    const pid = idDe(l.producto)!
    const p = prodPorId.get(pid)
    fisica.set(pid, (fisica.get(pid) ?? 0) + n0(l.existencia))
    const fechaEntrada = l.createdAt.slice(0, 10)
    if (!loteMasViejo.has(pid) || fechaEntrada < loteMasViejo.get(pid)!) loteMasViejo.set(pid, fechaEntrada)
    const dias = diasHasta(l.caducidad, hoy)
    if (!l.bloqueado && dias >= 0) disponible.set(pid, (disponible.get(pid) ?? 0) + n0(l.existencia))
    if (!p) continue
    const aviso = diasAvisoDe(cfg, p.linea)
    const nombre = `${p.nombre} · lote ${l.numeroLote} (${folioParaId('LOT', l.id)})`
    if (dias < 0) deseadas.push({ tipo: 'caducidad', objeto: `lote-${l.id}`, severidad: 'critica', mensaje: `${nombre} venció el ${l.caducidad}: retirar (${n0(l.existencia)} ${p.unidadBase}).`, producto: p.id, lote: l.id, valor: dias })
    else if (dias <= cfg.caducidad.urgente) deseadas.push({ tipo: 'caducidad', objeto: `lote-${l.id}`, severidad: 'urgente', mensaje: `${nombre} caduca en ${dias} días (${l.caducidad}).`, producto: p.id, lote: l.id, valor: dias })
    else if (dias <= aviso) deseadas.push({ tipo: 'caducidad', objeto: `lote-${l.id}`, severidad: 'aviso', mensaje: `${nombre} caduca en ${dias} días (${l.caducidad}).`, producto: p.id, lote: l.id, valor: dias })
  }

  /* Historia de ventas para reorden y sin rotación */
  const dias = Math.max(7, cfg.aprendizaje.semanasHistorial * 7)
  const desde = sumarDias(hoy, -dias)
  const historia = await historiaDeVentas(payload, sumarDias(hoy, -Math.max(dias, cfg.aprendizaje.diasSinRotacion)), hoy)
  let reorden = 0
  for (const p of productos.docs) {
    const disp = disponible.get(p.id) ?? 0
    const umbral = nOpc(p.puntoReordenAceptado) ?? n0(p.minimoInventario)
    /* Desabasto */
    if (umbral > 0 && disp <= umbral && yaTuvo.has(p.id)) {
      deseadas.push({ tipo: 'desabasto', objeto: `producto-${p.id}`, severidad: disp <= 0 ? 'critica' : 'urgente', mensaje: disp <= 0 ? `${p.nombre}: sin existencia vendible (mínimo ${umbral} ${p.unidadBase}).` : `${p.nombre}: quedan ${disp} ${p.unidadBase} (mínimo ${umbral}).`, producto: p.id, valor: disp })
    }
    /* Punto de reorden que aprende */
    const prov = idDe(p.proveedorPreferente) ? provPorId.get(idDe(p.proveedorPreferente)!) : undefined
    const L = prov && n0(prov.diasEntrega) > 0 ? n0(prov.diasEntrega) : cfg.aprendizaje.diasEntregaPorOmision || 1
    const calc = calcular(historia.get(p.id), desde, hoy, dias, L)
    if (calc.suficiente && calc.R > 0) {
      const vigente = umbral
      const difiere = vigente <= 0 ? true : Math.abs(calc.R - vigente) / vigente > VARIACION_PARA_PROPONER
      if (difiere) {
        reorden++
        if (nOpc(p.puntoReordenPropuesto) !== calc.R) await payload.update({ collection: 'far-productos', id: p.id, overrideAccess: true, depth: 0, data: { puntoReordenPropuesto: calc.R } })
        deseadas.push({ tipo: 'reorden_sugerido', objeto: `producto-${p.id}`, severidad: 'aviso', mensaje: `${p.nombre}: con ${cfg.aprendizaje.semanasHistorial} semanas de ventas (≈${calc.dBarra.toFixed(2)} ${p.unidadBase}/día, entrega ${L} días) el punto de reorden sugerido es ${calc.R}; hoy es ${vigente || 'sin mínimo'}.`, producto: p.id, valor: calc.R })
      }
    }
    /* Sin rotación */
    const sinVentaDesde = sumarDias(hoy, -cfg.aprendizaje.diasSinRotacion)
    const h = historia.get(p.id)
    const vendioReciente = h ? [...h.porDia.entries()].some(([d, u]) => d >= sinVentaDesde && u > 0) : false
    if ((fisica.get(p.id) ?? 0) > 0 && !vendioReciente && (loteMasViejo.get(p.id) ?? hoy) <= sinVentaDesde) {
      deseadas.push({ tipo: 'sin_rotacion', objeto: `producto-${p.id}`, severidad: 'aviso', mensaje: `${p.nombre}: sin ventas en ${cfg.aprendizaje.diasSinRotacion} días (${fisica.get(p.id)} ${p.unidadBase} en existencia).`, producto: p.id, valor: fisica.get(p.id) ?? 0 })
    }
  }

  /* Recetas */
  const porValidar = await payload.find({ collection: 'far-recetas', depth: 0, pagination: false, overrideAccess: true, where: { estado: { equals: 'por_validar' } } })
  for (const r of porValidar.docs) deseadas.push({ tipo: 'receta_por_validar', objeto: `receta-${r.id}`, severidad: diasHasta(r.createdAt.slice(0, 10), hoy) < -1 ? 'urgente' : 'aviso', mensaje: `Receta ${folioParaId('REC', r.id)} de ${r.mvzNombre} por validar.`, receta: r.id })
  const originales = await payload.find({ collection: 'far-recetas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ estado: { equals: 'valida' } }, { origen: { equals: 'externa' } }, { originalRecibido: { not_equals: true } }] } })
  for (const r of originales.docs) deseadas.push({ tipo: 'original_pendiente', objeto: `receta-${r.id}`, severidad: 'aviso', mensaje: `Falta el original físico de la receta ${folioParaId('REC', r.id)} (${r.mvzNombre}).`, receta: r.id })

  const res = await sincronizar(payload, deseadas)
  const promos = await sincronizarPromociones(sis, cfg, prodPorId, lotes.docs)
  return { ...res, reorden, promociones: promos }
}

async function sincronizar(payload: Payload, deseadas: Deseada[]): Promise<Omit<ResultadoRecalculo, 'reorden' | 'promociones'>> {
  const ahora = new Date().toISOString()
  const abiertas = await payload.find({ collection: 'far-alertas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ estado: { equals: 'abierta' } }, { tipo: { in: TIPOS_GESTIONADOS } }] } })
  const porClave = new Map(abiertas.docs.map((a) => [`${a.tipo}:${a.objeto}`, a]))
  const quedan = new Set<string>()
  let nuevas = 0
  let actualizadas = 0
  for (const d of deseadas) {
    const clave = `${d.tipo}:${d.objeto}`
    if (quedan.has(clave)) continue
    quedan.add(clave)
    const ya = porClave.get(clave)
    if (ya) {
      if (ya.severidad !== d.severidad || ya.mensaje !== d.mensaje || nOpc(ya.valor) !== (d.valor ?? null)) {
        await payload.update({ collection: 'far-alertas', id: ya.id, overrideAccess: true, depth: 0, data: { severidad: d.severidad, mensaje: d.mensaje, valor: d.valor ?? null, actualizadaEn: ahora } })
        actualizadas++
      }
      continue
    }
    /* ¿La descartaron con la misma severidad (y valor, en reorden)? Entonces no se repite. */
    const descartada = await payload.find({ collection: 'far-alertas', depth: 0, limit: 1, overrideAccess: true, sort: '-cerradaEn', where: { and: [{ tipo: { equals: d.tipo } }, { objeto: { equals: d.objeto } }, { estado: { equals: 'descartada' } }] } })
    const ult = descartada.docs[0]
    if (ult && ult.severidad === d.severidad && (d.tipo !== 'reorden_sugerido' || nOpc(ult.valor) === (d.valor ?? null))) continue
    try {
      await payload.create({
        collection: 'far-alertas',
        overrideAccess: true,
        depth: 0,
        data: { tipo: d.tipo, objeto: d.objeto, claveAbierta: clave, severidad: d.severidad, estado: 'abierta', mensaje: d.mensaje, producto: d.producto ?? null, lote: d.lote ?? null, receta: d.receta ?? null, valor: d.valor ?? null, abiertaEn: ahora, actualizadaEn: ahora },
      })
      nuevas++
    } catch (e) {
      /* Otra corrida simultánea ya la abrió: el índice único lo impide. */
      if (!/unique|duplicate|clave_abierta/i.test(String((e as Error)?.message))) throw e
    }
  }
  let cerradas = 0
  for (const a of abiertas.docs) {
    if (quedan.has(`${a.tipo}:${a.objeto}`)) continue
    await payload.update({ collection: 'far-alertas', id: a.id, overrideAccess: true, depth: 0, data: { estado: 'atendida', claveAbierta: null, cierreAutomatico: true, cerradaEn: ahora, nota: 'Se resolvió sola (ya no aplica).' } })
    cerradas++
  }
  const total = await payload.count({ collection: 'far-alertas', overrideAccess: true, where: { estado: { equals: 'abierta' } } })
  return { abiertas: total.totalDocs, nuevas, actualizadas, cerradas }
}

/** Descuento del escalón que alcanza al lote (el mayor de los que aplican), o null. */
export function escalonPara(dias: number, escalones: ConfiguracionVista['promociones']): number | null {
  const aplican = escalones.filter((e) => dias <= e.diasAntes)
  return aplican.length ? Math.max(...aplican.map((e) => e.descuentoPorciento)) : null
}

async function sincronizarPromociones(sis: Sistema, cfg: ConfiguracionVista, prodPorId: Map<number, FarProducto>, lotes: FarLote[]): Promise<ResultadoRecalculo['promociones']> {
  const { payload, hoy } = sis
  const ahora = new Date().toISOString()
  const abiertas = await payload.find({ collection: 'far-promociones', depth: 0, pagination: false, overrideAccess: true, where: { estado: { in: ['propuesta', 'aprobada'] } } })
  const porLote = new Map(abiertas.docs.filter((x) => idDe(x.lote)).map((x) => [idDe(x.lote)!, x]))
  const loteVivo = new Map(lotes.map((l) => [l.id, l]))
  let nuevas = 0
  let actualizadas = 0
  let vencidas = 0
  for (const l of lotes) {
    const p = prodPorId.get(idDe(l.producto)!)
    if (!p || (p.grupo !== 'III' && p.grupo !== 'desregulado') || l.bloqueado) continue
    const dias = diasHasta(l.caducidad, hoy)
    if (dias < 1) continue
    const descuento = escalonPara(dias, cfg.promociones)
    if (descuento == null) continue
    const hasta = sumarDias(l.caducidad, -1)
    const titulo = `${p.nombre} · lote ${l.numeroLote}: −${descuento}%`
    const ya = porLote.get(l.id)
    if (ya) {
      if (ya.estado === 'propuesta' && (ya.descuentoPorciento !== descuento || ya.diasParaCaducar !== dias)) {
        await payload.update({ collection: 'far-promociones', id: ya.id, overrideAccess: true, depth: 0, data: { descuentoPorciento: descuento, diasParaCaducar: dias, titulo, vigenteHasta: hasta } })
        actualizadas++
      }
      continue
    }
    const rechazada = await payload.find({ collection: 'far-promociones', depth: 0, limit: 1, overrideAccess: true, sort: '-decididaEn', where: { and: [{ lote: { equals: l.id } }, { estado: { equals: 'rechazada' } }] } })
    if (rechazada.docs[0] && rechazada.docs[0].descuentoPorciento === descuento) continue
    try {
      await payload.create({ collection: 'far-promociones', overrideAccess: true, depth: 0, data: { titulo, producto: p.id, lote: l.id, descuentoPorciento: descuento, diasParaCaducar: dias, vigenteDesde: hoy, vigenteHasta: hasta, origen: 'caducidad', estado: 'propuesta', claveAbierta: `lote-${l.id}` } })
      nuevas++
    } catch (e) {
      if (!/unique|duplicate|clave_abierta/i.test(String((e as Error)?.message))) throw e
    }
  }
  /* Vencen las que ya no tienen lote vivo, llegaron a su fecha o el lote venció. */
  for (const x of abiertas.docs) {
    const l = idDe(x.lote) ? loteVivo.get(idDe(x.lote)!) : undefined
    if (!l || x.vigenteHasta < hoy || diasHasta(l.caducidad, hoy) < 1) {
      await payload.update({ collection: 'far-promociones', id: x.id, overrideAccess: true, depth: 0, data: { estado: 'vencida', claveAbierta: null, decididaEn: x.decididaEn ?? ahora, motivo: x.motivo ?? 'Venció o el lote se agotó.' } })
      vencidas++
    }
  }
  return { nuevas, actualizadas, vencidas }
}

/* ───────────────────────────── vistas y acciones ───────────────────────────── */

export type AlertaVista = {
  id: number
  tipo: FarAlerta['tipo']
  severidad: FarAlerta['severidad']
  estado: FarAlerta['estado']
  mensaje: string
  productoId: number | null
  loteId: number | null
  recetaId: number | null
  valor: number | null
  abiertaEn: string
  actualizadaEn: string | null
  cerradaEn: string | null
  cerradaPor: { id: number; nombre: string } | null
  cierreAutomatico: boolean
  nota: string | null
}

const vistaAlerta = (a: FarAlerta): AlertaVista => ({
  id: a.id,
  tipo: a.tipo,
  severidad: a.severidad,
  estado: a.estado,
  mensaje: a.mensaje,
  productoId: idDe(a.producto),
  loteId: idDe(a.lote),
  recetaId: idDe(a.receta),
  valor: nOpc(a.valor),
  abiertaEn: a.abiertaEn,
  actualizadaEn: a.actualizadaEn ?? null,
  cerradaEn: a.cerradaEn ?? null,
  cerradaPor: persona(a.cerradaPor),
  cierreAutomatico: Boolean(a.cierreAutomatico),
  nota: t(a.nota),
})

function exigirModulo(ctx: Ctx): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
}
function exigirAlgo(ctx: Ctx): void {
  exigirModulo(ctx)
  if (!(ctx.p.superadmin || Object.values(ctx.p.farmacia).some(Boolean))) throw prohibido('Tu rol no incluye la farmacia.')
}
function exigir(ctx: Ctx, permisos: (keyof Permisos['farmacia'])[], mensaje: string): void {
  exigirModulo(ctx)
  if (!permisos.some((p) => ctx.p.farmacia[p])) throw prohibido(mensaje)
}

const SEVERIDAD_ORDEN: Record<string, number> = { critica: 0, urgente: 1, aviso: 2 }

export async function alertas(ctx: Ctx, f: { estado?: string | null; tipo?: string | null }): Promise<{ alertas: AlertaVista[]; porTipo: Record<string, number> }> {
  exigirAlgo(ctx)
  const where: Where[] = [{ estado: { equals: f.estado && ['abierta', 'atendida', 'descartada'].includes(f.estado) ? f.estado : 'abierta' } }]
  if (f.tipo) where.push({ tipo: { equals: f.tipo } })
  const r = await ctx.payload.find({ collection: 'far-alertas', depth: 1, limit: 300, overrideAccess: true, sort: '-abiertaEn', where: { and: where } })
  const abiertas = await ctx.payload.find({ collection: 'far-alertas', depth: 0, pagination: false, overrideAccess: true, where: { estado: { equals: 'abierta' } }, select: { tipo: true } })
  const porTipo: Record<string, number> = {}
  for (const a of abiertas.docs) porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1
  const lista = r.docs.map(vistaAlerta)
  if ((f.estado ?? 'abierta') === 'abierta') lista.sort((a, b) => SEVERIDAD_ORDEN[a.severidad] - SEVERIDAD_ORDEN[b.severidad] || b.abiertaEn.localeCompare(a.abiertaEn))
  return { alertas: lista, porTipo }
}

export async function recalcularAhora(ctx: Ctx): Promise<ResultadoRecalculo> {
  exigir(ctx, ['aprobar', 'ajustes'], 'Recalcular las alertas lo hace el encargado o un rol superior.')
  return recalcular(sistemaDe(ctx))
}

export async function cerrarAlerta(ctx: Ctx, id: number, como: 'atendida' | 'descartada', entrada: unknown): Promise<AlertaVista> {
  exigir(ctx, ['aprobar', 'ajustes', 'recetas'], 'Atender o descartar alertas lo hace el encargado o un rol superior.')
  const d = z.object({ nota: z.string().trim().max(300).nullable().optional() }).safeParse(entrada ?? {})
  const a = await ctx.payload.findByID({ collection: 'far-alertas', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!a) throw noEncontrado('No encontramos esa alerta.')
  if (a.estado !== 'abierta') return vistaAlerta(a)
  const act = await ctx.payload.update({ collection: 'far-alertas', id, overrideAccess: true, depth: 1, data: { estado: como, claveAbierta: null, cerradaEn: new Date().toISOString(), cerradaPor: ctx.user.id, nota: (d.success && t(d.data.nota)) || (como === 'descartada' ? 'Descartada: no se repite mientras no cambie.' : null) } })
  return vistaAlerta(act)
}

/* ───────── punto de reorden ───────── */

export async function aceptarReorden(ctx: Ctx, productoId: number, entrada: unknown): Promise<{ productoId: number; puntoReordenAceptado: number }> {
  exigir(ctx, ['aprobar'], 'Aceptar puntos de reorden lo hace el encargado o el dueño.')
  const d = z.object({ valor: z.coerce.number().min(0).nullable().optional() }).safeParse(entrada ?? {})
  if (!d.success) throw invalido('El punto de reorden debe ser un número.')
  const p = await ctx.payload.findByID({ collection: 'far-productos', id: productoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese producto.')
  const valor = d.data.valor ?? nOpc(p.puntoReordenPropuesto)
  if (valor == null) throw invalido('Este producto no tiene un punto de reorden propuesto.')
  await ctx.payload.update({ collection: 'far-productos', id: p.id, overrideAccess: true, depth: 0, data: { puntoReordenAceptado: valor } })
  const abierta = await ctx.payload.find({ collection: 'far-alertas', depth: 0, limit: 1, overrideAccess: true, where: { claveAbierta: { equals: `reorden_sugerido:producto-${p.id}` } } })
  if (abierta.docs[0]) await ctx.payload.update({ collection: 'far-alertas', id: abierta.docs[0].id, overrideAccess: true, depth: 0, data: { estado: 'atendida', claveAbierta: null, cerradaEn: new Date().toISOString(), cerradaPor: ctx.user.id, nota: `Aceptado: ${valor}${d.data.valor != null && d.data.valor !== nOpc(p.puntoReordenPropuesto) ? ` (propuesto ${p.puntoReordenPropuesto})` : ''}.` } })
  return { productoId: p.id, puntoReordenAceptado: valor }
}

/* ───────── reabasto ───────── */

export type RenglonReabasto = {
  productoId: number
  producto: string
  unidadBase: string
  disponible: number
  puntoReorden: number
  demandaDiaria: number
  cantidadUnidades: number
  presentacion: { id: number; nombre: string; factor: number } | null
  paquetes: number | null
}
export type GrupoReabasto = { proveedor: { id: number; nombre: string; diasEntrega: number; telefono: string | null } | null; renglones: RenglonReabasto[]; texto: string }

export async function reabasto(ctx: Ctx): Promise<{ grupos: GrupoReabasto[]; diasCobertura: number }> {
  exigir(ctx, ['recibirCompras', 'aprobar', 'reportes'], 'La lista de reabasto es del encargado o el dueño.')
  const cfg = await leerConfiguracion(ctx.payload)
  const [productos, lotes, proveedores, presentaciones] = await Promise.all([
    ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { activo: { equals: true } } }),
    ctx.payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ existencia: { greater_than: 0 } }, { bloqueado: { not_equals: true } }, { caducidad: { greater_than_equal: ctx.hoy } }] } }),
    ctx.payload.find({ collection: 'far-proveedores', depth: 0, pagination: false, overrideAccess: true }),
    ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, where: { activa: { equals: true } } }),
  ])
  const disp = new Map<number, number>()
  for (const l of lotes.docs) disp.set(idDe(l.producto)!, (disp.get(idDe(l.producto)!) ?? 0) + n0(l.existencia))
  const provPorId = new Map(proveedores.docs.map((p) => [p.id, p]))
  const presDe = new Map<number, FarPresentacion[]>()
  for (const x of presentaciones.docs) presDe.set(idDe(x.producto)!, [...(presDe.get(idDe(x.producto)!) ?? []), x])
  const dias = Math.max(7, cfg.aprendizaje.semanasHistorial * 7)
  const desde = sumarDias(ctx.hoy, -dias)
  const historia = await historiaDeVentas(ctx.payload, desde, ctx.hoy)
  const grupos = new Map<number | 0, GrupoReabasto>()
  for (const p of productos.docs) {
    const R = nOpc(p.puntoReordenAceptado) ?? n0(p.minimoInventario)
    const d = disp.get(p.id) ?? 0
    if (!(R > 0) || d > R) continue
    const calc = calcular(historia.get(p.id), desde, ctx.hoy, dias, 1)
    const cantidad = Math.max(0, R + calc.dBarra * cfg.aprendizaje.diasCobertura - d)
    const compra = [...(presDe.get(p.id) ?? [])].sort((a, b) => Number(a.fraccionada) - Number(b.fraccionada) || n0(b.factor) - n0(a.factor))[0]
    const factor = compra ? n0(compra.factor) || 1 : 1
    const paquetes = compra ? Math.max(1, Math.ceil(cantidad / factor - 1e-9)) : null
    const provId = idDe(p.proveedorPreferente) ?? 0
    const prov = provId ? provPorId.get(provId) : undefined
    const g = grupos.get(provId) ?? { proveedor: prov ? { id: prov.id, nombre: prov.nombre, diasEntrega: n0(prov.diasEntrega), telefono: t(prov.contacto?.telefono) } : null, renglones: [], texto: '' }
    g.renglones.push({ productoId: p.id, producto: p.nombre, unidadBase: p.unidadBase, disponible: d, puntoReorden: R, demandaDiaria: Math.round(calc.dBarra * 100) / 100, cantidadUnidades: Math.ceil(cantidad - 1e-9), presentacion: compra ? { id: compra.id, nombre: compra.nombre, factor } : null, paquetes })
    grupos.set(provId, g)
  }
  const lista = [...grupos.values()].sort((a, b) => (a.proveedor ? a.proveedor.nombre : '~').localeCompare(b.proveedor ? b.proveedor.nombre : '~', 'es'))
  for (const g of lista) {
    g.renglones.sort((a, b) => a.producto.localeCompare(b.producto, 'es'))
    g.texto = [`Pedido sugerido · ${site.brand.name}`, g.proveedor ? `Proveedor: ${g.proveedor.nombre}` : 'Sin proveedor preferente', '', ...g.renglones.map((r) => (r.presentacion && r.paquetes ? `• ${r.paquetes} × ${r.producto} · ${r.presentacion.nombre}` : `• ${r.cantidadUnidades} ${r.unidadBase} de ${r.producto}`)), '', 'Gracias.'].join('\n')
  }
  return { grupos: lista, diasCobertura: cfg.aprendizaje.diasCobertura }
}

export async function reabastoCsv(ctx: Ctx): Promise<string> {
  const { grupos } = await reabasto(ctx)
  const esc = (x: unknown) => {
    const s = x == null ? '' : String(x)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cab = ['Proveedor', 'Producto', 'Presentación de compra', 'Paquetes', 'Unidades base', 'Unidad', 'Disponible', 'Punto de reorden', 'Demanda diaria']
  const filas = grupos.flatMap((g) => g.renglones.map((r) => [g.proveedor?.nombre ?? 'Sin proveedor', r.producto, r.presentacion?.nombre ?? '', r.paquetes ?? '', r.cantidadUnidades, r.unidadBase, r.disponible, r.puntoReorden, r.demandaDiaria].map(esc).join(',')))
  return '﻿' + [cab.join(','), ...filas].join('\n')
}

/* ───────── promociones ───────── */

export type PromocionVista = { id: number; titulo: string; productoId: number; loteId: number | null; numeroLote: string | null; caducidad: string | null; descuentoPorciento: number; diasParaCaducar: number | null; vigenteDesde: string; vigenteHasta: string; origen: string; estado: FarPromocion['estado']; decididaPor: { id: number; nombre: string } | null; decididaEn: string | null; motivo: string | null }

const vistaPromocion = (x: FarPromocion): PromocionVista => {
  const l = typeof x.lote === 'object' && x.lote ? (x.lote as FarLote) : null
  return { id: x.id, titulo: x.titulo, productoId: idDe(x.producto)!, loteId: idDe(x.lote), numeroLote: l?.numeroLote ?? null, caducidad: l?.caducidad ?? null, descuentoPorciento: x.descuentoPorciento, diasParaCaducar: nOpc(x.diasParaCaducar), vigenteDesde: x.vigenteDesde, vigenteHasta: x.vigenteHasta, origen: x.origen, estado: x.estado, decididaPor: persona(x.decididaPor), decididaEn: x.decididaEn ?? null, motivo: t(x.motivo) }
}

export async function promociones(ctx: Ctx, f: { estado?: string | null }): Promise<PromocionVista[]> {
  exigir(ctx, ['vender', 'aprobar'], 'Tu rol no incluye la farmacia.')
  const estado = f.estado && ['propuesta', 'aprobada', 'rechazada', 'vencida'].includes(f.estado) ? f.estado : null
  const r = await ctx.payload.find({ collection: 'far-promociones', depth: 1, limit: 200, overrideAccess: true, sort: estado === 'propuesta' ? 'vigenteHasta' : '-updatedAt', where: estado ? { estado: { equals: estado } } : undefined })
  return r.docs.map(vistaPromocion)
}

export async function decidirPromocion(ctx: Ctx, id: number, entrada: unknown): Promise<PromocionVista> {
  exigir(ctx, ['aprobar'], 'Aprobar promociones lo hace el encargado o el dueño.')
  const d = z.object({ decision: z.enum(['aprobada', 'rechazada']), descuentoPorciento: z.coerce.number().int().min(1).max(90).optional(), motivo: z.string().trim().max(200).nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Indica si apruebas o rechazas la promoción.')
  const x = await ctx.payload.findByID({ collection: 'far-promociones', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!x) throw noEncontrado('No encontramos esa promoción.')
  if (x.estado !== 'propuesta') throw invalido('Solo se decide una promoción propuesta.')
  /* Defensa: aunque se hubiera creado por error, una promoción de Grupo I o II no se aprueba. */
  const p = await ctx.payload.findByID({ collection: 'far-productos', id: idDe(x.producto)!, depth: 0, overrideAccess: true })
  if (d.data.decision === 'aprobada' && (p.grupo === 'I' || p.grupo === 'II')) throw invalido('Los productos de Grupo I y II nunca llevan promoción.')
  const act = await ctx.payload.update({
    collection: 'far-promociones',
    id,
    overrideAccess: true,
    depth: 1,
    data: { estado: d.data.decision, claveAbierta: d.data.decision === 'aprobada' ? x.claveAbierta : null, descuentoPorciento: d.data.descuentoPorciento ?? x.descuentoPorciento, decididaPor: ctx.user.id, decididaEn: new Date().toISOString(), motivo: t(d.data.motivo) },
  })
  return vistaPromocion(act)
}

/* ───────────────────────────── cron diario ───────────────────────────── */

export type ResultadoCron = { omitido?: string; recalculo?: ResultadoRecalculo; correo: 'enviado' | 'ya_enviado' | 'sin_destinatarios' | 'sin_novedades' | 'omitido'; destinatarios: number; dia: string }

/**
 * Lo llama Vercel Cron todos los días a las 08:00 de México (14:00 UTC en
 * vercel.json) con `Authorization: Bearer $CRON_SECRET`. Recalcula alertas y
 * promociones y manda UN solo correo resumen a quien tiene «Reportes» (y a los
 * correos extra de la configuración). Si se llama dos veces el mismo día,
 * recalcula pero no repite el correo. Sin RESEND_API_KEY no manda nada y no
 * falla (lib/emailAdapter.ts).
 */
export async function cronDiario(payload: Payload, ahora = new Date()): Promise<ResultadoCron> {
  const hoy = diaEnZona(ahora, site.location.timeZone)
  const modulos = await leerModulos(payload)
  if (!modulos.farmacia) return { omitido: 'El módulo de Farmacia está apagado.', correo: 'omitido', destinatarios: 0, dia: hoy }
  const recalculo = await recalcular({ payload, hoy })
  const cfg = (await payload.findGlobal({ slug: 'farmacia-configuracion', depth: 0, overrideAccess: true })) as { ultimoResumen?: string | null; correosAlertas?: string | null }
  if (cfg.ultimoResumen === hoy) return { recalculo, correo: 'ya_enviado', destinatarios: 0, dia: hoy }
  const abiertas = await payload.find({ collection: 'far-alertas', depth: 0, pagination: false, overrideAccess: true, where: { estado: { equals: 'abierta' } } })
  const propuestas = await payload.find({ collection: 'far-promociones', depth: 0, pagination: false, overrideAccess: true, where: { estado: { equals: 'propuesta' } } })
  if (!abiertas.totalDocs && !propuestas.totalDocs) {
    await payload.updateGlobal({ slug: 'farmacia-configuracion', overrideAccess: true, data: { ultimoResumen: hoy } })
    return { recalculo, correo: 'sin_novedades', destinatarios: 0, dia: hoy }
  }
  const destinatarios = await destinatariosResumen(payload, cfg.correosAlertas ?? null)
  /* Se marca ANTES de mandar: si el envío fallara a medias, preferimos no repetir el correo a todo el equipo. */
  await payload.updateGlobal({ slug: 'farmacia-configuracion', overrideAccess: true, data: { ultimoResumen: hoy } })
  if (!destinatarios.length) return { recalculo, correo: 'sin_destinatarios', destinatarios: 0, dia: hoy }
  await payload
    .sendEmail({ to: destinatarios, subject: `Farmacia · resumen del ${hoy}: ${abiertas.totalDocs} alerta${abiertas.totalDocs === 1 ? '' : 's'}`, html: htmlResumen(hoy, abiertas.docs, propuestas.totalDocs) })
    .catch((e: unknown) => payload.logger.error(`[farmacia/cron] no se mandó el resumen: ${String(e)}`))
  return { recalculo, correo: 'enviado', destinatarios: destinatarios.length, dia: hoy }
}

async function destinatariosResumen(payload: Payload, extra: string | null): Promise<string[]> {
  const usuarios = await payload.find({ collection: 'users', depth: 0, pagination: false, overrideAccess: true })
  const roles = await payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true })
  const rolPorId = new Map(roles.docs.map((r) => [r.id, r as Rol]))
  const correos = new Set<string>()
  for (const u of usuarios.docs as User[]) {
    if (!u.email) continue
    const p = calcularPermisos(u, (rolPorId.get(idDe(u.rolDeAcceso) ?? 0) as unknown as RolGuardado) ?? null)
    if (p.superadmin || p.farmacia.reportes) correos.add(u.email.toLowerCase())
  }
  for (const x of (extra ?? '').split(/[,;\s]+/)) if (x.includes('@')) correos.add(x.trim().toLowerCase())
  return [...correos]
}

const ETIQUETA: Record<string, string> = { caducidad: 'Caducidad', desabasto: 'Desabasto', reorden_sugerido: 'Punto de reorden sugerido', sin_rotacion: 'Sin rotación', receta_por_validar: 'Recetas por validar', original_pendiente: 'Originales pendientes', plan_por_renovar: 'Planes por renovar' }

function htmlResumen(hoy: string, abiertas: FarAlerta[], propuestas: number): string {
  const porTipo = new Map<string, FarAlerta[]>()
  for (const a of [...abiertas].sort((x, y) => SEVERIDAD_ORDEN[x.severidad] - SEVERIDAD_ORDEN[y.severidad])) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a])
  const url = `${site.url.replace(/\/$/, '')}/admin/farmacia/alertas`
  const secciones = [...porTipo.entries()]
    .map(([tipo, xs]) => `<h3 style="margin:16px 0 6px;font-size:15px">${ETIQUETA[tipo] ?? tipo} (${xs.length})</h3><ul style="margin:0;padding-left:18px">${xs.slice(0, 15).map((a) => `<li>${a.severidad === 'critica' ? '<b style="color:#b42330">Crítica</b> · ' : a.severidad === 'urgente' ? '<b style="color:#b45309">Urgente</b> · ' : ''}${escapar(a.mensaje)}</li>`).join('')}${xs.length > 15 ? `<li>…y ${xs.length - 15} más</li>` : ''}</ul>`)
    .join('')
  return `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:620px"><h2 style="margin:0 0 4px">Farmacia · ${escapar(site.brand.name)}</h2><p style="margin:0;color:#475569">Resumen del ${hoy}: ${abiertas.length} alerta${abiertas.length === 1 ? '' : 's'} abierta${abiertas.length === 1 ? '' : 's'}${propuestas ? ` y ${propuestas} promoción${propuestas === 1 ? '' : 'es'} por aprobar` : ''}.</p>${secciones}<p style="margin-top:18px"><a href="${url}" style="background:${site.brand.accent};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir alertas</a></p><p style="color:#64748b;font-size:12px">Este correo sale una vez al día. Para dejar de recibirlo, pide que quiten «Reportes» de tu rol.</p></div>`
}

export type { FarProveedor, FarReceta }
