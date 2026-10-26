import type { Payload, PayloadRequest, Where } from 'payload'
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

import type { FarCompra, FarLote, FarPresentacion, FarProducto, FarProveedor, User } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { anular as anularEnFinanzas, type Ctx as CtxFinanzas, registrar as registrarEnFinanzas } from '../finanzas/servicio'
import { calcularPermisos } from '../permisosBase'
import {
  almacenPorOmision,
  type Ctx,
  enTransaccion,
  ErrorFarmacia,
  idDe,
  leerConfiguracion,
  registrarMovimiento,
  vistaLote,
} from './servicio'
import type { CfdiLeido, CompraBreve, CompraVista, LoteVista, PersonaBreve, RenglonCompraVista, RenglonConteo, ResultadoConteo } from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Compras e inventario operativo (fase 2, docs/FARMACIA-PROMPT.md)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - Una compra nace en «borrador» desde el XML CFDI 4.0 de la factura
 *   (`leerCfdi` → `crearCompraDesdeXml`) o a mano (`crearCompraManual`).
 * - Cada renglón se liga a una presentación. Las claves del proveedor
 *   (NoIdentificacion del XML) se aprenden en `far-proveedor-claves`: la
 *   segunda factura del mismo proveedor llega ya relacionada.
 * - Lote y caducidad se capturan SIEMPRE a mano; sin ellos no se recibe.
 * - `recibirCompra`: en una transacción con candado crea o reutiliza lotes,
 *   registra movimientos tipo compra (costo por unidad base = valor unitario
 *   sin IVA ÷ factor) y guarda las claves. Después, fuera de esa transacción
 *   y con clave de idempotencia `compra-<id>`, crea el GASTO en Finanzas
 *   (contado = realizado con cuenta; crédito = pendiente con vencimiento).
 *   Si Finanzas falla, la compra queda recibida sin gasto y se reintenta.
 * - `anularCompra`: solo si ningún lote de la compra tuvo salidas; genera
 *   movimientos inversos y anula el gasto en Finanzas con el motivo.
 * - Conteo físico: `renglonesConteo` lista lotes con existencia y
 *   `aplicarConteo` registra un ajuste por cada diferencia, con motivo.
 *
 * DEPENDENCIA NUEVA: `fast-xml-parser` (sin dependencias, ~50 KB) para leer
 * el CFDI; Node no trae analizador XML y escribirlo a mano para el SAT es
 * frágil (prefijos de espacio de nombres, atributos entre comillas simples).
 */

const prohibido = (m = 'Tu rol no permite hacer esto en la farmacia.') => new ErrorFarmacia(403, m)
const invalido = (m: string) => new ErrorFarmacia(400, m)
const noEncontrado = (m = 'No encontramos esa compra.') => new ErrorFarmacia(404, m)

const t = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}
const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const nOpc = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const persona = (u: unknown): PersonaBreve | null => {
  if (!u) return null
  if (typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u), nombre: 'Usuario' }
}
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000

function exigir(ctx: Ctx, permiso: 'recibirCompras' | 'ajustes', mensaje?: string): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia[permiso]) throw prohibido(mensaje)
}

/* ───────────────────────────── CFDI ───────────────────────────── */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseAttributeValue: false, trimValues: true })

