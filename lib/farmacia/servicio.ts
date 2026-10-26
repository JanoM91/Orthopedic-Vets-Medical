import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { FarAlmacen, FarLote, FarMovimiento, FarPresentacion, FarProducto, FarProveedor, FarmaciaConfiguracion, User } from '../../payload-types'
import { ESPECIES } from '../../collections/clinica/pacientes'
import { GRUPOS, LINEAS, TIPOS_ALMACEN } from '../../collections/farmacia/catalogo'
import { folioParaId } from '../../collections/farmacia/acceso'
import { aCentavos, aPesos, diaEnZona } from '../finanzas/reglas'
import { leerModulos, type Modulos } from '../modulos'
import { permisosDe, type Permisos } from '../permisos'
import { site } from '../site'
import { FARMACIA_TODO, ROLES_FARMACIA } from './roles'
import type {
  AlmacenVista,
  CatalogoFarmacia,
  ConfiguracionVista,
  EstadoLote,
  Inventario,
  LoteVista,
  MovimientoVista,
  PersonaBreve,
  PresentacionVista,
  ProductoBreve,
  ProductoVista,
  ProveedorVista,
  ResultadoProductos,
} from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Servicio de la farmacia: catálogo, inventario por lote y kardex (fase 1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mismo patrón que lib/clinica/servicio.ts: /api/farmacia verifica la sesión
 * y delega aquí; aquí se revisan permisos (lib/permisosBase.ts → farmacia),
 * se valida con zod y se escribe con la API local de Payload dentro de una
 * transacción. Toda regla de negocio vive aquí o en hooks de las colecciones,
 * nunca solo en la pantalla.
 *
 * INVARIANTES DEL INVENTARIO (docs/FARMACIA-PROMPT.md):
 *   - existencia física de un lote = suma de sus movimientos (`far-movimientos`);
 *     `far-lotes.existencia` es una copia que se recalcula en la misma
 *     transacción, con candado por lote.
 *   - el kardex es inmutable: una corrección es un movimiento inverso con motivo.
 *   - una salida nunca deja el lote en negativo.
 *   - un lote vencido o bloqueado no sale por venta (fase 3); sí por merma o ajuste.
 *
 * COSTOS: si quien pregunta no tiene «Ver costos», ninguna vista trae costos
 * ni valor del inventario (se omite la propiedad, no se manda null).
 */

export class ErrorFarmacia extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
const prohibido = (m = 'Tu rol no permite hacer esto en la farmacia.') => new ErrorFarmacia(403, m)
const invalido = (m: string) => new ErrorFarmacia(400, m)
const noEncontrado = (m = 'No encontramos ese registro.') => new ErrorFarmacia(404, m)

export type Ctx = { payload: Payload; req: PayloadRequest; user: User; p: Permisos; modulos: Modulos; hoy: string }

export async function contextoDesdeHeaders(payload: Payload, headers: Headers): Promise<Ctx | null> {
  const { user } = await payload.auth({ headers })
  if (!user || (user as { collection?: string }).collection !== 'users') return null
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  return armarCtx(req, user as User)
}

export async function contextoDesdeReq(req: PayloadRequest): Promise<Ctx | null> {
  if (!req.user || (req.user as { collection?: string }).collection !== 'users') return null
  return armarCtx(req, req.user as User)
}

async function armarCtx(req: PayloadRequest, user: User): Promise<Ctx> {
  const [p, modulos] = await Promise.all([permisosDe(req), leerModulos(req.payload)])
  return { payload: req.payload, req, user, p, modulos, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

/** El módulo apagado responde 404 en toda la API (no 403: no es cosa del rol). */
export function exigirModulo(ctx: Ctx): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado en esta instalación (Sistema → Instalación: módulos).')
}

function exigir(ctx: Ctx, permiso: keyof Permisos['farmacia'], mensaje?: string): void {
  exigirModulo(ctx)
  if (!ctx.p.farmacia[permiso]) throw prohibido(mensaje)
}

export const usaFarmacia = (p: Permisos): boolean => p.superadmin || Object.values(p.farmacia).some(Boolean)

function exigirAlgo(ctx: Ctx): void {
  exigirModulo(ctx)
  if (!usaFarmacia(ctx.p)) throw prohibido('Tu rol no incluye la farmacia.')
}

/**
 * Transacción con candado opcional por lote (pg_advisory_xact_lock): dos
 * movimientos simultáneos del mismo lote se ordenan y la existencia nunca se
 * calcula sobre datos a medias. Rango 8 000 000+ para no chocar con la agenda.
 */
async function enTransaccion<T>(ctx: Ctx, fn: (req: PayloadRequest) => Promise<T>, lotesACandar: number[] = []): Promise<T> {
  const req = await createLocalReq({ user: ctx.user as User & { collection: 'users' } }, ctx.payload)
  const propia = await initTransaction(req)
  try {
    if (lotesACandar.length) {
      const sesiones = (ctx.payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
      const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
      if (tx) for (const id of [...new Set(lotesACandar)].sort((a, b) => a - b)) await tx.execute(sql`select pg_advisory_xact_lock(${8000000 + id})`)
    }
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

/* ───────────────────────────── utilidades ───────────────────────────── */

export const idDe = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'object' && 'id' in (v as object)) return Number((v as { id: unknown }).id)
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const persona = (u: unknown): PersonaBreve | null => {
  if (!u) return null
  if (typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u), nombre: 'Usuario' }
}
const t = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}
const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const nOpc = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Días entre hoy (AAAA-MM-DD) y una fecha; negativo si ya pasó. */
export function diasHasta(fecha: string, hoy: string): number {
  const [y1, m1, d1] = hoy.split('-').map(Number)
  const [y2, m2, d2] = fecha.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** «PRD-00012» → 12, «lot 34» → 34; si no parece folio, null. */
export function idDeFolio(texto: string): { prefijo: 'PRD' | 'LOT' | null; id: number } | null {
  const m = texto.trim().toUpperCase().match(/^(PRD|LOT)?[\s-]*0*(\d{1,9})$/)
  if (!m) return null
  return { prefijo: (m[1] as 'PRD' | 'LOT') || null, id: Number(m[2]) }
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

/** Cantidades en unidades base: hasta 3 decimales (ml, g), nunca NaN. */
const cantidad = z.coerce.number().finite().refine((v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, 'Usa hasta tres decimales.')
const precio = z.coerce.number().min(0).refine((v) => !Number.isNaN(aCentavos(v)), 'Escribe un precio válido con hasta dos decimales.')

/* ───────────────────────────── configuración ───────────────────────────── */

const CONFIG_POR_OMISION: ConfiguracionVista = {
  caducidad: { medicamentos: 90, alimento: 60, otros: 60, urgente: 30 },
  horasApartado: 24,
  cierreDiaActivo: true,
  recetaGrupoIIDomicilio: false,
  aprendizaje: { semanasHistorial: 8, diasCobertura: 30, diasEntregaPorOmision: 3 },
  promociones: [
    { diasAntes: 90, descuentoPorciento: 15 },
    { diasAntes: 45, descuentoPorciento: 30 },
  ],
  politicaDevoluciones: null,
  almacenPorOmisionId: null,
  finanzas: { areaId: null, categoriaVentasId: null, categoriaComprasId: null },
  pasarelaActiva: 'ninguna',
}

function vistaConfiguracion(g: FarmaciaConfiguracion | null): ConfiguracionVista {
  const d = CONFIG_POR_OMISION
  if (!g) return { ...d, caducidad: { ...d.caducidad }, aprendizaje: { ...d.aprendizaje }, promociones: d.promociones.map((p) => ({ ...p })), finanzas: { ...d.finanzas } }
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def)
  return {
    caducidad: {
      medicamentos: num(g.caducidad?.medicamentos, d.caducidad.medicamentos),
      alimento: num(g.caducidad?.alimento, d.caducidad.alimento),
      otros: num(g.caducidad?.otros, d.caducidad.otros),
      urgente: num(g.caducidad?.urgente, d.caducidad.urgente),
    },
    horasApartado: num(g.horasApartado, d.horasApartado),
    cierreDiaActivo: g.cierreDiaActivo == null ? d.cierreDiaActivo : Boolean(g.cierreDiaActivo),
    recetaGrupoIIDomicilio: Boolean(g.recetaGrupoIIDomicilio),
    aprendizaje: {
      semanasHistorial: num(g.aprendizaje?.semanasHistorial, d.aprendizaje.semanasHistorial),
      diasCobertura: num(g.aprendizaje?.diasCobertura, d.aprendizaje.diasCobertura),
      diasEntregaPorOmision: num(g.aprendizaje?.diasEntregaPorOmision, d.aprendizaje.diasEntregaPorOmision),
    },
    promociones: (g.promociones?.length ? g.promociones : d.promociones).map((p) => ({ diasAntes: p.diasAntes, descuentoPorciento: p.descuentoPorciento })),
    politicaDevoluciones: t(g.politicaDevoluciones),
    almacenPorOmisionId: idDe(g.almacenPorOmision),
    finanzas: { areaId: idDe(g.finanzas?.area), categoriaVentasId: idDe(g.finanzas?.categoriaVentas), categoriaComprasId: idDe(g.finanzas?.categoriaCompras) },
    pasarelaActiva: g.pasarelaActiva === 'mercadopago' ? 'mercadopago' : 'ninguna',
  }
}

async function leerConfiguracion(payload: Payload): Promise<ConfiguracionVista> {
  try {
    return vistaConfiguracion((await payload.findGlobal({ slug: 'farmacia-configuracion', depth: 0, overrideAccess: true })) as FarmaciaConfiguracion)
  } catch {
    return vistaConfiguracion(null)
  }
}

/** Días de aviso de caducidad según la línea del producto. */
function diasAvisoDe(cfg: ConfiguracionVista, linea: FarProducto['linea']): number {
  if (linea === 'medicamento' || linea === 'antiparasitario') return cfg.caducidad.medicamentos
  if (linea === 'alimento' || linea === 'dieta_prescripcion') return cfg.caducidad.alimento
  return cfg.caducidad.otros
}

export async function actualizarConfiguracion(ctx: Ctx, entrada: unknown): Promise<ConfiguracionVista> {
  exigir(ctx, 'configurar', 'La configuración de la farmacia la cambian el dueño o el superadministrador.')
  const esquema = z.object({
    caducidad: z.object({ medicamentos: z.coerce.number().int().min(1), alimento: z.coerce.number().int().min(1), otros: z.coerce.number().int().min(1), urgente: z.coerce.number().int().min(1) }).partial().optional(),
    horasApartado: z.coerce.number().int().min(1).optional(),
    cierreDiaActivo: z.boolean().optional(),
    recetaGrupoIIDomicilio: z.boolean().optional(),
    aprendizaje: z.object({ semanasHistorial: z.coerce.number().int().min(1), diasCobertura: z.coerce.number().int().min(1), diasEntregaPorOmision: z.coerce.number().int().min(0) }).partial().optional(),
    promociones: z.array(z.object({ diasAntes: z.coerce.number().int().min(1), descuentoPorciento: z.coerce.number().int().min(1).max(90) })).max(6).optional(),
    politicaDevoluciones: z.string().max(4000).nullable().optional(),
    almacenPorOmisionId: z.coerce.number().int().positive().nullable().optional(),
    finanzas: z.object({ areaId: z.coerce.number().int().positive().nullable(), categoriaVentasId: z.coerce.number().int().positive().nullable(), categoriaComprasId: z.coerce.number().int().positive().nullable() }).partial().optional(),
    pasarelaActiva: z.enum(['ninguna', 'mercadopago']).optional(),
  })
  const d = esquema.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  const actual = (await ctx.payload.findGlobal({ slug: 'farmacia-configuracion', depth: 0, overrideAccess: true })) as FarmaciaConfiguracion
  const data: Record<string, unknown> = {}
  if (v.caducidad) data.caducidad = { ...(actual.caducidad ?? {}), ...v.caducidad }
  if (v.horasApartado != null) data.horasApartado = v.horasApartado
  if (v.cierreDiaActivo != null) data.cierreDiaActivo = v.cierreDiaActivo
  if (v.recetaGrupoIIDomicilio != null) data.recetaGrupoIIDomicilio = v.recetaGrupoIIDomicilio
  if (v.aprendizaje) data.aprendizaje = { ...(actual.aprendizaje ?? {}), ...v.aprendizaje }
  if (v.promociones) data.promociones = v.promociones
  if (v.politicaDevoluciones !== undefined) data.politicaDevoluciones = v.politicaDevoluciones
  if (v.almacenPorOmisionId !== undefined) data.almacenPorOmision = v.almacenPorOmisionId
  if (v.finanzas) {
    data.finanzas = {
      area: v.finanzas.areaId !== undefined ? v.finanzas.areaId : idDe(actual.finanzas?.area),
      categoriaVentas: v.finanzas.categoriaVentasId !== undefined ? v.finanzas.categoriaVentasId : idDe(actual.finanzas?.categoriaVentas),
      categoriaCompras: v.finanzas.categoriaComprasId !== undefined ? v.finanzas.categoriaComprasId : idDe(actual.finanzas?.categoriaCompras),
    }
  }
  if (v.pasarelaActiva) data.pasarelaActiva = v.pasarelaActiva
  const g = await ctx.payload.updateGlobal({ slug: 'farmacia-configuracion', overrideAccess: true, data })
  return vistaConfiguracion(g as FarmaciaConfiguracion)
}

/* ───────────────────────────── vistas ───────────────────────────── */

function vistaPresentacion(p: FarPresentacion): PresentacionVista {
  return {
    id: p.id,
    productoId: idDe(p.producto)!,
    nombre: p.nombre,
    factor: n0(p.factor) || 1,
    precio: n0(p.precio),
    codigoBarras: t(p.codigoBarras),
    fraccionada: Boolean(p.fraccionada),
    activa: p.activa !== false,
  }
}

function estadoDeLote(l: FarLote, diasAviso: number, urgente: number, hoy: string): { estado: EstadoLote; dias: number } {
  const dias = diasHasta(l.caducidad, hoy)
  if (n0(l.existencia) <= 0) return { estado: 'agotado', dias }
  if (dias < 0) return { estado: 'vencido', dias }
  if (l.bloqueado) return { estado: 'bloqueado', dias }
  if (dias <= urgente) return { estado: 'urgente', dias }
  if (dias <= diasAviso) return { estado: 'por_vencer', dias }
  return { estado: 'vigente', dias }
}

function vistaLote(l: FarLote, producto: Pick<FarProducto, 'id' | 'nombre' | 'linea'>, cfg: ConfiguracionVista, ctx: Ctx): LoteVista {
  const { estado, dias } = estadoDeLote(l, diasAvisoDe(cfg, producto.linea), cfg.caducidad.urgente, ctx.hoy)
  const alm = l.almacen as FarAlmacen | number
  const v: LoteVista = {
    id: l.id,
    folio: folioParaId('LOT', l.id),
    productoId: producto.id,
    productoNombre: producto.nombre,
    almacen: typeof alm === 'object' ? { id: alm.id, nombre: alm.nombre } : { id: Number(alm), nombre: 'Almacén' },
    numeroLote: l.numeroLote,
    caducidad: l.caducidad,
    diasParaCaducar: dias,
    estado,
    cantidadRecibida: n0(l.cantidadRecibida),
    existencia: n0(l.existencia),
    referencia: t(l.referencia),
    bloqueado: Boolean(l.bloqueado),
    creadoEn: l.createdAt,
  }
  if (ctx.p.farmacia.verCostos) v.costoUnidad = nOpc(l.costoUnidad)
  return v
}

function vistaMovimiento(m: FarMovimiento, ctx: Ctx, nombres: { producto: (id: number) => string; lote: (id: number) => { numero: string }; almacen: (id: number) => string }): MovimientoVista {
  const productoId = idDe(m.producto)!
  const loteId = idDe(m.lote)!
  const almacenId = idDe(m.almacen)!
  const v: MovimientoVista = {
    id: m.id,
    tipo: m.tipo,
    productoId,
    productoNombre: typeof m.producto === 'object' ? m.producto.nombre : nombres.producto(productoId),
    loteId,
    loteFolio: folioParaId('LOT', loteId),
    numeroLote: typeof m.lote === 'object' ? m.lote.numeroLote : nombres.lote(loteId).numero,
    almacen: { id: almacenId, nombre: typeof m.almacen === 'object' ? m.almacen.nombre : nombres.almacen(almacenId) },
    cantidad: n0(m.cantidad),
    dia: m.dia,
    referencia: t(m.referencia),
    motivo: t(m.motivo),
    usuario: persona(m.usuario),
    existenciaDespues: nOpc(m.existenciaDespues),
    creadoEn: m.createdAt,
  }
  if (ctx.p.farmacia.verCostos) v.costoUnidad = nOpc(m.costoUnidad)
  return v
}

const vistaAlmacen = (a: FarAlmacen): AlmacenVista => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, activo: a.activo !== false })
const vistaProveedor = (p: FarProveedor): ProveedorVista => ({
  id: p.id,
  nombre: p.nombre,
  rfc: t(p.rfc),
  diasEntrega: n0(p.diasEntrega),
  contacto: { nombre: t(p.contacto?.nombre), telefono: t(p.contacto?.telefono), correo: t(p.contacto?.correo) },
  notas: t(p.notas),
  activo: p.activo !== false,
})

/** Existencias de varios productos de una vez: disponible (vigente) y física. */
async function existenciasDe(payload: Payload, productoIds: number[], hoy: string, req?: PayloadRequest): Promise<Map<number, { vigente: number; fisica: number }>> {
  const r = new Map<number, { vigente: number; fisica: number }>()
  if (!productoIds.length) return r
  const lotes = await payload.find({
    collection: 'far-lotes',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
    where: { and: [{ producto: { in: productoIds } }, { existencia: { greater_than: 0 } }] },
  })
  for (const l of lotes.docs) {
    const pid = idDe(l.producto)!
    const acc = r.get(pid) ?? { vigente: 0, fisica: 0 }
    const ex = n0(l.existencia)
    acc.fisica += ex
    if (!l.bloqueado && l.caducidad >= hoy) acc.vigente += ex
    r.set(pid, acc)
  }
  return r
}

function breve(p: FarProducto, pres: FarPresentacion[], ex: { vigente: number; fisica: number } | undefined): ProductoBreve {
  const activas = pres.filter((x) => x.activa !== false)
  const precios = activas.map((x) => n0(x.precio)).filter((x) => x > 0)
  const existencia = ex?.vigente ?? 0
  const minimo = n0(p.minimoInventario)
  const reorden = nOpc(p.puntoReordenAceptado)
  return {
    id: p.id,
    folio: folioParaId('PRD', p.id),
    nombre: p.nombre,
    principioActivo: t(p.principioActivo),
    laboratorio: t(p.laboratorio),
    linea: p.linea,
    grupo: p.grupo,
    unidadBase: p.unidadBase,
    publicadoTienda: Boolean(p.publicadoTienda),
    activo: p.activo !== false,
    existencia: Math.round(existencia * 1000) / 1000,
    bajoMinimo: p.activo !== false && existencia <= (reorden ?? minimo) && (reorden ?? minimo) > 0,
    presentaciones: activas.length,
    precioDesde: precios.length ? Math.min(...precios) : null,
  }
}

function vistaProducto(p: FarProducto, pres: FarPresentacion[], ex: { vigente: number; fisica: number } | undefined): ProductoVista {
  const b = breve(p, pres, ex)
  const prov = p.proveedorPreferente
  return {
    ...b,
    registroSenasica: t(p.registroSenasica),
    especies: (p.especies ?? []) as string[],
    pesoMinKg: nOpc(p.pesoMinKg),
    pesoMaxKg: nOpc(p.pesoMaxKg),
    edadMinMeses: nOpc(p.edadMinMeses),
    alergenos: t(p.alergenos),
    refrigeracion: Boolean(p.refrigeracion),
    duracionDias: nOpc(p.duracionDias),
    descripcion: t(p.descripcion),
    imagenUrl: t(p.imagenUrl),
    minimoInventario: n0(p.minimoInventario),
    puntoReordenPropuesto: nOpc(p.puntoReordenPropuesto),
    puntoReordenAceptado: nOpc(p.puntoReordenAceptado),
    proveedorPreferente: prov && typeof prov === 'object' ? { id: prov.id, nombre: prov.nombre } : null,
    notasInternas: t(p.notasInternas),
    presentaciones: pres.map(vistaPresentacion),
    existenciaFisica: Math.round((ex?.fisica ?? 0) * 1000) / 1000,
    creadoEn: p.createdAt,
    actualizadoEn: p.updatedAt,
  }
}

/* ───────────────────────────── catálogo ───────────────────────────── */

export async function catalogo(ctx: Ctx): Promise<CatalogoFarmacia> {
  exigirAlgo(ctx)
  const [almacenes, proveedores, cfg, productos, activos, publicados, lotes] = await Promise.all([
    ctx.payload.find({ collection: 'far-almacenes', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ctx.payload.find({ collection: 'far-proveedores', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    leerConfiguracion(ctx.payload),
    ctx.payload.count({ collection: 'far-productos', overrideAccess: true }),
    ctx.payload.count({ collection: 'far-productos', overrideAccess: true, where: { activo: { equals: true } } }),
    ctx.payload.count({ collection: 'far-productos', overrideAccess: true, where: { and: [{ activo: { equals: true } }, { publicadoTienda: { equals: true } }] } }),
    ctx.payload.find({ collection: 'far-lotes', depth: 1, pagination: false, overrideAccess: true, where: { existencia: { greater_than: 0 } } }),
  ])
  let vencidos = 0
  let porVencer = 0
  let valor = 0
  const porProducto = new Map<number, number>()
  for (const l of lotes.docs) {
    const prod = l.producto as FarProducto | number
    const linea = typeof prod === 'object' ? prod.linea : 'medicamento'
    const { estado } = estadoDeLote(l, diasAvisoDe(cfg, linea), cfg.caducidad.urgente, ctx.hoy)
    if (estado === 'vencido') vencidos++
    else if (estado === 'por_vencer' || estado === 'urgente') porVencer++
    valor += aCentavos(n0(l.existencia) * n0(l.costoUnidad)) || 0
    if (estado !== 'vencido' && estado !== 'bloqueado') {
      const pid = idDe(prod)!
      porProducto.set(pid, (porProducto.get(pid) ?? 0) + n0(l.existencia))
    }
  }
  const conMinimo = await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ activo: { equals: true } }, { or: [{ minimoInventario: { greater_than: 0 } }, { puntoReordenAceptado: { greater_than: 0 } }] }] } })
  const bajoMinimo = conMinimo.docs.filter((p) => (porProducto.get(p.id) ?? 0) <= (nOpc(p.puntoReordenAceptado) ?? n0(p.minimoInventario))).length

  let finanzas: CatalogoFarmacia['finanzas'] = { areas: [], categorias: [] }
  if (ctx.p.farmacia.configurar) {
    const [areas, cats] = await Promise.all([
      ctx.payload.find({ collection: 'fin-actividades', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
      ctx.payload.find({ collection: 'fin-categorias', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ])
    finanzas = { areas: areas.docs.map((a) => ({ id: a.id, nombre: a.nombre })), categorias: cats.docs.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })) }
  }
  const roles = await ctx.payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true, where: { nombre: { in: ROLES_FARMACIA.map((r) => r.nombre) } } })

  const totales: CatalogoFarmacia['totales'] = {
    productos: productos.totalDocs,
    productosActivos: activos.totalDocs,
    publicados: publicados.totalDocs,
    lotesConExistencia: lotes.totalDocs,
    lotesVencidos: vencidos,
    lotesPorVencer: porVencer,
    productosBajoMinimo: bajoMinimo,
  }
  if (ctx.p.farmacia.verCostos) totales.valorInventario = aPesos(valor)

  return {
    permisos: { ...ctx.p.farmacia, superadmin: ctx.p.superadmin, panel: ctx.p.panel },
    modulos: ctx.modulos,
    usuario: persona(ctx.user)!,
    grupos: GRUPOS.map((g) => ({ label: g.label, value: g.value })),
    lineas: LINEAS.map((l) => ({ label: l.label, value: l.value })),
    especies: ESPECIES.map((e) => ({ label: e.label, value: e.value })),
    tiposAlmacen: TIPOS_ALMACEN.map((x) => ({ label: x.label, value: x.value })),
    almacenes: almacenes.docs.map(vistaAlmacen),
    proveedores: proveedores.docs.map(vistaProveedor),
    configuracion: cfg,
    finanzas,
    totales,
    arranque: { almacenes: almacenes.totalDocs > 0, rolesFarmacia: roles.totalDocs >= ROLES_FARMACIA.length },
  }
}

