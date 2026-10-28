import type { Metadata, Viewport } from 'next'
import React from 'react'
import { site } from '../../lib/site'
import { Carriles } from '../../components/Carriles'
import './portal.css'

/**
 * Portal del tutor (octubre de 2026): /portal/*
 *
 * Pensado para el teléfono (una columna, botones de 44 px) y para instalarse
 * como icono. La marca sale de variables de entorno (lib/site.ts → brand):
 * nombre, color primario, acento y logotipo. Nada de la clínica va en código.
 */
export const metadata: Metadata = {
  title: { default: `Portal · ${site.brand.name}`, template: `%s · ${site.brand.name}` },
  description: `Portal para tutores de ${site.brand.name}: mascotas, cartilla, peso y documentos.`,
  robots: { index: false },
}
export const viewport: Viewport = { themeColor: site.brand.primary, width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const estilo = `:root{--pt-primary:${site.brand.primary};--pt-accent:${site.brand.accent};}`
  return (
    <html lang="es-MX">
      <head>
        <style dangerouslySetInnerHTML={{ __html: estilo }} />
      </head>
      <body className="pt-body">
        {children}
        <Carriles />
      </body>
    </html>
  )
}
