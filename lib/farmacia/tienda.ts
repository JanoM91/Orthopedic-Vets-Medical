import crypto from 'crypto'
import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { FarLote, FarPedido, FarPresentacion, FarProducto, FarReceta, Mascota, Tutor } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { contextoTutor, idDe as idDeClinica, urlFoto } from '../clinica/servicio'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { diaLocal } from '../localTime'
import { leerModulos, type Modulos } from '../modulos'
import { rateLimit } from '../rateLimit'
import { site } from '../site'
import { apartadas, apartaInventario, ESTADOS_QUE_APARTAN as ESTADOS_APARTAN } from './apartados'
import { pasarelaDisponible, proveedorPago, type EventoPago } from './pagos'
import { pacienteDe, recetaVigente, renglonQueCubre } from './recetas'
import { almacenPorOmision, type Ctx, ErrorFarmacia, idDe, leerConfiguracion } from './servicio'
import type { ConfiguracionVista, PacienteVenta } from './tipos'
import type { AptoTienda, EstadoPedido, MascotaCompra, PedidoVista, PerfilCompra, ProductoTienda, RecetaTienda, SesionTienda } from './tiposTienda'
import { ESTADO_PEDIDO_LABEL } from './tiposTienda'
import { invalido, n0, noEncontrado, nOpc, prohibido, r3, revisarContraMascota, t } from './util'
import { registrarVenta } from './ventas'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Tienda en línea (Farmacia, fase 5a, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ SE VE EN LA TIENDA: productos activos, «Publicado en la tienda» y que no
 * sean Grupo I (el Grupo I nunca aparece en el catálogo público). El Grupo II
 * se ve con «Requiere receta» y solo lo pide un tutor con sesión que tenga una
 * receta vigente de esa mascota que lo cubra y con surtidos.
 *
 * APARTADO: un pedido vigente aparta unidades base por producto sin mover el
 * kardex. Disponible en tienda y mostrador = vendible de los lotes (no
 * vencidos ni bloqueados, almacén por omisión) − lo apartado. Sin pago, el
 * apartado vence a las `horasApartado`; la vigencia se evalúa al leer (no
 * depende del cron), y el cron diario solo marca «expirado» lo vencido.
 *
 * PAGO: «al recoger» (si la configuración lo permite) o «en línea» con la
 * pasarela activa (lib/farmacia/pagos.ts). En línea, el pedido pasa a
 * «pagado» SOLO por un aviso firmado del proveedor; un aviso repetido no hace
 * nada (far-pagos-eventos).
 *
 * ENTREGA (panel): «Entregar» convierte el pedido en una venta con canal
 * «tienda» por `registrarVenta()` (FEFO, receta, libro de control, Finanzas),
 * descontando el apartado del propio pedido. Así una venta de la tienda y una
 * de mostrador siguen exactamente las mismas reglas.
 */

const ESTADOS_QUE_APARTAN = ESTADOS_APARTAN as readonly string[] as EstadoPedido[]
const FINALES: EstadoPedido[] = ['entregado', 'cancelado', 'expirado']

const hoyNegocio = () => diaLocal(new Date())

/** Vendible por producto (lotes no vencidos ni bloqueados del almacén por omisión). */
async function vendiblePorProducto(payload: Payload, productoIds: number[], hoy: string, req?: PayloadRequest): Promise<Map<number, number>> {
  const m = new Map<number, number>()
  if (!productoIds.length) return m
  const almacen = await almacenPorOmision(payload, req).catch(() => null)
  if (!almacen) return m
  const lotes = await payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ producto: { in: productoIds } }, { almacen: { equals: almacen.id } }, { existencia: { greater_than: 0 } }, { bloqueado: { not_equals: true } }, { caducidad: { greater_than_equal: hoy } }] } })
  for (const l of lotes.docs as FarLote[]) m.set(idDe(l.producto)!, r3((m.get(idDe(l.producto)!) ?? 0) + n0(l.existencia)))
  return m
}

/** Disponible para vender (tienda o mostrador) = vendible − apartado. */
export async function disponiblePorProducto(payload: Payload, productoIds: number[], opciones: { hoy?: string; excluirPedido?: number | null; req?: PayloadRequest } = {}): Promise<Map<number, number>> {
  const [vend, apart] = await Promise.all([vendiblePorProducto(payload, productoIds, opciones.hoy ?? hoyNegocio(), opciones.req), apartadas(payload, productoIds, opciones)])
  const m = new Map<number, number>()
  for (const id of productoIds) m.set(id, Math.max(0, r3((vend.get(id) ?? 0) - (apart.get(id) ?? 0))))
  return m
}

/* ───────────────────────────── contexto público ───────────────────────────── */

type Publico = { payload: Payload; modulos: Modulos; cfg: ConfiguracionVista; hoy: string; tutor: Tutor | null; clienteId: number | null }

async function contextoPublico(payload: Payload, headers: Headers): Promise<Publico> {
  const modulos = await leerModulos(payload)
  if (!modulos.farmacia || !modulos.tienda) throw new ErrorFarmacia(404, 'La tienda en línea no está activa.')
  const [cfg, c] = await Promise.all([leerConfiguracion(payload), contextoTutor(payload, headers).catch(() => null)])
  return { payload, modulos, cfg, hoy: hoyNegocio(), tutor: c?.tutor ?? null, clienteId: c ? idDeClinica(c.tutor.cliente) : null }
}

/** Ctx mínimo para reutilizar `pacienteDe` (solo usa payload, módulos y hoy). */
const ctxSistema = (x: Publico) => ({ payload: x.payload, modulos: x.modulos, hoy: x.hoy }) as unknown as Ctx

async function mascotasDelCliente(x: Publico): Promise<Mascota[]> {
  if (!x.clienteId || !x.modulos.clinica) return []
  const r = await x.payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre', where: { and: [{ 'tutores.cliente': { equals: x.clienteId } }, { estado: { equals: 'activo' } }] } })
  return r.docs
}

