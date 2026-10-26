import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  actualizarAlmacen,
  actualizarConfiguracion,
  actualizarPresentacion,
  actualizarProducto,
  actualizarProveedor,
  ajustar,
  arranque,
  bloquearLote,
  buscarProductos,
  catalogo,
  contextoDesdeHeaders,
  crearAlmacen,
  crearPresentacion,
  crearProducto,
  crearProveedor,
  type Ctx,
  ErrorFarmacia,
  inventario,
  kardex,
  producto,
} from '@/lib/farmacia/servicio'
import { importarProductos, plantillaProductosXlsx } from '@/lib/farmacia/importacion'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * /api/farmacia/* — catálogo, inventario por lote y kardex (fase 1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Igual que /api/clinica: solo revisa la sesión del equipo y delega en
 * lib/farmacia/servicio.ts. Con el módulo apagado, todo responde 404.
 *
 *   GET  catalogo                               permisos, módulos, almacenes, proveedores, configuración, totales
 *   GET  productos?q=&linea=&grupo=&inactivos=&bajoMinimo=
 *   POST productos                              crear
 *   GET  productos/:id                          ficha con presentaciones y lotes
 *   POST productos/:id                          actualizar
 *   POST productos/:id/presentaciones           crear presentación
 *   POST presentaciones/:id                     actualizar presentación
 *   GET  productos/plantilla?ejemplo=3|50       plantilla .xlsx
 *   POST productos/importar  (multipart: archivo, aplicar=true|false)
 *   GET  inventario?q=&solo=con_existencia|todos|por_vencer|vencidos|bajo_minimo
 *   GET  kardex?producto=&lote=&limite=
 *   POST ajustes                                ajuste o merma (lote existente o nuevo), motivo obligatorio
 *   POST lotes/:id/bloqueo                      { bloqueado }
 *   POST proveedores | proveedores/:id
 *   POST almacenes   | almacenes/:id
 *   POST configuracion
 *   POST arranque                               { que: 'almacen' | 'roles' }
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Contexto = { params: Promise<{ ruta?: string[] }> }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

function mismoOrigen(req: NextRequest): boolean {
  const origen = req.headers.get('origin')
  if (!origen) return true
  try {
    return new URL(origen).host === req.headers.get('host')
  } catch {
    return false
  }
}

function idDeRuta(s: string | undefined): number {
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorFarmacia(404, 'Registro no encontrado.')
  return n
}

async function leerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErrorFarmacia(400, 'La petición no trae datos válidos.')
  }
}

async function leerArchivo(req: NextRequest): Promise<{ archivo: File; campos: Record<string, unknown> }> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ErrorFarmacia(400, 'No llegó el archivo.')
  }
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) throw new ErrorFarmacia(400, 'Elige un archivo.')
  const campos: Record<string, unknown> = {}
  for (const [k, v] of form.entries()) {
    if (k === 'archivo' || typeof v !== 'string') continue
    campos[k] = v === 'true' ? true : v === 'false' ? false : v
  }
  return { archivo, campos }
}

async function atender(metodo: 'GET' | 'POST', req: NextRequest, ruta: string[]): Promise<Response> {
  if (metodo === 'POST' && !mismoOrigen(req)) return json({ error: 'Origen no permitido.' }, 403)
  const payload = await getPayload({ config })
  const ctx: Ctx | null = await contextoDesdeHeaders(payload, req.headers)
  if (!ctx) return json({ error: 'Tu sesión terminó. Vuelve a entrar al panel.' }, 401)
  const q = req.nextUrl.searchParams
  const [a, b, c] = ruta

  if (metodo === 'GET') {
    if (a === 'catalogo' && !b) return json(await catalogo(ctx))
    if (a === 'productos' && !b) {
      return json(await buscarProductos(ctx, q.get('q') ?? '', { linea: q.get('linea'), grupo: q.get('grupo'), inactivos: q.get('inactivos') === 'true', bajoMinimo: q.get('bajoMinimo') === 'true' }))
    }
    if (a === 'productos' && b === 'plantilla') {
      if (!ctx.modulos.farmacia) return json({ error: 'El módulo de Farmacia está apagado.' }, 404)
      if (!ctx.p.farmacia.catalogo) return json({ error: 'Tu rol no incluye el catálogo.' }, 403)
      const ejemplo = Number(q.get('ejemplo') ?? 3)
      return new Response(new Uint8Array(await plantillaProductosXlsx(Number.isFinite(ejemplo) ? ejemplo : 3)), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="plantilla-productos.xlsx"',
          'Cache-Control': 'private, no-store',
        },
      })
    }
    if (a === 'productos' && b && !c) return json(await producto(ctx, idDeRuta(b)))
    if (a === 'inventario' && !b) return json(await inventario(ctx, { q: q.get('q') ?? '', solo: (q.get('solo') as 'todos' | null) ?? undefined }))
    if (a === 'kardex' && !b) {
      return json(await kardex(ctx, { productoId: q.get('producto') ? idDeRuta(q.get('producto')!) : undefined, loteId: q.get('lote') ? idDeRuta(q.get('lote')!) : undefined, limite: q.get('limite') ? Number(q.get('limite')) : undefined }))
    }
  } else {
    if (a === 'arranque' && !b) return json(await arranque(ctx, await leerJson(req)))
    if (a === 'configuracion' && !b) return json(await actualizarConfiguracion(ctx, await leerJson(req)))
    if (a === 'productos' && b === 'importar') {
      const { archivo, campos } = await leerArchivo(req)
      return json(await importarProductos(ctx, archivo, campos.aplicar === true))
    }
    if (a === 'productos' && !b) return json(await crearProducto(ctx, await leerJson(req)), 201)
    if (a === 'productos' && b && !c) return json(await actualizarProducto(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'productos' && b && c === 'presentaciones') return json(await crearPresentacion(ctx, idDeRuta(b), await leerJson(req)), 201)
    if (a === 'presentaciones' && b && !c) return json(await actualizarPresentacion(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'ajustes' && !b) return json(await ajustar(ctx, await leerJson(req)), 201)
    if (a === 'lotes' && b && c === 'bloqueo') return json(await bloquearLote(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'proveedores' && !b) return json(await crearProveedor(ctx, await leerJson(req)), 201)
    if (a === 'proveedores' && b && !c) return json(await actualizarProveedor(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'almacenes' && !b) return json(await crearAlmacen(ctx, await leerJson(req)), 201)
    if (a === 'almacenes' && b && !c) return json(await actualizarAlmacen(ctx, idDeRuta(b), await leerJson(req)))
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function manejar(metodo: 'GET' | 'POST', req: NextRequest, contexto: Contexto): Promise<Response> {
  const { ruta = [] } = await contexto.params
  try {
    return await atender(metodo, req, ruta)
  } catch (e) {
    if (e instanceof ErrorFarmacia) return json({ error: e.message }, e.estado)
    const msg = (e as { message?: string })?.message
    const st = (e as { status?: number })?.status
    if (st && st >= 400 && st < 500 && msg) return json({ error: msg }, st)
    console.error('[api/farmacia] error inesperado:', e)
    return json({ error: 'Algo falló al guardar. No se registró nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar('GET', req, contexto)
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return manejar('POST', req, contexto)
}