function unoOVarios<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/** Lee un CFDI 4.0 (acepta 3.3 con aviso). Lanza 400 si no parece una factura. */
export function leerCfdi(xml: string): CfdiLeido {
  let doc: Record<string, unknown>
  try {
    doc = parser.parse(xml) as Record<string, unknown>
  } catch {
    throw invalido('El archivo no es un XML válido.')
  }
  const comp = doc.Comprobante as Record<string, unknown> | undefined
  if (!comp || typeof comp !== 'object') throw invalido('El XML no es un CFDI: no trae el nodo Comprobante.')
  const avisos: string[] = []
  const version = String(comp.Version ?? comp.version ?? '')
  if (version !== '4.0') avisos.push(version ? `La factura es CFDI ${version}; el sistema está probado con 4.0.` : 'El XML no indica versión de CFDI.')
  const emisor = (comp.Emisor ?? {}) as Record<string, unknown>
  const receptor = (comp.Receptor ?? {}) as Record<string, unknown>
  const rfc = String(emisor.Rfc ?? '').trim().toUpperCase()
  if (!rfc) throw invalido('El XML no trae el RFC del emisor.')
  const fechaIso = String(comp.Fecha ?? '')
  const fecha = fechaIso.slice(0, 10)
  if (!esFecha(fecha)) throw invalido('El XML no trae una fecha válida.')
  const conceptosNodo = (comp.Conceptos ?? {}) as Record<string, unknown>
  const conceptos = unoOVarios(conceptosNodo.Concepto as Record<string, unknown> | Record<string, unknown>[] | undefined).map((c) => {
    const cantidad = Number(c.Cantidad ?? 0)
    const valorUnitario = Number(c.ValorUnitario ?? 0)
    const importe = Number(c.Importe ?? cantidad * valorUnitario)
    return {
      clave: t(c.NoIdentificacion),
      descripcion: t(c.Descripcion) ?? 'Sin descripción',
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      unidad: t(c.Unidad) ?? t(c.ClaveUnidad),
      valorUnitario: Number.isFinite(valorUnitario) ? valorUnitario : 0,
      importe: Number.isFinite(importe) ? importe : 0,
    }
  })
  if (!conceptos.length) throw invalido('El XML no trae conceptos.')
  /* IVA: suma de traslados con impuesto 002 (a nivel comprobante; si no, por concepto). */
  let iva = 0
  const impuestos = (comp.Impuestos ?? null) as Record<string, unknown> | null
  const traslados = impuestos ? unoOVarios(((impuestos.Traslados ?? {}) as Record<string, unknown>).Traslado as Record<string, unknown> | Record<string, unknown>[] | undefined) : []
  if (traslados.length) {
    for (const tr of traslados) if (String(tr.Impuesto ?? '') === '002') iva += Number(tr.Importe ?? 0) || 0
  } else {
    for (const c of unoOVarios(conceptosNodo.Concepto as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const imp = (c.Impuestos ?? null) as Record<string, unknown> | null
      const trs = imp ? unoOVarios(((imp.Traslados ?? {}) as Record<string, unknown>).Traslado as Record<string, unknown> | Record<string, unknown>[] | undefined) : []
      for (const tr of trs) if (String(tr.Impuesto ?? '') === '002') iva += Number(tr.Importe ?? 0) || 0
    }
  }
  const complemento = (comp.Complemento ?? {}) as Record<string, unknown>
  const timbre = (complemento.TimbreFiscalDigital ?? null) as Record<string, unknown> | null
  const uuid = t(timbre?.UUID)?.toUpperCase() ?? null
  if (!uuid) avisos.push('El XML no trae timbre (UUID): se registra, pero no se puede detectar si ya se capturó antes.')
  const subtotal = Number(comp.SubTotal ?? 0) || conceptos.reduce((a, c) => a + c.importe, 0)
  const total = Number(comp.Total ?? 0) || subtotal + iva
  return {
    version,
    emisor: { rfc, nombre: t(emisor.Nombre) },
    receptorRfc: t(receptor.Rfc)?.toUpperCase() ?? null,
    serie: t(comp.Serie),
    folio: t(comp.Folio),
    fecha,
    uuid,
    subtotal: r2(subtotal),
    iva: r2(iva),
    total: r2(total),
    conceptos,
    avisos,
  }
}

/* ───────────────────────────── vistas ───────────────────────────── */

type Renglon = NonNullable<FarCompra['renglones']>[number]

async function presentacionesDe(payload: Payload, ids: number[], req?: PayloadRequest): Promise<Map<number, FarPresentacion & { producto: FarProducto }>> {
  const m = new Map<number, FarPresentacion & { producto: FarProducto }>()
  if (!ids.length) return m
  const r = await payload.find({ collection: 'far-presentaciones', depth: 1, pagination: false, overrideAccess: true, req, where: { id: { in: ids } } })
  for (const p of r.docs) if (typeof p.producto === 'object') m.set(p.id, p as FarPresentacion & { producto: FarProducto })
  return m
}

function vistaRenglon(r: Renglon, pres: Map<number, FarPresentacion & { producto: FarProducto }>, ctx: Ctx, sugerida = false): RenglonCompraVista {
  const pid = idDe(r.presentacion)
  const p = pid ? pres.get(pid) : undefined
  const factor = p ? n0(p.factor) || 1 : null
  const v: RenglonCompraVista = {
    id: r.id ?? null,
    claveProveedor: t(r.claveProveedor),
    descripcion: t(r.descripcion),
    presentacionId: pid,
    presentacionNombre: p?.nombre ?? null,
    productoId: p ? p.producto.id : idDe(r.producto),
    productoNombre: p?.producto.nombre ?? null,
    unidadBase: p?.producto.unidadBase ?? null,
    factor,
    cantidad: n0(r.cantidad),
    numeroLote: t(r.numeroLote),
    caducidad: t(r.caducidad),
    loteId: idDe(r.lote),
    sugerida,
  }
  if (ctx.p.farmacia.verCostos) {
    v.valorUnitario = nOpc(r.valorUnitario)
    v.importe = nOpc(r.importe)
    v.costoUnidadBase = factor && r.valorUnitario != null ? r2(n0(r.valorUnitario) / factor) : null
  }
  return v
}

function faltantesDe(c: FarCompra, renglones: RenglonCompraVista[]): string[] {
  const f: string[] = []
  if (!renglones.length) f.push('La compra no tiene renglones.')
  renglones.forEach((r, i) => {
    const n = i + 1
    if (!r.presentacionId) f.push(`Renglón ${n}: elige la presentación del catálogo.`)
    if (!r.numeroLote) f.push(`Renglón ${n}: falta el número de lote.`)
    if (!r.caducidad) f.push(`Renglón ${n}: falta la caducidad.`)
    if (!(r.cantidad > 0)) f.push(`Renglón ${n}: la cantidad debe ser mayor que cero.`)
  })
  if (c.condicion === 'contado' && !idDe(c.cuenta)) f.push('Elige la cuenta o caja con la que se pagó (compra de contado).')
  return f
}

async function vistaCompra(ctx: Ctx, c: FarCompra): Promise<CompraVista> {
  const pres = await presentacionesDe(ctx.payload, (c.renglones ?? []).map((r) => idDe(r.presentacion)).filter((x): x is number => x != null))
  const prov = c.proveedor as FarProveedor | number
  const alm = c.almacen as FarCompra['almacen']
  const renglones = (c.renglones ?? []).map((r) => vistaRenglon(r, pres, ctx))
  const gasto = c.gastoFinanzas
  const v: CompraVista = {
    id: c.id,
    folio: folioParaId('COM', c.id),
    estado: c.estado,
    origen: c.origen,
    proveedor: typeof prov === 'object' ? { id: prov.id, nombre: prov.nombre, rfc: t(prov.rfc) } : { id: Number(prov), nombre: 'Proveedor', rfc: null },
    almacen: alm && typeof alm === 'object' ? { id: alm.id, nombre: alm.nombre } : null,
    fecha: c.fecha,
    serieFactura: t(c.serieFactura),
    folioFactura: t(c.folioFactura),
    uuid: t(c.uuid),
    tieneXml: Boolean(c.xmlTexto),
    renglones,
    condicion: c.condicion,
    cuentaId: idDe(c.cuenta),
    venceEl: t(c.venceEl),
    gastoFinanzasId: idDe(gasto),
    gastoFolio: gasto ? `FIN-${String(idDe(gasto)).padStart(5, '0')}` : null,
    notas: t(c.notas),
    capturadaPor: persona(c.capturadaPor),
    recibidaPor: persona(c.recibidaPor),
    recibidaEn: c.recibidaEn ?? null,
    anuladaPor: persona(c.anuladaPor),
    anuladaEn: c.anuladaEn ?? null,
    motivoAnulacion: t(c.motivoAnulacion),
    faltantes: c.estado === 'borrador' ? faltantesDe(c, renglones) : [],
    creadoEn: c.createdAt,
  }
  if (ctx.p.farmacia.verCostos) {
    v.subtotal = nOpc(c.subtotal)
    v.iva = nOpc(c.iva)
    v.total = nOpc(c.total)
  }
  return v
}

function breve(c: FarCompra, ctx: Ctx): CompraBreve {
  const prov = c.proveedor as FarProveedor | number
  const gasto = c.gastoFinanzas
  const b: CompraBreve = {
    id: c.id,
    folio: folioParaId('COM', c.id),
    estado: c.estado,
    origen: c.origen,
    proveedor: typeof prov === 'object' ? { id: prov.id, nombre: prov.nombre, rfc: t(prov.rfc) } : { id: Number(prov), nombre: 'Proveedor', rfc: null },
    fecha: c.fecha,
    folioFactura: t(c.folioFactura),
    condicion: c.condicion,
    creadoEn: c.createdAt,
    renglones: (c.renglones ?? []).length,
    gastoFolio: gasto ? `FIN-${String(idDe(gasto)).padStart(5, '0')}` : null,
  }
  if (ctx.p.farmacia.verCostos) b.total = nOpc(c.total)
  return b
}

async function cargar(ctx: Ctx, id: number, req?: PayloadRequest): Promise<FarCompra> {
  const c = await ctx.payload.findByID({ collection: 'far-compras', id, depth: 1, overrideAccess: true, req }).catch(() => null)
  if (!c) throw noEncontrado()
  return c
}

/* ───────────────────────────── claves del proveedor ───────────────────────────── */

async function clavesDe(payload: Payload, proveedorId: number, claves: string[], req?: PayloadRequest): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  const lista = claves.filter(Boolean)
  if (!lista.length) return m
  const r = await payload.find({ collection: 'far-proveedor-claves', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ proveedor: { equals: proveedorId } }, { clave: { in: lista } }] } })
  for (const k of r.docs) {
    const pid = idDe(k.presentacion)
    if (pid) m.set(k.clave, pid)
  }
  return m
}

