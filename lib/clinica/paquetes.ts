import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { Cita, FarPresentacion, FarProducto, Mascota, Paquete, PaqUso, PaqVendido, User } from '../../payload-types'
import { ESTADOS_OCUPAN } from '../../collections/clinica/agenda'
import { folioParaId } from '../../collections/clinica/acceso'
import { registrar as registrarEnFinanzas, anular as anularEnFinanzas } from '../finanzas/servicio'
import { calcularPermisos } from '../permisosBase'
import { leerModulos } from '../modulos'
import { configEstetica, NOMBRE_TALLA, tallaDeMascota } from './estetica'
import { type Ctx, type CtxTutor, ErrorClinica, idDe } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Paquetes con saldo de usos (nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * VENTA: recepción (permiso «Agenda») vende un paquete a una mascota desde su
 * expediente. Queda una copia del contenido (`paq-vendidos.renglones`) y una
 * entrada por cobrar en Finanzas con clave `paquete-<id>` (se cobra como las
 * citas). El precio es el del paquete o, si tiene precios por talla, el de la
 * talla de la mascota.
 *
 * SALDO por renglón = total − usos (`paq-usos`) − citas por venir ligadas al
 * paquete (`citas.paquete` en solicitada, confirmada, llegada o atención).
 * Un paquete vence el día `vence` (incluido) y no se usa después.
 *
 * USOS:
 *   - servicio con cita: al agendar, la cita se liga sola al paquete vigente
 *     con saldo de ese servicio (el equipo puede no ligarla). Al FINALIZAR se
 *     descuenta el uso y no se cobra el servicio (solo los adicionales de
 *     estética, si los hay). Si ya no hay saldo, se cobra normal.
 *   - servicio sin cita: «Registrar uso» a mano (con nota).
 *   - producto: «Entregar» registra una venta de mostrador en cero (descuenta
 *     el inventario con FEFO) y el uso. Nunca productos de Grupo I o II.
 *
 * Toda escritura toma un candado por paquete vendido dentro de la transacción
 * (pg_advisory_xact_lock 6 500 000 + id) para que dos usos simultáneos no
 * gasten el mismo saldo.
 */

const prohibido = (m = 'Tu rol no incluye la agenda.') => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos ese paquete.') => new ErrorClinica(404, m)

export type Talla = 'chico' | 'mediano' | 'grande' | 'gigante'
export type RenglonCatalogo = { tipo: 'servicio' | 'producto'; nombre: string; cantidad: number; servicioId: number | null; presentacionId: number | null }
export type PaqueteCatalogo = {
  id: number
  folio: string
  nombre: string
  descripcion: string | null
  precio: number
  preciosTalla: Partial<Record<Talla, number>> | null
  /** Precio más bajo (con precios por talla, el «desde»). */
  precioDesde: number
  vigenciaDias: number | null
  enLinea: boolean
  contenido: RenglonCatalogo[]
}
export type RenglonSaldo = { indice: number; tipo: 'servicio' | 'producto'; nombre: string; servicioId: number | null; presentacionId: number | null; total: number; usados: number; apartados: number; quedan: number }
export type UsoVista = { id: number; fecha: string; renglon: number; nombre: string; cantidad: number; origen: 'cita' | 'manual' | 'entrega'; cita: string | null; venta: number | null; por: string | null; nota: string | null }
export type EstadoPaqueteVendido = 'activo' | 'agotado' | 'vencido' | 'cancelado'
export type PaqueteVendidoVista = {
  id: number
  folio: string
  nombre: string
  mascota: { id: number; nombre: string }
  fecha: string
  vence: string | null
  estado: EstadoPaqueteVendido
  precio: number
  talla: string | null
  renglones: RenglonSaldo[]
  /** Solo el equipo: usos con fecha y quién. */
  usos: UsoVista[] | null
}

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d + n))
  return f.toISOString().slice(0, 10)
}

/* ───────────────────────────── catálogo ───────────────────────────── */

type PresConProducto = FarPresentacion & { producto: FarProducto }

async function presentaciones(payload: Payload, ids: number[]): Promise<Map<number, PresConProducto>> {
  if (!ids.length) return new Map()
  const r = await payload.find({ collection: 'far-presentaciones', depth: 1, pagination: false, overrideAccess: true, where: { id: { in: ids } } })
  return new Map(r.docs.filter((p) => typeof p.producto === 'object' && p.producto).map((p) => [p.id, p as PresConProducto]))
}

