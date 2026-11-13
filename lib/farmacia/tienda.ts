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
import { pasarelaDisponible, pedidoDeReferencia, proveedorPago, type EventoPago } from './pagos'
import { pacienteDe, recetaVigente, renglonQueCubre } from './recetas'
import { almacenPorOmision, type Ctx, ErrorFarmacia, idDe, leerConfiguracion } from './servicio'
import type { ConfiguracionVista, PacienteVenta } from './tipos'
import type { AptoTienda, CotizacionEnvio, EstadoPedido, MascotaCompra, PedidoVista, PerfilCompra, ProductoTienda, RecetaTienda, SesionTienda } from './tiposTienda'
import { ESTADO_PEDIDO_LABEL } from './tiposTienda'
import { invalido, n0, noEncontrado, nOpc, prohibido, r3, revisarContraMascota, t } from './util'
import { confirmarPagoSinPermiso, registrarVenta } from './ventas'

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

export type Publico = { payload: Payload; modulos: Modulos; cfg: ConfiguracionVista; hoy: string; tutor: Tutor | null; clienteId: number | null }

export async function contextoPublico(payload: Payload, headers: Headers): Promise<Publico> {
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
    domicilio: { activo: x.cfg.tienda.domicilioActivo && x.cfg.tienda.zonas.some((z) => z.activa), pagarAlRecibir: x.cfg.tienda.pagarAlRecibir, horario: x.cfg.tienda.horarioEntrega, grupoII: x.cfg.recetaGrupoIIDomicilio },
    busquedaIA: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  }
}

/* ───────────────────────────── envío a domicilio (fase 5b) ───────────────────────────── */

/** Zona y costo para un código postal y un subtotal de productos (pesos). Pura: la usan la cotización y el pedido. */
export function cotizar(cfg: ConfiguracionVista, cp: string, subtotal: number): CotizacionEnvio {
  const limpio = (cp ?? '').replace(/\D/g, '')
  const vacia = { cubre: false, zona: null, envio: 0, pedidoMinimo: 0, gratisDesde: null }
  if (!cfg.tienda.domicilioActivo) return { ...vacia, mensaje: 'Por ahora no hay entregas a domicilio.' }
  if (!/^\d{5}$/.test(limpio)) return { ...vacia, mensaje: 'Escribe tu código postal (5 dígitos).' }
  const z = cfg.tienda.zonas.find((x) => x.activa && x.codigosPostales.includes(limpio))
  if (!z) return { ...vacia, mensaje: `Todavía no entregamos en el ${limpio}. Puedes recogerlo en la farmacia.` }
  const gratis = z.gratisDesde != null && subtotal >= z.gratisDesde
  const falta = z.pedidoMinimo > 0 && subtotal < z.pedidoMinimo ? z.pedidoMinimo - subtotal : 0
  return {
    cubre: true,
    zona: z.nombre,
    envio: gratis ? 0 : z.envio,
    pedidoMinimo: z.pedidoMinimo,
    gratisDesde: z.gratisDesde,
    mensaje: falta > 0 ? `El pedido mínimo a domicilio en ${z.nombre} es de $${z.pedidoMinimo.toLocaleString('es-MX')}: te faltan $${falta.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` : gratis ? 'Envío gratis.' : z.gratisDesde ? `Envío gratis desde $${z.gratisDesde.toLocaleString('es-MX')}.` : null,
  }
}