async function recetasDelCliente(x: Publico, mascotas: Mascota[]): Promise<FarReceta[]> {
  if (!x.clienteId) return []
  const or: Where[] = [{ cliente: { equals: x.clienteId } }]
  if (mascotas.length) or.push({ mascota: { in: mascotas.map((m) => m.id) } })
  const r = await x.payload.find({ collection: 'far-recetas', depth: 1, limit: 40, overrideAccess: true, sort: '-createdAt', where: { and: [{ estado: { equals: 'valida' } }, { vigenteHasta: { greater_than_equal: x.hoy } }, { or }] } })
  return r.docs
}

export async function sesionTienda(payload: Payload, headers: Headers): Promise<SesionTienda> {
  const x = await contextoPublico(payload, headers)
  const mascotas = await mascotasDelCliente(x)
  const pesos = mascotas.length ? await payload.find({ collection: 'mas-pesos', depth: 0, pagination: false, overrideAccess: true, sort: '-fecha', where: { mascota: { in: mascotas.map((m) => m.id) } } }) : { docs: [] }
  const peso = new Map<number, number>()
  for (const p of pesos.docs) if (!peso.has(idDe(p.mascota)!)) peso.set(idDe(p.mascota)!, p.kg)
  const recetas = await recetasDelCliente(x, mascotas)
  const prov = pasarelaDisponible(x.cfg.pasarelaActiva)
  return {
    tutor: x.tutor ? { nombre: x.tutor.nombre, correo: x.tutor.email, telefono: x.tutor.telefono ?? null } : null,
    vinculado: Boolean(x.clienteId),
    mascotas: mascotas.map((m): MascotaCompra => ({ id: m.id, nombre: m.nombre, especie: m.especie, pesoKg: peso.get(m.id) ?? null, foto: urlFoto(m.id, m.fotoFecha) })),
    recetas: recetas.map((r) => vistaRecetaTienda(r)).filter((r) => r.productos.some((x) => x.surtidosRestantes > 0)),
    pagoEnLinea: { disponible: Boolean(prov), proveedor: prov?.nombre ?? null },
    pagarAlRecoger: x.cfg.tienda.pagarAlRecoger,
    horasApartado: x.cfg.horasApartado,
  }
}

function vistaRecetaTienda(r: FarReceta): RecetaTienda {
  const m = typeof r.mascota === 'object' && r.mascota ? (r.mascota as Mascota) : null
  return {
    id: r.id,
    folio: folioParaId('REC', r.id),
    mascotaId: idDe(r.mascota),
    mascota: m?.nombre ?? null,
    vigenteHasta: r.vigenteHasta,
    productos: (r.renglones ?? []).map((x) => {
      const pr = typeof x.producto === 'object' && x.producto ? (x.producto as FarProducto) : null
      return {
        productoId: idDe(x.producto),
        nombre: pr?.nombre ?? x.principio ?? 'Medicamento',
        surtidosRestantes: Math.max(0, (nOpc(x.surtidosPermitidos) ?? 1) - (nOpc(x.surtidosUsados) ?? 0)),
        /* El Grupo I nunca se surte en línea; lo no publicado tampoco. */
        enTienda: Boolean(pr && pr.activo && pr.publicadoTienda && pr.grupo !== 'I'),
      }
    }),
  }
}

/* ───────────────────────────── catálogo ───────────────────────────── */

const esquemaPerfil = z.union([z.object({ mascotaId: z.coerce.number().int().positive() }), z.object({ especie: z.string().trim().min(2).max(20), pesoKg: z.coerce.number().positive().max(200).nullable() })])

/** Paciente para revisar compatibilidad: mascota del tutor (con alergias, edad y peso) o el perfil rápido del invitado. */
async function pacienteDePerfil(x: Publico, perfil: PerfilCompra | null): Promise<{ paciente: PacienteVenta | null; mascotaId: number | null }> {
  if (!perfil) return { paciente: null, mascotaId: null }
  if ('mascotaId' in perfil) {
    const propias = await mascotasDelCliente(x)
    if (!propias.some((m) => m.id === perfil.mascotaId)) throw noEncontrado('Esa mascota no está entre las tuyas.')
    return { paciente: (await pacienteDe(ctxSistema(x), perfil.mascotaId)).paciente, mascotaId: perfil.mascotaId }
  }
  return { paciente: { mascotaId: 0, folio: '', nombre: 'tu mascota', especie: perfil.especie, raza: null, edadMeses: null, pesoKg: perfil.pesoKg, pesoFecha: null, pesoDias: perfil.pesoKg != null ? 0 : null, alergias: null, cliente: null }, mascotaId: null }
}

function aptoPara(prod: FarProducto, paciente: PacienteVenta | null): AptoTienda | null {
  if (!paciente) return null
  const problemas = revisarContraMascota(prod, paciente)
  const duros = problemas.filter((p) => p.tipo !== 'peso_viejo' && p.tipo !== 'sin_peso')
  if (duros.length) return { estado: 'no_apto', motivos: duros.map((p) => p.mensaje.replace(/la mascota/g, paciente.nombre)) }
  if (problemas.some((p) => p.tipo === 'peso_viejo')) return { estado: 'confirmar_peso', motivos: ['Su último peso tiene más de 90 días: confirma su peso al recoger.'] }
  if (problemas.some((p) => p.tipo === 'sin_peso')) return { estado: 'sin_datos', motivos: ['Este producto va por peso: elige el peso de tu mascota.'] }
  return { estado: 'apto', motivos: [] }
}

const visiblePublico: Where = { and: [{ activo: { equals: true } }, { publicadoTienda: { equals: true } }, { grupo: { not_equals: 'I' } }] }