async function aprenderClaves(payload: Payload, req: PayloadRequest, proveedorId: number, renglones: Renglon[]): Promise<number> {
  let nuevas = 0
  for (const r of renglones) {
    const clave = t(r.claveProveedor)
    const pid = idDe(r.presentacion)
    if (!clave || !pid) continue
    const ya = await payload.find({ collection: 'far-proveedor-claves', depth: 0, limit: 1, overrideAccess: true, req, where: { and: [{ proveedor: { equals: proveedorId } }, { clave: { equals: clave } }] } })
    if (ya.docs[0]) {
      if (idDe(ya.docs[0].presentacion) !== pid) await payload.update({ collection: 'far-proveedor-claves', id: ya.docs[0].id, overrideAccess: true, req, depth: 0, data: { presentacion: pid, descripcionProveedor: t(r.descripcion) } })
      continue
    }
    await payload.create({ collection: 'far-proveedor-claves', overrideAccess: true, req, depth: 0, data: { proveedor: proveedorId, clave, presentacion: pid, descripcionProveedor: t(r.descripcion) } })
    nuevas++
  }
  return nuevas
}

/* ───────────────────────────── crear ───────────────────────────── */

async function proveedorPorRfc(ctx: Ctx, rfc: string, nombre: string | null): Promise<FarProveedor> {
  const ya = await ctx.payload.find({ collection: 'far-proveedores', depth: 0, limit: 1, overrideAccess: true, where: { rfc: { equals: rfc } } })
  if (ya.docs[0]) return ya.docs[0]
  const base = nombre || `Proveedor ${rfc}`
  /* Nombre único: si ya hay uno con ese nombre y otro RFC, se distingue con el RFC. */
  const mismoNombre = await ctx.payload.find({ collection: 'far-proveedores', depth: 0, limit: 1, overrideAccess: true, where: { nombre: { equals: base } } })
  return ctx.payload.create({ collection: 'far-proveedores', overrideAccess: true, depth: 0, data: { nombre: mismoNombre.docs[0] ? `${base} (${rfc})` : base, rfc, diasEntrega: 3, activo: true } })
}

