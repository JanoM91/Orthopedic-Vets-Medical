import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { firmarPrueba, proveedorPago } from '@/lib/farmacia/pagos'
import { ErrorFarmacia } from '@/lib/farmacia/servicio'
import { sugerirProductos } from '@/lib/farmacia/sugerir'
import { cancelarPorCliente, catalogoTienda, cotizarEnvio, crearPedido, pagarPedido, pedidosDelTutor, productoTienda, recibirAviso, seguimiento, sesionTienda } from '@/lib/farmacia/tienda'
import { ErrorConCodigo } from '@/lib/farmacia/util'
import { contextoTutor } from '@/lib/clinica/servicio'
import { rateLimit } from '@/lib/rateLimit'

/**
 * API pública de la tienda en línea (Farmacia, fase 5a). Sin sesión del equipo:
 * la usan visitantes y tutores. Todo responde 404 si los módulos Farmacia o
 * Tienda están apagados (lo decide `contextoPublico()` del servicio).
 *
 *   GET  catalogo?q=&linea=&mascota=  |  &especie=&peso=
 *   GET  producto/:id?(mismo perfil)
 *   GET  sesion                         tutor con sesión: mascotas, recetas vigentes
 *   GET  envio?cp=&subtotal=            zona y costo de envío (5b)
 *   POST sugerir                        { texto, perfil? } búsqueda con IA (5b)
 *   GET  mis-pedidos                    tutor con sesión
 *   GET  pedidos/:folio?t=<token>       seguimiento (tutor o invitado con su liga)
 *   POST pedidos                        crear (idempotente por `clave`)
 *   POST pedidos/:folio/cancelar        { t, motivo? }
 *   POST pedidos/:folio/pagar           { t } → { url } de la pasarela
 *   POST webhook/:proveedor             aviso de la pasarela (firma obligatoria; Mercado Pago: x-signature)
 *   POST pago-prueba/:folio             { t, ref, resultado } SOLO con PAGOS_PRUEBA_SECRETO:
 *                                       firma el aviso y lo pasa por el mismo camino que uno real.
 */

export const dynamic = 'force-dynamic'

type Contexto = { params: Promise<{ ruta?: string[] }> }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

function mismoOrigen(req: NextRequest): boolean {
  const origen = req.headers.get('origin')
  if (!origen) return true
  try {
    return new URL(origen).host === req.headers.get('host')
  } catch {
    return false
  }
}

async function leerJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const d = await req.json()
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
  } catch {
    throw new ErrorFarmacia(400, 'La petición no trae datos válidos.')
  }
}

function perfilDe(q: URLSearchParams): unknown {
  if (q.get('mascota')) return { mascotaId: q.get('mascota') }
  if (q.get('especie')) return { especie: q.get('especie'), pesoKg: q.get('peso') ? q.get('peso') : null }
  return null
}

const ip = (req: NextRequest) => (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local').split(',')[0].trim()

async function atender(metodo: 'GET' | 'POST', req: NextRequest, ruta: string[]): Promise<Response> {
  const [a, b, c] = ruta
  const payload = await getPayload({ config })
  const q = req.nextUrl.searchParams

  /* El aviso de la pasarela llega de otro origen y su cuerpo se verifica tal cual llegó. */
  if (metodo === 'POST' && a === 'webhook' && b && !c) {
    const cuerpo = await req.text()
    return json(await recibirAviso(payload, b, req.headers, cuerpo, req.nextUrl))
  }
  if (metodo === 'POST' && !mismoOrigen(req)) return json({ error: 'Origen no permitido.' }, 403)
  if (!rateLimit(`tienda:${ip(req)}`, 240, 60 * 1000)) return json({ error: 'Demasiadas consultas seguidas. Espera un momento.' }, 429)

  if (metodo === 'GET') {
    if (a === 'catalogo' && !b) return json(await catalogoTienda(payload, req.headers, { q: q.get('q'), linea: q.get('linea'), perfil: perfilDe(q) }))
    if (a === 'producto' && b && !c) return json(await productoTienda(payload, req.headers, Number(b) || 0, perfilDe(q)))
    if (a === 'sesion' && !b) return json(await sesionTienda(payload, req.headers))
    if (a === 'envio' && !b) return json(await cotizarEnvio(payload, req.headers, q.get('cp') ?? '', Number(q.get('subtotal') ?? 0)))
    if (a === 'mis-pedidos' && !b) {
      const t = await contextoTutor(payload, req.headers)
      if (!t) return json({ error: 'Entra al portal para ver tus pedidos.' }, 401)
      return json(await pedidosDelTutor(payload, t.tutor.id))
    }
    if (a === 'pedidos' && b && !c) return json(await seguimiento(payload, b, q.get('t') ?? ''))
  }

  if (metodo === 'POST') {
    if (a === 'pedidos' && !b) return json(await crearPedido(payload, req.headers, await leerJson(req)), 201)
    if (a === 'sugerir' && !b) return json(await sugerirProductos(payload, req.headers, await leerJson(req)))
    if (a === 'pedidos' && b && c === 'cancelar') {
      const d = await leerJson(req)
      return json(await cancelarPorCliente(payload, b, String(d.t ?? ''), typeof d.motivo === 'string' ? d.motivo : null))
    }
    if (a === 'pedidos' && b && c === 'pagar') return json(await pagarPedido(payload, b, String((await leerJson(req)).t ?? '')))
    if (a === 'pago-prueba' && b && !c) {
      const prov = proveedorPago('prueba')
      if (!prov || !prov.disponible()) return json({ error: 'El pago de prueba no está activo en esta instalación.' }, 404)
      const d = await leerJson(req)
      const ped = await seguimiento(payload, b, String(d.t ?? ''))
      const ref = String(d.ref ?? '')
      if (!ref || ref !== ped.pago.referencia) return json({ error: 'Ese cobro ya no es el vigente. Vuelve a tu pedido y paga otra vez.' }, 409)
      const cuerpo = JSON.stringify({ idEvento: `${ref}:${d.resultado === 'rechazado' ? 'r' : 'a'}`, pedidoId: ped.id, referencia: ref, resultado: d.resultado === 'rechazado' ? 'rechazado' : 'aprobado', monto: ped.total })
      const cab = new Headers({ 'x-firma-prueba': firmarPrueba(cuerpo) })
      return json(await recibirAviso(payload, 'prueba', cab, cuerpo, req.nextUrl))
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function manejar(metodo: 'GET' | 'POST', req: NextRequest, contexto: Contexto): Promise<Response> {
  const { ruta = [] } = await contexto.params
  try {
    return await atender(metodo, req, ruta)
  } catch (e) {
    if (e instanceof ErrorConCodigo) return json({ error: e.message, codigo: e.codigo, detalle: e.detalle ?? null }, e.estado)
    if (e instanceof ErrorFarmacia) return json({ error: e.message }, e.estado)
    const msg = (e as { message?: string })?.message
    const st = (e as { status?: number })?.status
    if (st && st >= 400 && st < 500 && msg) return json({ error: msg }, st)
    console.error('[api/tienda] error inesperado:', e)
    return json({ error: 'Algo falló. No se guardó nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar('GET', req, contexto)
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return manejar('POST', req, contexto)
}
