import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { recordatorios } from '@/lib/clinica/avisos'
import { recordatoriosEstetica } from '@/lib/clinica/esteticaPortal'
import { revisarCron } from '@/lib/cron'
import { leerModulos } from '@/lib/modulos'

/**
 * Recordatorio de citas de mañana por correo. Vercel Cron lo llama a las
 * 00:00 UTC = 18:00 de México (vercel.json) con `Bearer $CRON_SECRET`. Cada
 * cita recibe un solo recordatorio (`recordatorioEnviadoEn`); reprogramarla
 * lo reinicia. Con la clínica apagada no hace nada. Además (estética, E3) manda
 * los «¿ya le toca su baño?» que tocan; con la estética apagada, no.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const no = revisarCron(req)
  if (no) return no
  const payload = await getPayload({ config })
  if (!(await leerModulos(payload)).clinica) return NextResponse.json({ omitido: 'El módulo de Clínica está apagado.' })
  try {
    const citas = await recordatorios(payload)
    const estetica = await recordatoriosEstetica(payload)
    return NextResponse.json({ ...citas, estetica }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    payload.logger.error(`[clinica/cron] recordatorios fallaron: ${String((e as Error)?.message ?? e)}`)
    return NextResponse.json({ error: 'El cron falló; revisa los registros.' }, { status: 500 })
  }
}
