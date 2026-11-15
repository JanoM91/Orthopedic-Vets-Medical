import crypto from 'crypto'
import type { Payload } from 'payload'
import { z } from 'zod'

import type { FarPedido, FarPlan, FarPresentacion, FarProducto, FarReceta, Mascota } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { liquidar as liquidarEnFinanzas, registrar as registrarEnFinanzas } from '../finanzas/servicio'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { diaLocal } from '../localTime'
import { leerModulos } from '../modulos'
import { site } from '../site'
import { firmarPrueba, pasarelaDisponible, planDeReferencia, proveedorPago, type EventoPago } from './pagos'
import { pacienteDe, recetaVigente, renglonQueCubre } from './recetas'
import { type Ctx, ErrorFarmacia, idDe, leerConfiguracion } from './servicio'
import { contextoPublico, crearPedidoDePlan, recibirAviso, type Publico } from './tienda'
import { invalido, n0, noEncontrado, nOpc, prohibido, r3, revisarContraMascota, sumarDias, t } from './util'
import { ctxFinanzas, MEDIO } from './ventas'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Planes de compra (Farmacia, fase 6b, nov-2026): `PLN-`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El tutor (con sesión y ficha vinculada) contrata un producto con «duración
 * por omisión» para una de sus mascotas:
 *
 *   cada = presentaciones por entrega × factor × duración por omisión (días)
 *
 *   - RECURRENTE: suscripción en la pasarela (Mercado Pago: preapproval;
 *     «prueba»: cobro simulado). Cada cobro aprobado → un pedido «pagado en
 *     línea» para recoger. Precio de lista al contratar.
 *   - ANUAL: un solo pago por `entregasAnual` entregas, con `descuentoAnual`.
 *     El cron genera cada entrega (`diasAntes` antes) como pedido «cubierto por
 *     el plan». Finanzas: el pago entra UNA vez, completo, como anticipo
 *     (categoría «anticipos») en la cuenta del método de pago en línea, al
 *     entregar la primera vez (o desde el panel); las ventas de cada entrega
 *     no llevan pagos ni registran otro ingreso. `anticipo.reconocido` =
 *     suma de esas ventas.
 *
 * ANTES DE CADA ENTREGA se revisa contra la mascota (especie, peso, edad,
 * alergias) y, si es Grupo II, que haya receta vigente con surtidos. Si algo
 * no cuadra el plan se DETIENE (y se pausa la suscripción) y se avisa al
 * tutor. NUNCA se cambia de producto o presentación por el peso: elegir otra
 * presentación es decisión del veterinario o del equipo.
 *
 * v1: solo para recoger en la farmacia. La política de cancelación del plan
 * anual la define la farmacia (el tutor no lo cancela solo una vez pagado).
 */

export type PlanVista = {
  id: number
  folio: string
  modalidad: 'recurrente' | 'anual'
  estado: FarPlan['estado']
  mascota: { id: number; nombre: string }
  producto: { id: number; nombre: string; grupo: string | null }
  presentacion: { id: number; nombre: string }
  cantidad: number
  cadaDias: number
  entregasTotales: number | null
  entregasHechas: number
  proximaEntrega: string | null
  precioEntrega: number
  descuentoPorciento: number
  total: number | null
  pago: { proveedor: string | null; pagadoEn: string | null; suscripcion: boolean }
  motivo: string | null
  creadoEn: string
  historial: { fecha: string; evento: string; por: string | null }[]
  pedidos: { folio: string; estado: string; ciclo: number | null; token?: string }[]
  /** Solo en el panel */
  tutor?: { nombre: string; correo: string; telefono: string | null } | null
  anticipo?: { registrado: boolean; reconocido: number; porReconocer: number } | null
  /** Solo para el tutor (liga de su plan) */
  token?: string
}

export type OfertaPlan = {
  disponible: boolean
  motivo: string | null
  cadaDias: number | null
  recurrente: { precioEntrega: number } | null
  anual: { entregas: number; descuentoPorciento: number; precioEntrega: number; total: number } | null
}

const VIGENTES: FarPlan['estado'][] = ['por_pagar', 'activo', 'detenido']
const hoyNegocio = () => diaLocal(new Date())
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pesos = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const ligaPlan = (p: Pick<FarPlan, 'id' | 'token'>) => `${site.url}/tienda/plan/${p.id}?t=${encodeURIComponent(p.token)}`
const evento = (p: FarPlan, texto: string, por: string) => [...(p.historial ?? []).map((h) => ({ fecha: h.fecha, evento: h.evento, por: h.por ?? null })), { fecha: new Date().toISOString(), evento: texto, por }]
/** Ctx mínimo para `pacienteDe` (solo usa payload, módulos y hoy). */
const ctxSistema = async (payload: Payload) => ({ payload, modulos: await leerModulos(payload), hoy: hoyNegocio() }) as unknown as Ctx

/* ───────────────────────────── vista ───────────────────────────── */

function vistaPlan(p: FarPlan, pedidos: FarPedido[], opciones: { token?: boolean; panel?: boolean; reconocido?: number } = {}): PlanVista {
  const obj = <T>(v: unknown): T | null => (typeof v === 'object' && v ? (v as T) : null)
  const m = obj<Mascota>(p.mascota)
  const prod = obj<FarProducto>(p.producto)
  const pres = obj<FarPresentacion>(p.presentacion)
  const tutor = obj<{ nombre: string; email: string; telefono?: string | null }>(p.tutor)
  const v: PlanVista = {
    id: p.id,
    folio: folioParaId('PLN', p.id),
    modalidad: p.modalidad,
    estado: p.estado,
    mascota: { id: idDe(p.mascota)!, nombre: m?.nombre ?? 'Mascota' },
    producto: { id: idDe(p.producto)!, nombre: prod?.nombre ?? 'Producto', grupo: t(prod?.grupo) },
    presentacion: { id: idDe(p.presentacion)!, nombre: pres?.nombre ?? '' },
    cantidad: p.cantidad,
    cadaDias: p.cadaDias,
    entregasTotales: nOpc(p.entregasTotales),
    entregasHechas: n0(p.entregasHechas),
    proximaEntrega: t(p.proximaEntrega),
    precioEntrega: p.precioEntrega,
    descuentoPorciento: n0(p.descuentoPorciento),
    total: nOpc(p.total),
    pago: { proveedor: t(p.pago?.proveedor), pagadoEn: p.pago?.pagadoEn ?? null, suscripcion: Boolean(t(p.pago?.idSuscripcion)) },
    motivo: t(p.motivo),
    creadoEn: p.createdAt,
    historial: (p.historial ?? []).map((h) => ({ fecha: h.fecha, evento: h.evento, por: t(h.por) })),
    pedidos: pedidos.map((x) => ({ folio: folioParaId('PED', x.id), estado: x.estado, ciclo: nOpc(x.ciclo), ...(opciones.token ? { token: x.token } : {}) })),
  }
  if (opciones.panel) {
    v.tutor = tutor ? { nombre: tutor.nombre, correo: tutor.email, telefono: t(tutor.telefono) } : null
    v.anticipo = p.modalidad === 'anual' ? { registrado: Boolean(idDe(p.anticipo?.operacionFinanzas)), reconocido: opciones.reconocido ?? n0(p.anticipo?.reconocido), porReconocer: p.pago?.pagadoEn ? aPesos(Math.max(0, (aCentavos(n0(p.total)) || 0) - (aCentavos(opciones.reconocido ?? n0(p.anticipo?.reconocido)) || 0))) : 0 } : null
  }
  if (opciones.token) v.token = p.token
  return v
}

