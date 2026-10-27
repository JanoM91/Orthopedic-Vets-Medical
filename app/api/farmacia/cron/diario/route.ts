import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { cronDiario } from '@/lib/farmacia/alertas'

/**
 * Cron diario de la farmacia (fase 4): alertas, promociones por caducidad y
 * un solo correo resumen. Vercel Cron lo llama a las 14:00 UTC = 08:00 de
 * México (vercel.json) con `Authorization: Bearer $CRON_SECRET`.
 *
 * Sin CRON_SECRET configurado responde 503 y no hace nada: así nadie de fuera
 * puede dispararlo. Para probarlo a mano:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/farmacia/cron/diario
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req: NextRequest, secreto: string): boolean {
  const recibido = req.headers.get('authorization') ?? ''
  const esperado = `Bearer ${secreto}`
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto) return NextResponse.json({ error: 'Falta CRON_SECRET en las variables de entorno: el cron está apagado.' }, { status: 503 })
  if (!autorizado(req, secreto)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const payload = await getPayload({ config })
  try {
    return NextResponse.json(await cronDiario(payload), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    payload.logger.error(`[farmacia/cron] falló: ${String((e as Error)?.message ?? e)}`)
    return NextResponse.json({ error: 'El cron falló; revisa los registros.' }, { status: 500 })
  }
}
