import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { portalResumen } from '../../../lib/clinica/servicio'
import { sesionTutor } from '../../../lib/portal/sesion'
import { site } from '../../../lib/site'
import { Avatar, Barra, Cabecera, ESPECIE_LABEL, fecha, Icono, Pill } from '../../../components/portal/comun'

export const dynamic = 'force-dynamic'

/** Inicio del portal: la ficha vinculada y las mascotas; si no hay ficha, invita a vincular. */
export default async function PortalInicio() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar')
  const r = await portalResumen(c)
  return (
    <>
      <Cabecera nombre={r.tutor.nombre} />
      <main className="pt-main">
        <div>
          <p className="pt-tenue pt-chico">{site.brand.name}</p>
          <h1>Hola, {r.tutor.nombre.split(' ')[0]}</h1>
        </div>
        {!r.cliente ? (
          <div className="pt-card">
            <h2>Vincula tu cuenta</h2>
            <p className="pt-chico">Para ver a tus mascotas, pide en la clínica tu <b>código de vinculación</b> y escríbelo aquí. Así nadie ve un expediente por coincidir en nombre o teléfono.</p>
            <Link href="/portal/vincular" className="pt-btn pt-btn--primario">
              <Icono n="link" /> Tengo un código
            </Link>
          </div>
        ) : (
          <>
            <div className="pt-card pt-lista" id="mascotas">
              <div style={{ padding: '12px 16px 0' }}>
                <h2>Mis mascotas</h2>
              </div>
              {r.mascotas.length === 0 && <p className="pt-tenue" style={{ padding: 16 }}>Aún no hay mascotas en tu ficha. La clínica las registra en tu primera visita.</p>}
              {r.mascotas.map((m) => (
                <Link key={m.id} href={`/portal/mascotas/${m.id}`} className="pt-fila">
                  <Avatar nombre={m.nombre} especie={m.especie} />
                  <span className="pt-fila__main">
                    <span className="pt-fila__t1">
                      {m.nombre} {m.estado === 'fallecido' && <Pill tono="gris">en memoria</Pill>}
                    </span>
                    <span className="pt-fila__t2">
                      {ESPECIE_LABEL[m.especie] ?? m.especie}
                      {m.raza ? `, ${m.raza}` : ''}
                      {m.edad ? ` · ${m.edad}` : ''}
                      {m.ultimoPeso ? ` · ${m.ultimoPeso.kg} kg` : ''}
                    </span>
                    {m.proximaCartilla && (
                      <span className="pt-fila__t2">
                        <Pill tono="info">Cartilla</Pill> {m.proximaCartilla.producto}: {fecha(m.proximaCartilla.fecha)}
                      </span>
                    )}
                  </span>
                  <Icono n="next" />
                </Link>
              ))}
            </div>
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
              <p className="pt-chico pt-tenue">Si algo está mal, avísanos en la clínica{site.brand.phone ? ` (${site.brand.phone})` : ''}.</p>
            </div>
          </>
        )}
      </main>
      <Barra activa="inicio" />
    </>
  )
}