export async function cotizarEnvio(payload: Payload, headers: Headers, cp: string, subtotal: number): Promise<CotizacionEnvio> {
  const x = await contextoPublico(payload, headers)
  return cotizar(x.cfg, cp, Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0)
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

export const esquemaPerfil = z.union([z.object({ mascotaId: z.coerce.number().int().positive() }), z.object({ especie: z.string().trim().min(2).max(20), pesoKg: z.coerce.number().positive().max(200).nullable() })])

/** Paciente para revisar compatibilidad: mascota del tutor (con alergias, edad y peso) o el perfil rápido del invitado. */
export async function pacienteDePerfil(x: Publico, perfil: PerfilCompra | null): Promise<{ paciente: PacienteVenta | null; mascotaId: number | null }> {
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

export const visiblePublico: Where = { and: [{ activo: { equals: true } }, { publicadoTienda: { equals: true } }, { grupo: { not_equals: 'I' } }] }

export async function armarProductos(x: Publico, prods: FarProducto[], paciente: PacienteVenta | null): Promise<ProductoTienda[]> {
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

function vistaPedido(p: FarPedido, conToken = false, evidencias: Set<number> = new Set()): PedidoVista {
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
    subtotal: nOpc(p.subtotal) ?? p.total - n0(p.costoEnvio),
    envio: n0(p.costoEnvio),
    total: p.total,
    direccion: p.entrega === 'domicilio' && p.direccion?.calle ? { calle: p.direccion.calle, colonia: t(p.direccion.colonia), codigoPostal: p.direccion.codigoPostal ?? '', referencias: t(p.direccion.referencias), zona: t(p.direccion.zona) } : null,
    repartidor: typeof p.repartidor === 'object' && p.repartidor ? { id: p.repartidor.id, nombre: p.repartidor.name?.trim() || p.repartidor.email } : idDe(p.repartidor) ? { id: idDe(p.repartidor)!, nombre: 'Repartidor' } : null,
    entregaDomicilio:
      p.entrega === 'domicilio'
        ? { salioEn: p.entregaDomicilio?.salioEn ?? null, entregadoEn: p.entregaDomicilio?.entregadoEn ?? null, recibio: t(p.entregaDomicilio?.recibio), nota: t(p.entregaDomicilio?.nota), intentos: n0(p.entregaDomicilio?.intentos), conFoto: Boolean(t(p.entregaDomicilio?.entregadoEn)) && evidencias.has(p.id) }
        : null,
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
  if (ESTADOS_QUE_APARTAN.includes(e) && !p.venta && !apartaInventario(p)) return 'expirado'
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
  direccion: z
    .object({
      calle: z.string().trim().min(4, 'Escribe la calle y el número.').max(160),
      colonia: z.string().trim().max(100).nullable().optional(),
      codigoPostal: z.string().trim().regex(/^\d{5}$/, 'El código postal lleva 5 dígitos.'),
      referencias: z.string().trim().max(200).nullable().optional(),
    })
    .nullable()
    .optional(),
  pago: z.enum(['al_recoger', 'en_linea', 'al_recibir']),
  notas: z.string().trim().max(400).nullable().optional(),
})

export function ipDe(headers: Headers): string {
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

  const domicilio = v.entrega === 'domicilio'
  if (domicilio && !x.cfg.tienda.domicilioActivo) throw invalido('Por ahora no hay entregas a domicilio. Elige «Recoger en farmacia».')
  if (domicilio && !v.direccion) throw invalido('Escribe la dirección de entrega.')
  if (domicilio && !t(v.contacto?.telefono) && !t(x.tutor?.telefono)) throw invalido('Escribe un teléfono para que el repartidor te localice.')
  const prov = pasarelaDisponible(x.cfg.pasarelaActiva)
  if (v.pago === 'en_linea' && !prov) throw invalido(`El pago en línea todavía no está disponible. Elige pagar ${domicilio ? 'al recibir' : 'al recoger'}.`)
  if (v.pago === 'al_recoger' && (domicilio || !x.cfg.tienda.pagarAlRecoger)) throw invalido(domicilio ? 'A domicilio se paga en línea o al recibir.' : 'Esta farmacia pide pagar en línea.')
  if (v.pago === 'al_recibir' && (!domicilio || !x.cfg.tienda.pagarAlRecibir)) throw invalido(domicilio ? 'Esta farmacia pide pagar en línea los pedidos a domicilio.' : 'Al recoger se paga en la farmacia o en línea.')

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
    if (prod.grupo === 'II' && domicilio && !x.cfg.recetaGrupoIIDomicilio) throw invalido(`${prod.nombre} lleva receta y no se envía a domicilio: elige «Recoger en farmacia» o quítalo del carrito.`)
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
  const subtotalC = planes.reduce((a, p) => a + p.importeC, 0)
  let envioC = 0
  let zona: string | null = null
  if (domicilio) {
    const c = cotizar(x.cfg, v.direccion!.codigoPostal, aPesos(subtotalC))
    if (!c.cubre) throw invalido(c.mensaje ?? 'No entregamos en esa zona.')
    if (c.pedidoMinimo > 0 && aPesos(subtotalC) < c.pedidoMinimo) throw invalido(c.mensaje ?? 'No llega al pedido mínimo a domicilio.')
    envioC = aCentavos(c.envio) || 0
    zona = c.zona
  }
  const totalC = subtotalC + envioC
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
        subtotal: aPesos(subtotalC),
        costoEnvio: aPesos(envioC),
        total: aPesos(totalC),
        entrega: domicilio ? 'domicilio' : 'recoger',
        direccion: domicilio ? { calle: v.direccion!.calle, colonia: t(v.direccion!.colonia), codigoPostal: v.direccion!.codigoPostal, referencias: t(v.direccion!.referencias), zona } : {},
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
  let cobro
  try {
    cobro = await prov.crearCobro({ pedidoId: p.id, folio: folioParaId('PED', p.id), total: p.total, token: p.token, base: site.url, descripcion: `Pedido ${folioParaId('PED', p.id)} · ${site.brand.name}`, expiraEn: p.expiraEn ?? null, correo: t(p.contacto?.correo) })
  } catch (e) {
    payload.logger.error(`[tienda] no se abrió el cobro de PED-${p.id}: ${String((e as Error)?.message ?? e)}`)
    throw new ErrorFarmacia(502, 'No pudimos abrir el pago en línea. Tu pedido quedó guardado: intenta pagar otra vez desde su liga en unos minutos.')
  }
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
  /* La referencia la generamos nosotros (`ped-<id>-…`); un cobro anterior del MISMO pedido también cuenta (el cliente pudo abrir el pago dos veces). */
  if (t(p.pago?.referencia) !== ev.referencia && pedidoDeReferencia(ev.referencia) !== p.id) return marcar('referencia distinta (cobro ajeno)')
  if (ev.resultado === 'rechazado') {
    await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { historial: historial(p, p.estado, proveedor, 'Pago rechazado por la pasarela') } })
    return marcar('rechazado')
  }
  if (p.pago?.estado === 'pagado') {
    if (t(p.pago.idPago) && ev.idPago && t(p.pago.idPago) !== ev.idPago) {
      await payload.update({ collection: 'far-pedidos', id: p.id, overrideAccess: true, depth: 0, data: { historial: historial(p, p.estado, proveedor, `Segundo pago aprobado (${ev.idPago}): reembolsarlo en la pasarela`) } })
      return marcar('pago duplicado')
    }
    return marcar('ya estaba pagado')
  }
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
      pago: { ...(p.pago ?? {}), estado: 'pagado', pagadoEn: new Date().toISOString(), referencia: ev.referencia, idPago: ev.idPago ?? null },
      historial: historial(p, 'pagado', proveedor, tarde ? 'Pagado después de vencer o cancelar el apartado: revisar existencia o reembolsar' : `Referencia ${ev.referencia}`),
    },
  })
  await avisarPedido(payload, n, 'pagado').catch(() => undefined)
  return marcar(tarde ? 'pagado tarde' : 'pagado')
}