async function pedidosDePlanes(payload: Payload, ids: number[]): Promise<Map<number, FarPedido[]>> {
  const m = new Map<number, FarPedido[]>()
  if (!ids.length) return m
  const r = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, sort: '-ciclo', where: { plan: { in: ids } } })
  for (const p of r.docs) m.set(idDe(p.plan)!, [...(m.get(idDe(p.plan)!) ?? []), p])
  return m
}

/* ───────────────────────────── oferta y alta (tutor) ───────────────────────────── */

type Base = { x: Publico; mascota: Mascota; pres: FarPresentacion; prod: FarProducto; cadaDias: number }

async function base(payload: Payload, headers: Headers, presentacionId: number, mascotaId: number): Promise<Base> {
  const x = await contextoPublico(payload, headers)
  if (!x.cfg.planes.activo) throw invalido('Los planes de compra no están activos en esta farmacia.')
  if (!x.tutor || !x.clienteId) throw invalido('Para un plan entra al portal con tu cuenta vinculada a la clínica.')
  if (!x.modulos.clinica) throw invalido('Los planes necesitan el expediente de tu mascota.')
  const mascota = await payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  const propia = await payload.count({ collection: 'mascotas', overrideAccess: true, where: { and: [{ id: { equals: mascotaId } }, { 'tutores.cliente': { equals: x.clienteId } }, { estado: { equals: 'activo' } }] } })
  if (!mascota || !propia.totalDocs) throw noEncontrado('Esa mascota no está entre las tuyas.')
  const pres = await payload.findByID({ collection: 'far-presentaciones', id: presentacionId, depth: 1, overrideAccess: true }).catch(() => null)
  const prod = pres && typeof pres.producto === 'object' ? (pres.producto as FarProducto) : null
  if (!pres || !prod || !pres.activa || !prod.activo || !prod.publicadoTienda || prod.grupo === 'I') throw invalido('Ese producto no está en la tienda.')
  if (!(n0(prod.duracionDias) > 0)) throw invalido(`${prod.nombre} no tiene una duración habitual capturada: no se puede hacer un plan.`)
  return { x, mascota, pres, prod, cadaDias: 0 }
}

const cadaDe = (b: Pick<Base, 'pres' | 'prod'>, cantidad: number) => Math.max(1, Math.round(cantidad * (n0(b.pres.factor) || 1) * n0(b.prod.duracionDias)))

/** Precio unitario y por entrega en centavos (con el descuento redondeado por pieza). */
function precios(precio: number, cantidad: number, descuento: number) {
  const unidadC = Math.round((aCentavos(precio) || 0) * (1 - descuento / 100))
  return { unidadC, entregaC: unidadC * cantidad }
}

/** Revisión contra la mascota y receta para una entrega. `motivo` = por qué no se puede. */
async function revisar(payload: Payload, p: { mascotaId: number; prod: FarProducto; presentacionId: number; excluirPedido?: number | null }): Promise<{ motivo: string | null; recetaId: number | null }> {
  const ctx = await ctxSistema(payload)
  const { mascota, paciente } = await pacienteDe(ctx, p.mascotaId)
  if (mascota.estado !== 'activo') return { motivo: `${mascota.nombre} ya no está activa en el expediente.`, recetaId: null }
  const duros = revisarContraMascota(p.prod, paciente).filter((x) => x.tipo !== 'peso_viejo' && x.tipo !== 'sin_peso')
  if (duros.length) return { motivo: `${p.prod.nombre} ya no le corresponde a ${mascota.nombre}: ${duros.map((x) => x.mensaje.replace(/la mascota/g, mascota.nombre)).join(' ')} Agenda una revisión o pide en la farmacia que te orienten.`, recetaId: null }
  if (p.prod.grupo !== 'II') return { motivo: null, recetaId: null }
  const recetas = await payload.find({ collection: 'far-recetas', depth: 1, limit: 40, overrideAccess: true, sort: '-createdAt', where: { and: [{ estado: { equals: 'valida' } }, { vigenteHasta: { greater_than_equal: ctx.hoy } }, { mascota: { equals: p.mascotaId } }] } })
  const quedan = (y: FarReceta) => {
    const g = renglonQueCubre(y, p.prod)
    return g ? (nOpc(g.surtidosPermitidos) ?? 1) - (nOpc(g.surtidosUsados) ?? 0) : 0
  }
  for (const y of recetas.docs) {
    if (!recetaVigente(y, ctx.hoy) || quedan(y) <= 0) continue
    const enCurso = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ 'renglones.receta': { equals: y.id } }, { estado: { in: ['pago_pendiente', 'creado', 'pagado', 'receta_por_validar', 'preparando', 'listo_para_recoger', 'en_ruta'] } }, { venta: { exists: false } }, ...(p.excluirPedido ? [{ id: { not_equals: p.excluirPedido } }] : [])] } })
    if (enCurso.docs.length < quedan(y)) return { motivo: null, recetaId: y.id }
  }
  return { motivo: `${p.prod.nombre} es con receta y ${mascota.nombre} no tiene una receta vigente con surtidos. Agenda una consulta para renovarla.`, recetaId: null }
}

export async function ofertaPlan(payload: Payload, headers: Headers, presentacionId: number, mascotaId: number, cantidad = 1): Promise<OfertaPlan> {
  const vacia = (motivo: string): OfertaPlan => ({ disponible: false, motivo, cadaDias: null, recurrente: null, anual: null })
  let b: Base
  try {
    b = await base(payload, headers, presentacionId, mascotaId)
  } catch (e) {
    if (e instanceof ErrorFarmacia && e.estado < 500) return vacia(e.message)
    throw e
  }
  if (!pasarelaDisponible(b.x.cfg.pasarelaActiva)) return vacia('El pago en línea no está disponible ahora.')
  const cant = Math.min(6, Math.max(1, Math.round(cantidad)))
  const r = await revisar(payload, { mascotaId, prod: b.prod, presentacionId })
  if (r.motivo) return vacia(r.motivo)
  const rec = precios(b.pres.precio, cant, 0)
  const d = b.x.cfg.planes.descuentoAnual
  const an = precios(b.pres.precio, cant, d)
  const entregas = b.x.cfg.planes.entregasAnual
  return { disponible: true, motivo: null, cadaDias: cadaDe(b, cant), recurrente: { precioEntrega: aPesos(rec.entregaC) }, anual: { entregas, descuentoPorciento: d, precioEntrega: aPesos(an.entregaC), total: aPesos(an.entregaC * entregas) } }
}