/* ───────────────────────────── productos ───────────────────────────── */

const esquemaProducto = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre comercial.').max(160),
  principioActivo: z.string().trim().max(160).nullable().optional(),
  laboratorio: z.string().trim().max(120).nullable().optional(),
  linea: z.enum(['medicamento', 'antiparasitario', 'alimento', 'dieta_prescripcion', 'accesorio', 'higiene', 'suplemento']),
  grupo: z.enum(['I', 'II', 'III', 'desregulado']),
  registroSenasica: z.string().trim().max(60).nullable().optional(),
  especies: z.array(z.enum(['perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otra'])).optional(),
  pesoMinKg: z.coerce.number().min(0).nullable().optional(),
  pesoMaxKg: z.coerce.number().min(0).nullable().optional(),
  edadMinMeses: z.coerce.number().int().min(0).nullable().optional(),
  alergenos: z.string().trim().max(400).nullable().optional(),
  unidadBase: z.string().trim().min(1).max(30).optional(),
  refrigeracion: z.boolean().optional(),
  duracionDias: z.coerce.number().int().min(0).nullable().optional(),
  descripcion: z.string().trim().max(4000).nullable().optional(),
  imagenUrl: z.string().trim().max(500).nullable().optional(),
  publicadoTienda: z.boolean().optional(),
  minimoInventario: z.coerce.number().min(0).optional(),
  puntoReordenAceptado: z.coerce.number().min(0).nullable().optional(),
  proveedorPreferenteId: z.coerce.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
  notasInternas: z.string().trim().max(4000).nullable().optional(),
})