export async function recibirAviso(payload: Payload, proveedor: string, cabeceras: Headers, cuerpo: string, url: URL): Promise<{ resultado: string; duplicado: boolean }> {
  const prov = proveedorPago(proveedor)
  if (!prov || !prov.disponible()) throw new ErrorFarmacia(404, 'Proveedor de pago desconocido.')
  const v = await prov.verificarAviso(cabeceras, cuerpo, url)
  if (!v.ok) throw new ErrorFarmacia(401, 'Firma del aviso inválida.')
  if (!v.evento) return { resultado: v.nota ?? 'sin cambios', duplicado: false }
  return procesarEventoPago(payload, prov.nombre, v.evento)
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
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ estado: { in: ESTADOS_QUE_APARTAN } }, { expiraEn: { less_than: new Date().toISOString() } }, { 'pago.estado': { not_equals: 'pagado' } }, { venta: { exists: false } }] } })
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
  const ev = await conEvidencia(ctx.payload, lista.docs.map((p) => p.id))
  return { pedidos: lista.docs.map((p) => vistaPedido(p, false, ev)), conteo: { nuevos, preparando, listos, cerrados } }
}

export async function pedidoPanel(ctx: Ctx, id: number): Promise<PedidoVista> {
  exigirPedidos(ctx)
  return vistaPanel(ctx, await cargarPedido(ctx, id))
}

const TRANSICION: Record<string, { de: EstadoPedido[]; a: EstadoPedido }> = {
  preparar: { de: ['creado', 'pagado'], a: 'preparando' },
  listo: { de: ['preparando'], a: 'listo_para_recoger' },
}

const quienEs = (ctx: Ctx) => ctx.user.name || ctx.user.email

/** Ids de pedidos con foto de entrega (para `conFoto` en la vista del panel). */
async function conEvidencia(payload: Payload, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set()
  const r = await payload.find({ collection: 'far-evidencias', depth: 0, pagination: false, overrideAccess: true, where: { pedido: { in: ids } }, select: { pedido: true } })
  return new Set(r.docs.map((e) => idDe(e.pedido)!))
}

