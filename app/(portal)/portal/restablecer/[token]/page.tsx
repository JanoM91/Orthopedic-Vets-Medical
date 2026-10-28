import React from 'react'
import { FormRestablecer } from '../../../../../components/portal/Formularios'
import { Cabecera } from '../../../../../components/portal/comun'
import { site } from '../../../../../lib/site'

/** Contraseña nueva: por «Olvidé mi contraseña» o por la invitación que manda la clínica (?bienvenida=1). */
export default async function Restablecer({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bienvenida?: string }> }) {
  const { token } = await params
  const { bienvenida } = await searchParams
  return (
    <>
      <Cabecera />
      <main className="pt-main pt-main--centro">
        <div>
          <h1>{bienvenida ? 'Crea tu contraseña' : 'Contraseña nueva'}</h1>
          {bienvenida && <p className="pt-tenue">Es tu acceso al portal de {site.brand.name}.</p>}
        </div>
        <div className="pt-card">
          <FormRestablecer token={token} />
        </div>
      </main>
    </>
  )
}
