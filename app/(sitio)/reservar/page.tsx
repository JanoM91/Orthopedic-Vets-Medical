import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import { Cabecera, Pie } from '../../../components/sitio/Piezas'
import { FormularioReserva } from '../../../components/sitio/FormularioReserva'
import { BarraApp } from '../../../components/app/BarraApp'
import { contenidoSitio } from '../../../lib/sitio/contenido'
import { diaLocal } from '../../../lib/localTime'
import { enlaceWhatsApp, mensajes } from '../../../lib/whatsapp'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Reserva tu primera cita' }

/**
 * Reserva de primera vez (nov-2026): un visitante sin cuenta deja sus datos y
 * su preferencia; recepción le escribe por WhatsApp para acordar día y hora.
 * `?servicio=<id>` llega con el servicio ya elegido.
 */
export default async function Reservar({ searchParams }: { searchParams: Promise<{ servicio?: string }> }) {
  const c = await contenidoSitio()
  if (!c.publicado) notFound()
  const pedido = Number((await searchParams).servicio)
  const servicios = c.grupos.flatMap((g) => g.servicios.map((s) => ({ id: s.id, nombre: s.nombre, area: g.area })))
  const wa = enlaceWhatsApp(c.contacto.whatsapp, mensajes.primeraVez(c.marca.nombre))
  return (
    <>
      <Cabecera c={c} />
      <main className="st-main st-reservar">
        <p className="st-eyebrow">Primera vez</p>
        <h1>Reserva tu primera cita</h1>
        <p className="st-tenue">Déjanos tus datos y qué día te queda mejor. Te escribimos por WhatsApp para confirmarte el día y la hora; no necesitas crear una cuenta.</p>
        <FormularioReserva servicios={servicios} servicioInicial={servicios.some((s) => s.id === pedido) ? pedido : null} hoy={diaLocal(new Date())} whatsapp={wa} campana={c.campana?.titulo ?? null} />
        <p className="st-chico st-tenue">
          ¿Ya eres cliente? <Link href="/portal/citas/nueva">Pide tu cita en el portal</Link>, ahí eliges el día y la hora.
        </p>
      </main>
      <Pie c={c} />
      <BarraApp modo="visitante" activa="citas" tienda={c.tienda} soloTelefono />
    </>
  )
}
