import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { NuevaCita } from '../../../../../components/portal/Citas'
import { Barra, Cabecera, Icono } from '../../../../../components/portal/comun'
import { portalCitas } from '../../../../../lib/clinica/agenda'
import { sesionTutor } from '../../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

export default async function PedirCita({ searchParams }: { searchParams: Promise<{ mascota?: string; servicio?: string }> }) {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/citas/nueva')
  if (!c.tutor.cliente) redirect('/portal')
  const { mascota, servicio } = await searchParams
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null)
  const d = await portalCitas(c)
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal/citas" className="pt-chico" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icono n="back" /> Mis citas
        </Link>
        <h1>Pedir cita</h1>
        <NuevaCita mascotas={d.mascotas} servicios={d.servicios} mascotaInicial={num(mascota)} servicioInicial={num(servicio)} anticipacionHoras={d.configuracion.anticipacionHoras} diasAdelante={d.configuracion.diasAdelante} />
        <p className="pt-chico pt-tenue">Tu cita queda «por confirmar» hasta que la clínica la revise. Para urgencias, llámanos: el portal no es inmediato.</p>
      </main>
      <Barra activa="citas" />
    </>
  )
}
