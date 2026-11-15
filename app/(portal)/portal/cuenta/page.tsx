import { redirect } from 'next/navigation'
import React from 'react'
import { BotonSalir, FormCuenta } from '../../../../components/portal/Formularios'
import { Barra, Cabecera, TarjetaContacto } from '../../../../components/portal/comun'
import { portalResumen } from '../../../../lib/clinica/servicio'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { contactoClinica } from '../../../../lib/sitio/contacto'

export const dynamic = 'force-dynamic'

export default async function Cuenta() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/cuenta')
  const [r, contacto] = await Promise.all([portalResumen(c), contactoClinica(c.payload)])
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <h1>Perfil</h1>
        <div className="pt-card">
          <p className="pt-chico pt-tenue">{c.tutor.email}</p>
          <FormCuenta tutor={{ id: c.tutor.id, nombre: c.tutor.nombre, telefono: c.tutor.telefono ?? null }} />
        </div>
        {r.cliente && (
          <div className="pt-card">
            <h2>Tu ficha en la clínica</h2>
            <dl className="pt-dl">
              <dt>Folio</dt>
              <dd>{r.cliente.folio}</dd>
              <dt>Nombre</dt>
              <dd>{r.cliente.nombreCompleto}</dd>
              <dt>Teléfono</dt>
              <dd>{r.cliente.telefono ?? '—'}</dd>
              <dt>Correo</dt>
              <dd>{r.cliente.email ?? '—'}</dd>
            </dl>
            <p className="pt-chico pt-tenue">Si algo está mal, avísanos en la clínica{contacto.telefono ? ` (${contacto.telefono})` : ''}.</p>
          </div>
        )}
        <TarjetaContacto contacto={contacto} />
        <div className="pt-card">
          <h2>Sesión</h2>
          <p className="pt-chico pt-tenue">Tu sesión dura 30 días en este dispositivo.</p>
          <div>
            <BotonSalir />
          </div>
        </div>
      </main>
      <Barra activa="cuenta" />
    </>
  )
}
