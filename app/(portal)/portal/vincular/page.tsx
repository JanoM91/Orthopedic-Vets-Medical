import { redirect } from 'next/navigation'
import React from 'react'
import { FormVincular } from '../../../../components/portal/Formularios'
import { Barra, Cabecera } from '../../../../components/portal/comun'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { site } from '../../../../lib/site'

export const dynamic = 'force-dynamic'

export default async function Vincular() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/vincular')
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main pt-main--centro">
        <div>
          <h1>Vincular mi cuenta</h1>
          <p className="pt-tenue">Escribe el código de 6 caracteres que te dio {site.brand.name}. Sirve una sola vez y vence a los 3 días.</p>
        </div>
        <div className="pt-card">
          <FormVincular />
        </div>
        {c.tutor.cliente ? <div className="pt-aviso pt-aviso--info">Tu cuenta ya está vinculada a una ficha. Si vinculas otro código, pasará a esa ficha.</div> : null}
      </main>
      <Barra activa="inicio" />
    </>
  )
}