const esquemaAlta = z.object({
  modalidad: z.enum(['recurrente', 'anual']),
  presentacionId: z.coerce.number().int().positive(),
  mascotaId: z.coerce.number().int().positive('Elige para cuál de tus mascotas es.'),
  cantidad: z.coerce.number().int().min(1).max(6).default(1),
})

/** Contratar un plan: queda «por pagar» y devuelve la liga de la pasarela. Un plan vigente del mismo producto y mascota no se duplica. */
export async function crearPlan(payload: Payload, headers: Headers, entrada: unknown): Promise<{ plan: PlanVista; url: string }> {
  const d = esquemaAlta.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  const b = await base(payload, headers, v.presentacionId, v.mascotaId)
  const prov = pasarelaDisponible(b.x.cfg.pasarelaActiva)
  if (!prov) throw invalido('El pago en línea no está disponible ahora: el plan se paga en línea.')
  const ya = await payload.find({ collection: 'far-planes', depth: 1, limit: 1, overrideAccess: true, where: { and: [{ cliente: { equals: b.x.clienteId } }, { mascota: { equals: v.mascotaId } }, { producto: { equals: b.prod.id } }, { estado: { in: VIGENTES } }] } })
  if (ya.docs[0] && ya.docs[0].estado !== 'por_pagar') throw invalido(`${b.mascota.nombre} ya tiene el plan ${folioParaId('PLN', ya.docs[0].id)} de ${b.prod.nombre}. Lo ves en «Mis pedidos».`)
  const r = await revisar(payload, { mascotaId: v.mascotaId, prod: b.prod, presentacionId: b.pres.id })
  if (r.motivo) throw invalido(r.motivo)
  const anual = v.modalidad === 'anual'
  const descuento = anual ? b.x.cfg.planes.descuentoAnual : 0
  const pr = precios(b.pres.precio, v.cantidad, descuento)
  if (!(pr.entregaC > 0)) throw invalido('Ese producto no tiene precio.')
  const entregas = anual ? b.x.cfg.planes.entregasAnual : null
  const datos = {
    modalidad: v.modalidad,
    estado: 'por_pagar' as const,
    tutor: b.x.tutor!.id,
    cliente: b.x.clienteId!,
    mascota: v.mascotaId,
    producto: b.prod.id,
    presentacion: b.pres.id,
    cantidad: v.cantidad,
    cadaDias: cadaDe(b, v.cantidad),
    entregasTotales: entregas,
    entregasHechas: 0,
    proximaEntrega: b.x.hoy,
    precioEntrega: aPesos(pr.entregaC),
    descuentoPorciento: descuento,
    total: entregas ? aPesos(pr.entregaC * entregas) : null,
    pago: { proveedor: prov.nombre },
  }
  /* Uno «por pagar» del mismo producto y mascota se reutiliza (volvió a intentarlo). */
  const plan = ya.docs[0]
    ? await payload.update({ collection: 'far-planes', id: ya.docs[0].id, overrideAccess: true, depth: 0, showHiddenFields: true, data: { ...datos, historial: evento(ya.docs[0], `Cambió a ${anual ? 'anual' : 'cada entrega'}`, `${b.x.tutor!.nombre} (portal)`) } })
    : await payload.create({ collection: 'far-planes', overrideAccess: true, depth: 0, showHiddenFields: true, data: { ...datos, token: crypto.randomBytes(24).toString('hex'), historial: [{ fecha: new Date().toISOString(), evento: `Plan ${anual ? 'anual' : 'cada entrega'} contratado`, por: `${b.x.tutor!.nombre} (portal)` }] } })
  const url = await abrirPago(payload, plan.id)
  const final = await cargar(payload, plan.id)
  return { plan: vistaPlan(final, [], { token: true }), url }
}

async function cargar(payload: Payload, id: number): Promise<FarPlan> {
  const p = await payload.findByID({ collection: 'far-planes', id, depth: 1, overrideAccess: true, showHiddenFields: true }).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese plan.')
  return p
}

/** Abre (o vuelve a abrir) el pago anual o la autorización de la suscripción. */
async function abrirPago(payload: Payload, id: number): Promise<string> {
  const p = await cargar(payload, id)
  const prov = proveedorPago(p.pago?.proveedor)
  if (!prov || !prov.disponible()) throw invalido('El pago en línea no está disponible ahora.')
  const folio = folioParaId('PLN', p.id)
  const prod = typeof p.producto === 'object' && p.producto ? (p.producto as FarProducto).nombre : 'Producto'
  const masc = typeof p.mascota === 'object' && p.mascota ? (p.mascota as Mascota).nombre : ''
  const correo = typeof p.tutor === 'object' && p.tutor ? t((p.tutor as { email?: string }).email) : null
  const descripcion = `Plan ${folio} · ${prod}${masc ? ` de ${masc}` : ''} · ${site.brand.name}`
  try {
    if (p.modalidad === 'anual') {
      const c = await prov.crearCobroPlan({ planId: p.id, folio, total: n0(p.total), token: p.token, base: site.url, descripcion, correo })
      await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { pago: { ...(p.pago ?? {}), proveedor: prov.nombre, referencia: c.referencia } } })
      return c.url
    }
    const inicio = new Date(Date.now() + 10 * 60000).toISOString()
    const s = await prov.crearSuscripcion({ planId: p.id, folio, monto: p.precioEntrega, cadaDias: p.cadaDias, inicio, token: p.token, base: site.url, descripcion, correo })
    await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { pago: { ...(p.pago ?? {}), proveedor: prov.nombre, referencia: s.referencia, idSuscripcion: s.idSuscripcion } } })
    return s.url
  } catch (e) {
    if (e instanceof ErrorFarmacia) throw e
    payload.logger.error(`[planes] no se abrió el pago de ${folio}: ${String((e as Error)?.message ?? e)}`)
    throw new ErrorFarmacia(502, 'No pudimos abrir el pago en línea. Tu plan quedó guardado: intenta otra vez desde su liga en unos minutos.')
  }
}

/* ───────────────────────────── liga del tutor (sin sesión) ───────────────────────────── */

async function porToken(payload: Payload, id: number, token: string): Promise<FarPlan> {
  if (!id || !token || token.length < 20) throw noEncontrado('No encontramos ese plan.')
  const p = await cargar(payload, id).catch(() => null)
  if (!p) throw noEncontrado('No encontramos ese plan.')
  const a = Buffer.from(p.token), b = Buffer.from(token)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw noEncontrado('No encontramos ese plan.')
  return p
}

