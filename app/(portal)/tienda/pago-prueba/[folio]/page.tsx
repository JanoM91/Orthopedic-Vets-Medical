import { notFound } from 'next/navigation'
import React from 'react'
import { proveedorPago } from '../../../../../lib/farmacia/pagos'
import { PagoPrueba } from '../../../../../components/tienda/Tienda'

export const metadata = { title: 'Pago de prueba', robots: { index: false } }

/** Pasarela simulada: solo existe con PAGOS_PRUEBA_SECRETO (nunca con clientes reales). */
export default async function PaginaPagoPrueba({ params, searchParams }: { params: Promise<{ folio: string }>; searchParams: Promise<{ t?: string; ref?: string }> }) {
  if (!proveedorPago('prueba')?.disponible()) notFound()
  const [{ folio }, sp] = await Promise.all([params, searchParams])
  return (
    <main className="pt-main ti-main pt-main--centro">
      <PagoPrueba folio={folio} token={sp.t ?? ''} referencia={sp.ref ?? ''} />
    </main>
  )
}