/** Reglas que no dependen de la pantalla: grupo vs. línea y registro SENASICA en regulados. */
export function validarProducto(d: z.infer<typeof esquemaProducto>): string | null {
  const noMedicamento = d.linea === 'alimento' || d.linea === 'accesorio' || d.linea === 'higiene'
  if (noMedicamento && (d.grupo === 'I' || d.grupo === 'II')) return 'Un alimento, accesorio o producto de higiene no puede ser Grupo I ni II.'
  if ((d.grupo === 'I' || d.grupo === 'II') && !t(d.registroSenasica)) return 'Los productos de Grupo I y II llevan registro SENASICA (el de la etiqueta).'
  if (d.pesoMinKg != null && d.pesoMaxKg != null && d.pesoMaxKg < d.pesoMinKg) return 'El peso máximo no puede ser menor que el mínimo.'
  return null
}

function datosProducto(d: z.infer<typeof esquemaProducto>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...d }
  delete data.proveedorPreferenteId
  if (d.proveedorPreferenteId !== undefined) data.proveedorPreferente = d.proveedorPreferenteId
  if (d.unidadBase !== undefined) data.unidadBase = d.unidadBase.toLowerCase()
  return data
}

export async function buscarProductos(ctx: Ctx, texto: string, filtros: { linea?: string | null; grupo?: string | null; inactivos?: boolean; bajoMinimo?: boolean } = {}, limite = 60): Promise<ResultadoProductos> {
  exigirAlgo(ctx)
  const q = texto.trim().slice(0, 80)
  const where: Where[] = []
  if (!filtros.inactivos) where.push({ activo: { equals: true } })
  if (filtros.linea) where.push({ linea: { equals: filtros.linea } })
  if (filtros.grupo) where.push({ grupo: { equals: filtros.grupo } })
  let porCodigo: number[] = []
  if (q) {
    const folio = idDeFolio(q)
    const codigo = await ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, where: { codigoBarras: { equals: q.replace(/\s+/g, '') } } })
    porCodigo = codigo.docs.map((p) => idDe(p.producto)!)
    const o: Where[] = [{ nombre: { like: q } }, { principioActivo: { like: q } }, { laboratorio: { like: q } }, { registroSenasica: { like: q } }]
    if (folio && (folio.prefijo === 'PRD' || folio.prefijo === null)) o.push({ id: { equals: folio.id } })
    if (porCodigo.length) o.push({ id: { in: porCodigo } })
    where.push({ or: o })
  }
  const r = await ctx.payload.find({ collection: 'far-productos', depth: 0, limit: limite, overrideAccess: true, sort: 'nombre', where: where.length ? { and: where } : {} })
  const ids = r.docs.map((p) => p.id)
  const [pres, ex] = await Promise.all([
    ids.length ? ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, where: { producto: { in: ids } } }) : { docs: [] as FarPresentacion[] },
    existenciasDe(ctx.payload, ids, ctx.hoy),
  ])
  const porProducto = new Map<number, FarPresentacion[]>()
  for (const p of pres.docs) {
    const pid = idDe(p.producto)!
    porProducto.set(pid, [...(porProducto.get(pid) ?? []), p])
  }
  let productos = r.docs.map((p) => breve(p, porProducto.get(p.id) ?? [], ex.get(p.id)))
  if (filtros.bajoMinimo) productos = productos.filter((p) => p.bajoMinimo)
  /* Un código de barras exacto va primero. */
  if (porCodigo.length) productos.sort((a, b) => Number(porCodigo.includes(b.id)) - Number(porCodigo.includes(a.id)))
  return { productos, total: r.totalDocs }
}