async function cargarPedido(ctx: Ctx, id: number): Promise<FarPedido> {
  const p = await ctx.payload.findByID({ collection: 'far-pedidos', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese pedido.')
  return p
}

async function vistaPanel(ctx: Ctx, p: FarPedido): Promise<PedidoVista> {
  return vistaPedido(p, false, await conEvidencia(ctx.payload, [p.id]))
}

export async function avanzarPedido(ctx: Ctx, id: number, entrada: unknown): Promise<PedidoVista> {
  exigirPedidos(ctx)
  if (!ctx.p.farmacia.vender) throw prohibido('Preparar pedidos es del equipo de mostrador.')
  const d = z.object({ accion: z.enum(['preparar', 'listo', 'cancelar']), motivo: z.string().trim().max(300).nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Acción no válida.')
  const p = await cargarPedido(ctx, id)
  const quien = quienEs(ctx)
  if (d.data.accion === 'cancelar') {
    if (FINALES.includes(p.estado as EstadoPedido)) throw invalido('Ese pedido ya está cerrado.')
    if (p.estado === 'en_ruta') throw invalido('El pedido ya salió con el repartidor: espera a que regrese («No se pudo entregar») para cancelarlo.')
    if (idDe(p.venta)) throw invalido(`Este pedido ya tiene la venta ${folioParaId('VTA', idDe(p.venta)!)}: anúlala en Ventas (regresa el inventario) y luego cancela el pedido.`)
    if (!d.data.motivo || d.data.motivo.length < 3) throw invalido('Escribe el motivo de la cancelación (lo recibe el cliente).')
    const pagado = p.pago?.estado === 'pagado'
    const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: 'cancelado', motivoCancelacion: d.data.motivo, expiraEn: null, pago: pagado ? { ...(p.pago ?? {}), estado: 'reembolso_pendiente' } : p.pago, historial: historial(p, 'cancelado', quien, pagado ? `${d.data.motivo} · reembolso pendiente` : d.data.motivo) } })
    await avisarPedido(ctx.payload, n, 'cancelado').catch(() => undefined)
    return vistaPanel(ctx, n)
  }
  const tr = TRANSICION[d.data.accion]
  if (estadoVisible(p) === 'expirado') throw invalido('El apartado ya venció: lo apartado se liberó. Pide al cliente un pedido nuevo.')
  if (!tr.de.includes(p.estado as EstadoPedido)) throw invalido(`Un pedido «${ESTADO_PEDIDO_LABEL[p.estado as EstadoPedido]}» no puede pasar a «${ESTADO_PEDIDO_LABEL[tr.a]}».`)
  if (p.pago?.forma === 'en_linea' && p.pago.estado !== 'pagado') throw invalido('Este pedido es de pago en línea y todavía no se paga.')
  const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: tr.a, historial: historial(p, tr.a, quien) } })
  /* A domicilio el aviso sale cuando el repartidor se lo lleva («va en camino»). */
  if (tr.a === 'listo_para_recoger' && n.entrega !== 'domicilio') await avisarPedido(ctx.payload, n, 'listo').catch(() => undefined)
  return vistaPanel(ctx, n)
}

const esquemaVentaPedido = z.object({
  clave: z.string().trim().min(8).max(80),
  pesoConfirmadoKg: z.coerce.number().positive().max(500).nullable().optional(),
  pagos: z.array(z.object({ metodo: z.string().trim().min(1), monto: z.coerce.number().positive(), recibido: z.coerce.number().positive().nullable().optional(), referencia: z.string().trim().max(120).nullable().optional() })).max(4).optional(),
  autorizacion: z.object({ correo: z.string().trim().email(), contrasena: z.string().min(1) }).nullable().optional(),
})

/** Venta del pedido (canal «tienda»), con las mismas reglas del mostrador; el envío entra al total. */
async function ventaDePedido(ctx: Ctx, p: FarPedido, v: z.infer<typeof esquemaVentaPedido>, pagos: { metodo: string; monto: number; recibido?: number | null; referencia?: string | null }[]) {
  return registrarVenta(
    ctx,
    {
      clave: `ped-${p.id}-${v.clave}`,
      mascotaId: idDe(p.mascota),
      clienteId: idDe(p.cliente),
      pesoConfirmadoKg: v.pesoConfirmadoKg ?? null,
      renglones: (p.renglones ?? []).map((r) => ({ presentacionId: idDe(r.presentacion)!, cantidad: r.cantidad, descuentoPorciento: 0, recetaId: idDe(r.receta) })),
      pagos,
      autorizacion: v.autorizacion ?? null,
      correoTicket: p.contacto?.correo ?? null,
      notas: `Pedido de la tienda ${folioParaId('PED', p.id)}${p.entrega === 'domicilio' ? ' · a domicilio' : ''}`,
    },
    { canal: 'tienda', pedidoId: p.id, envio: n0(p.costoEnvio) },
  )
}

function metodoConCuenta(cfg: ConfiguracionVista, clave: string, para: string) {
  const m = cfg.metodosPago.find((x) => x.clave === clave && x.activo)
  if (!m || !m.cuentaId) throw invalido(`Falta el método de pago «${clave}» (${para}) con su cuenta de Finanzas: agrégalo en Farmacia → Configuración → Métodos de pago.`)
  return m
}

/**
 * Entregar en mostrador (pedidos para recoger): convierte el pedido en una venta
 * (canal «tienda»). Pagado en línea → el pago entra con `tienda.metodoPagoEnLinea`;
 * al recoger → los pagos que registra el mostrador. La misma `clave` no vende dos veces.
 */
