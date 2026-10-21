import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { AccionesCita, PillCita } from '../../../../components/portal/Citas'
import { Avatar, Barra, Cabecera, fecha, Icono } from '../../../../components/portal/comun'
import { portalCitas } from '../../../../lib/clinica/agenda'
import { sesionTutor } from '../../../../lib/portal/sesion'

export const dynamic = 'force-dynamic'

/** Mis citas: próximas (con reprogramar/cancelar) y pasadas. */
export default async function Citas() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/citas')
  if (!c.tutor.cliente) redirect('/portal')
  const d = await portalCitas(c)
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Mis citas</h1>
          <Link href="/portal/citas/nueva" className="pt-btn pt-btn--primario">
            Pedir cita
          </Link>
        </div>
        <div className="pt-card pt-lista">
          <div style={{ padding: '12px 16px 0' }}>
            <h2>Próximas</h2>
          </div>
          {d.proximas.length === 0 && <p className="pt-tenue" style={{ padding: 16 }}>No tienes citas próximas.</p>}
          {d.proximas.map((x) => (
            <div key={x.id} className="pt-fila" style={{ alignItems: 'flex-start' }}>
              <Avatar nombre={x.mascota.nombre} especie={x.mascota.especie} />
              <span className="pt-fila__main">
                <span className="pt-fila__t1">
                  {x.servicio.nombre} · {x.mascota.nombre}
                </span>
                <span className="pt-fila__t2" style={{ textTransform: 'capitalize' }}>
                  {fecha(x.dia)} · {x.horaInicio}–{x.horaFin}
                </span>
                <span>
                  <PillCita estado={x.estado} />
                </span>
                {x.notasTutor && <span className="pt-fila__t2">Notas: {x.notasTutor}</span>}
                <AccionesCita cita={x} cancelacionHoras={d.configuracion.cancelacionHoras} />
              </span>
            </div>
          ))}
        </div>
        {d.pasadas.length > 0 && (
          <div className="pt-card pt-lista">
            <div style={{ padding: '12px 16px 0' }}>
              <h2>Anteriores</h2>
            </div>
            {d.pasadas.slice(0, 20).map((x) => (
              <div key={x.id} className="pt-fila">
                <Icono n="shield" />
                <span className="pt-fila__main">
                  <span className="pt-fila__t1">
                    {x.servicio.nombre} · {x.mascota.nombre}
                  </span>
                  <span className="pt-fila__t2">
                    {fecha(x.dia)} · {x.horaInicio}
                  </span>
                </span>
                <PillCita estado={x.estado} />
              </div>
            ))}
          </div>
        )}
      </main>
      <Barra activa="citas" />
    </>
  )
}