export async function producto(ctx: Ctx, id: number): Promise<ProductoVista & { lotes: LoteVista[] }> {
  exigirAlgo(ctx)
  const p = await ctx.payload.findByID({ collection: 'far-productos', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese producto.')
  const [pres, ex, lotes, cfg] = await Promise.all([
    ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, sort: 'factor', where: { producto: { equals: id } } }),
    existenciasDe(ctx.payload, [id], ctx.hoy),
    ctx.payload.find({ collection: 'far-lotes', depth: 1, pagination: false, overrideAccess: true, sort: 'caducidad', where: { producto: { equals: id } } }),
    leerConfiguracion(ctx.payload),
  ])
  return { ...vistaProducto(p, pres.docs, ex.get(id)), lotes: lotes.docs.map((l) => vistaLote(l, p, cfg, ctx)) }
}

export async function crearProducto(ctx: Ctx, entrada: unknown): Promise<ProductoVista> {
  exigir(ctx, 'catalogo', 'Tu rol no incluye editar el catálogo.')
  const d = esquemaProducto.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const falla = validarProducto(d.data)
  if (falla) throw invalido(falla)
  const creado = await ctx.payload.create({ collection: 'far-productos', overrideAccess: true, depth: 1, data: datosProducto(d.data) as never })
  return vistaProducto(creado, [], undefined)
}

