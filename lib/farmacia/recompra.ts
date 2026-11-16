import crypto from 'crypto'
import type { Payload } from 'payload'

import type { FarProducto, FarRecompra, FarVenta } from '../../payload-types'
import { diaLocal } from '../localTime'
import { site } from '../site'
import { idDe, leerConfiguracion } from './servicio'
import { armarProductos, contextoPublico, visiblePublico } from './tienda'
import { n0, noEncontrado, r3, t } from './util'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Recompra (Farmacia, fase 6a, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cada compra de un producto con «duración por omisión» (días que cubre una
 * unidad base; p. ej. pipeta = 30) deja una fecha estimada en que se acaba:
 *   fecha de la venta + unidades base compradas × duración.
 * Una fila por quién compra (cliente de la clínica o, en la tienda, el correo
 * del invitado) + mascota + producto; la compra más reciente manda.
 *
 * El cron diario recalcula y, `recompraDiasAntes` días antes de la fecha,
 * manda UN correo con «Volver a pedir» (liga con token, sin sesión) y
 * «No me avises más». Si la fecha cambia (compró otra vez), vuelve a avisar.
 *
 * No se calcula consumo con la posología de la receta: nunca se interpretan
 * dosis. Sin duración por omisión en el producto, no hay aviso.
 */

const HISTORIA_DIAS = 400
/** No se avisa de lo que se acabó hace más de esto (evita correos viejos al encender la función). */
const ATRASO_MAXIMO_DIAS = 7

function sumarDias(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + Math.round(n))
  return d.toISOString().slice(0, 10)
}
const hoyNegocio = () => diaLocal(new Date())
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Candidata = {
  clave: string
  cliente: number | null
  correo: string | null
  nombre: string | null
  mascota: number | null
  producto: number
  presentacion: number
  cantidad: number
  unidades: number
  venta: number
  dia: string
  fechaEstimada: string
}

