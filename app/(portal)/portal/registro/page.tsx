import { redirect } from 'next/navigation'
import React from 'react'
import { FormRegistro } from '../../../../components/portal/Formularios'
import { Cabecera } from '../../../../components/portal/comun'
import { sesionTutor } from '../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

export default async function Registro() {
  if (await sesionTutor()) redirect('/portal')
  return (
    <>
      <Cabecera />
      <main className="pt-main pt-main--centro">
        <div>
          <h1>Crear cuenta</h1>
          <p className="pt-tenue">Después de crearla, pide en la clínica tu código de vinculación para ver a tus mascotas.</p>
        </div>
        <div className="pt-card">
          <FormRegistro />
        </div>
      </main>
    </>
  )
}