export async function planPublico(payload: Payload, id: number, token: string): Promise<PlanVista & { pagoPrueba: boolean; referencia: string | null }> {
  const p = await porToken(payload, id, token)
  const ped = await pedidosDePlanes(payload, [p.id])
  return { ...vistaPlan(p, ped.get(p.id) ?? [], { token: true }), pagoPrueba: p.pago?.proveedor === 'prueba', referencia: p.estado === 'por_pagar' ? t(p.pago?.referencia) : null }
}

export async function pagarPlan(payload: Payload, id: number, token: string): Promise<{ url: string }> {
  const p = await porToken(payload, id, token)
  if (p.estado !== 'por_pagar') throw invalido('Este plan ya está pagado o autorizado.')
  const cfg = await leerConfiguracion(payload)
  const prov = pasarelaDisponible(cfg.pasarelaActiva)
  if (!prov) throw invalido('El pago en línea no está disponible ahora.')
  if (p.pago?.proveedor !== prov.nombre) await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { pago: { ...(p.pago ?? {}), proveedor: prov.nombre } } })
  return { url: await abrirPago(payload, p.id) }
}

/** El tutor cancela: sin pagar, siempre; recurrente, cancela la suscripción; anual pagado, lo revisa la farmacia. */
export async function cancelarPlanTutor(payload: Payload, id: number, token: string): Promise<PlanVista> {
  const p = await porToken(payload, id, token)
  if (!VIGENTES.includes(p.estado)) throw invalido('Este plan ya terminó.')
  if (p.modalidad === 'anual' && p.estado !== 'por_pagar') throw invalido('El plan anual ya está pagado: para cancelarlo escríbenos o llámanos y lo revisamos contigo.')
  await cancelarSuscripcion(payload, p)
  await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'cancelado', motivo: 'Cancelado por el tutor', historial: evento(p, 'Cancelado por el tutor', 'Tutor (portal)') } })
  await avisarEquipo(payload, p, 'Un tutor canceló su plan').catch(() => undefined)
  return (await planPublico(payload, id, token)) as PlanVista
}

async function cancelarSuscripcion(payload: Payload, p: FarPlan) {
  const sus = t(p.pago?.idSuscripcion)
  if (p.modalidad !== 'recurrente' || !sus) return
  const prov = proveedorPago(p.pago?.proveedor)
  if (!prov || !prov.disponible()) return
  try {
    await prov.cambiarSuscripcion({ idSuscripcion: sus, estado: 'cancelled' })
  } catch (e) {
    payload.logger.error(`[planes] no se canceló la suscripción de PLN-${p.id}: ${String((e as Error)?.message ?? e)}`)
    throw new ErrorFarmacia(502, 'No pudimos cancelar la suscripción en la pasarela. Intenta otra vez en unos minutos.')
  }
}

/** Planes del tutor (portal, «Mis pedidos»). */
export async function planesDelTutor(payload: Payload, tutorId: number): Promise<PlanVista[]> {
  const r = await payload.find({ collection: 'far-planes', depth: 1, limit: 30, overrideAccess: true, showHiddenFields: true, sort: '-createdAt', where: { tutor: { equals: tutorId } } })
  const ped = await pedidosDePlanes(payload, r.docs.map((p) => p.id))
  return r.docs.map((p) => vistaPlan(p, ped.get(p.id) ?? [], { token: true }))
}

/* ───────────────────────────── avisos de la pasarela ───────────────────────────── */

async function registrarEvento(payload: Payload, clave: string, planId: number, tipo: string): Promise<boolean> {
  try {
    await payload.create({ collection: 'far-pagos-eventos', overrideAccess: true, depth: 0, data: { clave, plan: planId, tipo, resultado: 'recibido' } })
    return true
  } catch (e) {
    if (/unique|duplicate|clave/i.test(String((e as Error)?.message))) return false
    throw e
  }
}

async function marcarEvento(payload: Payload, clave: string, resultado: string) {
  const r = await payload.find({ collection: 'far-pagos-eventos', depth: 0, limit: 1, overrideAccess: true, where: { clave: { equals: clave } } })
  if (r.docs[0]) await payload.update({ collection: 'far-pagos-eventos', id: r.docs[0].id, overrideAccess: true, depth: 0, data: { resultado } })
  return { resultado, duplicado: false }
}