export async function actualizarProducto(ctx: Ctx, id: number, entrada: unknown): Promise<ProductoVista> {
  exigir(ctx, 'catalogo', 'Tu rol no incluye editar el catálogo.')
  const actual = await ctx.payload.findByID({ collection: 'far-productos', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!actual) throw noEncontrado('No encontramos ese producto.')
  const d = esquemaProducto.partial().safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const fusion = { ...actual, ...d.data, linea: d.data.linea ?? actual.linea, grupo: d.data.grupo ?? actual.grupo, nombre: d.data.nombre ?? actual.nombre } as z.infer<typeof esquemaProducto>
  const falla = validarProducto(fusion)
  if (falla) throw invalido(falla)
  const p = await ctx.payload.update({ collection: 'far-productos', id, overrideAccess: true, depth: 1, data: datosProducto(d.data as z.infer<typeof esquemaProducto>) as never })
  const [pres, ex] = await Promise.all([
    ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, sort: 'factor', where: { producto: { equals: id } } }),
    existenciasDe(ctx.payload, [id], ctx.hoy),
  ])
  return vistaProducto(p, pres.docs, ex.get(id))
}

const esquemaPresentacion = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre de la presentación.').max(120),
  factor: cantidad.refine((v) => v > 0, 'El factor debe ser mayor que cero.').default(1),
  precio,
  codigoBarras: z.string().trim().max(40).nullable().optional(),
  fraccionada: z.boolean().optional(),
  activa: z.boolean().optional(),
})

async function codigoRepetido(ctx: Ctx, codigo: string | null | undefined, exceptoId?: number): Promise<string | null> {
  const c = t(codigo)?.replace(/\s+/g, '')
  if (!c) return null
  const r = await ctx.payload.find({ collection: 'far-presentaciones', depth: 1, limit: 1, overrideAccess: true, where: { and: [{ codigoBarras: { equals: c } }, ...(exceptoId ? [{ id: { not_equals: exceptoId } }] : [])] } })
  const otra = r.docs[0]
  if (!otra) return null
  const nombre = typeof otra.producto === 'object' ? otra.producto.nombre : `producto ${idDe(otra.producto)}`
  return `El código de barras ${c} ya está en «${nombre} · ${otra.nombre}».`
}