/** Recalcula las recompras con las ventas de los últimos 400 días. Devuelve cuántas filas creó o cambió. */
export async function recalcularRecompras(payload: Payload, hoy = hoyNegocio()): Promise<number> {
  const desde = sumarDias(hoy, -HISTORIA_DIAS)
  const ventas = await payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, sort: 'dia', where: { and: [{ estado: { not_equals: 'anulada' } }, { dia: { greater_than_equal: desde } }] } })
  if (!ventas.docs.length) return 0
  const idsProd = [...new Set(ventas.docs.flatMap((v) => (v.renglones ?? []).map((r) => idDe(r.producto)).filter((x): x is number => Boolean(x))))]
  const prods = await payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ id: { in: idsProd } }, { duracionDias: { greater_than: 0 } }] } })
  const duracion = new Map(prods.docs.map((p) => [p.id, n0(p.duracionDias)]))
  if (!duracion.size) return 0

  /* Ventas de la tienda sin cliente: el destinatario es el correo del pedido. */
  const sinCliente = ventas.docs.filter((v) => !idDe(v.cliente) && v.canal === 'tienda').map((v) => v.id)
  const correoDeVenta = new Map<number, { correo: string; nombre: string | null }>()
  if (sinCliente.length) {
    const ped = await payload.find({ collection: 'far-pedidos', depth: 0, pagination: false, overrideAccess: true, where: { venta: { in: sinCliente } }, select: { venta: true, contacto: true } })
    for (const p of ped.docs) {
      const vid = idDe(p.venta)
      const correo = t(p.contacto?.correo)?.toLowerCase()
      if (vid && correo) correoDeVenta.set(vid, { correo, nombre: t(p.contacto?.nombre) })
    }
  }

  /* La compra más reciente por clave (las ventas vienen por día ascendente). Una venta suma sus renglones del mismo producto. */
  const porClave = new Map<string, Candidata>()
  const ordenadas = (ventas.docs as FarVenta[]).slice().sort((a, b) => a.dia.localeCompare(b.dia) || a.id - b.id)
  for (const v of ordenadas) {
    const cliente = idDe(v.cliente)
    const inv = cliente ? null : correoDeVenta.get(v.id) ?? null
    if (!cliente && !inv) continue
    const mascota = idDe(v.mascota)
    for (const r of v.renglones ?? []) {
      const producto = idDe(r.producto)
      const presentacion = idDe(r.presentacion)
      if (!producto || !presentacion || !duracion.has(producto)) continue
      const clave = `${cliente ? `c${cliente}` : `e${inv!.correo}`}:${mascota ?? 0}:${producto}`
      const previa = porClave.get(clave)
      const mismaVenta = previa?.venta === v.id
      const unidades = r3((mismaVenta ? previa!.unidades : 0) + n0(r.unidades))
      const cantidad = r3((mismaVenta ? previa!.cantidad : 0) + n0(r.cantidad))
      porClave.set(clave, { clave, cliente, correo: inv?.correo ?? null, nombre: inv?.nombre ?? null, mascota, producto, presentacion, cantidad, unidades, venta: v.id, dia: v.dia, fechaEstimada: sumarDias(v.dia, unidades * duracion.get(producto)!) })
    }
  }

  const existentes = await payload.find({ collection: 'far-recompras', depth: 0, pagination: false, overrideAccess: true, where: { clave: { in: [...porClave.keys()] } } })
  const porClaveExistente = new Map(existentes.docs.map((x) => [x.clave, x]))
  let cambios = 0
  for (const c of porClave.values()) {
    const datos = { cliente: c.cliente, correo: c.correo, nombre: c.nombre, mascota: c.mascota, producto: c.producto, presentacion: c.presentacion, cantidad: c.cantidad, unidades: c.unidades, ultimaVenta: c.venta, ultimaCompra: c.dia, fechaEstimada: c.fechaEstimada }
    const e = porClaveExistente.get(c.clave)
    if (!e) {
      await payload.create({ collection: 'far-recompras', overrideAccess: true, depth: 0, data: { clave: c.clave, ...datos, activa: true, token: crypto.randomBytes(24).toString('hex') } })
      cambios++
    } else if (idDe(e.ultimaVenta) !== c.venta || e.fechaEstimada !== c.fechaEstimada) {
      await payload.update({ collection: 'far-recompras', id: e.id, overrideAccess: true, depth: 0, data: datos })
      cambios++
    }
  }
  return cambios
}

/** Correos de quien compró: el de la ficha del cliente y los de sus cuentas del portal; o el del invitado. */
async function destinatarios(payload: Payload, r: FarRecompra): Promise<string[]> {
  if (r.correo) return [r.correo]
  const cid = idDe(r.cliente)
  if (!cid) return []
  const [cli, tutores] = await Promise.all([
    payload.findByID({ collection: 'clientes', id: cid, depth: 0, overrideAccess: true }).catch(() => null),
    payload.find({ collection: 'tutores', depth: 0, pagination: false, overrideAccess: true, where: { cliente: { equals: cid } }, select: { email: true } }),
  ])
  return [...new Set([t(cli?.email), ...tutores.docs.map((x) => t(x.email))].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase()))]
}

const ligaRecompra = (r: Pick<FarRecompra, 'id' | 'token'>, baja = false) => `${site.url}/tienda/recompra/${r.id}?t=${encodeURIComponent(r.token)}${baja ? '&baja=1' : ''}`

function htmlAviso(r: FarRecompra, prod: FarProducto, mascota: string | null, enTienda: boolean): string {
  const quien = mascota ? ` de ${esc(mascota)}` : ''
  const cuando = r.fechaEstimada <= hoyNegocio() ? 'ya se debió acabar' : `se acaba alrededor del ${new Date(r.fechaEstimada + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
  const boton = enTienda
    ? `<p style="margin:18px 0"><a href="${ligaRecompra(r)}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Volver a pedir</a></p>`
    : `<p>Pídelo en la farmacia${prod.grupo === 'II' ? ' con su receta' : ''} o escríbenos.</p>`
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f2f2a"><h2 style="margin:0 0 6px">¿Ya toca${quien}?</h2><p style="margin:0 0 12px;color:#4b5b56">${esc(site.brand.name)}</p><p>El <b>${esc(prod.nombre)}</b>${quien} que compraste el ${new Date(r.ultimaCompra + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' })} ${cuando}.</p>${boton}<p style="font-size:12px;color:#4b5b56">Es un cálculo con la duración habitual del producto; si tu veterinario indicó otra cosa, sigue su indicación. <a href="${ligaRecompra(r, true)}" style="color:#4b5b56">No me avises más de este producto</a>.</p></div>`
}

