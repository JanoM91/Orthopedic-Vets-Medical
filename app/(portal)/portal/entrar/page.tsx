import { redirect } from 'next/navigation'
import React from 'react'
import { FormEntrar } from '../../../../components/portal/Formularios'
import { Cabecera } from '../../../../components/portal/comun'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { site } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

export default async function Entrar({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  if (await sesionTutor()) redirect('/portal')
  const { siguiente } = await searchParams
  return (
    <>
      <Cabecera />
      <main className="pt-main pt-main--centro">
        <div>
          <h1>Portal de tutores</h1>
          <p className="pt-tenue">Cartilla, peso y documentos de tus mascotas en {site.brand.name}.</p>
        </div>
        <div className="pt-card">
          <FormEntrar siguiente={siguiente?.startsWith('/portal') ? siguiente : undefined} />
        </div>
      </main>
    </>
  )
}
