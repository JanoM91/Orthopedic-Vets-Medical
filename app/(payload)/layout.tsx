/* Layout del panel administrativo (Payload CMS) */
import type { ServerFunctionClient } from 'payload'
import config from '@payload-config'
import '@payloadcms/next/css'
/* Marca del panel: va DESPUÉS del CSS de Payload para ganarle. Ver docs/58. */
import './custom.css'
/* Finanzas: usa los tokens --mx-* de custom.css, por eso va después. */
import './finanzas.css'
/* Clínica: reutiliza las clases fz-* y agrega las cl-*. */
import './clinica.css'
/* Farmacia (25-oct-2026): reutiliza fz-* y cl-*, agrega las fa-*. */
import './farmacia.css'
/* Tema «Clínico» (opción C, 26-oct-2026): capa final que retematiza todo lo anterior. Quitar el import = tema anterior. */
import './tema-clinico.css'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'
import { site } from '../../lib/site'

/**
 * Marca blanca (octubre de 2026): si la instalación define
 * NEXT_PUBLIC_BRAND_PRIMARY / NEXT_PUBLIC_BRAND_ACCENT, se sobreescriben los
 * tokens --mx-* de custom.css sin tocar el archivo. Sin variables, el panel se
 * ve exactamente como hasta ahora.
 */
function estiloDeMarca(): string | null {
  const partes: string[] = []
  if (process.env.NEXT_PUBLIC_BRAND_PRIMARY) partes.push(`--mx-navy:${site.brand.primary};--mx-navy-dark:${site.brand.primary};--mx-navy-light:${site.brand.primary}`)
  if (process.env.NEXT_PUBLIC_BRAND_ACCENT) partes.push(`--mx-teal:${site.brand.accent};--mx-teal-dark:${site.brand.accent};--mx-teal-text:${site.brand.accent}`)
  return partes.length ? `:root{${partes.join(';')}}` : null
}

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => {
  const marca = estiloDeMarca()
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {marca ? <style dangerouslySetInnerHTML={{ __html: marca }} /> : null}
      {children}
    </RootLayout>
  )
}

export default Layout