export async function crearCompraDesdeXml(ctx: Ctx, archivo: File): Promise<CompraVista & { avisos: string[] }> {
  exigir(ctx, 'recibirCompras', 'Las compras las registra el encargado o un rol superior.')
  if (archivo.size > 2 * 1024 * 1024) throw invalido('El XML pesa más de 2 MB; no parece una factura.')
  const xml = await archivo.text()
  const cfdi = leerCfdi(xml)
  if (cfdi.uuid) {
    const repetida = await ctx.payload.find({ collection: 'far-compras', depth: 0, limit: 1, overrideAccess: true, where: { uuid: { equals: cfdi.uuid } } })
    if (repetida.docs[0]) throw invalido(`Esta factura ya está registrada como ${folioParaId('COM', repetida.docs[0].id)} (mismo UUID ${cfdi.uuid}).`)
  }
  const proveedor = await proveedorPorRfc(ctx, cfdi.emisor.rfc, cfdi.emisor.nombre)
  const claves = await clavesDe(ctx.payload, proveedor.id, cfdi.conceptos.map((c) => c.clave ?? ''))
  const presIds = [...new Set([...claves.values()])]
  const pres = await presentacionesDe(ctx.payload, presIds)
  const almacen = await almacenPorOmision(ctx.payload)
  const renglones = cfdi.conceptos.map((c) => {
    const pid = c.clave ? claves.get(c.clave) ?? null : null
    const p = pid ? pres.get(pid) : undefined
    return {
      claveProveedor: c.clave,
      descripcion: c.descripcion,
      presentacion: pid,
      producto: p ? p.producto.id : null,
      cantidad: c.cantidad,
      valorUnitario: r2(c.valorUnitario),
      importe: r2(c.importe),
      numeroLote: null,
      caducidad: null,
    }
  })
  const creada = await ctx.payload.create({
    collection: 'far-compras',
    overrideAccess: true,
    depth: 1,
    data: {
      estado: 'borrador',
      origen: 'xml',
      proveedor: proveedor.id,
      almacen: almacen.id,
      fecha: cfdi.fecha,
      serieFactura: cfdi.serie,
      folioFactura: cfdi.folio,
      uuid: cfdi.uuid,
      xmlTexto: xml,
      renglones,
      subtotal: cfdi.subtotal,
      iva: cfdi.iva,
      total: cfdi.total,
      condicion: 'contado',
      capturadaPor: ctx.user.id,
    },
  })
  const avisos = [...cfdi.avisos]
  const reconocidas = renglones.filter((r) => r.presentacion).length
  if (renglones.length) avisos.push(reconocidas === renglones.length ? 'Todas las claves del proveedor ya estaban relacionadas con el catálogo.' : `${renglones.length - reconocidas} de ${renglones.length} renglones necesitan que elijas la presentación; la próxima factura de este proveedor llegará relacionada sola.`)
  return { ...(await vistaCompra(ctx, creada)), avisos }
}

const esquemaRenglon = z.object({
  id: z.string().nullable().optional(),
  claveProveedor: z.string().trim().max(60).nullable().optional(),
  descripcion: z.string().trim().max(300).nullable().optional(),
  presentacionId: z.coerce.number().int().positive().nullable().optional(),
  cantidad: z.coerce.number().min(0),
  valorUnitario: z.coerce.number().min(0).nullable().optional(),
  numeroLote: z.string().trim().max(60).nullable().optional(),
  caducidad: z.string().trim().nullable().optional(),
})
const esquemaCompra = z.object({
  proveedorId: z.coerce.number().int().positive().optional(),
  almacenId: z.coerce.number().int().positive().nullable().optional(),
  fecha: z.string().optional(),
  serieFactura: z.string().trim().max(20).nullable().optional(),
  folioFactura: z.string().trim().max(40).nullable().optional(),
  condicion: z.enum(['contado', 'credito']).optional(),
  cuentaId: z.coerce.number().int().positive().nullable().optional(),
  venceEl: z.string().trim().nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  iva: z.coerce.number().min(0).nullable().optional(),
  renglones: z.array(esquemaRenglon).max(300).optional(),
})

/**
 * En una compra del XML, clave, descripción y valor unitario son los de la
 * factura y no se editan (el costo del lote sale de ahí). Un renglón agregado
 * a mano en una compra del XML entra sin costo (bonificación o regalo del
 * proveedor). Quitar un renglón del XML lo deja fuera del inventario, pero el
 * gasto sigue siendo el total de la factura.
 */
async function armarRenglones(ctx: Ctx, entrada: z.infer<typeof esquemaRenglon>[], previos: Renglon[], origen: 'xml' | 'manual'): Promise<Renglon[]> {
  const pres = await presentacionesDe(ctx.payload, entrada.map((r) => r.presentacionId).filter((x): x is number => x != null))
  const porId = new Map(previos.map((r) => [r.id ?? '', r]))
  return entrada.map((r) => {
    if (r.presentacionId && !pres.has(r.presentacionId)) throw invalido('Una presentación elegida ya no existe.')
    if (r.caducidad && !esFecha(r.caducidad)) throw invalido('Escribe la caducidad como AAAA-MM-DD.')
    const previo = r.id ? porId.get(r.id) : undefined
    const p = r.presentacionId ? pres.get(r.presentacionId) : undefined
    const delXml = origen === 'xml'
    const valorUnitario = delXml ? (nOpc(previo?.valorUnitario) ?? 0) : (r.valorUnitario ?? nOpc(previo?.valorUnitario) ?? 0)
    return {
      id: previo?.id ?? undefined,
      claveProveedor: delXml && previo ? t(previo.claveProveedor) : r.claveProveedor !== undefined ? t(r.claveProveedor) : t(previo?.claveProveedor),
      descripcion: delXml && previo ? t(previo.descripcion) : r.descripcion !== undefined ? t(r.descripcion) : (t(previo?.descripcion) ?? (p ? `${p.producto.nombre} · ${p.nombre}` : delXml ? 'Bonificación (sin costo)' : null)),
      presentacion: r.presentacionId ?? null,
      producto: p ? p.producto.id : null,
      cantidad: r3(r.cantidad),
      valorUnitario: r2(valorUnitario),
      importe: r2(r.cantidad * valorUnitario),
      numeroLote: t(r.numeroLote),
      caducidad: t(r.caducidad),
      lote: null,
    }
  })
}

function totales(renglones: Renglon[], iva: number | null | undefined, ivaPorOmision: boolean): { subtotal: number; iva: number; total: number } {
  const subtotalC = renglones.reduce((a, r) => a + (aCentavos(n0(r.importe)) || 0), 0)
  const ivaC = iva != null ? aCentavos(iva) || 0 : ivaPorOmision ? Math.round(subtotalC * 0.16) : 0
  return { subtotal: aPesos(subtotalC), iva: aPesos(ivaC), total: aPesos(subtotalC + ivaC) }
}

