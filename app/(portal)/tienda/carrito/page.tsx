import Link from 'next/link'
import React from 'react'
import { sesionDeTienda } from '../../../../lib/portal/sesionTienda'
import { CabeceraTienda } from '../../../../components/tienda/Cabecera'
import { Carrito } from '../../../../components/tienda/Tienda'
import { Icono } from '../../../../components/portal/comun'

export const metadata = { title: 'Carrito' }

export default async function PaginaCarrito() {
  const sesion = await sesionDeTienda()
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <Link href="/tienda" className="pt-volver pt-chico">
          <Icono n="back" /> Seguir comprando
        </Link>
        <h1>Tu carrito</h1>
        <Carrito sesion={sesion} />
      </main>
    </>
  )
}