/** Procesa un aviso ya verificado de un plan. Idempotente por proveedor + idEvento. */
export async function procesarEventoPlan(payload: Payload, proveedor: string, ev: EventoPago): Promise<{ resultado: string; duplicado: boolean }> {
  const clave = `${proveedor}:${ev.idEvento}`
  if (!ev.planId || !(await registrarEvento(payload, clave, ev.planId, ev.tipo ?? 'pago'))) return { resultado: 'ya procesado', duplicado: true }
  const p = await payload.findByID({ collection: 'far-planes', id: ev.planId, depth: 1, overrideAccess: true, showHiddenFields: true }).catch(() => null)
  if (!p) return marcarEvento(payload, clave, 'plan inexistente')
  if (planDeReferencia(ev.referencia) !== p.id) return marcarEvento(payload, clave, 'referencia de otro plan')
  const tipo = ev.tipo ?? 'pago'

  if (tipo === 'suscripcion') {
    if (p.modalidad !== 'recurrente') return marcarEvento(payload, clave, 'no es recurrente')
    if (ev.idSuscripcion && t(p.pago?.idSuscripcion) && ev.idSuscripcion !== t(p.pago?.idSuscripcion)) return marcarEvento(payload, clave, 'suscripción anterior')
    const st = ev.estadoSuscripcion ?? ''
    if (st === 'authorized' && p.estado === 'por_pagar') {
      await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'activo', pago: { ...(p.pago ?? {}), pagadoEn: new Date().toISOString() }, historial: evento(p, 'Suscripción autorizada', proveedor) } })
      await avisarTutor(payload, p, 'activo').catch(() => undefined)
      return marcarEvento(payload, clave, 'activado')
    }
    if (st === 'cancelled' && VIGENTES.includes(p.estado)) {
      await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'cancelado', motivo: 'La suscripción se canceló en la pasarela', historial: evento(p, 'Suscripción cancelada en la pasarela', proveedor) } })
      await avisarEquipo(payload, p, 'Se canceló la suscripción de un plan').catch(() => undefined)
      return marcarEvento(payload, clave, 'cancelado')
    }
    return marcarEvento(payload, clave, `suscripción ${st || 'sin estado'}`)
  }

  if (ev.resultado === 'rechazado') {
    await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { historial: evento(p, tipo === 'cobro_suscripcion' ? 'Cobro de la suscripción rechazado (la pasarela reintenta)' : 'Pago rechazado', proveedor) } })
    return marcarEvento(payload, clave, 'rechazado')
  }

  if (tipo === 'pago') {
    if (p.modalidad !== 'anual') return marcarEvento(payload, clave, 'pago único en un plan recurrente')
    if (p.pago?.pagadoEn) return marcarEvento(payload, clave, t(p.pago.idPago) && ev.idPago && t(p.pago.idPago) !== ev.idPago ? 'pago duplicado' : 'ya estaba pagado')
    if ((aCentavos(ev.monto) || 0) !== (aCentavos(n0(p.total)) || 0)) {
      await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { historial: evento(p, `Monto pagado distinto del total (${ev.monto}): revisar`, proveedor) } })
      return marcarEvento(payload, clave, 'monto distinto')
    }
    const tarde = p.estado !== 'por_pagar'
    await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { estado: tarde ? p.estado : 'activo', pago: { ...(p.pago ?? {}), referencia: ev.referencia, idPago: ev.idPago ?? null, pagadoEn: new Date().toISOString() }, historial: evento(p, tarde ? 'Pagado con el plan cancelado: reembolsar' : `Pago anual confirmado (${ev.referencia})`, proveedor) } })
    if (tarde) {
      await avisarEquipo(payload, p, 'Se pagó un plan anual ya cancelado: reembólsalo').catch(() => undefined)
      return marcarEvento(payload, clave, 'pagado tarde')
    }
    await avisarTutor(payload, p, 'activo').catch(() => undefined)
    /* La primera entrega sale de inmediato. */
    await cicloPlan(payload, p.id).catch((e) => payload.logger.error(`[planes] primera entrega de PLN-${p.id}: ${String(e)}`))
    return marcarEvento(payload, clave, 'pagado')
  }

  /* cobro_suscripcion aprobado */
  if (p.modalidad !== 'recurrente') return marcarEvento(payload, clave, 'cobro en un plan anual')
  if (ev.idSuscripcion && t(p.pago?.idSuscripcion) && ev.idSuscripcion !== t(p.pago?.idSuscripcion)) return marcarEvento(payload, clave, 'cobro de una suscripción anterior')
  if ((aCentavos(ev.monto) || 0) !== (aCentavos(p.precioEntrega) || 0)) {
    await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { historial: evento(p, `Cobro de ${ev.monto} distinto del precio por entrega: revisar`, proveedor) } })
    await avisarEquipo(payload, p, 'Un cobro del plan no coincide con el precio').catch(() => undefined)
    return marcarEvento(payload, clave, 'monto distinto')
  }
  let actual = p
  if (p.estado === 'por_pagar') actual = await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 1, showHiddenFields: true, data: { estado: 'activo', pago: { ...(p.pago ?? {}), pagadoEn: new Date().toISOString() }, historial: evento(p, 'Primer cobro de la suscripción', proveedor) } })
  if (actual.estado !== 'activo') {
    await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { historial: evento(actual, `Cobro recibido con el plan ${actual.estado}: reembolsar en la pasarela o surtir al reanudar`, proveedor) } })
    await avisarEquipo(payload, actual, 'Llegó un cobro de un plan que no está activo').catch(() => undefined)
    return marcarEvento(payload, clave, `cobro con el plan ${actual.estado}`)
  }
  const r = await generarEntrega(payload, actual, { proveedor, referencia: ev.referencia, idPago: ev.idPago ?? null, pagadoEn: new Date().toISOString() })
  if (r.motivo) {
    await avisarEquipo(payload, actual, `Llegó un cobro y el plan se detuvo (${r.motivo}): reembolsar o surtir al reanudar`).catch(() => undefined)
    return marcarEvento(payload, clave, 'cobro con el plan detenido')
  }
  return marcarEvento(payload, clave, 'entrega generada')
}

/* ───────────────────────────── entregas (cron y avisos) ───────────────────────────── */

/** Detiene el plan (pausa la suscripción) y avisa al tutor. */
async function detener(payload: Payload, p: FarPlan, motivo: string): Promise<void> {
  if (p.estado === 'detenido' && t(p.motivo) === motivo) return
  const sus = t(p.pago?.idSuscripcion)
  const prov = proveedorPago(p.pago?.proveedor)
  if (p.modalidad === 'recurrente' && sus && prov?.disponible()) await prov.cambiarSuscripcion({ idSuscripcion: sus, estado: 'paused' }).catch((e) => payload.logger.error(`[planes] no se pausó PLN-${p.id}: ${String(e)}`))
  await payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { estado: 'detenido', motivo, historial: evento(p, `Detenido: ${motivo}`, 'Sistema') } })
  await avisarTutor(payload, { ...p, motivo }, 'detenido').catch(() => undefined)
}

/**
 * Genera la siguiente entrega: revisa contra la mascota y la receta, crea el
 * pedido pagado y mueve la próxima fecha. `pago` es el cobro (recurrente) o el
 * pago anual. Devuelve `motivo` si el plan se detuvo.
 */
async function generarEntrega(payload: Payload, p: FarPlan, pago: { proveedor: string | null; referencia: string | null; idPago: string | null; pagadoEn: string | null }): Promise<{ motivo: string | null; pedido: FarPedido | null }> {
  const pres = await payload.findByID({ collection: 'far-presentaciones', id: idDe(p.presentacion)!, depth: 1, overrideAccess: true }).catch(() => null)
  const prod = pres && typeof pres.producto === 'object' ? (pres.producto as FarProducto) : null
  if (!pres || !prod || !pres.activa || !prod.activo || prod.grupo === 'I') {
    const motivo = 'El producto ya no está a la venta.'
    await detener(payload, p, motivo)
    return { motivo, pedido: null }
  }
  const rev = await revisar(payload, { mascotaId: idDe(p.mascota)!, prod, presentacionId: pres.id })
  if (rev.motivo) {
    await detener(payload, p, rev.motivo)
    return { motivo: rev.motivo, pedido: null }
  }
  const tutor = await payload.findByID({ collection: 'tutores', id: idDe(p.tutor)!, depth: 0, overrideAccess: true }).catch(() => null)
  const mascota = typeof p.mascota === 'object' && p.mascota ? (p.mascota as Mascota) : null
  const ciclo = n0(p.entregasHechas) + 1
  const anual = p.modalidad === 'anual'
  const unidad = aPesos(Math.round((aCentavos(p.precioEntrega) || 0) / p.cantidad))
  const r = await crearPedidoDePlan(payload, {
    planId: p.id,
    ciclo,
    anual,
    tutorId: idDe(p.tutor)!,
    clienteId: idDe(p.cliente)!,
    mascotaId: idDe(p.mascota)!,
    contacto: { nombre: tutor?.nombre ?? 'Tutor', correo: (tutor?.email ?? '').toLowerCase(), telefono: t(tutor?.telefono) },
    presentacionId: pres.id,
    productoId: prod.id,
    descripcion: `${prod.nombre} · ${pres.nombre}`,
    grupo: t(prod.grupo),
    cantidad: p.cantidad,
    unidades: r3(p.cantidad * (n0(pres.factor) || 1)),
    precioUnitario: unidad,
    recetaId: rev.recetaId,
    pago,
    nota: `Entrega ${ciclo}${anual && p.entregasTotales ? ` de ${p.entregasTotales}` : ''} del plan ${folioParaId('PLN', p.id)}${mascota ? ` · ${mascota.nombre}` : ''}`,
  })
  const hoy = hoyNegocio()
  const desde = t(p.proximaEntrega) && t(p.proximaEntrega)! > hoy ? t(p.proximaEntrega)! : hoy
  const termina = anual && p.entregasTotales != null && ciclo >= p.entregasTotales
  await payload.update({
    collection: 'far-planes',
    id: p.id,
    overrideAccess: true,
    depth: 0,
    data: { entregasHechas: ciclo, proximaEntrega: termina ? null : sumarDias(desde, p.cadaDias), estado: termina ? 'terminado' : p.estado, historial: evento(p, `Entrega ${ciclo}: pedido ${folioParaId('PED', r.pedido.id)}${r.faltaExistencia ? ' (falta existencia)' : ''}${termina ? ' · última del plan' : ''}`, 'Sistema') },
  })
  return { motivo: null, pedido: r.pedido }
}