export async function crearCompraManual(ctx: Ctx, entrada: unknown): Promise<CompraVista> {
  exigir(ctx, 'recibirCompras', 'Las compras las registra el encargado o un rol superior.')
  const d = esquemaCompra.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  if (!v.proveedorId) throw invalido('Elige el proveedor.')
  const proveedor = await ctx.payload.findByID({ collection: 'far-proveedores', id: v.proveedorId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!proveedor) throw invalido('Ese proveedor no existe.')
  const fecha = v.fecha ?? ctx.hoy
  if (!esFecha(fecha)) throw invalido('Escribe la fecha como AAAA-MM-DD.')
  if (fecha > ctx.hoy) throw invalido('La fecha de la factura no puede ser futura.')
  const renglones = await armarRenglones(ctx, v.renglones ?? [], [], 'manual')
  const almacen = v.almacenId ? await ctx.payload.findByID({ collection: 'far-almacenes', id: v.almacenId, depth: 0, overrideAccess: true }).catch(() => null) : await almacenPorOmision(ctx.payload)
  if (!almacen) throw invalido('Ese almacén no existe.')
  const tot = totales(renglones, v.iva, true)
  const creada = await ctx.payload.create({
    collection: 'far-compras',
    overrideAccess: true,
    depth: 1,
    data: {
      estado: 'borrador',
      origen: 'manual',
      proveedor: proveedor.id,
      almacen: almacen.id,
      fecha,
      serieFactura: t(v.serieFactura),
      folioFactura: t(v.folioFactura),
      renglones,
      ...tot,
      condicion: v.condicion ?? 'contado',
      cuenta: v.cuentaId ?? null,
      venceEl: v.venceEl && esFecha(v.venceEl) ? v.venceEl : null,
      notas: t(v.notas),
      capturadaPor: ctx.user.id,
    },
  })
  return vistaCompra(ctx, creada)
}

export async function actualizarCompra(ctx: Ctx, id: number, entrada: unknown): Promise<CompraVista> {
  exigir(ctx, 'recibirCompras')
  const c = await cargar(ctx, id)
  if (c.estado !== 'borrador') throw invalido('Solo se edita una compra en borrador. Una recibida se anula.')
  const d = esquemaCompra.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  const data: Record<string, unknown> = {}
  if (v.proveedorId && c.origen === 'manual') data.proveedor = v.proveedorId
  if (v.almacenId !== undefined) data.almacen = v.almacenId
  if (v.fecha) {
    if (!esFecha(v.fecha) || v.fecha > ctx.hoy) throw invalido('La fecha de la factura no es válida o es futura.')
    data.fecha = v.fecha
  }
  if (v.serieFactura !== undefined) data.serieFactura = t(v.serieFactura)
  if (v.folioFactura !== undefined) data.folioFactura = t(v.folioFactura)
  if (v.condicion) data.condicion = v.condicion
  if (v.cuentaId !== undefined) data.cuenta = v.cuentaId
  if (v.venceEl !== undefined) {
    if (v.venceEl && !esFecha(v.venceEl)) throw invalido('Escribe el vencimiento como AAAA-MM-DD.')
    data.venceEl = v.venceEl || null
  }
  if (v.notas !== undefined) data.notas = t(v.notas)
  if (v.renglones) {
    const renglones = await armarRenglones(ctx, v.renglones, c.renglones ?? [], c.origen === 'xml' ? 'xml' : 'manual')
    data.renglones = renglones
    /* En una compra del XML los totales son los de la factura; en manual se recalculan (IVA omitido = 16 % del subtotal). */
    if (c.origen === 'manual') Object.assign(data, totales(renglones, v.iva, true))
  } else if (v.iva != null && c.origen === 'manual') {
    Object.assign(data, totales(c.renglones ?? [], v.iva, false))
  }
  const act = await ctx.payload.update({ collection: 'far-compras', id, overrideAccess: true, depth: 1, data })
  return vistaCompra(ctx, act)
}

/* ───────────────────────────── recibir ───────────────────────────── */

function ctxFinanzasSistema(ctx: Ctx): CtxFinanzas {
  /* El gasto lo registra el sistema aunque quien recibe no tenga permisos de Finanzas (igual que el cargo de una cita). */
  return { payload: ctx.payload, req: ctx.req, user: ctx.user, p: calcularPermisos({ esSuperadmin: true }, null), hoy: ctx.hoy }
}

async function registrarGasto(ctx: Ctx, c: FarCompra): Promise<number | null> {
  const cfg = await leerConfiguracion(ctx.payload)
  const prov = c.proveedor as FarProveedor | number
  const nombreProv = typeof prov === 'object' ? prov.nombre : 'Proveedor'
  const totalC = aCentavos(n0(c.total))
  if (!totalC || totalC <= 0) return null
  const areaId = cfg.finanzas.areaId
  /* Finanzas no acepta fechas anteriores al corte ni futuras: si la factura es vieja, el gasto va con la fecha de recepción y lo dice en las notas. */
  const fechaReal = c.fecha <= ctx.hoy ? c.fecha : ctx.hoy
  const factura = [c.serieFactura, c.folioFactura].filter(Boolean).join('-')
  let r
  try {
    r = await registrarEnFinanzas(
      ctxFinanzasSistema(ctx),
      {
        tipo: 'gasto',
        importe: aPesos(totalC),
        fechaReal,
        estado: c.condicion === 'contado' ? 'realizado' : 'pendiente',
        cuenta: c.condicion === 'contado' ? idDe(c.cuenta) : null,
        concepto: `Compra ${folioParaId('COM', c.id)}${factura ? ` · factura ${factura}` : ''}`,
        categoria: cfg.finanzas.categoriaComprasId,
        asignacion: areaId ? 'actividad' : 'pendiente',
        actividad: areaId,
        contraparte: nombreProv,
        notas: `Compra de farmacia ${folioParaId('COM', c.id)}: ${(c.renglones ?? []).length} renglones.${c.uuid ? ` UUID ${c.uuid}.` : ''}`,
        venceEl: c.condicion === 'credito' ? c.venceEl ?? null : null,
      },
      `compra-${c.id}`,
    )
  } catch (e) {
    const msg = (e as { message?: string })?.message
    if (msg && /fecha de corte/.test(msg)) {
      r = await registrarEnFinanzas(
        ctxFinanzasSistema(ctx),
        {
          tipo: 'gasto',
          importe: aPesos(totalC),
          fechaReal: ctx.hoy,
          estado: c.condicion === 'contado' ? 'realizado' : 'pendiente',
          cuenta: c.condicion === 'contado' ? idDe(c.cuenta) : null,
          concepto: `Compra ${folioParaId('COM', c.id)}${factura ? ` · factura ${factura}` : ''}`,
          categoria: cfg.finanzas.categoriaComprasId,
          asignacion: areaId ? 'actividad' : 'pendiente',
          actividad: areaId,
          contraparte: nombreProv,
          notas: `Compra de farmacia ${folioParaId('COM', c.id)}. Factura con fecha ${c.fecha} (anterior al corte): se registra con la fecha de recepción.`,
          venceEl: c.condicion === 'credito' ? c.venceEl ?? null : null,
        },
        `compra-${c.id}`,
      )
    } else throw e
  }
  return r.operacion.id
}

export async function recibirCompra(ctx: Ctx, id: number): Promise<CompraVista & { lotes: LoteVista[]; gasto: 'registrado' | 'pendiente' | 'sin_importe' }> {
  exigir(ctx, 'recibirCompras', 'Las compras las recibe el encargado o un rol superior.')
  const c = await cargar(ctx, id)
  if (c.estado === 'recibida') throw invalido('Esta compra ya se recibió.')
  if (c.estado === 'anulada') throw invalido('Esta compra está anulada.')
  const faltantes = faltantesDe(c, (c.renglones ?? []).map((r) => vistaRenglon(r, new Map(), ctx)).map((v, i) => ({ ...v, presentacionId: idDe((c.renglones ?? [])[i].presentacion) })))
  if (faltantes.length) throw invalido(`No se puede recibir: ${faltantes[0]}`)
  if (c.condicion === 'contado') {
    const cuenta = await ctx.payload.findByID({ collection: 'fin-cuentas', id: idDe(c.cuenta)!, depth: 0, overrideAccess: true }).catch(() => null)
    if (!cuenta || !cuenta.activa) throw invalido('La cuenta o caja elegida no existe o está desactivada.')
  }
  const cfg = await leerConfiguracion(ctx.payload)
  const proveedorId = idDe(c.proveedor)!
  const pres = await presentacionesDe(ctx.payload, (c.renglones ?? []).map((r) => idDe(r.presentacion)!))
  const folio = folioParaId('COM', c.id)

  const { lotes, renglones } = await enTransaccion(ctx, async (req) => {
    const almacen = c.almacen && typeof c.almacen === 'object' ? c.almacen : await almacenPorOmision(ctx.payload, req)
    const lotes: FarLote[] = []
    const renglones: Renglon[] = []
    for (const r of c.renglones ?? []) {
      const p = pres.get(idDe(r.presentacion)!)!
      const factor = n0(p.factor) || 1
      const unidades = r3(n0(r.cantidad) * factor)
      const costoUnidad = r2(n0(r.valorUnitario) / factor)
      const numeroLote = t(r.numeroLote)!
      const caducidad = t(r.caducidad)!
      let lote: FarLote
      const mismo = await ctx.payload.find({ collection: 'far-lotes', depth: 0, limit: 1, overrideAccess: true, req, where: { and: [{ producto: { equals: p.producto.id } }, { almacen: { equals: almacen.id } }, { numeroLote: { equals: numeroLote } }] } })
      if (mismo.docs[0]) {
        lote = mismo.docs[0]
        if (lote.caducidad !== caducidad) throw invalido(`El lote ${numeroLote} de «${p.producto.nombre}» ya existe con caducidad ${lote.caducidad}; si es otro lote, cambia el número.`)
      } else {
        lote = await ctx.payload.create({
          collection: 'far-lotes',
          overrideAccess: true,
          req,
          depth: 0,
          data: { producto: p.producto.id, almacen: almacen.id, numeroLote, caducidad, cantidadRecibida: 0, existencia: 0, costoUnidad, referencia: folio, bloqueado: caducidad < ctx.hoy },
        })
      }
      await registrarMovimiento(ctx, req, { tipo: 'compra', loteId: lote.id, cantidad: unidades, costoUnidad, referencia: folio, motivo: `Recepción de ${folio}${r.descripcion ? ` · ${r.descripcion}` : ''}` })
      const act = await ctx.payload.update({
        collection: 'far-lotes',
        id: lote.id,
        overrideAccess: true,
        req,
        depth: 1,
        data: { cantidadRecibida: r3(n0(lote.cantidadRecibida) + unidades), ...(lote.costoUnidad == null ? { costoUnidad } : {}) },
      })
      lotes.push(act)
      renglones.push({ ...r, producto: p.producto.id, lote: lote.id })
    }
    await aprenderClaves(ctx.payload, req, proveedorId, renglones)
    await ctx.payload.update({ collection: 'far-compras', id: c.id, overrideAccess: true, req, depth: 0, data: { estado: 'recibida', renglones, almacen: almacen.id, recibidaPor: ctx.user.id, recibidaEn: new Date().toISOString() } })
    return { lotes, renglones }
  }, [])

  /* Gasto en Finanzas, fuera de la transacción del inventario, con clave de idempotencia. */
  let gasto: 'registrado' | 'pendiente' | 'sin_importe' = 'sin_importe'
  try {
    const gastoId = await registrarGasto(ctx, { ...c, renglones })
    if (gastoId) {
      await ctx.payload.update({ collection: 'far-compras', id: c.id, overrideAccess: true, depth: 0, data: { gastoFinanzas: gastoId } })
      gasto = 'registrado'
    }
  } catch (e) {
    console.error('[farmacia] la compra se recibió pero el gasto en Finanzas falló:', e)
    gasto = 'pendiente'
  }
  const final = await cargar(ctx, c.id)
  const productos = new Map<number, FarProducto>()
  for (const p of pres.values()) productos.set(p.producto.id, p.producto)
  return { ...(await vistaCompra(ctx, final)), lotes: lotes.map((l) => vistaLote(l, productos.get(idDe(l.producto)!)!, cfg, ctx)), gasto }
}

export async function reintentarGasto(ctx: Ctx, id: number): Promise<CompraVista> {
  exigir(ctx, 'recibirCompras')
  const c = await cargar(ctx, id)
  if (c.estado !== 'recibida') throw invalido('Solo una compra recibida lleva gasto.')
  if (c.gastoFinanzas) return vistaCompra(ctx, c)
  const gastoId = await registrarGasto(ctx, c)
  if (gastoId) await ctx.payload.update({ collection: 'far-compras', id, overrideAccess: true, depth: 0, data: { gastoFinanzas: gastoId } })
  return vistaCompra(ctx, await cargar(ctx, id))
}

/* ───────────────────────────── anular ───────────────────────────── */

export async function anularCompra(ctx: Ctx, id: number, entrada: unknown): Promise<CompraVista> {
  exigir(ctx, 'recibirCompras')
  const d = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo de la anulación (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe el motivo.')
  const c = await cargar(ctx, id)
  if (c.estado === 'anulada') return vistaCompra(ctx, c)
  const folio = folioParaId('COM', c.id)
  if (c.estado === 'borrador') {
    const act = await ctx.payload.update({ collection: 'far-compras', id, overrideAccess: true, depth: 1, data: { estado: 'anulada', motivoAnulacion: d.data.motivo, anuladaPor: ctx.user.id, anuladaEn: new Date().toISOString() } })
    return vistaCompra(ctx, act)
  }
  const loteIds = (c.renglones ?? []).map((r) => idDe(r.lote)).filter((x): x is number => x != null)
  /* Solo si ningún lote de la compra ha tenido salidas (ventas, mermas, ajustes negativos). */
  if (loteIds.length) {
    const salidas = await ctx.payload.count({ collection: 'far-movimientos', overrideAccess: true, where: { and: [{ lote: { in: loteIds } }, { cantidad: { less_than: 0 } }] } })
    if (salidas.totalDocs) throw invalido('No se puede anular: alguno de sus lotes ya tuvo salidas. Registra una devolución al proveedor o una merma, según el caso.')
  }
  await enTransaccion(
    ctx,
    async (req) => {
      for (const r of c.renglones ?? []) {
        const loteId = idDe(r.lote)
        if (!loteId) continue
        const entradas = await ctx.payload.find({ collection: 'far-movimientos', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ lote: { equals: loteId } }, { referencia: { equals: folio } }, { tipo: { equals: 'compra' } }] } })
        const total = entradas.docs.reduce((a, m) => a + n0(m.cantidad), 0)
        if (total > 0) await registrarMovimiento(ctx, req, { tipo: 'devolucion', loteId, cantidad: -total, referencia: folio, motivo: `Anulación de ${folio}: ${d.data.motivo}` })
        const lote = await ctx.payload.findByID({ collection: 'far-lotes', id: loteId, depth: 0, overrideAccess: true, req })
        await ctx.payload.update({ collection: 'far-lotes', id: loteId, overrideAccess: true, req, depth: 0, data: { cantidadRecibida: Math.max(0, r3(n0(lote.cantidadRecibida) - total)) } })
      }
      await ctx.payload.update({ collection: 'far-compras', id, overrideAccess: true, req, depth: 0, data: { estado: 'anulada', motivoAnulacion: d.data.motivo, anuladaPor: ctx.user.id, anuladaEn: new Date().toISOString() } })
    },
    loteIds,
  )
  const gastoId = idDe(c.gastoFinanzas)
  if (gastoId) {
    try {
      await anularEnFinanzas(ctxFinanzasSistema(ctx), gastoId, { motivo: `Anulación de compra ${folio}: ${d.data.motivo}` })
    } catch (e) {
      console.error('[farmacia] compra anulada pero el gasto en Finanzas no se pudo anular:', e)
    }
  }
  return vistaCompra(ctx, await cargar(ctx, id))
}

