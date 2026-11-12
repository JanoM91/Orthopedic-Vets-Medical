import type { Metadata } from 'next'
import { site } from './site'

/**
 * La plataforma como «app» en el celular (nov-2026). Puro.
 *
 * Dos instalaciones con el isotipo de la marca (public/app/, generado con
 * scripts/marca/generar-iconos-app.py) y el nombre de lib/site.ts → app:
 *
 *   - Portal: la instalan los tutores desde el sitio o el portal; abre /portal.
 *     Bajo el icono: «<nombre corto> - Portal».
 *   - Panel: la instala el equipo desde /admin; abre el tablero «Hoy».
 *     Bajo el icono: «<nombre corto> - Panel».
 *
 * Finanzas conserva su propia instalación (lib/finanzas/appMovil.ts): quien
 * solo captura entradas y gastos sigue teniendo su acceso directo.
 */

export type Instalacion = 'portal' | 'panel'

export const ICONOS_APP = {
  favicon32: '/app/favicon-32.png',
  favicon64: '/app/favicon-64.png',
  apple: '/app/apple-icon.png',
  chico: '/app/icon-192.png',
  grande: '/app/icon-512.png',
  chicoMaskable: '/app/icon-maskable-192.png',
  grandeMaskable: '/app/icon-maskable-512.png',
} as const

export const RUTA_MANIFEST: Record<Instalacion, string> = {
  portal: '/app/portal.webmanifest',
  panel: '/app/panel.webmanifest',
}

export function nombreCorto(i: Instalacion): string {
  return `${site.app.shortName} - ${i === 'portal' ? 'Portal' : 'Panel'}`
}

/** Icono de la pestaña (todas las páginas del sitio, portal y panel). */
export const iconosPestana: NonNullable<Metadata['icons']> = {
  icon: [
    { url: ICONOS_APP.favicon32, type: 'image/png', sizes: '32x32' },
    { url: ICONOS_APP.favicon64, type: 'image/png', sizes: '64x64' },
  ],
  apple: [{ url: ICONOS_APP.apple, type: 'image/png', sizes: '180x180' }],
}

/** Lo que va en el <head> para que «Agregar a pantalla de inicio» use el logo y el nombre. */
export function metadatosInstalables(i: Instalacion): Metadata {
  return {
    applicationName: site.app.name,
    manifest: RUTA_MANIFEST[i],
    icons: iconosPestana,
    appleWebApp: { capable: true, title: nombreCorto(i), statusBarStyle: 'default' },
    other: { 'apple-mobile-web-app-capable': 'yes' },
  }
}

export function manifest(i: Instalacion) {
  const portal = i === 'portal'
  return {
    id: portal ? '/portal' : '/admin',
    name: portal ? site.app.name : `${site.app.name} · Panel`,
    short_name: nombreCorto(i),
    description: portal ? `Tus mascotas, citas y cartilla en ${site.brand.name}.` : `Agenda, pacientes, farmacia y finanzas de ${site.brand.name}.`,
    lang: 'es-MX',
    start_url: portal ? '/portal' : '/admin',
    /* Portal: alcance «/» para que el sitio público también abra dentro de la app. Panel: solo /admin. */
    scope: portal ? '/' : '/admin/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: site.brand.primary,
    categories: portal ? ['medical', 'lifestyle'] : ['business', 'medical', 'productivity'],
    icons: [
      { src: ICONOS_APP.chico, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: ICONOS_APP.grande, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: ICONOS_APP.chicoMaskable, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: ICONOS_APP.grandeMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

/* ───────── títulos de la pestaña en el panel ───────── */

const CLINICA: Record<string, string> = { agenda: 'Agenda', clientes: 'Tutores', mascotas: 'Pacientes', importar: 'Importar pacientes' }
const FARMACIA: Record<string, string> = {
  vender: 'Mostrador',
  productos: 'Productos',
  inventario: 'Inventario',
  compras: 'Compras',
  conteo: 'Conteo físico',
  ventas: 'Ventas',
  recetas: 'Recetas',
  cierre: 'Cierre del día',
  alertas: 'Alertas',
  importar: 'Importar catálogo',
  configuracion: 'Configuración',
}

/**
 * Título de la pestaña para las vistas propias del panel (Payload pone
 * «Payload» en las que no conoce). `null` = dejar el que trae Payload.
 */
export function tituloPanel(segments: string[] | undefined): string | null {
  const s = Array.isArray(segments) ? segments : []
  const de = (seccion: string) => `${seccion} — ${site.brand.name}`
  if (s.length === 0) return de('Hoy')
  if (s[0] === 'clinica') return de(CLINICA[s[1] ?? ''] ?? 'Pacientes')
  if (s[0] === 'farmacia') return de(FARMACIA[s[1] ?? ''] ?? 'Farmacia')
  if (s[0] === 'login') return de('Entrar')
  if (s[0] === 'logout') return de('Salir')
  if (s[0] === 'forgot') return de('Recuperar contraseña')
  if (s[0] === 'account') return de('Mi cuenta')
  return null
}
