import type { Metadata, Viewport } from 'next'
import config from '@payload-config'
import { generatePageMetadata, RootPage } from '@payloadcms/next/views'
import { importMap } from '../importMap.js'
import { esRutaDeFinanzas, metadatosFinanzas, viewportFinanzas } from '@/lib/finanzas/appMovil'
import { metadatosInstalables, tituloPanel } from '@/lib/appInstalable'
import { site } from '@/lib/site'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

/**
 * Metadatos del panel: los de Payload y, solo en las páginas de
 * Finanzas, lo que hace falta para instalarla como app en el celular
 * (manifest, icono de iPhone, nombre corto). Ver lib/finanzas/appMovil.ts.
 */
export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  const base = await generatePageMetadata({ config, params, searchParams })
  const [{ segments }, query] = await Promise.all([params, searchParams])
  if (esRutaDeFinanzas(segments, query)) return { ...base, ...metadatosFinanzas() }
  /* El resto del panel: título propio (nunca «Payload») e instalación «<nombre corto> - Panel» con el logo. */
  const titulo = tituloPanel(segments) ?? (typeof base.title === 'string' && !/^payload/i.test(base.title) ? base.title : site.brand.name)
  return { ...base, ...metadatosInstalables('panel'), title: titulo, openGraph: { ...(base.openGraph ?? {}), title: titulo } }
}

/** Color de la barra de estado y bordes del teléfono, solo en Finanzas. */
export const generateViewport = async ({ params, searchParams }: Args): Promise<Viewport> => {
  const [{ segments }, query] = await Promise.all([params, searchParams])
  return esRutaDeFinanzas(segments, query) ? viewportFinanzas : { themeColor: site.brand.primary }
}

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap })

export default Page