/* ───────────────────────────── consultas ───────────────────────────── */

export async function compras(ctx: Ctx, filtro: { estado?: string | null; q?: string | null; limite?: number }): Promise<{ compras: CompraBreve[]; total: number }> {
  exigir(ctx, 'recibirCompras', 'Tu rol no incluye compras.')
  const where: Where[] = []
  if (filtro.estado && ['borrador', 'recibida', 'anulada'].includes(filtro.estado)) where.push({ estado: { equals: filtro.estado } })
  const q = (filtro.q ?? '').trim()
  if (q) {
    const o: Where[] = [{ folioFactura: { like: q } }, { uuid: { like: q } }]
    const m = q.toUpperCase().match(/^(COM)?[\s-]*0*(\d{1,9})$/)
    if (m) o.push({ id: { equals: Number(m[2]) } })
    const provs = await ctx.payload.find({ collection: 'far-proveedores', depth: 0, pagination: false, overrideAccess: true, where: { nombre: { like: q } } })
    if (provs.docs.length) o.push({ proveedor: { in: provs.docs.map((p) => p.id) } })
    where.push({ or: o })
  }
  const r = await ctx.payload.find({ collection: 'far-compras', depth: 1, limit: Math.min(filtro.limite ?? 50, 200), overrideAccess: true, sort: '-createdAt', where: where.length ? { and: where } : {} })
  return { compras: r.docs.map((c) => breve(c, ctx)), total: r.totalDocs }
}