/** Manda los avisos que tocan hoy. Un aviso por fecha estimada; best-effort (un correo que falla no detiene a los demás). */
export async function enviarAvisosRecompra(payload: Payload, hoy = hoyNegocio()): Promise<number> {
  const cfg = await leerConfiguracion(payload)
  if (!cfg.tienda.recompraActiva) return 0
  const r = await payload.find({
    collection: 'far-recompras',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    showHiddenFields: true,
    where: { and: [{ activa: { equals: true } }, { fechaEstimada: { less_than_equal: sumarDias(hoy, cfg.tienda.recompraDiasAntes) } }, { fechaEstimada: { greater_than_equal: sumarDias(hoy, -ATRASO_MAXIMO_DIAS) } }] },
  })
  const pendientes = r.docs.filter((x) => x.avisadoPara !== x.fechaEstimada)
  if (!pendientes.length) return 0
  const prods = await payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: [...new Set(pendientes.map((x) => idDe(x.producto)!))] } } })
  const prod = new Map(prods.docs.map((p) => [p.id, p]))
  const idsMascota = [...new Set(pendientes.map((x) => idDe(x.mascota)).filter((x): x is number => Boolean(x)))]
  const mascotas = idsMascota.length ? await payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: idsMascota } }, select: { nombre: true, estado: true } }) : { docs: [] }
  const mascota = new Map(mascotas.docs.map((m) => [m.id, m]))
  let enviados = 0
  for (const x of pendientes) {
    try {
      const p = prod.get(idDe(x.producto)!)
      const m = idDe(x.mascota) ? mascota.get(idDe(x.mascota)!) : null
      /* Producto dado de baja o mascota fallecida: no se avisa (y no vuelve a intentarse para esa fecha). */
      const omitir = !p || p.activo === false || p.grupo === 'I' || m?.estado === 'fallecido'
      const para = omitir ? [] : await destinatarios(payload, x)
      if (para.length) {
        const enTienda = Boolean(p!.publicadoTienda && p!.grupo !== 'II')
        await payload.sendEmail({ to: para, subject: `¿Ya toca? ${p!.nombre}${m ? ` de ${m.nombre}` : ''}`, html: htmlAviso(x, p!, m?.nombre ?? null, enTienda) })
        enviados++
      }
      await payload.update({ collection: 'far-recompras', id: x.id, overrideAccess: true, depth: 0, data: { avisadoPara: x.fechaEstimada, avisadoEn: new Date().toISOString() } })
    } catch (e) {
      payload.logger.error(`[farmacia/recompra] aviso ${x.id} falló: ${String((e as Error)?.message ?? e)}`)
    }
  }
  return enviados
}

/** Lo del cron diario: recalcular y avisar. Nunca lanza. */
export async function cronRecompras(payload: Payload): Promise<{ recompras: number; avisosRecompra: number }> {
  try {
    const recompras = await recalcularRecompras(payload)
    const avisosRecompra = await enviarAvisosRecompra(payload)
    return { recompras, avisosRecompra }
  } catch (e) {
    payload.logger.error(`[farmacia/recompra] cron falló: ${String((e as Error)?.message ?? e)}`)
    return { recompras: 0, avisosRecompra: 0 }
  }
}

/* ───────────────────────────── tienda y portal ───────────────────────────── */

export type RecompraVista = {
  id: number
  token: string
  activa: boolean
  ultimaCompra: string
  fechaEstimada: string
  cantidad: number
  mascota: { id: number; nombre: string } | null
  producto: { id: number; nombre: string; linea: string; imagenUrl: string | null; requiereReceta: boolean; enTienda: boolean }
  presentacion: { id: number; nombre: string; precio: number; fraccionada: boolean; disponible: boolean } | null
}