const nombrePresentacion = (p: PresConProducto) => `${p.producto.nombre} · ${p.nombre}`
const esControlado = (p: PresConProducto) => p.producto.grupo === 'I' || p.producto.grupo === 'II'

function preciosTallaDe(p: Paquete): Partial<Record<Talla, number>> | null {
  const out: Partial<Record<Talla, number>> = {}
  for (const k of ['chico', 'mediano', 'grande', 'gigante'] as Talla[]) {
    const v = p.preciosTalla?.[k]
    if (typeof v === 'number' && v >= 0) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/**
 * Paquetes activos con su contenido ya con nombres. `soloEnLinea`: los que se
 * muestran en el sitio y en la app. Sin la farmacia encendida, los paquetes con
 * productos no se ofrecen (no se podrían entregar); tampoco los que traen algo
 * de Grupo I o II (el catálogo lo impide, pero se vuelve a revisar).
 */
export async function catalogoPaquetes(payload: Payload, opciones: { soloEnLinea?: boolean; incluirInactivos?: boolean } = {}): Promise<PaqueteCatalogo[]> {
  const where: Where = opciones.soloEnLinea ? { and: [{ activo: { equals: true } }, { enLinea: { equals: true } }] } : opciones.incluirInactivos ? {} : { activo: { equals: true } }
  const [r, modulos] = await Promise.all([
    payload.find({ collection: 'paquetes', depth: 0, pagination: false, sort: 'orden', overrideAccess: true, where }),
    leerModulos(payload),
  ])
  const idsServ = [...new Set(r.docs.flatMap((p) => (p.contenido ?? []).map((c) => idDe(c.servicio)).filter((x): x is number => x != null)))]
  const idsPres = [...new Set(r.docs.flatMap((p) => (p.contenido ?? []).map((c) => idDe(c.presentacion)).filter((x): x is number => x != null)))]
  const [servs, pres] = await Promise.all([
    idsServ.length ? payload.find({ collection: 'servicios', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: idsServ } } }) : Promise.resolve({ docs: [] }),
    modulos.farmacia ? presentaciones(payload, idsPres) : Promise.resolve(new Map<number, PresConProducto>()),
  ])
  const servPorId = new Map(servs.docs.map((s) => [s.id, s]))
  const out: PaqueteCatalogo[] = []
  for (const p of r.docs) {
    const contenido: RenglonCatalogo[] = []
    let valido = true
    for (const c of p.contenido ?? []) {
      if (c.tipo === 'servicio') {
        const s = servPorId.get(idDe(c.servicio) ?? -1)
        if (!s) valido = false
        else contenido.push({ tipo: 'servicio', nombre: s.nombre, cantidad: c.cantidad, servicioId: s.id, presentacionId: null })
      } else {
        const pr = pres.get(idDe(c.presentacion) ?? -1)
        if (!pr || esControlado(pr)) valido = false
        else contenido.push({ tipo: 'producto', nombre: nombrePresentacion(pr), cantidad: c.cantidad, servicioId: null, presentacionId: pr.id })
      }
    }
    if (!valido || !contenido.length) continue
    const pt = preciosTallaDe(p)
    out.push({
      id: p.id,
      folio: folioParaId('PAQ', p.id),
      nombre: p.nombre,
      descripcion: t(p.descripcion),
      precio: p.precio,
      preciosTalla: pt,
      precioDesde: pt ? Math.min(...Object.values(pt)) : p.precio,
      vigenciaDias: p.vigenciaDias ?? null,
      enLinea: Boolean(p.enLinea),
      contenido,
    })
  }
  return out
}

/* ───────────────────────────── saldo ───────────────────────────── */

const ESTADOS_APARTAN = ESTADOS_OCUPAN as string[]

async function citasLigadas(payload: Payload, vendidoIds: number[], req?: PayloadRequest): Promise<Cita[]> {
  if (!vendidoIds.length) return []
  const r = await payload.find({ collection: 'citas', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ paquete: { in: vendidoIds } }, { estado: { in: ESTADOS_APARTAN } }] }, select: { paquete: true, servicio: true, estado: true } })
  return r.docs as Cita[]
}