export async function compra(ctx: Ctx, id: number): Promise<CompraVista> {
  exigir(ctx, 'recibirCompras', 'Tu rol no incluye compras.')
  return vistaCompra(ctx, await cargar(ctx, id))
}

export async function xmlDeCompra(ctx: Ctx, id: number): Promise<{ nombre: string; xml: string }> {
  exigir(ctx, 'recibirCompras')
  const c = await cargar(ctx, id)
  if (!c.xmlTexto) throw noEncontrado('Esta compra no tiene XML.')
  return { nombre: `${folioParaId('COM', c.id)}${c.uuid ? '-' + c.uuid : ''}.xml`, xml: c.xmlTexto }
}

/** Presentaciones para elegir en un renglón: búsqueda por nombre, principio activo o código de barras. */
export async function buscarPresentaciones(ctx: Ctx, texto: string): Promise<{ id: number; nombre: string; productoId: number; productoNombre: string; factor: number; unidadBase: string; codigoBarras: string | null }[]> {
  exigir(ctx, 'recibirCompras')
  const q = texto.trim().slice(0, 80)
  if (!q) return []
  const prods = await ctx.payload.find({ collection: 'far-productos', depth: 0, limit: 30, overrideAccess: true, where: { and: [{ activo: { equals: true } }, { or: [{ nombre: { like: q } }, { principioActivo: { like: q } }] }] } })
  const where: Where[] = [{ codigoBarras: { equals: q.replace(/\s+/g, '') } }]
  if (prods.docs.length) where.push({ producto: { in: prods.docs.map((p) => p.id) } })
  const pres = await ctx.payload.find({ collection: 'far-presentaciones', depth: 1, limit: 60, overrideAccess: true, sort: 'nombre', where: { and: [{ activa: { equals: true } }, { or: where }] } })
  return pres.docs
    .filter((p) => typeof p.producto === 'object')
    .map((p) => {
      const prod = p.producto as FarProducto
      return { id: p.id, nombre: p.nombre, productoId: prod.id, productoNombre: prod.nombre, factor: n0(p.factor) || 1, unidadBase: prod.unidadBase, codigoBarras: t(p.codigoBarras) }
    })
}

