import type { Metadata, Viewport } from 'next'
import React from 'react'
import { site } from '../../lib/site'
import { Carriles } from '../../components/Carriles'
import { IndicadorNavegacion } from '../../components/Cargando'
import { metadatosInstalables } from '../../lib/appInstalable'
import { getPayload } from 'payload'
import config from '@payload-config'
import { leerModulos } from '../../lib/modulos'
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
  ...metadatosInstalables('portal'),
}
export const viewport: Viewport = { themeColor: site.brand.primary, width: 'device-width', initialScale: 1, viewportFit: 'cover' }

/**
 * ¿Mostrar «Farmacia» en la barra? Nunca debe tumbar la página: en el build de
 * CI no hay base de datos y algunas páginas del portal (entrar, olvidé…) se
 * generan fijas; ahí simplemente queda apagado. Las páginas con barra son
 * dinámicas y lo leen en cada visita.
 */
async function tiendaEncendida(): Promise<boolean> {
  try {
    const m = await leerModulos(await getPayload({ config }))
    return Boolean(m.farmacia && m.tienda)
  } catch {
    return false
  }
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const tienda = await tiendaEncendida()
  const estilo = `:root{--pt-primary:${site.brand.primary};--pt-accent:${site.brand.accent};}`
  return (
    <html lang="es-MX">
      <head>
        <style dangerouslySetInnerHTML={{ __html: estilo }} />
      </head>
      <body className="pt-body" data-tienda={tienda ? '1' : undefined}>
        {children}
        <Carriles />
        <IndicadorNavegacion />
      </body>
    </html>
  )
}
