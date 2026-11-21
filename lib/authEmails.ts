/**
 * Correos de autenticación del panel administrativo.
 *
 * De fábrica, Payload manda un correo en inglés genérico, sin la marca del
 * negocio y con la liga suelta en el texto. Este archivo lo sustituye por uno
 * en español mexicano, con el diseño de los demás correos del sistema y con la
 * vigencia dicha en voz alta.
 *
 * Se separa de lib/notify.ts a propósito: notify.ts son avisos del negocio
 * (leads, citas, seguimientos) y se dispara desde el código del sitio; esto son
 * correos de seguridad y los dispara Payload por su cuenta. Mezclarlos haría
 * que un cambio de plantilla comercial tocara un correo de seguridad.
 *
 * REPLICABILIDAD: no se nombra al negocio en ningún lado; todo sale de
 * lib/site.ts y de la configuración de Payload.
 */
import { APIError, type CollectionBeforeOperationHook, type PayloadRequest } from 'payload'

import { site } from './site'

/** Escapa texto para meterlo en HTML de correo (copiado de lib/notify.ts de MacAuto). */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Vigencia de la liga de recuperación: 24 horas (19-nov-2026). Era una hora y
 * el Dr. Joni abrió su correo después: la liga ya había vencido. Sigue siendo
 * de un solo uso y cada liga nueva anula las anteriores.
 */
export const VIGENCIA_RECUPERACION_MS = 24 * 60 * 60 * 1000
const VIGENCIA_TEXTO = '24 horas'

/**
 * De dónde sale el dominio de la liga.
 *
 * En producción se usa SIEMPRE la URL configurada del sitio, nunca el
 * encabezado `Host` de la petición. Esto no es un detalle: si se armara la liga
 * con el `Host` que manda el navegador, cualquiera podría pedir la
 * recuperación de una cuenta ajena falsificando ese encabezado, y a la persona
 * dueña de la cuenta le llegaría un correo legítimo con una liga hacia el
 * servidor del atacante. Al hacer clic, entregaría su token. Es un hueco
 * conocido ("host header injection") y aquí queda cerrado por construcción.
 *
 * En desarrollo sí se prefiere el origen de la petición, porque si no, probar
 * en localhost mandaría ligas apuntando al sitio de producción.
 */
function dominioBase(req?: PayloadRequest): string {
  if (process.env.NODE_ENV === 'production') return site.url

  const origen = req?.headers?.get?.('origin')?.trim()
  if (origen) return origen.replace(/\/$/, '')

  const host = req?.headers?.get?.('host')?.trim()
  if (host) {
    const protocolo = req?.headers?.get?.('x-forwarded-proto')?.trim() || 'http'
    return `${protocolo}://${host}`
  }

  return site.url
}

/** La dirección completa de la pantalla donde se captura la contraseña nueva. */
export function ligaDeRecuperacion(args: { req?: PayloadRequest; token?: string }): string {
  const config = args.req?.payload?.config
  const rutaPanel = config?.routes?.admin ?? '/admin'
  const rutaReset = config?.admin?.routes?.reset ?? '/reset'
  return `${dominioBase(args.req)}${rutaPanel}${rutaReset}/${args.token ?? ''}`
}

export function asuntoDeRecuperacion(): string {
  return `Restablece tu contraseña del panel de ${site.brand.name}`
}

/**
 * El cuerpo del correo.
 *
 * Decisiones de redacción, todas deliberadas:
 * - El botón y la liga en texto van juntos. Muchos clientes de correo
 *   corporativos bloquean los botones; sin la liga escrita, la persona se
 *   queda atorada.
 * - Se dice la vigencia ("una hora") en lugar de una fecha exacta: la fecha
 *   exigiría explicar zonas horarias y no ayuda a nadie.
 * - Se cierra con el aviso de "si no fuiste tú": es la única señal que tiene el
 *   equipo de que alguien está intentando entrar al panel.
 * - No lleva publicidad ni ligas al inventario. Es un correo de seguridad.
 */