/** Una vuelta del plan: si toca (próxima − díasAntes ≤ hoy) revisa y, si es anual o «prueba», genera la entrega. */
async function cicloPlan(payload: Payload, id: number): Promise<'entrega' | 'detenido' | 'revisado' | 'nada'> {
  const p = await payload.findByID({ collection: 'far-planes', id, depth: 1, overrideAccess: true, showHiddenFields: true })
  if (p.estado !== 'activo' || !t(p.proximaEntrega)) return 'nada'
  const cfg = await leerConfiguracion(payload)
  const hoy = hoyNegocio()
  if (sumarDias(p.proximaEntrega!, -cfg.planes.diasAntes) > hoy) return 'nada'
  if (p.modalidad === 'anual') {
    if (!p.pago?.pagadoEn) return 'nada'
    const r = await generarEntrega(payload, p, { proveedor: t(p.pago?.proveedor), referencia: t(p.pago?.referencia), idPago: t(p.pago?.idPago), pagadoEn: p.pago?.pagadoEn ?? null })
    return r.motivo ? 'detenido' : 'entrega'
  }
  /* Recurrente: se revisa antes del cobro, para pausar a tiempo. Con pasarela real, la pasarela cobra sola. */
  const pres = await payload.findByID({ collection: 'far-presentaciones', id: idDe(p.presentacion)!, depth: 1, overrideAccess: true }).catch(() => null)
  const prod = pres && typeof pres.producto === 'object' ? (pres.producto as FarProducto) : null
  if (!pres || !prod || !pres.activa || !prod.activo) {
    await detener(payload, p, 'El producto ya no está a la venta.')
    return 'detenido'
  }
  const rev = await revisar(payload, { mascotaId: idDe(p.mascota)!, prod, presentacionId: pres.id })
  if (rev.motivo) {
    await detener(payload, p, rev.motivo)
    return 'detenido'
  }
  if (p.pago?.proveedor !== 'prueba') return 'revisado'
  /* «prueba»: se simula el cobro de la suscripción, por el mismo camino que un aviso real. */
  const r = await procesarEventoPlan(payload, 'prueba', { idEvento: `cron-${p.id}-${n0(p.entregasHechas) + 1}`, pedidoId: 0, planId: p.id, tipo: 'cobro_suscripcion', idSuscripcion: t(p.pago?.idSuscripcion), referencia: t(p.pago?.referencia) ?? `prueba-pln-${p.id}-0`, resultado: 'aprobado', monto: p.precioEntrega, idPago: `prueba-cobro-${p.id}-${n0(p.entregasHechas) + 1}` })
  return r.resultado === 'entrega generada' ? 'entrega' : r.resultado.includes('detenido') ? 'detenido' : 'nada'
}

/** Lo del cron diario. Nunca lanza. */
export async function cronPlanes(payload: Payload): Promise<{ entregasPlan: number; planesDetenidos: number }> {
  let entregasPlan = 0
  let planesDetenidos = 0
  try {
    const cfg = await leerConfiguracion(payload)
    const limite = sumarDias(hoyNegocio(), cfg.planes.diasAntes)
    const r = await payload.find({ collection: 'far-planes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ estado: { equals: 'activo' } }, { proximaEntrega: { less_than_equal: limite } }] }, select: { estado: true } })
    for (const { id } of r.docs) {
      try {
        const x = await cicloPlan(payload, id)
        if (x === 'entrega') entregasPlan++
        if (x === 'detenido') planesDetenidos++
      } catch (e) {
        payload.logger.error(`[planes] PLN-${id}: ${String((e as Error)?.message ?? e)}`)
      }
    }
  } catch (e) {
    payload.logger.error(`[planes] cron falló: ${String((e as Error)?.message ?? e)}`)
  }
  return { entregasPlan, planesDetenidos }
}

/* ───────────────────────────── pago de prueba ───────────────────────────── */

/** Página de pago de prueba del plan: firma el aviso con PAGOS_PRUEBA_SECRETO y lo pasa por el mismo camino que uno real. */
export async function pagoPruebaPlan(payload: Payload, id: number, token: string, ref: string, resultado: 'aprobado' | 'rechazado', url: URL): Promise<{ resultado: string }> {
  const p = await porToken(payload, id, token)
  if (p.pago?.proveedor !== 'prueba') throw invalido('Este plan no es de pago de prueba.')
  if (!ref || ref !== t(p.pago?.referencia)) throw new ErrorFarmacia(409, 'Ese cobro ya no es el vigente. Vuelve a tu plan y paga otra vez.')
  const enviar = async (ev: Record<string, unknown>) => {
    const cuerpo = JSON.stringify(ev)
    return recibirAviso(payload, 'prueba', new Headers({ 'x-firma-prueba': firmarPrueba(cuerpo) }), cuerpo, url)
  }
  const r = resultado === 'rechazado' ? 'r' : 'a'
  if (p.modalidad === 'anual') return { resultado: (await enviar({ idEvento: `${ref}:${r}`, planId: p.id, tipo: 'pago', referencia: ref, resultado, monto: n0(p.total) })).resultado }
  if (resultado === 'rechazado') return { resultado: (await enviar({ idEvento: `${ref}:cob1:r`, planId: p.id, tipo: 'cobro_suscripcion', idSuscripcion: t(p.pago?.idSuscripcion), referencia: ref, resultado, monto: p.precioEntrega })).resultado }
  await enviar({ idEvento: `${ref}:aut`, planId: p.id, tipo: 'suscripcion', estadoSuscripcion: 'authorized', idSuscripcion: t(p.pago?.idSuscripcion), referencia: ref, resultado: 'aprobado', monto: p.precioEntrega })
  return { resultado: (await enviar({ idEvento: `${ref}:cob1`, planId: p.id, tipo: 'cobro_suscripcion', idSuscripcion: t(p.pago?.idSuscripcion), referencia: ref, resultado: 'aprobado', monto: p.precioEntrega })).resultado }
}

/* ───────────────────────────── Finanzas (anual) ───────────────────────────── */

/**
 * Anticipo del plan anual: una entrada por el total, liquidada en la cuenta del
 * método de pago en línea con la fecha del pago. Idempotente (`plan-<id>-anticipo`).
 */
async function registrarAnticipo(ctx: Ctx, p: FarPlan): Promise<number> {
  const opYa = idDe(p.anticipo?.operacionFinanzas)
  if (opYa) return opYa
  if (!p.pago?.pagadoEn) throw invalido('El plan todavía no está pagado.')
  const cfg = await leerConfiguracion(ctx.payload)
  const m = cfg.metodosPago.find((x) => x.clave === cfg.tienda.metodoPagoEnLinea && x.activo)
  if (!m?.cuentaId) throw invalido('Falta el método de pago en línea con su cuenta de Finanzas (Farmacia → Configuración → Tienda y Métodos de pago).')
  const fin = ctxFinanzas(ctx)
  const folio = folioParaId('PLN', p.id)
  const dia = diaLocal(new Date(p.pago.pagadoEn))
  const fecha = dia <= ctx.hoy ? dia : ctx.hoy
  const tutor = typeof p.tutor === 'object' && p.tutor ? (p.tutor as { nombre?: string }).nombre : null
  const r = await registrarEnFinanzas(
    fin,
    {
      tipo: 'entrada',
      importe: n0(p.total),
      fechaReal: fecha,
      estado: 'pendiente',
      concepto: `Anticipo del plan anual ${folio}`,
      categoria: cfg.planes.categoriaAnticiposId ?? cfg.finanzas.categoriaVentasId,
      asignacion: cfg.finanzas.areaId ? 'actividad' : 'pendiente',
      actividad: cfg.finanzas.areaId,
      contraparte: tutor ?? 'Tienda en línea',
      notas: `${p.entregasTotales ?? ''} entregas · se reconoce con cada entrega · ${t(p.pago?.idPago) ?? t(p.pago?.referencia) ?? ''}`,
    },
    `plan-${p.id}-anticipo`,
  )
  await liquidarEnFinanzas(fin, r.operacion.id, { importe: n0(p.total), cuenta: m.cuentaId, medio: MEDIO[m.tipo] ?? null, fechaReal: fecha }, `plan-${p.id}-anticipo-cobro`)
  await ctx.payload.update({ collection: 'far-planes', id: p.id, overrideAccess: true, depth: 0, data: { anticipo: { ...(p.anticipo ?? {}), operacionFinanzas: r.operacion.id } } })
  return r.operacion.id
}

async function reconocidoDe(payload: Payload, planId: number): Promise<number> {
  const v = await payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ plan: { equals: planId } }, { estado: { not_equals: 'anulada' } }] }, select: { total: true } })
  return aPesos(v.docs.reduce((a, x) => a + (aCentavos(x.total) || 0), 0))
}

