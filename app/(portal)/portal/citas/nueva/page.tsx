import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { NuevaCita } from '../../../../../components/portal/Citas'
import { Barra, Cabecera, Icono } from '../../../../../components/portal/comun'
import { portalCitas } from '../../../../../lib/clinica/agenda'
import { sesionTutor } from '../../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

export default async function PedirCita({ searchParams }: { searchParams: Promise<{ mascota?: string }> }) {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/citas/nueva')
  if (!c.tutor.cliente) redirect('/portal')
  const { mascota } = await searchParams
  const d = await portalCitas(c)
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal/citas" className="pt-chico" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icono n="back" /> Mis citas
        </Link>
        <h1>Pedir cita</h1>
        <div className="pt-card">
          <NuevaCita mascotas={d.mascotas} servicios={d.servicios} mascotaInicial={mascota && /^\d+$/.test(mascota) ? Number(mascota) : null} anticipacionHoras={d.configuracion.anticipacionHoras} />
        </div>
        <p className="pt-chico pt-tenue">Tu cita queda «por confirmar» hasta que la clínica la revise. Para urgencias, llámanos: el portal no es inmediato.</p>
      </main>
      <Barra activa="citas" />
    </>
  )
}
