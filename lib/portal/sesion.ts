import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

import { contextoTutor, type CtxTutor } from '../clinica/servicio'

/**
 * Sesión del portal del tutor en componentes de servidor. Lee la cookie de
 * Payload (la misma que usa el panel) y solo acepta cuentas de la colección
 * «tutores»: una sesión del equipo aquí cuenta como «sin sesión».
 */
export async function sesionTutor(): Promise<CtxTutor | null> {
  const payload = await getPayload({ config })
  return contextoTutor(payload, await headers())
}
