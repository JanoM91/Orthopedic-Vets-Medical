import type { Payload } from 'payload'

import type { SitioConfiguracion } from '../../payload-types'
import { site } from '../site'

export type ContactoClinica = { telefono: string | null; whatsapp: string | null; urgencias: string | null }

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Teléfono y WhatsApp de la clínica para el portal, los correos y la cartilla.
 * Manda lo que el equipo captura en «Sitio público → Contacto» (se edita en el
 * panel); si está vacío, cae a `NEXT_PUBLIC_BRAND_PHONE`. Nunca lanza.
 */
export async function contactoClinica(payload: Payload): Promise<ContactoClinica> {
  const g = (await payload.findGlobal({ slug: 'sitio-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as SitioConfiguracion | null
  const respaldo = t(site.brand.phone)
  const wa = t(g?.contacto?.whatsapp)
  const telefono = t(g?.contacto?.telefono) ?? respaldo ?? wa
  const whatsapp = wa ?? telefono
  return { telefono, whatsapp, urgencias: t(g?.contacto?.urgencias) }
}