export async function crearPresentacion(ctx: Ctx, productoId: number, entrada: unknown): Promise<PresentacionVista> {
  exigir(ctx, 'catalogo', 'Tu rol no incluye editar el catálogo.')
  const prod = await ctx.payload.findByID({ collection: 'far-productos', id: productoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!prod) throw noEncontrado('No encontramos ese producto.')
  const d = esquemaPresentacion.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const rep = await codigoRepetido(ctx, d.data.codigoBarras)
  if (rep) throw invalido(rep)
  const p = await ctx.payload.create({ collection: 'far-presentaciones', overrideAccess: true, depth: 0, data: { ...d.data, producto: productoId } })
  return vistaPresentacion(p)
}

export async function actualizarPresentacion(ctx: Ctx, id: number, entrada: unknown): Promise<PresentacionVista> {
  exigir(ctx, 'catalogo', 'Tu rol no incluye editar el catálogo.')
  const actual = await ctx.payload.findByID({ collection: 'far-presentaciones', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!actual) throw noEncontrado('No encontramos esa presentación.')
  const d = esquemaPresentacion.partial().safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  if (d.data.codigoBarras !== undefined) {
    const rep = await codigoRepetido(ctx, d.data.codigoBarras, id)
    if (rep) throw invalido(rep)
  }
  const p = await ctx.payload.update({ collection: 'far-presentaciones', id, overrideAccess: true, depth: 0, data: d.data })
  return vistaPresentacion(p)
}

/* ───────────────────────────── proveedores y almacenes ───────────────────────────── */

const esquemaProveedor = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del proveedor.').max(120),
  rfc: z.string().trim().max(13).nullable().optional(),
  diasEntrega: z.coerce.number().int().min(0).max(365).optional(),
  contacto: z.object({ nombre: z.string().trim().max(120).nullable(), telefono: z.string().trim().max(20).nullable(), correo: z.string().trim().email('Escribe un correo válido.').nullable().or(z.literal('')) }).partial().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  activo: z.boolean().optional(),
})

export async function crearProveedor(ctx: Ctx, entrada: unknown): Promise<ProveedorVista> {
  exigir(ctx, 'configurar', 'Los proveedores los dan de alta el dueño o quien configura la farmacia.')
  const d = esquemaProveedor.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const ya = await ctx.payload.find({ collection: 'far-proveedores', depth: 0, limit: 1, overrideAccess: true, where: { nombre: { equals: d.data.nombre } } })
  if (ya.totalDocs) throw invalido('Ya hay un proveedor con ese nombre.')
  const p = await ctx.payload.create({ collection: 'far-proveedores', overrideAccess: true, depth: 0, data: { ...d.data, contacto: { ...d.data.contacto, correo: d.data.contacto?.correo || null } } as never })
  return vistaProveedor(p)
}

export async function actualizarProveedor(ctx: Ctx, id: number, entrada: unknown): Promise<ProveedorVista> {
  exigir(ctx, 'configurar', 'Los proveedores los edita el dueño o quien configura la farmacia.')
  const d = esquemaProveedor.partial().safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const data: Record<string, unknown> = { ...d.data }
  if (d.data.contacto) data.contacto = { ...d.data.contacto, correo: d.data.contacto.correo || null }
  const p = await ctx.payload.update({ collection: 'far-proveedores', id, overrideAccess: true, depth: 0, data }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese proveedor.')
  return vistaProveedor(p)
}

const esquemaAlmacen = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del almacén.').max(80),
  tipo: z.enum(['farmacia', 'clinica', 'sucursal']).optional(),
  activo: z.boolean().optional(),
})

export async function crearAlmacen(ctx: Ctx, entrada: unknown): Promise<AlmacenVista> {
  exigir(ctx, 'configurar')
  const d = esquemaAlmacen.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const ya = await ctx.payload.find({ collection: 'far-almacenes', depth: 0, limit: 1, overrideAccess: true, where: { nombre: { equals: d.data.nombre } } })
  if (ya.totalDocs) throw invalido('Ya hay un almacén con ese nombre.')
  return vistaAlmacen(await ctx.payload.create({ collection: 'far-almacenes', overrideAccess: true, depth: 0, data: { tipo: 'farmacia', ...d.data } }))
}

export async function actualizarAlmacen(ctx: Ctx, id: number, entrada: unknown): Promise<AlmacenVista> {
  exigir(ctx, 'configurar')
  const d = esquemaAlmacen.partial().safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const a = await ctx.payload.update({ collection: 'far-almacenes', id, overrideAccess: true, depth: 0, data: d.data }).catch(() => null)
  if (!a) throw noEncontrado('No encontramos ese almacén.')
  return vistaAlmacen(a)
}

/** Almacén por omisión: el configurado, o el primero activo, o «Farmacia» recién creado. */
export async function almacenPorOmision(payload: Payload, req?: PayloadRequest): Promise<FarAlmacen> {
  const cfg = await leerConfiguracion(payload)
  if (cfg.almacenPorOmisionId) {
    const a = await payload.findByID({ collection: 'far-almacenes', id: cfg.almacenPorOmisionId, depth: 0, overrideAccess: true, req }).catch(() => null)
    if (a && a.activo !== false) return a
  }
  const activos = await payload.find({ collection: 'far-almacenes', depth: 0, limit: 1, overrideAccess: true, req, sort: 'id', where: { activo: { equals: true } } })
  if (activos.docs[0]) return activos.docs[0]
  return payload.create({ collection: 'far-almacenes', overrideAccess: true, req, depth: 0, data: { nombre: 'Farmacia', tipo: 'farmacia', activo: true } })
}

/* ───────────────────────────── inventario y kardex ───────────────────────────── */

/** Recalcula `existencia` del lote como la suma de su kardex. Dentro de la transacción. */
async function recalcularExistencia(payload: Payload, req: PayloadRequest, loteId: number): Promise<number> {
  const movs = await payload.find({ collection: 'far-movimientos', depth: 0, pagination: false, overrideAccess: true, req, where: { lote: { equals: loteId } } })
  /* Suma en milésimas enteras para no arrastrar errores de coma flotante (ml, g). */
  const total = movs.docs.reduce((acc, m) => acc + Math.round(n0(m.cantidad) * 1000), 0) / 1000
  await payload.update({ collection: 'far-lotes', id: loteId, overrideAccess: true, req, depth: 0, data: { existencia: total } })
  return total
}

type NuevoMovimiento = {
  tipo: FarMovimiento['tipo']
  loteId: number
  cantidad: number
  costoUnidad?: number | null
  referencia?: string | null
  motivo?: string | null
}

/**
 * Registra un movimiento y deja la existencia del lote recalculada. Es la
 * ÚNICA puerta de escritura del kardex (compras, ventas, ajustes, mermas…).
 * Llamar siempre dentro de `enTransaccion` con candado sobre el lote.
 */
