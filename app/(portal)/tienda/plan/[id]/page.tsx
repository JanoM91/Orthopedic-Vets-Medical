import React from 'react'
import { sesionDeTienda } from '../../../../../lib/portal/sesionTienda'
import { BarraTienda, CabeceraTienda } from '../../../../../components/tienda/Cabecera'
import { PaginaPlan } from '../../../../../components/tienda/Planes'

export const metadata = { title: 'Mi plan', robots: { index: false } }

/** Plan de compra (fase 6b): la liga lleva id y token; aquí se paga o autoriza, se ve el avance y se cancela. */
export default async function Plan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; ref?: string; pago?: string }> }) {
  const [sesion, { id }, sp] = await Promise.all([sesionDeTienda(), params, searchParams])
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <PaginaPlan id={Number(id) || 0} token={sp.t ?? ''} referencia={sp.ref ?? null} volvioDelPago={sp.pago === '1'} />
      </main>
      <BarraTienda sesion={sesion} />
    </>
  )
}