async function usosDe(payload: Payload, vendidoIds: number[], req?: PayloadRequest): Promise<PaqUso[]> {
  if (!vendidoIds.length) return []
  const r = await payload.find({ collection: 'paq-usos', depth: 1, pagination: false, sort: '-createdAt', overrideAccess: true, req, where: { vendido: { in: vendidoIds } } })
  return r.docs
}

function saldo(v: PaqVendido, usos: PaqUso[], citas: Cita[]): RenglonSaldo[] {
  return (v.renglones ?? []).map((r, i) => {
    const usados = usos.filter((u) => idDe(u.vendido) === v.id && u.renglon === i).reduce((s, u) => s + u.cantidad, 0)
    const apartados = r.tipo === 'servicio' ? citas.filter((c) => idDe(c.paquete) === v.id && idDe(c.servicio) === idDe(r.servicio)).length : 0
    return { indice: i, tipo: r.tipo, nombre: r.nombre, servicioId: idDe(r.servicio), presentacionId: idDe(r.presentacion), total: r.total, usados, apartados, quedan: Math.max(0, r.total - usados - apartados) }
  })
}

function estadoDe(v: PaqVendido, renglones: RenglonSaldo[], hoy: string): EstadoPaqueteVendido {
  if (v.estado === 'cancelado') return 'cancelado'
  if (renglones.every((r) => r.usados >= r.total)) return 'agotado'
  if (v.vence && v.vence < hoy) return 'vencido'
  return 'activo'
}

function vista(v: PaqVendido, usos: PaqUso[], citas: Cita[], hoy: string, mascota: Pick<Mascota, 'id' | 'nombre'>, equipo: boolean): PaqueteVendidoVista {
  const renglones = saldo(v, usos, citas)
  return {
    id: v.id,
    folio: folioParaId('PQV', v.id),
    nombre: v.nombre,
    mascota: { id: mascota.id, nombre: mascota.nombre },
    fecha: v.fecha,
    vence: v.vence ?? null,
    estado: estadoDe(v, renglones, hoy),
    precio: v.precio,
    talla: v.talla ? (NOMBRE_TALLA[v.talla as Talla] ?? v.talla) : null,
    renglones,
    usos: equipo
      ? usos
          .filter((u) => idDe(u.vendido) === v.id)
          .map((u) => ({
            id: u.id,
            fecha: u.fecha,
            renglon: u.renglon,
            nombre: v.renglones?.[u.renglon]?.nombre ?? '—',
            cantidad: u.cantidad,
            origen: u.origen,
            cita: idDe(u.cita) ? folioParaId('CIT', idDe(u.cita)!) : null,
            venta: idDe(u.venta),
            por: u.por ?? null,
            nota: u.nota ?? null,
          }))
      : null,
  }
}

async function vistasDe(payload: Payload, vendidos: PaqVendido[], hoy: string, equipo: boolean): Promise<PaqueteVendidoVista[]> {
  const ids = vendidos.map((v) => v.id)
  const [usos, citas] = await Promise.all([usosDe(payload, ids), citasLigadas(payload, ids)])
  const idsMasc = [...new Set(vendidos.map((v) => idDe(v.mascota)!))]
  const masc = idsMasc.length ? await payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: idsMasc } }, select: { nombre: true } }) : { docs: [] }
  const mPorId = new Map(masc.docs.map((m) => [m.id, m]))
  return vendidos.map((v) => vista(v, usos, citas, hoy, mPorId.get(idDe(v.mascota)!) ?? { id: idDe(v.mascota)!, nombre: '—' }, equipo))
}

/* ───────────────────────────── equipo ───────────────────────────── */

export async function paquetesDeMascota(ctx: Ctx, mascotaId: number): Promise<{ vendidos: PaqueteVendidoVista[]; catalogo: PaqueteCatalogo[]; talla: string | null; farmacia: boolean }> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  const [r, catalogo, cfg, modulos] = await Promise.all([
    ctx.payload.find({ collection: 'paq-vendidos', depth: 0, pagination: false, sort: '-createdAt', overrideAccess: true, where: { mascota: { equals: mascotaId } } }),
    catalogoPaquetes(ctx.payload),
    configEstetica(ctx.payload),
    leerModulos(ctx.payload),
  ])
  const { talla } = await tallaDeMascota(ctx.payload, mascota, cfg)
  return { vendidos: await vistasDe(ctx.payload, r.docs, ctx.hoy, true), catalogo, talla, farmacia: modulos.farmacia }
}