export async function registrarMovimiento(ctx: Ctx, req: PayloadRequest, m: NuevoMovimiento): Promise<{ movimiento: FarMovimiento; existencia: number }> {
  const lote = await ctx.payload.findByID({ collection: 'far-lotes', id: m.loteId, depth: 0, overrideAccess: true, req }).catch(() => null)
  if (!lote) throw noEncontrado('No encontramos ese lote.')
  const cant = Math.round(m.cantidad * 1000) / 1000
  if (!cant) throw invalido('La cantidad no puede ser cero.')
  const existenciaActual = (await ctx.payload.find({ collection: 'far-movimientos', depth: 0, pagination: false, overrideAccess: true, req, where: { lote: { equals: lote.id } } })).docs.reduce((acc, x) => acc + Math.round(n0(x.cantidad) * 1000), 0) / 1000
  if (existenciaActual + cant < -1e-9) throw invalido(`El lote ${lote.numeroLote} solo tiene ${existenciaActual} unidades: no puede salir ${Math.abs(cant)}.`)
  const movimiento = await ctx.payload.create({
    collection: 'far-movimientos',
    overrideAccess: true,
    req,
    depth: 0,
    data: {
      tipo: m.tipo,
      producto: idDe(lote.producto)!,
      lote: lote.id,
      almacen: idDe(lote.almacen)!,
      cantidad: cant,
      costoUnidad: m.costoUnidad ?? nOpc(lote.costoUnidad),
      dia: ctx.hoy,
      referencia: t(m.referencia),
      motivo: t(m.motivo),
      usuario: ctx.user.id,
      existenciaDespues: Math.round((existenciaActual + cant) * 1000) / 1000,
    },
  })
  const existencia = await recalcularExistencia(ctx.payload, req, lote.id)
  return { movimiento, existencia }
}

const esquemaAjuste = z.object({
  productoId: z.coerce.number().int().positive(),
  /** Lote existente… */
  loteId: z.coerce.number().int().positive().optional(),
  /** …o lote nuevo (solo entradas). */
  lote: z
    .object({
      numeroLote: z.string().trim().min(1, 'Escribe el número de lote.').max(60),
      caducidad: z.string().refine(esFecha, 'Escribe la caducidad como AAAA-MM-DD.'),
      costoUnidad: z.coerce.number().min(0).nullable().optional(),
      almacenId: z.coerce.number().int().positive().optional(),
    })
    .optional(),
  tipo: z.enum(['ajuste', 'merma']).default('ajuste'),
  /** Con signo: positiva entra, negativa sale. Una merma siempre sale. */
  cantidad: cantidad.refine((v) => v !== 0, 'La cantidad no puede ser cero.'),
  motivo: z.string().trim().min(3, 'Escribe el motivo del ajuste.').max(300),
  referencia: z.string().trim().max(80).nullable().optional(),
})

/**
 * Ajuste de inventario o merma, con motivo obligatorio. Es también la forma de
 * cargar el inventario inicial (lote nuevo + cantidad positiva) antes de que
 * exista el módulo de compras (fase 2). Solo «Ajustes, mermas y conteo».
 */
export async function ajustar(ctx: Ctx, entrada: unknown): Promise<{ lote: LoteVista; movimiento: MovimientoVista }> {
  exigir(ctx, 'ajustes', 'Los ajustes y mermas los registra el encargado o un rol superior.')
  const d = esquemaAjuste.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  const prod = await ctx.payload.findByID({ collection: 'far-productos', id: v.productoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!prod) throw noEncontrado('No encontramos ese producto.')
  if (v.tipo === 'merma' && v.cantidad > 0) throw invalido('Una merma siempre es una salida: escribe la cantidad que se pierde.')
  if (!v.loteId && !v.lote) throw invalido('Elige un lote existente o captura lote y caducidad.')
  if (!v.loteId && v.cantidad < 0) throw invalido('Para una salida elige el lote del que sale.')
  if (v.lote && v.cantidad > 0 && v.lote.costoUnidad == null && ctx.p.farmacia.verCostos) {
    /* Se permite sin costo (p. ej. muestra médica), pero queda registrado como costo cero a propósito. */
  }
  const cfg = await leerConfiguracion(ctx.payload)

  return enTransaccion(
    ctx,
    async (req) => {
      let lote: FarLote
      if (v.loteId) {
        const l = await ctx.payload.findByID({ collection: 'far-lotes', id: v.loteId, depth: 0, overrideAccess: true, req }).catch(() => null)
        if (!l || idDe(l.producto) !== prod.id) throw noEncontrado('Ese lote no es de este producto.')
        lote = l
      } else {
        const nl = v.lote!
        const almacen = nl.almacenId
          ? await ctx.payload.findByID({ collection: 'far-almacenes', id: nl.almacenId, depth: 0, overrideAccess: true, req }).catch(() => null)
          : await almacenPorOmision(ctx.payload, req)
        if (!almacen) throw noEncontrado('No encontramos ese almacén.')
        /* Mismo número de lote del mismo producto en el mismo almacén: se reutiliza (una entrada más al mismo lote). */
        const mismo = await ctx.payload.find({ collection: 'far-lotes', depth: 0, limit: 1, overrideAccess: true, req, where: { and: [{ producto: { equals: prod.id } }, { almacen: { equals: almacen.id } }, { numeroLote: { equals: nl.numeroLote } }] } })
        if (mismo.docs[0]) {
          lote = mismo.docs[0]
          if (lote.caducidad !== nl.caducidad) throw invalido(`El lote ${nl.numeroLote} ya existe con caducidad ${lote.caducidad}. Si es otro lote, usa otro número.`)
        } else {
          lote = await ctx.payload.create({
            collection: 'far-lotes',
            overrideAccess: true,
            req,
            depth: 0,
            data: {
              producto: prod.id,
              almacen: almacen.id,
              numeroLote: nl.numeroLote,
              caducidad: nl.caducidad,
              cantidadRecibida: 0,
              existencia: 0,
              costoUnidad: nl.costoUnidad ?? null,
              referencia: t(v.referencia) ?? `Ajuste: ${v.motivo}`,
              bloqueado: nl.caducidad < ctx.hoy,
            },
          })
        }
      }
      const { movimiento, existencia } = await registrarMovimiento(ctx, req, {
        tipo: v.tipo,
        loteId: lote.id,
        cantidad: v.cantidad,
        costoUnidad: v.lote?.costoUnidad ?? undefined,
        referencia: v.referencia,
        motivo: v.motivo,
      })
      /* Una entrada por ajuste cuenta como «recibida» para el lote (así cuadra «recibida − salidas»). */
      const dataLote: Record<string, unknown> = {}
      if (v.cantidad > 0) dataLote.cantidadRecibida = Math.round((n0(lote.cantidadRecibida) + v.cantidad) * 1000) / 1000
      if (v.lote?.costoUnidad != null && lote.costoUnidad == null) dataLote.costoUnidad = v.lote.costoUnidad
      const actualizado = Object.keys(dataLote).length
        ? await ctx.payload.update({ collection: 'far-lotes', id: lote.id, overrideAccess: true, req, depth: 1, data: dataLote })
        : await ctx.payload.findByID({ collection: 'far-lotes', id: lote.id, depth: 1, overrideAccess: true, req })
      void existencia
      const nombres = { producto: () => prod.nombre, lote: () => ({ numero: lote.numeroLote }), almacen: (id: number) => (typeof actualizado.almacen === 'object' ? actualizado.almacen.nombre : `Almacén ${id}`) }
      return { lote: vistaLote(actualizado, prod, cfg, ctx), movimiento: vistaMovimiento(movimiento, ctx, nombres) }
    },
    v.loteId ? [v.loteId] : [],
  )
}

export async function bloquearLote(ctx: Ctx, id: number, entrada: unknown): Promise<LoteVista> {
  exigir(ctx, 'ajustes')
  const d = z.object({ bloqueado: z.boolean() }).safeParse(entrada)
  if (!d.success) throw invalido('Indica si el lote queda bloqueado o no.')
  const l = await ctx.payload.findByID({ collection: 'far-lotes', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!l) throw noEncontrado('No encontramos ese lote.')
  if (!d.data.bloqueado && l.caducidad < ctx.hoy) throw invalido('Un lote vencido no se puede desbloquear: retíralo con una merma.')
  const act = await ctx.payload.update({ collection: 'far-lotes', id, overrideAccess: true, depth: 1, data: { bloqueado: d.data.bloqueado } })
  const prod = act.producto as FarProducto
  return vistaLote(act, prod, await leerConfiguracion(ctx.payload), ctx)
}

export async function inventario(ctx: Ctx, filtro: { q?: string; solo?: 'todos' | 'con_existencia' | 'por_vencer' | 'vencidos' | 'bajo_minimo' }): Promise<Inventario> {
  exigirAlgo(ctx)
  const cfg = await leerConfiguracion(ctx.payload)
  const { productos } = await buscarProductos(ctx, filtro.q ?? '', { inactivos: false }, 500)
  const ids = productos.map((p) => p.id)
  if (!ids.length) return { productos: [] }
  const [lotes, prods] = await Promise.all([
    ctx.payload.find({ collection: 'far-lotes', depth: 1, pagination: false, overrideAccess: true, sort: 'caducidad', where: { producto: { in: ids } } }),
    ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } }),
  ])
  const lineaDe = new Map(prods.docs.map((p) => [p.id, p]))
  const porProducto = new Map<number, LoteVista[]>()
  for (const l of lotes.docs) {
    const pid = idDe(l.producto)!
    const p = lineaDe.get(pid)!
    const v = vistaLote(l, p, cfg, ctx)
    if (v.existencia <= 0 && filtro.solo !== 'todos') continue
    porProducto.set(pid, [...(porProducto.get(pid) ?? []), v])
  }
  const solo = filtro.solo ?? 'con_existencia'
  const salida = productos
    .map((p) => ({ ...p, lotes: porProducto.get(p.id) ?? [] }))
    .filter((p) => {
      if (solo === 'todos') return true
      if (solo === 'con_existencia') return p.lotes.length > 0
      if (solo === 'por_vencer') return p.lotes.some((l) => l.estado === 'por_vencer' || l.estado === 'urgente')
      if (solo === 'vencidos') return p.lotes.some((l) => l.estado === 'vencido')
      if (solo === 'bajo_minimo') return p.bajoMinimo
      return true
    })
  return { productos: salida }
}