async function armarProductos(x: Publico, prods: FarProducto[], paciente: PacienteVenta | null): Promise<ProductoTienda[]> {
  if (!prods.length) return []
  const ids = prods.map((p) => p.id)
  const [pres, disp] = await Promise.all([
    x.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, sort: 'precio', where: { and: [{ producto: { in: ids } }, { activa: { equals: true } }] } }),
    disponiblePorProducto(x.payload, ids, { hoy: x.hoy }),
  ])
  const porProd = new Map<number, FarPresentacion[]>()
  for (const p of pres.docs) porProd.set(idDe(p.producto)!, [...(porProd.get(idDe(p.producto)!) ?? []), p])
  return prods
    .filter((p) => (porProd.get(p.id) ?? []).length)
    .map((p) => {
      const d = disp.get(p.id) ?? 0
      return {
        id: p.id,
        nombre: p.nombre,
        principioActivo: t(p.principioActivo),
        laboratorio: t(p.laboratorio),
        linea: p.linea,
        grupo: p.grupo,
        requiereReceta: p.grupo === 'II',
        descripcion: t(p.descripcion),
        imagenUrl: t(p.imagenUrl),
        especies: (p.especies ?? []) as string[],
        rangoPeso: { min: nOpc(p.pesoMinKg), max: nOpc(p.pesoMaxKg) },
        presentaciones: (porProd.get(p.id) ?? []).map((pr) => {
          const f = n0(pr.factor) || 1
          return { id: pr.id, nombre: pr.nombre, precio: pr.precio, fraccionada: Boolean(pr.fraccionada), disponible: d >= f - 1e-9, pocas: d >= f - 1e-9 && d < 3 * f }
        }),
        apto: aptoPara(p, paciente),
      }
    })
}

export async function catalogoTienda(payload: Payload, headers: Headers, f: { q?: string | null; linea?: string | null; perfil?: unknown }): Promise<{ productos: ProductoTienda[]; perfil: PerfilCompra | null }> {
  const x = await contextoPublico(payload, headers)
  const perfilP = f.perfil ? esquemaPerfil.safeParse(f.perfil) : null
  const perfil = perfilP?.success ? (perfilP.data as PerfilCompra) : null
  const { paciente } = await pacienteDePerfil(x, perfil).catch(() => ({ paciente: null }))
  const and: Where[] = [visiblePublico]
  const q = (f.q ?? '').trim().slice(0, 80)
  if (q) and.push({ or: [{ nombre: { like: q } }, { principioActivo: { like: q } }, { laboratorio: { like: q } }] })
  if (f.linea) and.push({ linea: { equals: f.linea } })
  const r = await payload.find({ collection: 'far-productos', depth: 0, limit: 60, overrideAccess: true, sort: 'nombre', where: { and } })
  const productos = await armarProductos(x, r.docs, paciente)
  /* Con mascota: primero lo apto y disponible. */
  const peso = (p: ProductoTienda) => (p.apto?.estado === 'no_apto' ? 2 : 0) + (p.presentaciones.some((z) => z.disponible) ? 0 : 1)
  productos.sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, 'es'))
  return { productos, perfil }
}

export async function productoTienda(payload: Payload, headers: Headers, id: number, perfil?: unknown): Promise<ProductoTienda> {
  const x = await contextoPublico(payload, headers)
  const r = await payload.find({ collection: 'far-productos', depth: 0, limit: 1, overrideAccess: true, where: { and: [visiblePublico, { id: { equals: id } }] } })
  if (!r.docs[0]) throw noEncontrado('Ese producto no está en la tienda.')
  const perfilP = perfil ? esquemaPerfil.safeParse(perfil) : null
  const { paciente } = await pacienteDePerfil(x, perfilP?.success ? (perfilP.data as PerfilCompra) : null).catch(() => ({ paciente: null }))
  const [p] = await armarProductos(x, r.docs, paciente)
  if (!p) throw noEncontrado('Ese producto no tiene presentaciones a la venta.')
  return p
}

/* ───────────────────────────── vistas de pedido ───────────────────────────── */

function vistaPedido(p: FarPedido, conToken = false): PedidoVista {
  const m = typeof p.mascota === 'object' && p.mascota ? (p.mascota as Mascota) : null
  const v: PedidoVista = {
    id: p.id,
    folio: folioParaId('PED', p.id),
    estado: estadoVisible(p),
    creadoEn: p.createdAt,
    expiraEn: p.expiraEn ?? null,
    entrega: p.entrega,
    pago: { forma: p.pago?.forma ?? 'al_recoger', estado: p.pago?.estado ?? 'pendiente', proveedor: t(p.pago?.proveedor), referencia: t(p.pago?.referencia), pagadoEn: p.pago?.pagadoEn ?? null },
    contacto: { nombre: p.contacto?.nombre ?? '', correo: p.contacto?.correo ?? '', telefono: t(p.contacto?.telefono) },
    mascota: m ? { id: m.id, nombre: m.nombre } : idDe(p.mascota) ? { id: idDe(p.mascota)!, nombre: 'Mascota' } : null,
    perfil: p.perfil?.especie ? { especie: p.perfil.especie, pesoKg: nOpc(p.perfil.pesoKg) } : null,
    renglones: (p.renglones ?? []).map((r) => ({
      presentacionId: idDe(r.presentacion)!,
      productoId: idDe(r.producto)!,
      descripcion: r.descripcion,
      grupo: t(r.grupo),
      cantidad: r.cantidad,
      precioUnitario: r.precioUnitario,
      importe: r.importe,
      recetaId: idDe(r.receta),
      recetaFolio: idDe(r.receta) ? folioParaId('REC', idDe(r.receta)!) : null,
    })),
    total: p.total,
    notasCliente: t(p.notasCliente),
    motivoCancelacion: t(p.motivoCancelacion),
    ventaId: idDe(p.venta),
    ventaFolio: idDe(p.venta) ? folioParaId('VTA', idDe(p.venta)!) : null,
    historial: (p.historial ?? []).map((h) => ({ estado: h.estado, fecha: h.fecha, por: t(h.por), detalle: t(h.detalle) })),
  }
  if (conToken) v.token = p.token
  return v
}

/** Un apartado sin pago y vencido se muestra «expirado» aunque el cron aún no lo marque. */
function estadoVisible(p: FarPedido): EstadoPedido {
  const e = p.estado as EstadoPedido
  if (ESTADOS_QUE_APARTAN.includes(e) && !apartaInventario(p)) return 'expirado'
  return e
}

