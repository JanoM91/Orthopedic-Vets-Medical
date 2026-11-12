import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { proximasPorMascota } from '../../../lib/clinica/agenda'
import { portalResumen } from '../../../lib/clinica/servicio'
import { sesionTutor } from '../../../lib/portal/sesion'
import { site } from '../../../lib/site'
import { contactoClinica } from '../../../lib/sitio/contacto'
import { InsigniaServicio } from '../../../components/IconoServicio'
import { PillCita } from '../../../components/portal/Citas'
import { Barra, Cabecera, Icono, SalidaWhatsApp, TarjetaContacto } from '../../../components/portal/comun'
import { diaCorto, TarjetaMascota } from '../../../components/portal/Mascotas'

export const dynamic = 'force-dynamic'

const ACCIONES: { href: string; icono: string; titulo: string; detalle: string; tono: string }[] = [
  { href: '/portal/servicios', icono: 'servicios', titulo: 'Servicios', detalle: 'Lo que ofrecemos', tono: 'menta' },
  { href: '/portal/citas/nueva', icono: 'calmas', titulo: 'Pedir cita', detalle: 'Elige día y hora', tono: 'verde' },
  { href: '/portal/citas', icono: 'cal', titulo: 'Mis citas', detalle: 'Próximas y pasadas', tono: 'pizarra' },
  { href: '/portal/cuenta', icono: 'user', titulo: 'Mi cuenta', detalle: 'Tus datos y sesión', tono: 'arena' },
]

/** Inicio del portal: próxima cita, mis mascotas (con foto) y las cuatro acciones principales. */
export default async function PortalInicio() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar')
  const r = await portalResumen(c)
  const [proximas, contacto] = await Promise.all([proximasPorMascota(c, r.mascotas.map((m) => m.id)), contactoClinica(c.payload)])
  const siguiente = [...proximas.values()].sort((a, b) => (a.dia + a.horaInicio).localeCompare(b.dia + b.horaInicio))[0] ?? null
  return (
    <>
      <Cabecera nombre={r.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-saludo">
          <p className="pt-tenue pt-chico">{site.brand.name}</p>
          <h1>Hola, {r.tutor.nombre.split(' ')[0]}</h1>
        </div>
        {!r.cliente ? (
          <>
            <div className="pt-card">
              <h2>Vincula tu cuenta</h2>
              <p className="pt-chico">Para ver a tus mascotas, pide en la clínica tu <b>código de vinculación</b> y escríbelo aquí. Así nadie ve un expediente por coincidir en nombre o teléfono.</p>
              <Link href="/portal/vincular" className="pt-btn pt-btn--primario">
                <Icono n="link" /> Tengo un código
              </Link>
            </div>
            <SalidaWhatsApp whatsapp={contacto.whatsapp} motivo="codigo" />
            <Link href="/portal/servicios" className="pt-accion pt-accion--menta pt-accion--ancha">
              <span className="pt-accion__icono">
                <Icono n="servicios" />
              </span>
              <span className="pt-accion__texto">
                <b>Servicios</b>
                <span>Conoce lo que ofrecemos</span>
              </span>
              <Icono n="next" />
            </Link>
          </>
        ) : (
          <>
            {siguiente && (
              <Link href="/portal/citas" className="pt-proxima">
                <span className="pt-proxima__etiqueta">Próxima cita</span>
                <span className="pt-proxima__fila">
                  <InsigniaServicio clave={siguiente.servicio.icono} />
                  <span className="pt-proxima__main">
                    <b>{siguiente.servicio.nombre}</b>
                    <span>
                      {siguiente.mascota.nombre} · {diaCorto(siguiente.dia)} · {siguiente.horaInicio}
                    </span>
                  </span>
                  {siguiente.mascota.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pt-proxima__foto" src={siguiente.mascota.foto} alt="" />
                  )}
                </span>
                <span className="pt-proxima__pie">
                  <PillCita estado={siguiente.estado} />
                  <span>Ver o reprogramar ›</span>
                </span>
              </Link>
            )}

            <section className="pt-seccion" id="mascotas" aria-labelledby="t-mascotas">
              <div className="pt-seccion__cab">
                <h2 id="t-mascotas">Mis mascotas</h2>
                {r.mascotas.length > 0 && (
                  <Link href="/portal/mascotas" className="pt-enlace">
                    Ver todas
                  </Link>
                )}
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
              {r.mascotas.some((m) => !m.foto && m.estado !== 'fallecido') && <p className="pt-chico pt-tenue">Toca la cámara para ponerle foto a tu mascota.</p>}
            </section>

            <section className="pt-seccion" aria-labelledby="t-acciones">
              <h2 id="t-acciones" className="pt-sr">
                Acciones
              </h2>
              <div className="pt-acciones-inicio">
                {ACCIONES.map((a) => (
                  <Link key={a.href} href={a.href} className={`pt-accion pt-accion--${a.tono}`}>
                    <span className="pt-accion__icono">
                      <Icono n={a.icono} />
                    </span>
                    <span className="pt-accion__texto">
                      <b>{a.titulo}</b>
                      <span>{a.detalle}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

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
            <TarjetaContacto contacto={contacto} />
          </>
        )}
      </main>
      <Barra activa="inicio" />
    </>
  )
}