export function htmlDeRecuperacion(args: {
  liga: string
  nombre?: string
  /** «del panel administrativo» (equipo) o «del portal» (tutores). */
  lugar?: string
}): string {
  const e = escapeHtml
  const saludo = args.nombre?.trim() ? `Hola ${e(args.nombre.trim())},` : 'Hola,'

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1A1A2E;max-width:560px">
      <p>${saludo}</p>
      <p>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta
        ${e(args.lugar ?? 'del panel administrativo')} de <b>${e(site.brand.name)}</b>.
      </p>
      <p style="margin:24px 0">
        <a href="${e(args.liga)}" style="background:${site.brand.primary};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Crear una contraseña nueva
        </a>
      </p>
      <p style="color:#6B7280;font-size:14px">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${e(args.liga)}</span>
      </p>
      <p style="color:#6B7280;font-size:14px">
        La liga sirve <b>una sola vez</b> y vence en <b>${VIGENCIA_TEXTO}</b>. Si la pediste
        varias veces, usa solo la del correo <b>más reciente</b>: cada liga nueva anula las anteriores.
      </p>
      <p style="color:#6B7280;font-size:14px">
        <b>¿No fuiste tú?</b> Ignora este correo: tu contraseña sigue igual y
        nadie puede cambiarla sin esta liga. Si te llega varias veces, avísale
        al responsable del sitio.
      </p>
      <p style="margin-top:24px">— ${e(site.brand.name)}</p>
    </div>
  `
}

/** Vigencia de la liga de invitación al portal: siete días (el tutor la abre cuando puede). */
export const VIGENCIA_INVITACION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Invitación al portal del tutor: la clínica le crea la cuenta y el tutor
 * solo elige su contraseña. Mismo diseño que la recuperación; sin publicidad.
 */
export function htmlDeInvitacion(args: { liga: string; nombre?: string; mascotas?: string[] }): string {
  const e = escapeHtml
  const saludo = args.nombre?.trim() ? `Hola ${e(args.nombre.trim())},` : 'Hola,'
  const mascotas = args.mascotas?.length ? ` de ${e(args.mascotas.join(', '))}` : ' de tus mascotas'
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1A1A2E;max-width:560px">
      <p>${saludo}</p>
      <p>
        <b>${e(site.brand.name)}</b> te dio acceso a su portal: ahí ves la cartilla, el peso y los
        documentos${mascotas}, y pides citas en línea.
      </p>
      <p style="margin:24px 0">
        <a href="${e(args.liga)}" style="background:${site.brand.primary};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Crear mi contraseña
        </a>
      </p>
      <p style="color:#6B7280;font-size:14px">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${e(args.liga)}</span>
      </p>
      <p style="color:#6B7280;font-size:14px">
        La liga sirve <b>una sola vez</b> y vence en <b>7 días</b>. Después entras en
        <span style="word-break:break-all">${e(site.url)}/portal</span> con este correo y tu contraseña.
      </p>
      <p style="color:#6B7280;font-size:14px">Si no esperabas este correo, ignóralo o avísale a la clínica.</p>
      <p style="margin-top:24px">— ${e(site.brand.name)}</p>
    </div>
  `
}

/**
 * Antes de restablecer (19-nov-2026): Payload contesta «Token is either invalid
 * or has expired» y, en producción, lo oculta como «An unknown error
 * occurred.». Con eso la persona no sabe qué pasó y vuelve a intentar con la
 * misma liga (en los registros: siete intentos seguidos con una liga ya
 * usada). Aquí se revisa la liga primero y se responde en español qué hacer.
 * No revela si un correo tiene cuenta: solo habla de la liga que ya se tiene.
 */
export const revisarLigaDeRecuperacion: CollectionBeforeOperationHook = async ({ args, operation, req, collection }) => {
  if (operation !== 'resetPassword') return args
  const token = typeof args?.data?.token === 'string' ? args.data.token.trim() : ''
  const password = typeof args?.data?.password === 'string' ? args.data.password : ''
  if (!token) throw new APIError('La liga está incompleta. Ábrela directo desde el correo o pide otra.', 400, undefined, true)
  if (password.length < 8) throw new APIError('La contraseña nueva debe tener al menos 8 caracteres.', 400, undefined, true)
  const doc = (await req.payload.db.findOne({ collection: collection.slug, req, where: { resetPasswordToken: { equals: token } } })) as { resetPasswordExpiration?: string | null } | null
  if (!doc) {
    throw new APIError('Esta liga ya no sirve: se pidió otra más nueva. Abre el correo más reciente o pide otra liga.', 403, undefined, true)
  }
  const vence = doc.resetPasswordExpiration ? new Date(doc.resetPasswordExpiration).getTime() : 0
  if (!vence || vence <= Date.now()) {
    throw new APIError('Esta liga ya se usó o ya venció. Si ya cambiaste tu contraseña, entra con la nueva; si no, pide otra liga.', 403, undefined, true)
  }
  return args
}
