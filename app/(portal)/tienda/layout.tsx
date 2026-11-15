import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import React from 'react'
import { leerModulos } from '../../../lib/modulos'
import { site } from '../../../lib/site'
import './tienda.css'

/**
 * Tienda en línea (Farmacia, fase 5a): /tienda/*. Vive dentro del grupo del
 * portal para compartir su HTML, estilos y la app instalable. Con Farmacia o
 * Tienda apagadas, toda la sección responde 404.
 */
export const metadata: Metadata = {
  title: { default: `Tienda · ${site.brand.name}`, template: `%s · Tienda ${site.brand.name}` },
  description: `Farmacia veterinaria de ${site.brand.name}: pide en línea y recoge en la clínica.`,
  robots: { index: true },
}

export const dynamic = 'force-dynamic'

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  const m = await leerModulos(await getPayload({ config }))
  if (!m.farmacia || !m.tienda) notFound()
  return <>{children}</>
}