export async function kardex(ctx: Ctx, filtro: { productoId?: number; loteId?: number; limite?: number }): Promise<{ movimientos: MovimientoVista[]; total: number }> {
  exigirAlgo(ctx)
  const where: Where[] = []
  if (filtro.loteId) where.push({ lote: { equals: filtro.loteId } })
  if (filtro.productoId) where.push({ producto: { equals: filtro.productoId } })
  const r = await ctx.payload.find({ collection: 'far-movimientos', depth: 1, limit: Math.min(filtro.limite ?? 100, 500), overrideAccess: true, sort: '-createdAt', where: where.length ? { and: where } : {} })
  const nombres = { producto: (id: number) => `Producto ${id}`, lote: () => ({ numero: '' }), almacen: (id: number) => `Almacén ${id}` }
  return { movimientos: r.docs.map((m) => vistaMovimiento(m, ctx, nombres)), total: r.totalDocs }
}

/* ───────────────────────────── arranque ───────────────────────────── */

/**
 * Arranque de la farmacia (idempotente):
 *   - almacen: crea «Farmacia» si no hay almacenes y lo deja por omisión;
 *   - roles: crea los roles de farmacia que falten y, a Dueño y Administración
 *     que existan sin ninguna casilla de farmacia, les enciende todas (una
 *     instalación que ya tenía roles antes de este módulo no se queda sin
 *     nadie que pueda configurarlo). Un rol ya tocado no se cambia.
 */
export async function arranque(ctx: Ctx, entrada: unknown): Promise<{ hecho: string[] }> {
  exigirModulo(ctx)
  const d = z.object({ que: z.enum(['almacen', 'roles']) }).safeParse(entrada)
  if (!d.success) throw invalido('Petición no válida.')
  const hecho: string[] = []
  if (d.data.que === 'almacen') {
    exigir(ctx, 'configurar')
    const a = await almacenPorOmision(ctx.payload)
    const cfg = await leerConfiguracion(ctx.payload)
    if (!cfg.almacenPorOmisionId) await ctx.payload.updateGlobal({ slug: 'farmacia-configuracion', overrideAccess: true, data: { almacenPorOmision: a.id } })
    hecho.push(`almacén «${a.nombre}» por omisión`)
  }
  if (d.data.que === 'roles') {
    if (!ctx.p.gestionarUsuarios) throw prohibido('Los roles los crean los dueños o el superadministrador.')
    const existentes = await ctx.payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true })
    const porNombre = new Map(existentes.docs.map((r) => [r.nombre.trim().toLowerCase(), r]))
    await enTransaccion(ctx, async (req) => {
      for (const r of ROLES_FARMACIA) {
        if (porNombre.has(r.nombre.toLowerCase())) continue
        await ctx.payload.create({ collection: 'roles', req, overrideAccess: true, data: r as never })
        hecho.push(`rol «${r.nombre}»`)
      }
      for (const nombre of ['dueño', 'administración']) {
        const rol = porNombre.get(nombre)
        if (!rol) continue
        const fa = (rol.farmacia ?? {}) as Record<string, boolean | null | undefined>
        if (Object.values(fa).some(Boolean)) continue
        await ctx.payload.update({ collection: 'roles', id: rol.id, req, overrideAccess: true, data: { farmacia: { ...FARMACIA_TODO } } })
        hecho.push(`farmacia completa para «${rol.nombre}»`)
      }
    })
    if (!hecho.length) hecho.push('los roles de farmacia ya existían')
  }
  return { hecho }
}