/* ───────────────────────────── conteo físico ───────────────────────────── */

export async function renglonesConteo(ctx: Ctx, filtro: { q?: string | null; almacenId?: number | null }): Promise<{ renglones: RenglonConteo[] }> {
  exigir(ctx, 'ajustes', 'El conteo físico lo hace el encargado o un rol superior.')
  const cfg = await leerConfiguracion(ctx.payload)
  const where: Where[] = [{ existencia: { greater_than: 0 } }]
  if (filtro.almacenId) where.push({ almacen: { equals: filtro.almacenId } })
  const q = (filtro.q ?? '').trim()
  if (q) {
    const prods = await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { or: [{ nombre: { like: q } }, { principioActivo: { like: q } }] } })
    where.push({ or: [{ producto: { in: prods.docs.length ? prods.docs.map((p) => p.id) : [0] } }, { numeroLote: { like: q } }] })
  }
  const lotes = await ctx.payload.find({ collection: 'far-lotes', depth: 1, limit: 500, overrideAccess: true, sort: 'producto', where: { and: where } })
  const renglones: RenglonConteo[] = []
  for (const l of lotes.docs) {
    if (typeof l.producto !== 'object' || typeof l.almacen !== 'object') continue
    const v = vistaLote(l, l.producto, cfg, ctx)
    renglones.push({ loteId: l.id, loteFolio: v.folio, numeroLote: v.numeroLote, caducidad: v.caducidad, estado: v.estado, productoId: l.producto.id, productoNombre: l.producto.nombre, unidadBase: l.producto.unidadBase, almacen: v.almacen, existencia: v.existencia })
  }
  renglones.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, 'es') || a.caducidad.localeCompare(b.caducidad))
  return { renglones }
}

export async function aplicarConteo(ctx: Ctx, entrada: unknown): Promise<ResultadoConteo> {
  exigir(ctx, 'ajustes', 'El conteo físico lo hace el encargado o un rol superior.')
  const d = z
    .object({
      motivo: z.string().trim().min(3, 'Escribe el motivo del conteo (p. ej. «Conteo mensual»).').max(200),
      renglones: z.array(z.object({ loteId: z.coerce.number().int().positive(), contado: z.coerce.number().min(0) })).min(1, 'No hay renglones que aplicar.').max(500),
    })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const referencia = `Conteo ${ctx.hoy}`
  const ids = d.data.renglones.map((r) => r.loteId)
  return enTransaccion(
    ctx,
    async (req) => {
      const ajustes: ResultadoConteo['ajustes'] = []
      let sinCambio = 0
      for (const r of d.data.renglones) {
        const lote = await ctx.payload.findByID({ collection: 'far-lotes', id: r.loteId, depth: 1, overrideAccess: true, req }).catch(() => null)
        if (!lote || typeof lote.producto !== 'object') throw invalido(`El lote ${r.loteId} no existe.`)
        const antes = n0(lote.existencia)
        const diferencia = r3(r.contado - antes)
        if (!diferencia) {
          sinCambio++
          continue
        }
        await registrarMovimiento(ctx, req, { tipo: 'ajuste', loteId: lote.id, cantidad: diferencia, referencia, motivo: `Conteo físico: ${d.data.motivo}` })
        ajustes.push({ loteId: lote.id, productoNombre: lote.producto.nombre, numeroLote: lote.numeroLote, antes, contado: r.contado, diferencia })
      }
      return { ajustes, sinCambio }
    },
    ids,
  )
}