const historial = (p: FarPedido, estado: string, por: string, detalle?: string | null) => [...(p.historial ?? []).map((h) => ({ estado: h.estado, fecha: h.fecha, por: h.por ?? null, detalle: h.detalle ?? null })), { estado, fecha: new Date().toISOString(), por, detalle: detalle ?? null }]

/* ───────────────────────────── crear pedido ───────────────────────────── */

const esquemaPedido = z.object({
  clave: z.string().trim().min(8, 'Falta la clave del pedido.').max(80),
  renglones: z
    .array(z.object({ presentacionId: z.coerce.number().int().positive(), cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(100), recetaId: z.coerce.number().int().positive().nullable().optional() }))
    .min(1, 'Tu carrito está vacío.')
    .max(30),
  perfil: esquemaPerfil.nullable().optional(),
  contacto: z.object({ nombre: z.string().trim().min(2, 'Escribe tu nombre.').max(120), correo: z.string().trim().toLowerCase().email('Escribe un correo válido.').max(160), telefono: z.string().trim().max(30).nullable().optional() }).optional(),
  entrega: z.enum(['recoger', 'domicilio']).default('recoger'),
  pago: z.enum(['al_recoger', 'en_linea']),
  notas: z.string().trim().max(400).nullable().optional(),
})

function ipDe(headers: Headers): string {
  return (headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'local').split(',')[0].trim()
}

async function conCandado<T>(payload: Payload, productoIds: number[], fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    /* Rango 9 000 000+: candado por producto para que dos pedidos simultáneos no aparten lo mismo. */
    if (tx) for (const id of [...new Set(productoIds)].sort((a, b) => a - b)) await tx.execute(sql`select pg_advisory_xact_lock(${9000000 + id})`)
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

export async function crearPedido(payload: Payload, headers: Headers, entrada: unknown): Promise<{ pedido: PedidoVista; urlPago: string | null; duplicado: boolean }> {
  const x = await contextoPublico(payload, headers)
  const d = esquemaPedido.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data

  const ya = await payload.find({ collection: 'far-pedidos', depth: 1, limit: 1, overrideAccess: true, where: { claveIdempotencia: { equals: v.clave } } })
  if (ya.docs[0]) return { pedido: vistaPedido(ya.docs[0], true), urlPago: null, duplicado: true }
  if (!rateLimit(`pedido:${ipDe(headers)}`, 30, 60 * 60 * 1000)) throw new ErrorFarmacia(429, 'Demasiados pedidos seguidos desde esta conexión. Espera un rato o llámanos.')

  if (v.entrega === 'domicilio') throw invalido('La entrega a domicilio llega pronto. Por ahora, elige «Recoger en farmacia».')
  const prov = pasarelaDisponible(x.cfg.pasarelaActiva)
  if (v.pago === 'en_linea' && !prov) throw invalido('El pago en línea todavía no está disponible. Elige pagar al recoger.')
  if (v.pago === 'al_recoger' && !x.cfg.tienda.pagarAlRecoger) throw invalido('Esta farmacia pide pagar en línea.')

  /* Con sesión, el correo es siempre el de la cuenta (ahí llegan los avisos y así lo ve en el portal). */
  const contacto = x.tutor ? { nombre: t(v.contacto?.nombre) ?? x.tutor.nombre, correo: x.tutor.email.toLowerCase(), telefono: t(v.contacto?.telefono) ?? t(x.tutor.telefono) } : v.contacto
  if (!contacto) throw invalido('Escribe tu nombre y tu correo para avisarte de tu pedido.')

  const perfil = (v.perfil ?? null) as PerfilCompra | null
  const { paciente, mascotaId } = await pacienteDePerfil(x, perfil)

  /* Presentaciones y productos */
  const presIds = [...new Set(v.renglones.map((r) => r.presentacionId))]
  const pres = await payload.find({ collection: 'far-presentaciones', depth: 1, pagination: false, overrideAccess: true, where: { id: { in: presIds } } })
  const presPorId = new Map(pres.docs.map((p) => [p.id, p]))
  /* Recetas del tutor: se leen solo si hay algo de Grupo II en el carrito. */
  let recetas: FarReceta[] | null = null

  type Plan = { pres: FarPresentacion; prod: FarProducto; cantidad: number; unidades: number; precioC: number; importeC: number; recetaId: number | null }
  const planes: Plan[] = []
  for (const r of v.renglones) {
    const pr = presPorId.get(r.presentacionId)
    const prod = pr && typeof pr.producto === 'object' ? (pr.producto as FarProducto) : null
    if (!pr || !prod || !pr.activa || !prod.activo || !prod.publicadoTienda || prod.grupo === 'I') throw invalido('Uno de los productos ya no está en la tienda. Revisa tu carrito.')
    if (!pr.fraccionada && !Number.isInteger(r.cantidad)) throw invalido(`${prod.nombre} se vende por pieza entera.`)
    if (paciente) {
      const duros = revisarContraMascota(prod, paciente).filter((p) => p.tipo !== 'peso_viejo' && p.tipo !== 'sin_peso')
      if (duros.length) throw invalido(`${prod.nombre} no es apto para ${paciente.nombre}: ${duros.map((p) => p.mensaje).join(' ')}`)
    }
    let recetaId: number | null = null
    if (prod.grupo === 'II') {
      if (!x.tutor || !x.clienteId) throw invalido(`${prod.nombre} requiere receta: entra al portal con tu cuenta (o agenda una consulta).`)
      if (!mascotaId) throw invalido(`${prod.nombre} requiere receta: elige para cuál de tus mascotas es.`)
      recetas = recetas ?? (await recetasDelCliente(x, await mascotasDelCliente(x)))
      const quedan = (y: FarReceta) => {
        const g = renglonQueCubre(y, prod)
        return g ? (nOpc(g.surtidosPermitidos) ?? 1) - (nOpc(g.surtidosUsados) ?? 0) : 0
      }
      const cubren = recetas.filter((y) => idDe(y.mascota) === mascotaId && recetaVigente(y, x.hoy) && renglonQueCubre(y, prod))
      if (!cubren.length) throw invalido(`${prod.nombre} requiere una receta vigente de ${paciente?.nombre ?? 'tu mascota'}. Agenda una consulta o pide la receta a tu veterinario.`)
      const rec = cubren.find((y) => y.id === r.recetaId && quedan(y) > 0) ?? cubren.find((y) => quedan(y) > 0)
      if (!rec) throw invalido(`La receta de ${paciente?.nombre ?? 'tu mascota'} ya no tiene surtidos de ${prod.nombre}. Pide una nueva a tu veterinario.`)
      /* Un pedido en curso con esa receta ya cuenta como surtido (se descuenta al entregar). */
      const enCurso = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ 'renglones.receta': { equals: rec.id } }, { estado: { in: ESTADOS_QUE_APARTAN } }] } })
      if (enCurso.docs.filter((y) => apartaInventario(y)).length >= quedan(rec)) throw invalido(`Ya tienes un pedido en curso con la receta ${folioParaId('REC', rec.id)}. Espera a recogerlo o cancélalo.`)
      recetaId = rec.id
    }
    const precioC = aCentavos(pr.precio) || 0
    planes.push({ pres: pr, prod, cantidad: r.cantidad, unidades: r3(r.cantidad * (n0(pr.factor) || 1)), precioC, importeC: Math.round(precioC * r.cantidad), recetaId })
  }
  const totalC = planes.reduce((a, p) => a + p.importeC, 0)
  const prodIds = [...new Set(planes.map((p) => p.prod.id))]
  const token = crypto.randomBytes(24).toString('hex')
  const expira = new Date(Date.now() + x.cfg.horasApartado * 3600000).toISOString()

  const creado = await conCandado(payload, prodIds, async (req) => {
    const disp = await disponiblePorProducto(payload, prodIds, { hoy: x.hoy, req })
    const pedidas = new Map<number, number>()
    for (const p of planes) pedidas.set(p.prod.id, r3((pedidas.get(p.prod.id) ?? 0) + p.unidades))
    for (const p of planes) {
      const hay = disp.get(p.prod.id) ?? 0
      if ((pedidas.get(p.prod.id) ?? 0) > hay + 1e-9) throw invalido(hay > 0 ? `Solo quedan ${r3(hay)} ${p.prod.unidadBase} de ${p.prod.nombre}. Ajusta la cantidad.` : `${p.prod.nombre} se agotó. Quítalo del carrito.`)
    }
    return payload.create({
      collection: 'far-pedidos',
      overrideAccess: true,
      req,
      depth: 0,
      data: {
        estado: v.pago === 'en_linea' ? 'pago_pendiente' : 'creado',
        claveIdempotencia: v.clave,
        token,
        tutor: x.tutor?.id ?? null,
        cliente: x.clienteId,
        mascota: mascotaId,
        contacto: { nombre: contacto.nombre, correo: contacto.correo, telefono: t(contacto.telefono) },
        perfil: perfil && !('mascotaId' in perfil) ? { especie: perfil.especie, pesoKg: perfil.pesoKg } : {},
        renglones: planes.map((p) => ({ presentacion: p.pres.id, producto: p.prod.id, descripcion: `${p.prod.nombre} · ${p.pres.nombre}`, grupo: p.prod.grupo, cantidad: p.cantidad, unidades: p.unidades, precioUnitario: aPesos(p.precioC), importe: aPesos(p.importeC), receta: p.recetaId })),
        total: aPesos(totalC),
        entrega: 'recoger',
        pago: { forma: v.pago, estado: 'pendiente', proveedor: v.pago === 'en_linea' ? prov!.nombre : null },
        expiraEn: expira,
        notasCliente: t(v.notas),
        historial: [{ estado: v.pago === 'en_linea' ? 'pago_pendiente' : 'creado', fecha: new Date().toISOString(), por: x.tutor ? `${x.tutor.nombre} (portal)` : `${contacto.nombre} (tienda)`, detalle: null }],
      },
    })
  }).catch(async (e) => {
    if (/clave_idempotencia|claveIdempotencia|unique|duplicate/i.test(String((e as Error)?.message))) {
      const otro = await payload.find({ collection: 'far-pedidos', depth: 0, limit: 1, overrideAccess: true, where: { claveIdempotencia: { equals: v.clave } } })
      if (otro.docs[0]) return otro.docs[0]
    }
    throw e
  })

  let urlPago: string | null = null
  if (v.pago === 'en_linea' && prov) urlPago = await abrirCobro(payload, creado.id, prov.nombre)
  const final = await payload.findByID({ collection: 'far-pedidos', id: creado.id, depth: 1, overrideAccess: true })
  await avisarPedido(payload, final, 'nuevo').catch((e) => payload.logger.error(`[tienda] aviso de pedido nuevo: ${String(e)}`))
  return { pedido: vistaPedido(final, true), urlPago, duplicado: false }
}

