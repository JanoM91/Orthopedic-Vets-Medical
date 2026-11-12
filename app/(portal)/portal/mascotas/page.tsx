import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { proximasPorMascota } from '../../../../lib/clinica/agenda'
import { portalResumen } from '../../../../lib/clinica/servicio'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { Barra, Cabecera, Icono } from '../../../../components/portal/comun'
import { TarjetaMascota } from '../../../../components/portal/Mascotas'

export const dynamic = 'force-dynamic'

/** «Mascotas» de la barra: todas las mascotas de la ficha, con su foto. */
export default async function MisMascotas() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/mascotas')
  const r = await portalResumen(c)
  if (!r.cliente) redirect('/portal')
  const proximas = await proximasPorMascota(c, r.mascotas.map((m) => m.id))
  return (
    <>
      <Cabecera nombre={r.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-seccion__cab">
          <h1>Mis mascotas</h1>
          <Link href="/portal/citas/nueva" className="pt-btn pt-btn--primario pt-btn--chico">
            <Icono n="calmas" /> Pedir cita
          </Link>
        </div>
        {r.mascotas.length === 0 ? (
          <div className="pt-card">
            <p className="pt-tenue">Aún no hay mascotas en tu ficha. La clínica las registra en tu primera visita.</p>
          </div>
        ) : (
          <div className={`pt-mascotas${r.mascotas.length === 1 ? ' pt-mascotas--una' : ''}`}>
            {r.mascotas.map((m) => (
              <TarjetaMascota key={m.id} m={m} proxima={proximas.get(m.id) ?? null} />
            ))}
          </div>
        )}
        <p className="pt-chico pt-tenue">¿Falta alguna? La clínica la agrega a tu ficha en su próxima visita.</p>
      </main>
      <Barra activa="mascotas" />
    </>
  )
}
