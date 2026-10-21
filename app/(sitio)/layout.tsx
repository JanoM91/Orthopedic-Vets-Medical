import type { Metadata, Viewport } from 'next'
import React from 'react'
import { site } from '../../lib/site'
import './sitio.css'

/**
 * Sitio público (octubre de 2026): la raíz del dominio. Contenido desde el
 * global «Sitio público» del panel; servicios y horario desde la agenda. La
 * marca (nombre, colores, logotipo) sale de lib/site.ts.
 */
export const metadata: Metadata = {
  title: { default: `${site.brand.name} · Veterinaria en ${site.location.city}`, template: `%s · ${site.brand.name}` },
  description: `${site.brand.name}: consulta, cirugía, vacunación, estética y más en ${site.location.city}. Pide tu cita en línea.`,
  metadataBase: new URL(site.url),
  openGraph: { title: site.brand.name, description: `Veterinaria en ${site.location.city}. Pide tu cita en línea.`, type: 'website', locale: 'es_MX', images: ['/logo-mark.png'] },
  icons: { icon: '/finanzas/favicon-64.png', apple: '/finanzas/apple-icon.png' },
}
export const viewport: Viewport = { themeColor: site.brand.primary, width: 'device-width', initialScale: 1 }

export default function SitioLayout({ children }: { children: React.ReactNode }) {
  const estilo = `:root{--st-primary:${site.brand.primary};--st-accent:${site.brand.accent};}`
  return (
    <html lang="es-MX">
      <head>
        <style dangerouslySetInnerHTML={{ __html: estilo }} />
      </head>
      <body className="st-body">{children}</body>
    </html>
  )
}
