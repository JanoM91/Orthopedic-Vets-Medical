import { getPayload } from 'payload'
import config from '@payload-config'
import { contactoClinica, type ContactoClinica } from '../sitio/contacto'

/** Contacto de la clínica para páginas del portal sin sesión (entrar, registro). Nunca lanza. */
export async function contactoDelPortal(): Promise<ContactoClinica> {
  try {
    return await contactoClinica(await getPayload({ config }))
  } catch {
    return { telefono: null, whatsapp: null, urgencias: null }
  }
}