async function abrirCobro(payload: Payload, pedidoId: number, nombre: string): Promise<string> {
  const prov = proveedorPago(nombre)
  if (!prov || !prov.disponible()) throw invalido('El pago en línea no está disponible ahora.')
  const p = await payload.findByID({ collection: 'far-pedidos', id: pedidoId, depth: 0, overrideAccess: true })
  const cobro = await prov.crearCobro({ pedidoId: p.id, folio: folioParaId('PED', p.id), total: p.total, token: p.token, base: site.url, descripcion: `Pedido ${folioParaId('PED', p.id)} · ${site.brand.name}` })
  await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { pago: { ...(p.pago ?? {}), forma: 'en_linea', proveedor: prov.nombre, referencia: cobro.referencia } } })
  return cobro.url
}

/* ───────────────────────────── seguimiento (tutor o invitado con su liga) ───────────────────────────── */

async function pedidoPorFolio(payload: Payload, folio: string, token: string): Promise<FarPedido> {
  const m = /^PED-0*(\d+)$/i.exec(folio.trim())
  if (!m || !token || token.length < 20) throw noEncontrado('No encontramos ese pedido.')
  const p = await payload.findByID({ collection: 'far-pedidos', id: Number(m[1]), depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese pedido.')
  const a = Buffer.from(p.token), b = Buffer.from(token)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw noEncontrado('No encontramos ese pedido.')
  return p
}

export async function seguimiento(payload: Payload, folio: string, token: string): Promise<PedidoVista & { pagoEnLinea: boolean }> {
  const p = await pedidoPorFolio(payload, folio, token)
  const cfg = await leerConfiguracion(payload)
  return { ...vistaPedido(p, true), pagoEnLinea: Boolean(pasarelaDisponible(cfg.pasarelaActiva)) }
}

export async function pagarPedido(payload: Payload, folio: string, token: string): Promise<{ url: string }> {
  const p = await pedidoPorFolio(payload, folio, token)
  if (estadoVisible(p) === 'expirado') throw invalido('Este apartado ya venció. Haz un pedido nuevo.')
  if (p.pago?.estado === 'pagado') throw invalido('Este pedido ya está pagado.')
  if (!['pago_pendiente', 'creado'].includes(p.estado)) throw invalido('Este pedido ya no se puede pagar en línea.')
  const cfg = await leerConfiguracion(payload)
  const prov = pasarelaDisponible(cfg.pasarelaActiva)
  if (!prov) throw invalido('El pago en línea no está disponible ahora. Puedes pagar al recoger.')
  if (p.estado === 'creado') await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'pago_pendiente', historial: historial(p, 'pago_pendiente', `${p.contacto?.nombre ?? 'Cliente'} (tienda)`, 'Cambió a pago en línea') } })
  return { url: await abrirCobro(payload, p.id, prov.nombre) }
}