/** Precio del paquete para esta mascota: por talla si el paquete los tiene. */
async function precioPara(payload: Payload, paq: PaqueteCatalogo, mascota: Mascota): Promise<{ precio: number; talla: Talla | null }> {
  if (!paq.preciosTalla) return { precio: paq.precio, talla: null }
  const { talla } = await tallaDeMascota(payload, mascota, await configEstetica(payload))
  if (!talla) throw invalido(`Este paquete tiene precio por talla y ${mascota.nombre} no tiene talla: registra su peso o fija su talla en el expediente.`)
  const p = paq.preciosTalla[talla]
  if (p == null) throw invalido(`El paquete no tiene precio para la talla ${NOMBRE_TALLA[talla].toLowerCase()}: captúralo en Clínica → Paquetes.`)
  return { precio: p, talla }
}

const ctxSistema = (ctx: Ctx): Ctx => ({ ...ctx, p: calcularPermisos({ esSuperadmin: true }, null) })

export async function venderPaquete(ctx: Ctx, mascotaId: number, entrada: unknown): Promise<PaqueteVendidoVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const d = z.object({ paqueteId: z.number().int().positive(), solicitudId: z.number().int().positive().nullable().optional(), notas: z.string().trim().max(500).optional().default('') }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Elige el paquete.')
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  if (mascota.estado === 'fallecido') throw invalido('La mascota está registrada como fallecida.')
  const paq = (await catalogoPaquetes(ctx.payload)).find((p) => p.id === d.data.paqueteId)
  if (!paq) throw invalido('Ese paquete no está disponible para vender (inactivo, o trae algo que no se puede entregar).')
  const { precio, talla } = await precioPara(ctx.payload, paq, mascota)
  const clienteId = idDe((mascota.tutores ?? []).find((x) => x.principal)?.cliente ?? mascota.tutores?.[0]?.cliente) ?? null
  const cliente = clienteId ? await ctx.payload.findByID({ collection: 'clientes', id: clienteId, depth: 0, overrideAccess: true }).catch(() => null) : null

  const vendido = await ctx.payload.create({
    collection: 'paq-vendidos',
    overrideAccess: true,
    depth: 0,
    data: {
      paquete: paq.id,
      nombre: paq.nombre,
      mascota: mascota.id,
      cliente: clienteId,
      precio,
      talla,
      fecha: ctx.hoy,
      vence: paq.vigenciaDias ? sumarDias(ctx.hoy, paq.vigenciaDias - 1) : null,
      estado: 'activo',
      renglones: paq.contenido.map((c) => ({ tipo: c.tipo, servicio: c.servicioId, presentacion: c.presentacionId, nombre: c.nombre, total: c.cantidad })),
      solicitud: d.data.solicitudId ?? null,
      vendidoPor: ctx.user.id,
      notas: d.data.notas || null,
    },
  })
  /* Entrada por cobrar en Finanzas (como el cargo de una cita). Si falla, no queda un paquete sin cargo. */
  let cargoId: number | null = null
  if (precio > 0) {
    try {
      const primerServicio = paq.contenido.find((c) => c.servicioId)?.servicioId
      const serv = primerServicio ? await ctx.payload.findByID({ collection: 'servicios', id: primerServicio, depth: 0, overrideAccess: true }).catch(() => null) : null
      const areaId = idDe(serv?.area)
      const r = await registrarEnFinanzas(
        ctxSistema(ctx),
        {
          tipo: 'entrada',
          importe: precio,
          fechaReal: ctx.hoy,
          estado: 'pendiente',
          concepto: `Paquete ${paq.nombre} · ${mascota.nombre}${talla ? ` (talla ${NOMBRE_TALLA[talla].toLowerCase()})` : ''}`,
          categoria: idDe(serv?.categoriaFinanzas),
          asignacion: areaId ? 'actividad' : 'pendiente',
          actividad: areaId,
          contraparte: cliente ? cliente.nombreCompleto || cliente.nombre : null,
          notas: `Paquete vendido ${folioParaId('PQV', vendido.id)}.`,
        },
        `paquete-${vendido.id}`,
      )
      cargoId = r.operacion.id
    } catch (e) {
      await ctx.payload.delete({ collection: 'paq-vendidos', id: vendido.id, overrideAccess: true }).catch(() => null)
      throw e
    }
  }
  const final = await ctx.payload.update({ collection: 'paq-vendidos', id: vendido.id, overrideAccess: true, depth: 0, data: { cargoFinanzas: cargoId } })
  if (d.data.solicitudId) await ctx.payload.update({ collection: 'solicitudes', id: d.data.solicitudId, overrideAccess: true, data: { estado: 'vendida' } }).catch(() => null)
  return (await vistasDe(ctx.payload, [final], ctx.hoy, true))[0]
}