/** Al entregar una entrega del plan anual (lo llama `entregarPedido`). */
export async function reconocerEntrega(ctx: Ctx, planId: number): Promise<{ aviso: string | null }> {
  const p = await cargar(ctx.payload, planId)
  if (p.modalidad !== 'anual') return { aviso: null }
  let aviso: string | null = null
  try {
    await registrarAnticipo(ctx, p)
  } catch (e) {
    aviso = `El anticipo del plan ${folioParaId('PLN', p.id)} no entró a Finanzas: ${String((e as Error)?.message ?? e)} Reintenta desde Farmacia → Planes.`
  }
  const fresco = await cargar(ctx.payload, planId)
  await ctx.payload.update({ collection: 'far-planes', id: planId, overrideAccess: true, depth: 0, data: { anticipo: { ...(fresco.anticipo ?? {}), reconocido: await reconocidoDe(ctx.payload, planId) } } })
  return { aviso }
}

/* ───────────────────────────── panel (equipo) ───────────────────────────── */

function exigir(ctx: Ctx) {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.vender) throw prohibido('Tu rol no incluye los planes de la tienda.')
}

export type ResumenPlanes = { planes: PlanVista[]; conteo: Record<'activos' | 'detenidos' | 'por_pagar' | 'cerrados', number>; anticipos: { cobrado: number; reconocido: number; porReconocer: number } }

const GRUPO: Record<string, FarPlan['estado'][]> = { activos: ['activo'], detenidos: ['detenido'], por_pagar: ['por_pagar'], cerrados: ['cancelado', 'terminado'] }

export async function planesPanel(ctx: Ctx, grupo: string | null): Promise<ResumenPlanes> {
  exigir(ctx)
  const g = GRUPO[grupo ?? 'activos'] ? (grupo ?? 'activos') : 'activos'
  const [lista, ...conteos] = await Promise.all([
    ctx.payload.find({ collection: 'far-planes', depth: 1, limit: 200, overrideAccess: true, sort: g === 'cerrados' ? '-updatedAt' : 'proximaEntrega', where: { estado: { in: GRUPO[g] } } }),
    ...Object.values(GRUPO).map((es) => ctx.payload.count({ collection: 'far-planes', overrideAccess: true, where: { estado: { in: es } } })),
  ])
  const [activos, detenidos, por_pagar, cerrados] = conteos.map((c) => c.totalDocs)
  const ped = await pedidosDePlanes(ctx.payload, lista.docs.map((p) => p.id))
  const planes = await Promise.all(lista.docs.map(async (p) => vistaPlan(p, ped.get(p.id) ?? [], { panel: true, reconocido: p.modalidad === 'anual' ? await reconocidoDe(ctx.payload, p.id) : 0 })))
  return { planes, conteo: { activos, detenidos, por_pagar, cerrados }, anticipos: await resumenAnticipos(ctx.payload) }
}

/** Anticipos de planes anuales: cobrado (pagado), reconocido (entregado) y por reconocer. Lo usan el panel y los reportes. */
export async function resumenAnticipos(payload: Payload, hasta?: string): Promise<{ cobrado: number; reconocido: number; porReconocer: number }> {
  const r = await payload.find({ collection: 'far-planes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ modalidad: { equals: 'anual' } }, { 'pago.pagadoEn': { exists: true } }] }, select: { total: true, pago: true, estado: true } })
  const pagados = r.docs.filter((p) => p.pago?.pagadoEn && (!hasta || diaLocal(new Date(p.pago.pagadoEn)) <= hasta))
  let cobradoC = 0
  let reconocidoC = 0
  if (pagados.length) {
    const ventas = await payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ plan: { in: pagados.map((p) => p.id) } }, { estado: { not_equals: 'anulada' } }, ...(hasta ? [{ dia: { less_than_equal: hasta } }] : [])] }, select: { total: true, pagos: true } })
    reconocidoC = ventas.docs.filter((v) => !(v.pagos ?? []).length).reduce((a, v) => a + (aCentavos(v.total) || 0), 0)
    cobradoC = pagados.reduce((a, p) => a + (aCentavos(n0(p.total)) || 0), 0)
  }
  return { cobrado: aPesos(cobradoC), reconocido: aPesos(reconocidoC), porReconocer: aPesos(Math.max(0, cobradoC - reconocidoC)) }
}