export async function cancelarPorCliente(payload: Payload, folio: string, token: string, motivo?: string | null): Promise<PedidoVista> {
  const p = await pedidoPorFolio(payload, folio, token)
  if (!['pago_pendiente', 'creado'].includes(p.estado) || p.pago?.estado === 'pagado') throw invalido('Este pedido ya no se puede cancelar desde aquí. Llámanos o escríbenos.')
  const n = await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 1, data: { estado: 'cancelado', motivoCancelacion: t(motivo) ?? 'Cancelado por el cliente', expiraEn: null, historial: historial(p, 'cancelado', `${p.contacto?.nombre ?? 'Cliente'} (tienda)`, t(motivo)) } })
  await avisarPedido(payload, n, 'cancelado').catch(() => undefined)
  return vistaPedido(n, true)
}

/* ───────────────────────────── aviso de la pasarela ───────────────────────────── */

/** Procesa un aviso ya verificado. Idempotente por proveedor + idEvento. */
export async function procesarEventoPago(payload: Payload, proveedor: string, ev: EventoPago): Promise<{ resultado: string; duplicado: boolean }> {
  const clave = `${proveedor}:${ev.idEvento}`
  try {
    await payload.create({ collection: 'far-pagos-eventos', overrideAccess: true, depth: 0, data: { clave, pedido: ev.pedidoId, tipo: ev.resultado, resultado: 'recibido' } })
  } catch (e) {
    if (/unique|duplicate|clave/i.test(String((e as Error)?.message))) return { resultado: 'ya procesado', duplicado: true }
    throw e
  }
  const p = await payload.findByID({ collection: 'far-pedidos', id: ev.pedidoId, depth: 1, overrideAccess: true }).catch(() => null)
  const marcar = async (resultado: string) => {
    const r = await payload.find({ collection: 'far-pagos-eventos', depth: 0, limit: 1, overrideAccess: true, where: { clave: { equals: clave } } })
    if (r.docs[0]) await payload.update({ collection: 'far-pagos-eventos', id: r.docs[0].id, overrideAccess: true, depth: 0, data: { resultado } })
    return { resultado, duplicado: false }
  }
  if (!p) return marcar('pedido inexistente')
  if (t(p.pago?.referencia) !== ev.referencia) return marcar('referencia distinta (cobro anterior o ajeno)')
  if (ev.resultado === 'rechazado') {
    await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { historial: historial(p, p.estado, proveedor, 'Pago rechazado por la pasarela') } })
    return marcar('rechazado')
  }
  if (p.pago?.estado === 'pagado') return marcar('ya estaba pagado')
  if (Math.abs((aCentavos(ev.monto) || 0) - (aCentavos(p.total) || 0)) > 0) {
    await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { historial: historial(p, p.estado, proveedor, `Monto pagado distinto del total (${ev.monto}): revisar`) } })
    return marcar('monto distinto')
  }
  const tarde = estadoVisible(p) === 'expirado' || ['cancelado', 'expirado'].includes(p.estado)
  const n = await payload.update({
    collection: 'far-pedidos',
    id: p.id,
    overrideAccess: true,
    depth: 1,
    data: {
      estado: ['cancelado', 'expirado'].includes(p.estado) ? p.estado : ['pago_pendiente', 'creado'].includes(p.estado) ? 'pagado' : p.estado,
      expiraEn: null,
      pago: { ...(p.pago ?? {}), estado: 'pagado', pagadoEn: new Date().toISOString() },
      historial: historial(p, 'pagado', proveedor, tarde ? 'Pagado después de vencer o cancelar el apartado: revisar existencia o reembolsar' : `Referencia ${ev.referencia}`),
    },
  })
  await avisarPedido(payload, n, 'pagado').catch(() => undefined)
  return marcar(tarde ? 'pagado tarde' : 'pagado')
}

export async function recibirAviso(payload: Payload, proveedor: string, cabeceras: Headers, cuerpo: string): Promise<{ resultado: string; duplicado: boolean }> {
  const prov = proveedorPago(proveedor)
  if (!prov || !prov.disponible()) throw new ErrorFarmacia(404, 'Proveedor de pago desconocido.')
  const ev = prov.verificarAviso(cabeceras, cuerpo)
  if (!ev) throw new ErrorFarmacia(401, 'Firma del aviso inválida.')
  return procesarEventoPago(payload, prov.nombre, ev)
}

/* ───────────────────────────── portal del tutor ───────────────────────────── */

export async function pedidosDelTutor(payload: Payload, tutorId: number): Promise<PedidoVista[]> {
  const r = await payload.find({ collection: 'far-pedidos', depth: 1, limit: 30, overrideAccess: true, sort: '-createdAt', where: { tutor: { equals: tutorId } } })
  return r.docs.map((p) => vistaPedido(p, true))
}

