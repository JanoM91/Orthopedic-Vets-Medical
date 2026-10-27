import crypto from 'crypto'
import { NextResponse } from 'next/server'

/**
 * Autorización de los crons de Vercel: `Authorization: Bearer $CRON_SECRET`
 * (Vercel lo manda solo si la variable existe). Sin CRON_SECRET, 503: ningún
 * cron corre y nadie de fuera puede dispararlos. Comparación en tiempo
 * constante.
 */
export function revisarCron(req: Request): NextResponse | null {
  const secreto = process.env.CRON_SECRET?.trim()
  if (!secreto) return NextResponse.json({ error: 'Falta CRON_SECRET en las variables de entorno: el cron está apagado.' }, { status: 503 })
  const a = Buffer.from(req.headers.get('authorization') ?? '')
  const b = Buffer.from(`Bearer ${secreto}`)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  return null
}