export async function entregarPedido(ctx: Ctx, id: number, entrada: unknown): Promise<{ pedido: PedidoVista; ventaFolio: string; finanzas: string; avisos: string[] }> {
  exigirPedidos(ctx)
  const d = esquemaVentaPedido.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const p = await cargarPedido(ctx, id)
  if (idDe(p.venta)) return { pedido: await vistaPanel(ctx, p), ventaFolio: folioParaId('VTA', idDe(p.venta)!), finanzas: 'registrado', avisos: [] }
  if (p.entrega === 'domicilio') throw invalido('Este pedido es a domicilio: usa «Enviar con repartidor».')
  if (!['listo_para_recoger', 'preparando', 'pagado', 'creado'].includes(p.estado) || estadoVisible(p) === 'expirado') throw invalido(`Un pedido «${ESTADO_PEDIDO_LABEL[estadoVisible(p)]}» no se entrega.`)
  const cfg = await leerConfiguracion(ctx.payload)
  let pagos = d.data.pagos ?? []
  if (p.pago?.estado === 'pagado') {
    const m = metodoConCuenta(cfg, cfg.tienda.metodoPagoEnLinea, 'pagos en línea')
    pagos = [{ metodo: m.clave, monto: p.total, referencia: t(p.pago.idPago) ?? t(p.pago.referencia) ?? folioParaId('PED', p.id), recibido: null }]
  } else if (p.pago?.forma === 'en_linea') throw invalido('Este pedido es de pago en línea y todavía no se paga.')
  const venta = await ventaDePedido(ctx, p, d.data, pagos)
  const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { estado: 'entregado', venta: venta.id, historial: historial(p, 'entregado', quienEs(ctx), `Venta ${venta.folio}`) } })
  return { pedido: await vistaPanel(ctx, n), ventaFolio: venta.folio, finanzas: venta.finanzas, avisos: venta.avisos }
}

/* ───────────────────────────── a domicilio: repartidor (fase 5b) ───────────────────────────── */

/** Personas con «Mis entregas» (rol con `entregas`), para elegir repartidor. */
export async function repartidores(ctx: Ctx): Promise<{ id: number; nombre: string }[]> {
  exigirPedidos(ctx)
  const roles = await ctx.payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true })
  const conEntregas = roles.docs.filter((r) => Boolean((r as { farmacia?: { entregas?: boolean | null } }).farmacia?.entregas)).map((r) => r.id)
  const or: Where[] = [{ esSuperadmin: { equals: true } }]
  if (conEntregas.length) or.push({ rolDeAcceso: { in: conEntregas } })
  const us = await ctx.payload.find({ collection: 'users', depth: 0, pagination: false, overrideAccess: true, sort: 'name', where: { or } })
  return us.docs.map((u) => ({ id: u.id, nombre: u.name?.trim() || u.email }))
}

/**
 * Enviar con repartidor: el pedido sale de la farmacia. Aquí se registra la
 * venta (la mercancía sale del inventario en este momento): pagado en línea →
 * método `metodoPagoEnLinea`; pagar al recibir → método `metodoContraEntrega`
 * («por confirmar»: el cobro entra a Finanzas cuando el repartidor entrega).
 * Lo hace quien vende (con receta, la misma autorización del mostrador).
 */
export async function enviarPedido(ctx: Ctx, id: number, entrada: unknown): Promise<{ pedido: PedidoVista; ventaFolio: string; avisos: string[] }> {
  exigirPedidos(ctx)
  if (!ctx.p.farmacia.vender) throw prohibido('Enviar pedidos es del equipo de mostrador.')
  if (!(entrada as { repartidorId?: unknown } | null)?.repartidorId) throw invalido('Elige quién lo lleva.')
  const d = esquemaVentaPedido.extend({ repartidorId: z.coerce.number().int().positive('Elige quién lo lleva.') }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const p = await cargarPedido(ctx, id)
  if (p.entrega !== 'domicilio') throw invalido('Este pedido es para recoger en la farmacia.')
  if (p.estado === 'en_ruta' && idDe(p.venta)) return { pedido: await vistaPanel(ctx, p), ventaFolio: folioParaId('VTA', idDe(p.venta)!), avisos: [] }
  if (!['listo_para_recoger', 'preparando', 'pagado', 'creado'].includes(p.estado) || estadoVisible(p) === 'expirado') throw invalido(`Un pedido «${ESTADO_PEDIDO_LABEL[estadoVisible(p)]}» no se envía.`)
  if (p.pago?.forma === 'en_linea' && p.pago.estado !== 'pagado') throw invalido('Este pedido es de pago en línea y todavía no se paga.')
  const lista = await repartidores(ctx)
  const rep = lista.find((r) => r.id === d.data.repartidorId)
  if (!rep) throw invalido('Esa persona no tiene «Mis entregas» en su rol.')
  const cfg = await leerConfiguracion(ctx.payload)
  let ventaId = idDe(p.venta)
  let ventaFolio = ventaId ? folioParaId('VTA', ventaId) : ''
  let avisos: string[] = []
  if (!ventaId) {
    const m = p.pago?.estado === 'pagado' ? metodoConCuenta(cfg, cfg.tienda.metodoPagoEnLinea, 'pagos en línea') : metodoConCuenta(cfg, cfg.tienda.metodoContraEntrega, 'cobros del repartidor')
    if (p.pago?.estado !== 'pagado' && !m.porConfirmar) throw invalido(`El método «${m.nombre}» debe ser «por confirmar»: el cobro se confirma cuando el repartidor entrega.`)
    const venta = await ventaDePedido(ctx, p, d.data, [{ metodo: m.clave, monto: p.total, referencia: p.pago?.estado === 'pagado' ? (t(p.pago.idPago) ?? t(p.pago.referencia)) : `${folioParaId('PED', p.id)} · cobra ${rep.nombre}`, recibido: null }])
    ventaId = venta.id
    ventaFolio = venta.folio
    avisos = venta.avisos
  }
  const n = await ctx.payload.update({
    collection: 'far-pedidos',
    id,
    overrideAccess: true,
    depth: 1,
    data: { estado: 'en_ruta', venta: ventaId, repartidor: rep.id, expiraEn: null, entregaDomicilio: { ...(p.entregaDomicilio ?? {}), salioEn: new Date().toISOString() }, historial: historial(p, 'en_ruta', quienEs(ctx), `Sale con ${rep.nombre} · venta ${ventaFolio}`) },
  })
  await avisarPedido(ctx.payload, n, 'en_camino').catch(() => undefined)
  return { pedido: await vistaPanel(ctx, n), ventaFolio, avisos }
}

function exigirEntregas(ctx: Ctx): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.entregas) throw prohibido('Tu rol no incluye «Mis entregas».')
}

