/**
 * Identidad de la instalación en un solo lugar (heredado de MacAuto, recortado
 * a lo que usa Finanzas).
 *
 * Nada de esto se escribe en el código: todo se lee de variables de entorno.
 * Los respaldos son placeholders evidentes ("Nombre del Negocio", "Ciudad"),
 * a propósito: si alguna variable falta, se nota de inmediato en pantalla en
 * vez de publicar un dato equivocado sin que nadie lo advierta.
 *
 * Sobre las NEXT_PUBLIC_*: Next.js las sustituye por su valor al compilar, y
 * solo cuando el acceso está escrito literal (`process.env.NEXT_PUBLIC_ALGO`).
 * Por eso todas se leen aquí arriba, una por una. Nunca las leas con nombre
 * dinámico (`process.env[nombre]`) ni desestructures `process.env`: en el
 * bundle de cliente llegarían como undefined aunque estén configuradas.
 */

const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME,
  /* Marca blanca (octubre de 2026): colores y logotipo del portal del tutor. Opcionales. */
  brandPrimary: process.env.NEXT_PUBLIC_BRAND_PRIMARY,
  brandAccent: process.env.NEXT_PUBLIC_BRAND_ACCENT,
  brandLogo: process.env.NEXT_PUBLIC_BRAND_LOGO,
  brandPhone: process.env.NEXT_PUBLIC_BRAND_PHONE,
  locationCity: process.env.NEXT_PUBLIC_LOCATION_CITY,
  locationTimeZone: process.env.NEXT_PUBLIC_LOCATION_TIMEZONE,
}

const missingEnvVars: string[] = []

function fromEnv(name: string, value: string | undefined, placeholder: string): string {
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  missingEnvVars.push(name)
  return placeholder
}

/**
 * URL pública de la app. En desarrollo cae a http://localhost:3000; en
 * producción es obligatoria (la usan las ligas del correo de recuperación de
 * contraseña). Se resuelve al usarse, no al importar el módulo.
 */
let cachedUrl: string | undefined

const esColor = (v: string | undefined): boolean => Boolean(v && /^#[0-9a-fA-F]{6}$/.test(v.trim()))

function resolveSiteUrl(): string {
  if (cachedUrl) return cachedUrl
  const configured = env.siteUrl?.trim()
  if (configured) {
    cachedUrl = configured.replace(/\/$/, '')
    return cachedUrl
  }
  if (typeof window !== 'undefined') {
    cachedUrl = window.location.origin
    return cachedUrl
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL no está configurada. Defínela en Vercel para el Environment que se está compilando (Production/Preview).',
    )
  }
  cachedUrl = 'http://localhost:3000'
  return cachedUrl
}

export const site = {
  get url(): string {
    return resolveSiteUrl()
  },
  brand: {
    /** Nombre comercial, tal como se muestra en el panel y en la app. */
    name: fromEnv('NEXT_PUBLIC_SITE_NAME', env.siteName, 'Nombre del Negocio'),
    /**
     * Marca blanca: el color primario (oscuro) y el acento del portal del
     * tutor salen de aquí; si faltan, se usan los de la instalación actual.
     * El panel toma los suyos de app/(payload)/custom.css (--mx-*).
     */
    primary: esColor(env.brandPrimary) ? env.brandPrimary!.trim() : '#123a34',
    accent: esColor(env.brandAccent) ? env.brandAccent!.trim() : '#2bae8e',
    /** Logotipo para fondos oscuros (ruta en public/ o URL). */
    logo: env.brandLogo?.trim() || '/logo-mark-white.png',
    /** Teléfono de la clínica que se muestra en el portal (texto libre). */
    phone: env.brandPhone?.trim() || '',
  },
  location: {
    city: fromEnv('NEXT_PUBLIC_LOCATION_CITY', env.locationCity, 'Ciudad'),
    /**
     * Zona horaria del negocio (IANA). El servidor de Vercel corre en UTC: las
     * fechas reales de Finanzas («hoy», «ayer») se calculan siempre en esta
     * zona, nunca en la del servidor.
     */
    timeZone: env.locationTimeZone?.trim() || 'America/Mexico_City',
  },
}

if (missingEnvVars.length > 0) {
  console.warn(`[site] Variables de identidad sin configurar (se usan placeholders): ${missingEnvVars.join(', ')}`)
}