async function conCandado<T>(payload: Payload, user: User | null, vendidoId: number, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq(user ? { user: user as User & { collection: 'users' } } : {}, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${6500000 + vendidoId})`)
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

async function cargarVendido(payload: Payload, id: number, req?: PayloadRequest): Promise<PaqVendido> {
  try {
    return await payload.findByID({ collection: 'paq-vendidos', id, depth: 0, overrideAccess: true, req })
  } catch {
    throw noEncontrado()
  }
}

function exigirVigente(v: PaqVendido, hoy: string): void {
  if (v.estado === 'cancelado') throw invalido('Ese paquete está cancelado.')
  if (v.vence && v.vence < hoy) throw invalido(`Ese paquete venció el ${v.vence}.`)
}

/** «Registrar uso» de un servicio sin cita (con nota). */
export async function registrarUso(ctx: Ctx, vendidoId: number, entrada: unknown): Promise<PaqueteVendidoVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const d = z.object({ renglon: z.number().int().min(0), nota: z.string().trim().max(200).optional().default('') }).safeParse(entrada)
  if (!d.success) throw invalido('Elige qué se usó.')
  await conCandado(ctx.payload, ctx.user, vendidoId, async (req) => {
    const v = await cargarVendido(ctx.payload, vendidoId, req)
    exigirVigente(v, ctx.hoy)
    const r = v.renglones?.[d.data.renglon]
    if (!r) throw invalido('Ese renglón no existe en el paquete.')
    if (r.tipo !== 'servicio') throw invalido('Los productos se entregan con «Entregar»: así se descuentan del inventario.')
    const s = saldo(v, await usosDe(ctx.payload, [v.id], req), await citasLigadas(ctx.payload, [v.id], req))[d.data.renglon]
    if (s.quedan < 1) throw invalido(s.apartados ? `No quedan usos libres de ${r.nombre}: ${s.apartados} ya están apartados por citas por venir.` : `Ya no quedan usos de ${r.nombre}.`)
    await ctx.payload.create({ collection: 'paq-usos', overrideAccess: true, req, data: { vendido: v.id, renglon: d.data.renglon, cantidad: 1, fecha: ctx.hoy, origen: 'manual', por: ctx.user.name || ctx.user.email, nota: d.data.nota || null } })
  })
  return (await vistasDe(ctx.payload, [await cargarVendido(ctx.payload, vendidoId)], ctx.hoy, true))[0]
}

/**
 * «Entregar» un producto del paquete: venta de mostrador en cero (inventario
 * FEFO, kardex) y el uso. Pide el permiso «Vender» de la farmacia. La clave de
 * la venta depende de cuántas piezas se llevan entregadas, así un reintento
 * no descuenta dos veces.
 */
export async function entregarProducto(ctx: Ctx, vendidoId: number, entrada: unknown): Promise<PaqueteVendidoVista> {
  const { contextoDesdeReq } = await import('../farmacia/servicio')
  const { registrarVenta } = await import('../farmacia/ventas')
  const fctx = await contextoDesdeReq(ctx.req)
  if (!fctx || !fctx.modulos.farmacia) throw invalido('La farmacia está apagada en esta instalación.')
  if (!fctx.p.farmacia.vender) throw prohibido('Entregar productos pide el permiso «Vender» de la farmacia.')
  const d = z.object({ renglon: z.number().int().min(0), cantidad: z.number().int().min(1).max(100).optional().default(1) }).safeParse(entrada)
  if (!d.success) throw invalido('Elige qué se entrega.')
  await conCandado(ctx.payload, ctx.user, vendidoId, async (req) => {
    const v = await cargarVendido(ctx.payload, vendidoId, req)
    exigirVigente(v, ctx.hoy)
    const r = v.renglones?.[d.data.renglon]
    if (!r) throw invalido('Ese renglón no existe en el paquete.')
    if (r.tipo !== 'producto' || !idDe(r.presentacion)) throw invalido('Ese renglón es un servicio: se usa con una cita o con «Registrar uso».')
    const s = saldo(v, await usosDe(ctx.payload, [v.id], req), [])[d.data.renglon]
    if (s.quedan < d.data.cantidad) throw invalido(s.quedan ? `Solo quedan ${s.quedan} de ${r.nombre}.` : `Ya se entregó todo lo de ${r.nombre}.`)
    const presId = idDe(r.presentacion)!
    const venta = await registrarVenta(
      fctx,
      {
        clave: `paquete-${v.id}-r${d.data.renglon}-u${s.usados + d.data.cantidad}`,
        mascotaId: idDe(v.mascota),
        clienteId: idDe(v.cliente),
        renglones: [{ presentacionId: presId, cantidad: d.data.cantidad }],
        pagos: [],
        notas: `Entrega del paquete ${folioParaId('PQV', v.id)} (ya pagado).`,
      },
      { preciosPactados: { [presId]: 0 } },
    ).catch((e: unknown) => {
      /* Errores de la farmacia (sin existencia, mascota no apta…) se devuelven tal cual. */
      const estado = (e as { estado?: unknown })?.estado
      if (typeof estado === 'number') throw new ErrorClinica(estado, (e as Error).message)
      throw e
    })
    await ctx.payload.create({ collection: 'paq-usos', overrideAccess: true, req, data: { vendido: v.id, renglon: d.data.renglon, cantidad: d.data.cantidad, fecha: ctx.hoy, origen: 'entrega', venta: venta.id, por: ctx.user.name || ctx.user.email } })
  })
  return (await vistasDe(ctx.payload, [await cargarVendido(ctx.payload, vendidoId)], ctx.hoy, true))[0]
}

/** Cancelar un paquete sin usos ni citas por venir: se anula su entrada en Finanzas. */
export async function cancelarPaquete(ctx: Ctx, vendidoId: number, entrada: unknown): Promise<PaqueteVendidoVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const d = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Escribe el motivo.')
  await conCandado(ctx.payload, ctx.user, vendidoId, async (req) => {
    const v = await cargarVendido(ctx.payload, vendidoId, req)
    if (v.estado === 'cancelado') return
    const [usos, citas] = await Promise.all([usosDe(ctx.payload, [v.id], req), citasLigadas(ctx.payload, [v.id], req)])
    if (usos.length) throw invalido('Este paquete ya tiene usos: no se puede cancelar. Si hay que devolver dinero, hazlo en Finanzas.')
    if (citas.length) throw invalido('Hay citas por venir ligadas a este paquete: cancélalas o desliga el paquete antes.')
    await ctx.payload.update({ collection: 'paq-vendidos', id: v.id, overrideAccess: true, req, data: { estado: 'cancelado', motivoCancelacion: d.data.motivo } })
  })
  const v = await cargarVendido(ctx.payload, vendidoId)
  const cargo = idDe(v.cargoFinanzas)
  if (cargo) await anularEnFinanzas(ctxSistema(ctx), cargo, { motivo: `Paquete ${folioParaId('PQV', v.id)} cancelado: ${d.data.motivo}` })
  return (await vistasDe(ctx.payload, [v], ctx.hoy, true))[0]
}

/* ───────────────────────────── citas ───────────────────────────── */

/**
 * Paquete vigente (en el día de la cita) de esa mascota con saldo libre de ese
 * servicio; el que vence primero. Lo usa `crear()` de la agenda al agendar.
 */
export async function paqueteParaCita(payload: Payload, mascotaId: number, servicioId: number, dia: string, req?: PayloadRequest): Promise<number | null> {
  const r = await payload.find({ collection: 'paq-vendidos', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ mascota: { equals: mascotaId } }, { estado: { equals: 'activo' } }] } })
  const candidatos = r.docs.filter((v) => (!v.vence || v.vence >= dia) && (v.renglones ?? []).some((x) => x.tipo === 'servicio' && idDe(x.servicio) === servicioId))
  if (!candidatos.length) return null
  const ids = candidatos.map((v) => v.id)
  const [usos, citas] = await Promise.all([usosDe(payload, ids, req), citasLigadas(payload, ids, req)])
  candidatos.sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.id - b.id)
  for (const v of candidatos) {
    const s = saldo(v, usos, citas).find((x) => x.tipo === 'servicio' && x.servicioId === servicioId)
    if (s && s.quedan > 0) return v.id
  }
  return null
}

/**
 * Al finalizar una cita ligada a un paquete: descuenta el uso (una sola vez por
 * cita). Devuelve `true` si la cita quedó cubierta por el paquete; `false` si
 * el paquete ya no aplica (cancelado, vencido o sin saldo) y hay que cobrarla.
 */
export async function consumirConCita(payload: Payload, user: User, cita: Cita, hoy: string): Promise<{ cubierta: boolean; folio: string | null }> {
  const vendidoId = idDe(cita.paquete)
  if (!vendidoId) return { cubierta: false, folio: null }
  return conCandado(payload, user, vendidoId, async (req) => {
    const ya = await payload.find({ collection: 'paq-usos', depth: 0, limit: 1, overrideAccess: true, req, where: { cita: { equals: cita.id } } })
    if (ya.docs[0]) return { cubierta: true, folio: folioParaId('PQV', vendidoId) }
    const v = await cargarVendido(payload, vendidoId, req).catch(() => null)
    if (!v || v.estado === 'cancelado' || (v.vence && v.vence < cita.dia)) return { cubierta: false, folio: null }
    const indice = (v.renglones ?? []).findIndex((x) => x.tipo === 'servicio' && idDe(x.servicio) === idDe(cita.servicio))
    if (indice < 0) return { cubierta: false, folio: null }
    /* Esta cita estaba apartando su uso: se cuenta sin ella. */
    const citas = (await citasLigadas(payload, [v.id], req)).filter((c) => c.id !== cita.id)
    const s = saldo(v, await usosDe(payload, [v.id], req), citas)[indice]
    if (s.quedan < 1) return { cubierta: false, folio: null }
    await payload.create({ collection: 'paq-usos', overrideAccess: true, req, data: { vendido: v.id, renglon: indice, cantidad: 1, fecha: hoy, origen: 'cita', cita: cita.id, por: user.name || user.email } })
    return { cubierta: true, folio: folioParaId('PQV', v.id) }
  })
}

/** Folio y nombre del paquete de una cita (para mostrarlo en la agenda y el portal). */
export async function nombresDePaquetes(payload: Payload, ids: number[]): Promise<Map<number, { folio: string; nombre: string }>> {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return new Map()
  const r = await payload.find({ collection: 'paq-vendidos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: unicos } }, select: { nombre: true } })
  return new Map(r.docs.map((v) => [v.id, { folio: folioParaId('PQV', v.id), nombre: v.nombre }]))
}

/* ───────────────────────────── portal ───────────────────────────── */

export async function portalPaquetes(c: CtxTutor): Promise<{ catalogo: PaqueteCatalogo[]; mios: PaqueteVendidoVista[]; mascotas: { id: number; nombre: string }[] }> {
  const clienteId = idDe(c.tutor.cliente)
  const catalogo = await catalogoPaquetes(c.payload, { soloEnLinea: true })
  if (!clienteId) return { catalogo, mios: [], mascotas: [] }
  const masc = await c.payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ 'tutores.cliente': { equals: clienteId } }, { estado: { equals: 'activo' } }] }, select: { nombre: true } })
  const ids = masc.docs.map((m) => m.id)
  const r = ids.length ? await c.payload.find({ collection: 'paq-vendidos', depth: 0, pagination: false, sort: '-createdAt', overrideAccess: true, where: { and: [{ mascota: { in: ids } }, { estado: { not_equals: 'cancelado' } }] } }) : { docs: [] }
  return { catalogo, mios: await vistasDe(c.payload, r.docs, c.hoy, false), mascotas: masc.docs.map((m) => ({ id: m.id, nombre: m.nombre })) }
}

/** Saldo vigente por mascota (para el inicio del portal): «Te quedan 3 de 10 sesiones». */
export async function portalSaldos(c: CtxTutor): Promise<PaqueteVendidoVista[]> {
  return (await portalPaquetes(c)).mios.filter((v) => v.estado === 'activo')
}