/** «Mis entregas»: lo que lleva este repartidor (en ruta) y lo que entregó hoy. */
export async function misEntregas(ctx: Ctx): Promise<{ enRuta: PedidoVista[]; entregadosHoy: PedidoVista[] }> {
  exigirEntregas(ctx)
  /* «Hoy» en la zona del negocio: desde 36 h atrás y se filtra por día local. */
  const desde = new Date(Date.now() - 36 * 3600000).toISOString()
  const [ruta, hechos] = await Promise.all([
    ctx.payload.find({ collection: 'far-pedidos', depth: 1, pagination: false, overrideAccess: true, sort: 'updatedAt', where: { and: [{ estado: { equals: 'en_ruta' } }, { repartidor: { equals: ctx.user.id } }] } }),
    ctx.payload.find({ collection: 'far-pedidos', depth: 1, limit: 30, overrideAccess: true, sort: '-updatedAt', where: { and: [{ estado: { equals: 'entregado' } }, { entrega: { equals: 'domicilio' } }, { repartidor: { equals: ctx.user.id } }, { 'entregaDomicilio.entregadoEn': { greater_than: desde } }] } }),
  ])
  const ev = await conEvidencia(ctx.payload, [...ruta.docs, ...hechos.docs].map((p) => p.id))
  return { enRuta: ruta.docs.map((p) => vistaPedido(p, false, ev)), entregadosHoy: hechos.docs.filter((p) => p.entregaDomicilio?.entregadoEn && diaLocal(new Date(p.entregaDomicilio.entregadoEn)) === ctx.hoy).map((p) => vistaPedido(p, false, ev)) }
}

/** Puede actuar sobre una entrega: el repartidor asignado, o quien asigna repartidores. */
function puedeEntrega(ctx: Ctx, p: FarPedido) {
  if (idDe(p.repartidor) === ctx.user.id && ctx.p.farmacia.entregas) return
  if (ctx.p.farmacia.asignarRepartidor) return
  throw prohibido('Esta entrega es de otro repartidor.')
}

/**
 * Entregado (repartidor): nombre de quien recibió, nota y foto opcional. Si se
 * paga al recibir, aquí se confirma el cobro (`confirmarPagoSinPermiso`) y entra
 * a Finanzas.
 */