/* ───────────────────────────── panel (equipo) ───────────────────────────── */

function exigirPedidos(ctx: Ctx): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.vender && !ctx.p.farmacia.asignarRepartidor) throw prohibido('Tu rol no incluye los pedidos de la tienda.')
}

/** Marca «expirado» lo que venció sin pago (también lo hace el cron diario). */
export async function expirarPedidos(payload: Payload): Promise<number> {
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ estado: { in: ESTADOS_QUE_APARTAN } }, { expiraEn: { less_than: new Date().toISOString() } }, { 'pago.estado': { not_equals: 'pagado' } }] } })
  for (const p of r.docs) await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'expirado', historial: historial(p, 'expirado', 'Sistema', `Sin pago en ${Math.round((Date.parse(p.expiraEn!) - Date.parse(p.createdAt)) / 3600000)} h: se liberó lo apartado`) } })
  return r.docs.length
}

export type ResumenPedidos = { pedidos: PedidoVista[]; conteo: Record<'nuevos' | 'preparando' | 'listos' | 'cerrados', number> }

const GRUPO: Record<string, EstadoPedido[]> = {
  nuevos: ['pago_pendiente', 'creado', 'pagado', 'receta_por_validar'],
  preparando: ['preparando'],
  listos: ['listo_para_recoger', 'en_ruta'],
  cerrados: ['entregado', 'cancelado', 'expirado'],
}

export async function pedidosPanel(ctx: Ctx, grupo: string | null): Promise<ResumenPedidos> {
  exigirPedidos(ctx)
  await expirarPedidos(ctx.payload)
  const g = GRUPO[grupo ?? 'nuevos'] ? (grupo ?? 'nuevos') : 'nuevos'
  const [lista, ...conteos] = await Promise.all([
    ctx.payload.find({ collection: 'far-pedidos', depth: 1, limit: 100, overrideAccess: true, sort: g === 'cerrados' ? '-updatedAt' : 'createdAt', where: { estado: { in: GRUPO[g] } } }),
    ...Object.values(GRUPO).map((es) => ctx.payload.count({ collection: 'far-pedidos', overrideAccess: true, where: { estado: { in: es } } })),
  ])
  const [nuevos, preparando, listos, cerrados] = conteos.map((c) => c.totalDocs)
  return { pedidos: lista.docs.map((p) => vistaPedido(p)), conteo: { nuevos, preparando, listos, cerrados } }
}

export async function pedidoPanel(ctx: Ctx, id: number): Promise<PedidoVista> {
  exigirPedidos(ctx)
  const p = await ctx.payload.findByID({ collection: 'far-pedidos', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese pedido.')
  return vistaPedido(p)
}

const TRANSICION: Record<string, { de: EstadoPedido[]; a: EstadoPedido }> = {
  preparar: { de: ['creado', 'pagado'], a: 'preparando' },
  listo: { de: ['preparando'], a: 'listo_para_recoger' },
}

export async function avanzarPedido(ctx: Ctx, id: number, entrada: unknown): Promise<PedidoVista> {
  exigirPedidos(ctx)
  if (!ctx.p.farmacia.vender) throw prohibido('Preparar pedidos es del equipo de mostrador.')
  const d = z.object({ accion: z.enum(['preparar', 'listo', 'cancelar']), motivo: z.string().trim().max(300).nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Acción no válida.')
  const p = await ctx.payload.findByID({ collection: 'far-pedidos', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese pedido.')
  const quien = ctx.user.name || ctx.user.email
  if (d.data.accion === 'cancelar') {
    if (FINALES.includes(p.estado as EstadoPedido)) throw invalido('Ese pedido ya está cerrado.')
    if (!d.data.motivo || d.data.motivo.length < 3) throw invalido('Escribe el motivo de la cancelación (lo recibe el cliente).')
    const pagado = p.pago?.estado === 'pagado'
    const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: 'cancelado', motivoCancelacion: d.data.motivo, expiraEn: null, pago: pagado ? { ...(p.pago ?? {}), estado: 'reembolso_pendiente' } : p.pago, historial: historial(p, 'cancelado', quien, pagado ? `${d.data.motivo} · reembolso pendiente en la pasarela` : d.data.motivo) } })
    await avisarPedido(ctx.payload, n, 'cancelado').catch(() => undefined)
    return vistaPedido(n)
  }
  const tr = TRANSICION[d.data.accion]
  if (estadoVisible(p) === 'expirado') throw invalido('El apartado ya venció: lo apartado se liberó. Pide al cliente un pedido nuevo.')
  if (!tr.de.includes(p.estado as EstadoPedido)) throw invalido(`Un pedido «${ESTADO_PEDIDO_LABEL[p.estado as EstadoPedido]}» no puede pasar a «${ESTADO_PEDIDO_LABEL[tr.a]}».`)
  if (p.pago?.forma === 'en_linea' && p.pago.estado !== 'pagado') throw invalido('Este pedido es de pago en línea y todavía no se paga.')
  const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: tr.a, historial: historial(p, tr.a, quien) } })
  if (tr.a === 'listo_para_recoger') await avisarPedido(ctx.payload, n, 'listo').catch(() => undefined)
  return vistaPedido(n)
}

/**
 * Entregar: convierte el pedido en una venta (canal «tienda») con las mismas
 * reglas del mostrador. Pagado en línea → el pago entra con el método de la
 * configuración (`tienda.metodoPagoEnLinea`); al recoger → los pagos que
 * registra el mostrador. Con la misma `clave`, un doble clic no vende dos veces.
 */
