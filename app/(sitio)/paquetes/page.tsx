import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import { Cabecera, Pie } from '../../../components/sitio/Piezas'
import { TarjetaPaquete } from '../../../components/sitio/TarjetaPaquete'
import { BarraApp } from '../../../components/app/BarraApp'
import { contenidoSitio } from '../../../lib/sitio/contenido'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Paquetes' }

/**
 * Paquetes del sitio (nov-2026): los del catálogo marcados «Mostrar en el
 * sitio». «Lo quiero» deja una solicitud (sin cuenta) que recepción confirma;
 * se paga en la clínica. Quien ya es cliente lo pide desde su app.
 */
export default async function PaquetesSitio() {
  const c = await contenidoSitio()
  if (!c.publicado || !c.paquetes.length) notFound()
  return (
    <>
      <Cabecera c={c} activa="paquetes" />
      <main className="st-main">
        <p className="st-eyebrow">Paquetes</p>
        <h1>Paga una vez, úsalo con el tiempo</h1>
        <p className="st-tenue">Elige el paquete, déjanos tus datos y te escribimos para confirmarlo. Se paga en la clínica y cada visita se descuenta de tu saldo.</p>
        <div className="st-paquetes">
          {c.paquetes.map((p) => (
            <TarjetaPaquete key={p.id} p={p} />
          ))}
        </div>
        <p className="st-chico st-tenue">
          ¿Ya eres cliente? <Link href="/portal/paquetes">Pídelo desde tu app</Link> y ve cuánto te queda.
        </p>
      </main>
      <Pie c={c} />
      <BarraApp modo="visitante" activa="inicio" tienda={c.tienda} soloTelefono />
    </>
  )
}
