import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { firmarPorLiga, htmlPresupuesto, ipDe, presupuestoPorLiga, rechazarPorLiga } from '../../../../../lib/clinica/cirugia'
import { contextoTutor, ErrorClinica } from '../../../../../lib/clinica/servicio'
import { diaLocal } from '../../../../../lib/localTime'
import { leerModulos } from '../../../../../lib/modulos'
import { rateLimit } from '../../../../../lib/rateLimit'
import { contactoClinica } from '../../../../../lib/sitio/contacto'

/**
 * Liga del presupuesto de cirugía para el tutor (nov-2026), sin cuenta:
 *   GET  /api/presupuesto/:id/:token              detalle y texto del consentimiento
 *   GET  /api/presupuesto/:id/:token?imprimir=1   presupuesto y consentimiento imprimibles
 *   POST /api/presupuesto/:id/:token              { accion: 'firmar', nombre, firma, acepto } | { accion: 'rechazar', motivo? }
 * La liga sale al enviar el presupuesto (correo, WhatsApp y «Pendientes» de su app).
 */
export const dynamic = 'force-dynamic'

type Contexto = { params: Promise<{ id: string; token: string }> }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function manejar(req: NextRequest, contexto: Contexto, fn: (id: number, token: string) => Promise<Response>): Promise<Response> {
  const { id, token } = await contexto.params
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return json({ error: 'Esta liga no es válida.' }, 404)
  try {
    const payload = await getPayload({ config })
    if (!(await leerModulos(payload)).clinica) return json({ error: 'No disponible.' }, 404)
    return await fn(n, token)
  } catch (e) {
    if (e instanceof ErrorClinica) return json({ error: e.message }, e.estado)
    console.error('[presupuesto]', e)
    return json({ error: 'Algo falló. No se guardó nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar(req, contexto, async (id, token) => {
    const payload = await getPayload({ config })
    const v = await presupuestoPorLiga(payload, id, token, diaLocal(new Date()))
    if (req.nextUrl.searchParams.get('imprimir')) {
      return new Response(htmlPresupuesto(v, v.firma, (await contactoClinica(payload)).telefono), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } })
    }
    const { firma: _f, ...resto } = v
    void _f
    return json(resto)
  })
}

export async function POST(req: NextRequest, contexto: Contexto) {
  const origen = req.headers.get('origin')
  if (origen) {
    try {
      if (new URL(origen).host !== req.headers.get('host')) return json({ error: 'Origen no permitido.' }, 403)
    } catch {
      return json({ error: 'Origen no permitido.' }, 403)
    }
  }
  if (!rateLimit(`presupuesto:${ipDe(req.headers) ?? 'local'}`, 20, 60 * 60 * 1000)) return json({ error: 'Demasiados intentos seguidos. Espera un rato o llama a la clínica.' }, 429)
  return manejar(req, contexto, async (id, token) => {
    const payload = await getPayload({ config })
    let cuerpo: Record<string, unknown>
    try {
      cuerpo = (await req.json()) as Record<string, unknown>
    } catch {
      return json({ error: 'La petición no trae datos válidos.' }, 400)
    }
    const hoy = diaLocal(new Date())
    if (cuerpo?.accion === 'rechazar') return json(await rechazarPorLiga(payload, id, token, cuerpo, hoy))
    if (cuerpo?.accion === 'firmar') {
      const tutor = await contextoTutor(payload, req.headers).catch(() => null)
      return json(await firmarPorLiga(payload, id, token, cuerpo, req.headers, hoy, tutor?.tutor.id ?? null))
    }
    return json({ error: 'Acción no válida.' }, 400)
  })
}