export async function entregarDomicilio(ctx: Ctx, id: number, entrada: { recibio?: unknown; nota?: unknown; cobrado?: unknown }, foto: File | null): Promise<PedidoVista> {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  const d = z.object({ recibio: z.string().trim().min(2, 'Escribe quién recibió.').max(120), nota: z.string().trim().max(300).nullable().optional(), cobrado: z.union([z.boolean(), z.enum(['true', 'false'])]).optional() }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const p = await cargarPedido(ctx, id)
  puedeEntrega(ctx, p)
  if (p.estado === 'entregado') return vistaPanel(ctx, p)
  if (p.estado !== 'en_ruta') throw invalido('Ese pedido no va en camino.')
  const alRecibir = p.pago?.estado !== 'pagado'
  if (alRecibir && !(d.data.cobrado === true || d.data.cobrado === 'true')) throw invalido(`Cobra ${p.total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} y marca «Cobrado» antes de entregar.`)
  if (foto) await guardarEvidencia(ctx, p.id, foto)
  if (alRecibir && idDe(p.venta)) {
    const v = await ctx.payload.findByID({ collection: 'far-ventas', id: idDe(p.venta)!, depth: 0, overrideAccess: true })
    const i = (v.pagos ?? []).findIndex((x) => x.estado === 'por_confirmar')
    if (i >= 0) await confirmarPagoSinPermiso(ctx, v.id, i, { referencia: `Cobró ${quienEs(ctx)} · ${folioParaId('PED', p.id)}` })
  }
  const n = await ctx.payload.update({
    collection: 'far-pedidos',
    id,
    overrideAccess: true,
    depth: 1,
    data: {
      estado: 'entregado',
      pago: alRecibir ? { ...(p.pago ?? {}), estado: 'pagado', pagadoEn: new Date().toISOString() } : p.pago,
      entregaDomicilio: { ...(p.entregaDomicilio ?? {}), entregadoEn: new Date().toISOString(), recibio: d.data.recibio, nota: t(d.data.nota) },
      historial: historial(p, 'entregado', quienEs(ctx), `Recibió ${d.data.recibio}${alRecibir ? ' · cobrado' : ''}${foto ? ' · con foto' : ''}`),
    },
  })
  await avisarPedido(ctx.payload, n, 'entregado').catch(() => undefined)
  return vistaPanel(ctx, n)
}

/** No se pudo entregar: regresa a la farmacia (sigue vendido; se reintenta o se cancela con devolución). */
export async function noEntregado(ctx: Ctx, id: number, entrada: unknown): Promise<PedidoVista> {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  const d = z.object({ motivo: z.string().trim().min(3, 'Escribe qué pasó.').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe qué pasó.')
  const p = await cargarPedido(ctx, id)
  puedeEntrega(ctx, p)
  if (p.estado !== 'en_ruta') throw invalido('Ese pedido no va en camino.')
  const n = await ctx.payload.update({
    collection: 'far-pedidos',
    id,
    overrideAccess: true,
    depth: 1,
    data: { estado: 'listo_para_recoger', entregaDomicilio: { ...(p.entregaDomicilio ?? {}), intentos: n0(p.entregaDomicilio?.intentos) + 1, nota: d.data.motivo }, historial: historial(p, 'listo_para_recoger', quienEs(ctx), `No se pudo entregar: ${d.data.motivo}`) },
  })
  return vistaPanel(ctx, n)
}

const TOPE_FOTO = 600 * 1024

async function guardarEvidencia(ctx: Ctx, pedidoId: number, foto: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(foto.type)) throw invalido('La foto debe ser JPG, PNG o WebP.')
  if (foto.size > TOPE_FOTO) throw invalido('La foto pesa demasiado (máximo 600 KB). Tómala otra vez.')
  const datos = Buffer.from(await foto.arrayBuffer()).toString('base64')
  const ya = await ctx.payload.find({ collection: 'far-evidencias', depth: 0, limit: 1, overrideAccess: true, where: { pedido: { equals: pedidoId } } })
  const data = { pedido: pedidoId, tipo: foto.type, datos, bytes: foto.size, subidaPor: quienEs(ctx) }
  if (ya.docs[0]) await ctx.payload.update({ collection: 'far-evidencias', id: ya.docs[0].id, overrideAccess: true, depth: 0, data })
  else await ctx.payload.create({ collection: 'far-evidencias', overrideAccess: true, depth: 0, data })
}

/** Foto de la entrega: quien ve pedidos o el repartidor asignado. */
export async function evidencia(ctx: Ctx, id: number): Promise<{ tipo: string; bytes: Buffer }> {
  const p = await cargarPedido(ctx, id)
  if (!(ctx.p.farmacia.vender || ctx.p.farmacia.asignarRepartidor || (ctx.p.farmacia.entregas && idDe(p.repartidor) === ctx.user.id))) throw prohibido('No puedes ver esta evidencia.')
  const r = await ctx.payload.find({ collection: 'far-evidencias', depth: 0, limit: 1, overrideAccess: true, where: { pedido: { equals: id } } })
  if (!r.docs[0]) throw noEncontrado('Este pedido no tiene foto de entrega.')
  return { tipo: r.docs[0].tipo, bytes: Buffer.from(r.docs[0].datos, 'base64') }
}

/** Reembolso total en la pasarela de un pedido cancelado ya pagado (encargado). */
export async function reembolsarPedido(ctx: Ctx, id: number): Promise<PedidoVista> {
  exigirPedidos(ctx)
  if (!ctx.p.farmacia.aprobar) throw prohibido('Los reembolsos los hace el encargado o el dueño.')
  const p = await cargarPedido(ctx, id)
  if (p.pago?.estado === 'reembolsado') return vistaPanel(ctx, p)
  if (p.pago?.estado !== 'reembolso_pendiente') throw invalido('Solo se reembolsa un pedido cancelado que ya estaba pagado en línea.')
  const prov = proveedorPago(p.pago.proveedor)
  if (!prov || !prov.disponible()) throw invalido('La pasarela de ese pago no está configurada: haz el reembolso desde su panel y avísale al cliente.')
  let idReembolso: string
  try {
    idReembolso = await prov.reembolsar({ idPago: t(p.pago.idPago), pedidoId: p.id, monto: p.total })
  } catch (e) {
    throw new ErrorFarmacia(502, `No se pudo reembolsar en la pasarela (${String((e as Error)?.message ?? e)}). Inténtalo de nuevo o hazlo desde su panel.`)
  }
  const n = await ctx.payload.update({ collection: 'far-pedidos', id, overrideAccess: true, depth: 1, data: { pago: { ...(p.pago ?? {}), estado: 'reembolsado' }, historial: historial(p, p.estado, quienEs(ctx), `Reembolso ${idReembolso} en ${prov.nombre}`) } })
  await avisarPedido(ctx.payload, n, 'reembolsado').catch(() => undefined)
  return vistaPanel(ctx, n)
}

/** Para el inicio de Farmacia y el tablero: pedidos que piden acción. */
export async function pedidosPorAtender(payload: Payload): Promise<number> {
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { estado: { in: ['creado', 'pagado', 'receta_por_validar', 'preparando'] } }, select: { estado: true, expiraEn: true, pago: true } })
  return r.docs.filter((p) => apartaInventario(p as FarPedido)).length
}

