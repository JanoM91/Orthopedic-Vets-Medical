import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

import { sesionTienda } from '../farmacia/tienda'
import type { SesionTienda } from '../farmacia/tiposTienda'

/** Sesión de la tienda en componentes de servidor (tutor con sus mascotas y recetas, o invitado). */
export async function sesionDeTienda(): Promise<SesionTienda> {
  const payload = await getPayload({ config })
  return sesionTienda(payload, await headers())
}
