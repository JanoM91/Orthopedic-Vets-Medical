import { redirect } from 'next/navigation'
import React from 'react'
import { BotonSalir, FormCuenta } from '../../../../components/portal/Formularios'
import { Barra, Cabecera } from '../../../../components/portal/comun'
import { sesionTutor } from '../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

export default async function Cuenta() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/cuenta')
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <h1>Mi cuenta</h1>
        <div className="pt-card">
          <p className="pt-chico pt-tenue">{c.tutor.email}</p>
          <FormCuenta tutor={{ id: c.tutor.id, nombre: c.tutor.nombre, telefono: c.tutor.telefono ?? null }} />
        </div>
        <div className="pt-card">
          <h2>Sesión</h2>
          <p className="pt-chico pt-tenue">Tu sesión dura 30 días en este dispositivo.</p>
          <div>
            <BotonSalir />
          </div>
        </div>
      </main>
      <Barra activa="cuenta" />
    </>
  )
}