/* ───────────────────────────── avisos por correo (best-effort) ───────────────────────────── */

type EventoAviso = 'nuevo' | 'pagado' | 'listo' | 'cancelado' | 'en_camino' | 'entregado' | 'reembolsado'

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
    en_camino: 'Tu pedido va en camino',
    entregado: 'Entregamos tu pedido',
    reembolsado: 'Te reembolsamos tu pago',
  }
  const detalle: Record<EventoAviso, string> = {
    nuevo: p.pago?.forma === 'en_linea' ? 'Termina el pago desde la liga de abajo. Si no se paga, el apartado vence solo.' : p.entrega === 'domicilio' ? 'Te avisamos cuando salga. Pagas al recibir.' : 'Te avisamos cuando esté listo. Pagas al recoger.',
    pagado: p.entrega === 'domicilio' ? 'Te avisamos cuando salga a tu domicilio.' : 'Te avisamos cuando esté listo para recoger.',
    en_camino: `${p.pago?.estado === 'pagado' ? 'Ya está pagado.' : `Ten listo el pago de $${p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`} Lo lleva nuestro repartidor a ${p.direccion?.calle ?? 'tu domicilio'}.`,
    entregado: `Recibió: ${p.entregaDomicilio?.recibio ?? ''}. ¡Gracias por tu compra!`,
    reembolsado: 'El reembolso puede tardar unos días en verse en tu estado de cuenta, según tu banco.',
    listo: 'Pasa por él a la farmacia. Si es con receta, trae a la mano el nombre de tu mascota.',
    cancelado: t(p.motivoCancelacion) ?? '',
  }
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f2f2a"><h2 style="margin:0 0 6px">${esc(titulo[evento])}</h2><p style="margin:0 0 12px;color:#4b5b56">${esc(site.brand.name)} · ${folio}</p><p>${esc(detalle[evento])}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${lineas}${n0(p.costoEnvio) ? `<tr><td style="padding:4px 0">Envío</td><td style="padding:4px 0;text-align:right">$${n0(p.costoEnvio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>` : ''}<tr><td style="padding-top:8px;border-top:1px solid #d9e4e0"><b>Total</b></td><td style="padding-top:8px;border-top:1px solid #d9e4e0;text-align:right"><b>$${p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b></td></tr></table><p style="margin-top:18px"><a href="${liga}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ver mi pedido</a></p></div>`
  if (p.contacto?.correo) await payload.sendEmail({ to: p.contacto.correo, subject: `${titulo[evento]} · ${folio}`, html })
  if (evento === 'nuevo' || evento === 'pagado') {
    const cfg = await leerConfiguracion(payload)
    const para = (cfg.tienda.correosPedidos ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    if (para.length) await payload.sendEmail({ to: para, subject: `${evento === 'nuevo' ? 'Pedido nuevo' : 'Pedido pagado'} en la tienda: ${folio} · $${p.total.toLocaleString('es-MX')}`, html: `<p>${esc(p.contacto?.nombre ?? '')} · ${esc(p.contacto?.telefono ?? '')} · ${esc(p.contacto?.correo ?? '')}</p><table>${lineas}</table><p>Entra a Farmacia → Pedidos.</p>` })
  }
}
