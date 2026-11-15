import React from 'react'
import { sesionDeTienda } from '../../../../../lib/portal/sesionTienda'
import { BarraTienda, CabeceraTienda } from '../../../../../components/tienda/Cabecera'
import { Seguimiento } from '../../../../../components/tienda/Tienda'

export const metadata = { title: 'Mi pedido', robots: { index: false } }

/** Seguimiento del pedido: sirve al tutor y al invitado con la liga (folio + token) de su correo. */
export default async function Pedido({ params, searchParams }: { params: Promise<{ folio: string }>; searchParams: Promise<{ t?: string; pago?: string; nuevo?: string }> }) {
  const [sesion, { folio }, sp] = await Promise.all([sesionDeTienda(), params, searchParams])
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <Seguimiento folio={folio} token={sp.t ?? ''} recienPagado={sp.pago === '1'} nuevo={sp.nuevo === '1'} />
      </main>
      <BarraTienda sesion={sesion} />
    </>
  )
}