async function buscarConToken(payload: Payload, id: number, token: string): Promise<FarRecompra> {
  if (!id || !/^[a-f0-9]{48}$/.test(token)) throw noEncontrado('Esa liga ya no es válida.')
  const r = await payload.find({ collection: 'far-recompras', depth: 0, limit: 1, overrideAccess: true, showHiddenFields: true, where: { and: [{ id: { equals: id } }, { token: { equals: token } }] } })
  if (!r.docs[0]) throw noEncontrado('Esa liga ya no es válida.')
  return r.docs[0]
}

async function vistas(payload: Payload, headers: Headers, filas: FarRecompra[]): Promise<RecompraVista[]> {
  if (!filas.length) return []
  const x = await contextoPublico(payload, headers)
  const ids = [...new Set(filas.map((f) => idDe(f.producto)!))]
  const [todos, publicos, mascotas] = await Promise.all([
    payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } }),
    payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { and: [visiblePublico, { id: { in: ids } }] } }),
    payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: filas.map((f) => idDe(f.mascota)).filter((m): m is number => Boolean(m)) } }, select: { nombre: true } }),
  ])
  const enTienda = new Map((await armarProductos(x, publicos.docs, null)).map((p) => [p.id, p]))
  const prod = new Map(todos.docs.map((p) => [p.id, p]))
  const nombreMascota = new Map(mascotas.docs.map((m) => [m.id, m.nombre]))
  return filas
    .filter((f) => prod.has(idDe(f.producto)!))
    .map((f) => {
      const p = prod.get(idDe(f.producto)!)!
      const pt = enTienda.get(p.id)
      const pres = pt?.presentaciones.find((y) => y.id === idDe(f.presentacion)) ?? null
      const mid = idDe(f.mascota)
      return {
        id: f.id,
        token: f.token,
        activa: f.activa !== false,
        ultimaCompra: f.ultimaCompra,
        fechaEstimada: f.fechaEstimada,
        cantidad: n0(f.cantidad),
        mascota: mid ? { id: mid, nombre: nombreMascota.get(mid) ?? 'tu mascota' } : null,
        producto: { id: p.id, nombre: p.nombre, linea: p.linea, imagenUrl: t(p.imagenUrl), requiereReceta: p.grupo === 'II', enTienda: Boolean(pt) },
        presentacion: pres ? { id: pres.id, nombre: pres.nombre, precio: pres.precio, fraccionada: pres.fraccionada, disponible: pres.disponible } : null,
      }
    })
}

/** «Volver a pedir» desde el correo (sin sesión: la liga lleva el token). */
export async function recompraPublica(payload: Payload, headers: Headers, id: number, token: string): Promise<RecompraVista> {
  const f = await buscarConToken(payload, id, token)
  const [v] = await vistas(payload, headers, [f])
  if (!v) throw noEncontrado('Ese producto ya no está disponible.')
  return v
}

/** «No me avises más» (también desde el correo). */
export async function bajaRecompra(payload: Payload, id: number, token: string): Promise<{ activa: false }> {
  const f = await buscarConToken(payload, id, token)
  if (f.activa !== false) await payload.update({ collection: 'far-recompras', id: f.id, overrideAccess: true, depth: 0, data: { activa: false } })
  return { activa: false }
}

/** Para el inicio del portal: lo que se acaba en los próximos `dias` (o ya se acabó hace poco) de las mascotas del cliente. */
export async function recomprasDelCliente(payload: Payload, headers: Headers, clienteId: number, dias = 7): Promise<RecompraVista[]> {
  const hoy = hoyNegocio()
  const r = await payload.find({
    collection: 'far-recompras',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    showHiddenFields: true,
    sort: 'fechaEstimada',
    where: { and: [{ cliente: { equals: clienteId } }, { activa: { equals: true } }, { fechaEstimada: { less_than_equal: sumarDias(hoy, dias) } }, { fechaEstimada: { greater_than_equal: sumarDias(hoy, -30) } }] },
  })
  return (await vistas(payload, headers, r.docs)).filter((v) => v.producto.enTienda || v.producto.requiereReceta)
}

