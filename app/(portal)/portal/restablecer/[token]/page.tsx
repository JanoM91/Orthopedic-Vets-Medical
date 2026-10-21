import React from 'react'
import { FormRestablecer } from '../../../../../components/portal/Formularios'
import { Cabecera } from '../../../../../components/portal/comun'

export default async function Restablecer({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <>
      <Cabecera />
      <main className="pt-main pt-main--centro">
        <h1>Contraseña nueva</h1>
        <div className="pt-card">
          <FormRestablecer token={token} />
        </div>
      </main>
    </>
  )
}