export async function entregarPedido(ctx: Ctx, id: number, entrada: unknown): Promise<{ pedido: PedidoVista; ventaFolio: string; finanzas: string; avisos: string[] }> {
  exigirPedidos(ctx)
  const d = z
    .object({
      clave: z.string().trim().min(8).max(80),
      pesoConfirmadoKg: z.coerce.number().positive().max(500).nullable().optional(),
      pagos: z.array(z.object({ metodo: z.string().trim().min(1), monto: z.coerce.number().positive(), recibido: z.coerce.number().positive().nullable().optional(), referencia: z.string().trim().max(120).nullable().optional() })).max(4).optional(),
      autorizacion: z.object({ correo: z.string().trim().email(), contrasena: z.string().min(1) }).nullable().optional(),
    })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const p = await ctx.payload.findByID({ collection: 'far-pedidos', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese pedido.')
  if (idDe(p.venta)) return { pedido: vistaPedido(p), ventaFolio: folioParaId('VTA', idDe(p.venta)!), finanzas: 'registrado', avisos: [] }
  if (!['listo_para_recoger', 'preparando', 'pagado', 'creado'].includes(p.estado) || estadoVisible(p) === 'expirado') throw invalido(`Un pedido «${ESTADO_PEDIDO_LABEL[estadoVisible(p)]}» no se entrega.`)
  const cfg = await leerConfiguracion(ctx.payload)
  let pagos = d.data.pagos ?? []
  if (p.pago?.estado === 'pagado') {
    const m = cfg.metodosPago.find((x) => x.clave === cfg.tienda.metodoPagoEnLinea && x.activo)
    if (!m || !m.cuentaId) throw invalido(`Falta el método de pago «${cfg.tienda.metodoPagoEnLinea}» con su cuenta de Finanzas: agrégalo en Farmacia → Configuración → Métodos de pago.`)
    pagos = [{ metodo: m.clave, monto: p.total, referencia: t(p.pago.referencia) ?? folioParaId('PED', p.id), recibido: null }]
  } else if (p.pago?.forma === 'en_linea') throw invalido('Este pedido es de pago en línea y todavía no se paga.')
  const venta = await registrarVenta(
    ctx,
    {
      clave: `ped-${p.id}-${d.data.clave}`,
      mascotaId: idDe(p.mascota),
      clienteId: idDe(p.cliente),
      pesoConfirmadoKg: d.data.pesoConfirmadoKg ?? null,
      renglones: (p.renglones ?? []).map((r) => ({ presentacionId: idDe(r.presentacion)!, cantidad: r.cantidad, descuentoPorciento: 0, recetaId: idDe(r.receta) })),
      pagos,
      autorizacion: d.data.autorizacion ?? null,
      correoTicket: p.contacto?.correo ?? null,
      notas: `Pedido de la tienda ${folioParaId('PED', p.id)}`,
    },
    { canal: 'tienda', pedidoId: p.id },
  )
  const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: 'entregado', venta: venta.id, historial: historial(p, 'entregado', ctx.user.name || ctx.user.email, `Venta ${venta.folio}`) } })
  return { pedido: vistaPedido(n), ventaFolio: venta.folio, finanzas: venta.finanzas, avisos: venta.avisos }
}

/** Para el inicio de Farmacia y el tablero: pedidos que piden acción. */
export async function pedidosPorAtender(payload: Payload): Promise<number> {
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { estado: { in: ['creado', 'pagado', 'receta_por_validar', 'preparando'] } }, select: { estado: true, expiraEn: true, pago: true } })
  return r.docs.filter((p) => apartaInventario(p as FarPedido)).length
}

/* ───────────────────────────── avisos por correo (best-effort) ───────────────────────────── */

type EventoAviso = 'nuevo' | 'pagado' | 'listo' | 'cancelado'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function avisarPedido(payload: Payload, p: FarPedido, evento: EventoAviso): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const folio = folioParaId('PED', p.id)
  const liga = `${site.url}/tienda/pedido/${folio}?t=${encodeURIComponent(p.token)}`
  const lineas = (p.renglones ?? []).map((r) => `<tr><td style="padding:4px 0">${esc(r.descripcion)} × ${r.cantidad}</td><td style="padding:4px 0;text-align:right">$${r.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>`).join('')
  const titulo: Record<EventoAviso, string> = {
    nuevo: p.pago?.forma === 'en_linea' ? 'Recibimos tu pedido: falta el pago' : 'Recibimos tu pedido',
    pagado: 'Tu pago quedó confirmado',
    listo: 'Tu pedido está listo para recoger',
    cancelado: 'Tu pedido se canceló',
  }
  const detalle: Record<EventoAviso, string> = {
    nuevo: p.pago?.forma === 'en_linea' ? 'Termina el pago desde la liga de abajo. Si no se paga, el apartado vence solo.' : 'Te avisamos cuando esté listo. Pagas al recoger.',
    pagado: 'Te avisamos cuando esté listo para recoger.',
    listo: 'Pasa por él a la farmacia. Si es con receta, trae a la mano el nombre de tu mascota.',
    cancelado: t(p.motivoCancelacion) ?? '',
  }
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f2f2a"><h2 style="margin:0 0 6px">${esc(titulo[evento])}</h2><p style="margin:0 0 12px;color:#4b5b56">${esc(site.brand.name)} · ${folio}</p><p>${esc(detalle[evento])}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${lineas}<tr><td style="padding-top:8px;border-top:1px solid #d9e4e0"><b>Total</b></td><td style="padding-top:8px;border-top:1px solid #d9e4e0;text-align:right"><b>$${p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b></td></tr></table><p style="margin-top:18px"><a href="${liga}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ver mi pedido</a></p></div>`
  if (p.contacto?.correo) await payload.sendEmail({ to: p.contacto.correo, subject: `${titulo[evento]} · ${folio}`, html })
  if (evento === 'nuevo' || evento === 'pagado') {
    const cfg = await leerConfiguracion(payload)
    const para = (cfg.tienda.correosPedidos ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    if (para.length) await payload.sendEmail({ to: para, subject: `${evento === 'nuevo' ? 'Pedido nuevo' : 'Pedido pagado'} en la tienda: ${folio} · $${p.total.toLocaleString('es-MX')}`, html: `<p>${esc(p.contacto?.nombre ?? '')} · ${esc(p.contacto?.telefono ?? '')} · ${esc(p.contacto?.correo ?? '')}</p><table>${lineas}</table><p>Entra a Farmacia → Pedidos.</p>` })
  }
}