const esquemaAccion = z.object({ accion: z.enum(['cancelar', 'reanudar', 'anticipo']), motivo: z.string().trim().max(300).nullable().optional() })

export async function accionPlan(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(ctx)
  const d = esquemaAccion.safeParse(entrada)
  if (!d.success) throw invalido('Acción no válida.')
  const p = await cargar(ctx.payload, id)
  const quien = ctx.user.name || ctx.user.email
  if (d.data.accion === 'cancelar') {
    if (!VIGENTES.includes(p.estado)) throw invalido('Ese plan ya está cerrado.')
    if (!d.data.motivo || d.data.motivo.length < 3) throw invalido('Escribe el motivo de la cancelación (lo recibe el tutor).')
    if (p.modalidad === 'anual' && p.pago?.pagadoEn && !ctx.p.farmacia.aprobar) throw prohibido('Cancelar un plan anual pagado lo hace el encargado o el dueño (hay que decidir el reembolso).')
    await cancelarSuscripcion(ctx.payload, p)
    await ctx.payload.update({ collection: 'far-planes', id, overrideAccess: true, depth: 0, data: { estado: 'cancelado', motivo: d.data.motivo, historial: evento(p, `Cancelado: ${d.data.motivo}${p.modalidad === 'anual' && p.pago?.pagadoEn ? ' · reembolso según la política de la farmacia (fuera del sistema)' : ''}`, quien) } })
    await avisarTutor(ctx.payload, { ...p, motivo: d.data.motivo }, 'cancelado').catch(() => undefined)
  } else if (d.data.accion === 'reanudar') {
    if (p.estado !== 'detenido') throw invalido('Solo se reanuda un plan detenido.')
    const pres = await ctx.payload.findByID({ collection: 'far-presentaciones', id: idDe(p.presentacion)!, depth: 1, overrideAccess: true }).catch(() => null)
    const prod = pres && typeof pres.producto === 'object' ? (pres.producto as FarProducto) : null
    if (!pres || !prod || !pres.activa || !prod.activo) throw invalido('El producto ya no está a la venta: cancela el plan.')
    const rev = await revisar(ctx.payload, { mascotaId: idDe(p.mascota)!, prod, presentacionId: pres.id })
    if (rev.motivo) throw invalido(`Todavía no se puede: ${rev.motivo}`)
    const sus = t(p.pago?.idSuscripcion)
    const prov = proveedorPago(p.pago?.proveedor)
    if (p.modalidad === 'recurrente' && sus && prov?.disponible()) await prov.cambiarSuscripcion({ idSuscripcion: sus, estado: 'authorized' }).catch((e) => {
      throw new ErrorFarmacia(502, `No se reanudó la suscripción en la pasarela (${String((e as Error)?.message ?? e)}).`)
    })
    const proxima = t(p.proximaEntrega) && t(p.proximaEntrega)! >= ctx.hoy ? t(p.proximaEntrega) : ctx.hoy
    await ctx.payload.update({ collection: 'far-planes', id, overrideAccess: true, depth: 0, data: { estado: p.pago?.pagadoEn ? 'activo' : 'por_pagar', motivo: null, proximaEntrega: proxima, historial: evento(p, 'Reanudado', quien) } })
    if (p.modalidad === 'anual') await cicloPlan(ctx.payload, id).catch((e) => ctx.payload.logger.error(`[planes] al reanudar PLN-${id}: ${String(e)}`))
  } else {
    if (p.modalidad !== 'anual') throw invalido('Solo el plan anual lleva anticipo.')
    await registrarAnticipo(ctx, p)
  }
  const f = await cargar(ctx.payload, id)
  const ped = await pedidosDePlanes(ctx.payload, [id])
  return vistaPlan(f, ped.get(id) ?? [], { panel: true, reconocido: await reconocidoDe(ctx.payload, id) })
}

/* ───────────────────────────── correos (best-effort) ───────────────────────────── */

async function avisarTutor(payload: Payload, p: FarPlan, ev: 'activo' | 'detenido' | 'cancelado'): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const tutor = await payload.findByID({ collection: 'tutores', id: idDe(p.tutor)!, depth: 0, overrideAccess: true }).catch(() => null)
  if (!tutor?.email) return
  const prod = typeof p.producto === 'object' && p.producto ? (p.producto as FarProducto).nombre : 'tu producto'
  const masc = typeof p.mascota === 'object' && p.mascota ? (p.mascota as Mascota).nombre : 'tu mascota'
  const folio = folioParaId('PLN', p.id)
  const titulo = { activo: 'Tu plan quedó activo', detenido: 'Pausamos tu plan', cancelado: 'Tu plan se canceló' }[ev]
  const cuerpo = {
    activo: p.modalidad === 'anual' ? `Pagaste ${pesos(n0(p.total))} por ${p.entregasTotales} entregas de ${prod} para ${masc}, una cada ${p.cadaDias} días. Te avisamos cuando cada una esté lista para recoger.` : `Cada ${p.cadaDias} días se cobra ${pesos(p.precioEntrega)} y preparamos ${prod} para ${masc}. Te avisamos cuando esté listo para recoger.`,
    detenido: `${t(p.motivo) ?? ''} No se hará otra entrega${p.modalidad === 'recurrente' ? ' ni otro cobro' : ''} hasta resolverlo.`,
    cancelado: t(p.motivo) ?? '',
  }[ev]
  const cita = ev === 'detenido' ? `<p><a href="${site.url}/portal/citas/nueva" style="color:${site.brand.accent}">Agendar una cita</a></p>` : ''
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f2f2a"><h2 style="margin:0 0 6px">${esc(titulo)}</h2><p style="margin:0 0 12px;color:#4b5b56">${esc(site.brand.name)} · ${folio}</p><p>${esc(cuerpo)}</p>${cita}<p style="margin-top:18px"><a href="${ligaPlan(p)}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ver mi plan</a></p></div>`
  await payload.sendEmail({ to: tutor.email, subject: `${titulo} · ${folio}`, html })
  if (ev === 'detenido') await avisarEquipo(payload, p, `Plan detenido: ${t(p.motivo) ?? ''}`)
}

async function avisarEquipo(payload: Payload, p: FarPlan, texto: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const cfg = await leerConfiguracion(payload)
  const para = (cfg.tienda.correosPedidos ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
  if (!para.length) return
  await payload.sendEmail({ to: para, subject: `${texto} · ${folioParaId('PLN', p.id)}`, html: `<p>${esc(texto)}</p><p>Entra a Farmacia → Planes.</p>` })
}

