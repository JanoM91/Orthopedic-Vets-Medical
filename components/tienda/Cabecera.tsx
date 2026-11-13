import Link from 'next/link'
import React from 'react'
import { site } from '../../lib/site'
import type { SesionTienda } from '../../lib/farmacia/tiposTienda'
import { iniciales } from '../portal/comun'
import { BotonCarrito } from './Tienda'

/** Cabecera de la tienda: marca (lleva a /tienda), cuenta o «Entrar» y el carrito con su cuenta. */
export function CabeceraTienda({ sesion }: { sesion: SesionTienda | null }) {
  return (
    <header className="pt-cabecera ti-cabecera">
      <Link href="/tienda" className="pt-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={site.brand.logo} alt="" />
        <span>Tienda</span>
      </Link>
      <span className="pt-cabecera__der">
        {sesion?.tutor ? (
          <Link href="/portal/farmacia" aria-label="Mis pedidos en el portal">
            {iniciales(sesion.tutor.nombre)}
          </Link>
        ) : (
          <Link href="/portal/entrar?siguiente=/tienda">Entrar</Link>
        )}
        <BotonCarrito />
      </span>
    </header>
  )
}
