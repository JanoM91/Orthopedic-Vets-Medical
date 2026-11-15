import Link from 'next/link'
import React from 'react'
import { site } from '../../lib/site'
import type { SesionTienda } from '../../lib/farmacia/tiposTienda'
import { Icono } from '../portal/comun'
import { BarraApp } from '../app/BarraApp'
import { BotonCarrito } from './Tienda'

/** Cabecera de la tienda: marca (lleva a /tienda), «Mis pedidos» del tutor o «Entrar» y el carrito con su cuenta. La navegación va en la barra de la app. */
export function CabeceraTienda({ sesion }: { sesion: SesionTienda | null }) {
  return (
    <header className="pt-cabecera ti-cabecera">
      <Link href="/tienda" className="pt-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={site.brand.logoClaro} alt="" />
        <span>Tienda</span>
      </Link>
      <span className="pt-cabecera__der">
        {sesion?.tutor ? (
          <Link href="/portal/farmacia" aria-label="Mis pedidos y recetas">
            <Icono n="receta" />
            <span className="ti-cabecera__txt">Mis pedidos</span>
          </Link>
        ) : (
          <Link href="/portal/entrar?siguiente=/tienda">Entrar</Link>
        )}
        <BotonCarrito />
      </span>
    </header>
  )
}

/** Barra de la app en la tienda: modo tutor si hay sesión, si no la del visitante. */
export function BarraTienda({ sesion }: { sesion: SesionTienda | null }) {
  return <BarraApp modo={sesion?.tutor ? 'tutor' : 'visitante'} activa="tienda" />
}
