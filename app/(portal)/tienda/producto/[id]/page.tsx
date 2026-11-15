import Link from 'next/link'
import React from 'react'
import { sesionDeTienda } from '../../../../../lib/portal/sesionTienda'
import { BarraTienda, CabeceraTienda } from '../../../../../components/tienda/Cabecera'
import { FichaProducto } from '../../../../../components/tienda/Tienda'
import { Icono } from '../../../../../components/portal/comun'

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const [sesion, { id }] = await Promise.all([sesionDeTienda(), params])
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <Link href="/tienda" className="pt-volver pt-chico">
          <Icono n="back" /> Tienda
        </Link>
        <FichaProducto id={Number(id) || 0} sesion={sesion} />
      </main>
      <BarraTienda sesion={sesion} />
    </>
  )
}
