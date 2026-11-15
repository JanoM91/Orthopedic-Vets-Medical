import React from 'react'
import { sesionDeTienda } from '../../../lib/portal/sesionTienda'
import { LINEAS_TIENDA, type Linea } from '../../../lib/farmacia/tiposTienda'
import { BarraTienda, CabeceraTienda } from '../../../components/tienda/Cabecera'
import { Catalogo } from '../../../components/tienda/Tienda'

/** Inicio de la tienda: ¿para quién compras?, buscador, secciones por necesidad y productos. */
export default async function Tienda({ searchParams }: { searchParams: Promise<{ q?: string; linea?: string; para?: string }> }) {
  const [sesion, sp] = await Promise.all([sesionDeTienda(), searchParams])
  const linea = LINEAS_TIENDA.some((l) => l.clave === sp.linea) ? (sp.linea as Linea) : null
  return (
    <>
      <CabeceraTienda sesion={sesion} />
      <main className="pt-main ti-main">
        <div>
          <h1>Farmacia en línea</h1>
          <p className="pt-tenue pt-chico">{sesion.domicilio.activo ? 'Recoge en la clínica o recíbelo en casa.' : 'Pide aquí y recoge en la clínica.'}</p>
        </div>
        <Catalogo sesion={sesion} lineaInicial={linea} qInicial={(sp.q ?? '').slice(0, 80)} para={Number(sp.para) || null} />
      </main>
      <BarraTienda sesion={sesion} />
    </>
  )
}
