import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { catalogoAgenda } from '../../../../lib/clinica/agenda'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { contactoClinica } from '../../../../lib/sitio/contacto'
import { InsigniaServicio } from '../../../../components/IconoServicio'
import { Barra, Cabecera, Icono, TarjetaContacto } from '../../../../components/portal/comun'

export const dynamic = 'force-dynamic'

const duracion = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`)

/** Servicios que se pueden pedir desde el portal, con su icono, qué incluyen y cómo prepararse. */
export default async function Servicios() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/servicios')
  const [cat, contacto] = await Promise.all([catalogoAgenda(c.payload, true), contactoClinica(c.payload)])
  const vinculado = Boolean(c.tutor.cliente)
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal" className="pt-volver pt-chico">
          <Icono n="back" /> Inicio
        </Link>
        <div>
          <h1>Servicios</h1>
          <p className="pt-tenue pt-chico">Elige uno para pedir tu cita.</p>
        </div>
        {cat.servicios.length === 0 && (
          <div className="pt-card">
            <p className="pt-tenue">Por ahora los servicios se agendan por teléfono o WhatsApp.</p>
          </div>
        )}
        <div className="pt-servicios">
          {cat.servicios.map((s) => (
            <article key={s.id} className="pt-servicio">
              <div className="pt-servicio__cab">
                <InsigniaServicio clave={s.icono} grande />
                <div className="pt-servicio__titulo">
                  <h2>{s.nombre}</h2>
                  <p className="pt-chico pt-tenue">
                    <Icono n="reloj" /> {duracion(s.duracionMin)}
                    {s.precio ? ` · desde $${s.precio.toLocaleString('es-MX')}` : ''}
                  </p>
                </div>
              </div>
              {s.descripcion && <p className="pt-chico">{s.descripcion}</p>}
              {s.indicaciones && (
                <p className="pt-servicio__nota">
                  <b>Antes de venir:</b> {s.indicaciones}
                </p>
              )}
              {s.reservaEnLinea === 'valoracion' && <p className="pt-chico pt-tenue">Requiere valoración: la clínica revisa tu solicitud y te confirma.</p>}
              {vinculado && (
                <Link href={`/portal/citas/nueva?servicio=${s.id}`} className="pt-btn pt-btn--acento pt-btn--chico">
                  Pedir cita
                </Link>
              )}
            </article>
          ))}
        </div>
        {!vinculado && (
          <div className="pt-aviso pt-aviso--info">
            Para pedir cita, primero <Link href="/portal/vincular">vincula tu cuenta</Link> con el código que te dan en la clínica.
          </div>
        )}
        <TarjetaContacto contacto={contacto} />
      </main>
      <Barra activa="inicio" />
    </>
  )
}
