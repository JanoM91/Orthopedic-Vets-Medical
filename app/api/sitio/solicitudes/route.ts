import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { crearSolicitud, ErrorSolicitud } from '../../../../lib/sitio/solicitudes'

/**
 * Solicitud de primera cita desde `/reservar` (nov-2026). Pública: la manda un
 * visitante sin cuenta. Los frenos están en lib/sitio/solicitudes.ts.
 */
export const dynamic = 'force-dynamic'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(req: NextRequest) {
  const origen = req.headers.get('origin')
  if (origen) {
    try {
      if (new URL(origen).host !== req.headers.get('host')) return json({ error: 'Origen no permitido.' }, 403)
    } catch {
      return json({ error: 'Origen no permitido.' }, 403)
    }
  }
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'La petición no trae datos válidos.' }, 400)
  }
  try {
    const payload = await getPayload({ config })
    return json(await crearSolicitud(payload, cuerpo, req.headers), 201)
  } catch (e) {
    if (e instanceof ErrorSolicitud) return json({ error: e.message }, e.status)
    console.error('[solicitudes]', e)
    return json({ error: 'No pudimos guardar tu solicitud. Intenta de nuevo o escríbenos por WhatsApp.' }, 500)
  }
}
