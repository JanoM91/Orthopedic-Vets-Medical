import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { cronDiario } from '@/lib/farmacia/alertas'
import { revisarCron } from '@/lib/cron'
import { expirarPedidos } from '@/lib/farmacia/tienda'
import { cronRecompras } from '@/lib/farmacia/recompra'
import { cronPlanes } from '@/lib/farmacia/planes'

/**
 * Cron diario de la farmacia (fase 4): alertas, promociones por caducidad y
 * un solo correo resumen; también expira apartados vencidos de la tienda y
 * (fase 6a) recalcula las recompras y manda los avisos de «¿ya toca?»; (fase 6b)
 * genera las entregas de los planes que tocan y detiene los que ya no cuadran. Vercel Cron lo llama a las 14:00 UTC = 08:00 de
 * México (vercel.json) con `Authorization: Bearer $CRON_SECRET`.
 * Sin CRON_SECRET responde 503 y no hace nada. Probar a mano:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/farmacia/cron/diario
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const no = revisarCron(req)
  if (no) return no
  const payload = await getPayload({ config })
  try {
    /* Tienda: marca «expirado» lo apartado que venció sin pago (la vigencia ya se evalúa al leer; esto solo deja el estado al día). */
    const pedidosExpirados = await expirarPedidos(payload).catch((e) => {
      payload.logger.error(`[farmacia/cron] no se expiraron pedidos: ${String(e)}`)
      return 0
    })
    const resultado = await cronDiario(payload)
    /* Recompra (6a): recalcula fechas y manda los avisos que tocan. Nunca tumba el cron. */
    const recompra = await cronRecompras(payload)
    /* Planes (6b): entregas que tocan y revisión previa (receta y mascota). Nunca tumba el cron. */
    const planes = await cronPlanes(payload)
    return NextResponse.json({ ...resultado, pedidosExpirados, ...recompra, ...planes }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    payload.logger.error(`[farmacia/cron] falló: ${String((e as Error)?.message ?? e)}`)
    return NextResponse.json({ error: 'El cron falló; revisa los registros.' }, { status: 500 })
  }
}
