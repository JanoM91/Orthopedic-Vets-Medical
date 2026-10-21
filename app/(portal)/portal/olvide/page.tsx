import React from 'react'
import { FormOlvide } from '../../../../components/portal/Formularios'
import { Cabecera } from '../../../../components/portal/comun'

export default function Olvide() {
  return (
    <>
      <Cabecera />
      <main className="pt-main pt-main--centro">
        <h1>Recuperar contraseña</h1>
        <div className="pt-card">
          <FormOlvide />
        </div>
      </main>
    </>
  )
}
