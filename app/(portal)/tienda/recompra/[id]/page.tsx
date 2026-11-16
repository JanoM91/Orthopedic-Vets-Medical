import React from 'react'
import { sesionDeTienda } from '../../../../../lib/portal/sesionTienda'
import { BarraTienda, CabeceraTienda } from '../../../../../components/tienda/Cabecera'
import { VolverAPedir } from '../../../../../components/tienda/Recompra'

export const metadata = { title: 'Volver a pedir', robots: { index: false } }

/** «Volver a pedir» desde el aviso de recompra (fase 6a): la liga lleva id y token, no hace falta sesión. */
export default async function PaginaRecompra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; baja?: string }> }) {
  const [sesion, { id }, sp] = await Promise.all([sesionDeTienda(), params, searchParams])
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <VolverAPedir id={Number(id) || 0} token={sp.t ?? ''} baja={sp.baja === '1'} sesion={sesion} />
      </main>
      <BarraTienda sesion={sesion} />
    </>
  )
}
