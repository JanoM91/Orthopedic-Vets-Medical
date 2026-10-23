import type { Metadata } from 'next'
import React from 'react'
import { Cabecera, Pie } from '../../../components/sitio/Piezas'
import { contenidoSitio } from '../../../lib/sitio/contenido'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Aviso de privacidad' }

export default async function Aviso() {
  const c = await contenidoSitio()
  return (
    <>
      <Cabecera c={c} />
      <main className="st-main st-prosa">
        <h1>Aviso de privacidad</h1>
        {c.avisoPrivacidad ? c.avisoPrivacidad.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p className="st-tenue">En preparación. Mientras tanto, escríbenos si tienes dudas sobre el uso de tus datos.</p>}
      </main>
      <Pie c={c} />
    </>
  )
}
