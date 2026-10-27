import Link from 'next/link'
import React from 'react'
import { BotonesCita, Cabecera, Horario, Icono, Pie } from '../../components/sitio/Piezas'
import { contenidoSitio, ligaWhatsApp } from '../../lib/sitio/contenido'

export const dynamic = 'force-dynamic'

/**
 * Página principal. Si el sitio no está «publicado» (global Sitio público),
 * solo muestra el nombre y los accesos: así una instalación nueva no expone
 * una página a medias mientras se captura el contenido.
 */
export default async function Inicio() {
  const c = await contenidoSitio()
  if (!c.publicado) {
    return (
      <main className="st-main st-main--centro">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.marca.logo} alt="" width={120} height={120} />
        <h1>{c.marca.nombre}</h1>
        <p className="st-tenue">Sitio en preparación.</p>
        <div className="st-acciones">
          <Link href="/portal" className="st-btn st-btn--primario">
            Portal del tutor
          </Link>
          <Link href="/admin" className="st-btn st-btn--claro">
            Acceso del equipo
          </Link>
        </div>
      </main>
    )
  }
  const abiertoHoy = (() => {
    const i = (new Date().getUTCDay() + 6) % 7 // horario va de lunes (0) a domingo (6)
    return c.horario[i]
  })()
  return (
    <>
      <Cabecera c={c} activa="inicio" />
      <main>
        <section className="st-hero">
          <div className="st-wrap st-hero__in">
            <div>
              <p className="st-eyebrow">Veterinaria en {c.marca.ciudad}</p>
              <h1>{c.lema ?? c.marca.nombre}</h1>
              {c.descripcion && <p className="st-lead">{c.descripcion}</p>}
              <BotonesCita c={c} />
              <p className="st-chico st-hero__nota">
                {abiertoHoy?.abierto ? `Hoy abrimos de ${abiertoHoy.de} a ${abiertoHoy.a}.` : 'Hoy no hay atención.'} {c.contacto.urgencias ?? ''}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="st-hero__logo" src={c.marca.logoClaro} alt="" />
          </div>
        </section>

        <section className="st-sec" id="servicios">
          <div className="st-wrap">
            <div className="st-sec__head">
              <h2>Servicios</h2>
              <Link href="/servicios">Ver todos</Link>
            </div>
            <div className="st-grupos">
              {c.grupos.map((g) => (
                <div key={g.area} className="st-card">
                  <h3>{g.area}</h3>
                  <ul className="st-lista">
                    {g.servicios.slice(0, 5).map((s) => (
                      <li key={s.id}>
                        <Link href={`/servicios#s-${s.id}`}>{s.nombre}</Link>
                        {s.precio ? <span className="st-tenue"> · ${s.precio.toLocaleString('es-MX')}</span> : null}
                      </li>
                    ))}
                    {g.servicios.length > 5 && (
                      <li className="st-tenue">
                        <Link href="/servicios">y {g.servicios.length - 5} más</Link>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
              {c.grupos.length === 0 && <p className="st-tenue">Pronto publicaremos nuestros servicios.</p>}
            </div>
          </div>
        </section>

        <section className="st-sec st-sec--alt">
          <div className="st-wrap st-pasos">
            <div className="st-card">
              <Icono n="user" grande />
              <h3>1 · Crea tu cuenta</h3>
              <p>En el portal, con tu correo. En tu primera visita te damos un código para vincularla a tu ficha.</p>
            </div>
            <div className="st-card">
              <Icono n="cal" grande />
              <h3>2 · Pide tu cita</h3>
              <p>Elige a tu mascota, el servicio y la hora. Nosotros la confirmamos.</p>
            </div>
            <div className="st-card">
              <Icono n="shield" grande />
              <h3>3 · Todo en un lugar</h3>
              <p>Cartilla, peso, indicaciones y documentos de cada mascota, siempre a la mano.</p>
            </div>
          </div>
        </section>

        {c.equipo.length > 0 && (
          <section className="st-sec">
            <div className="st-wrap">
              <h2>Equipo</h2>
              <div className="st-grupos">
                {c.equipo.map((p, i) => (
                  <div key={i} className="st-card">
                    <h3>{p.nombre}</h3>
                    {p.cargo && <p className="st-tenue">{p.cargo}</p>}
                    {p.descripcion && <p>{p.descripcion}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="st-sec st-sec--alt" id="horario">
          <div className="st-wrap st-dos">
            <div>
              <h2>
                <Icono n="clock" /> Horario
              </h2>
              <Horario c={c} />
            </div>
            <div id="contacto">
              <h2>
                <Icono n="pin" /> Contacto
              </h2>
              <div className="st-contacto">
                {c.contacto.direccion && (
                  <p>
                    {c.contacto.direccion}
                    {c.contacto.mapaUrl && (
                      <>
                        {' '}
                        ·{' '}
                        <a href={c.contacto.mapaUrl} target="_blank" rel="noreferrer">
                          Cómo llegar
                        </a>
                      </>
                    )}
                  </p>
                )}
                {c.contacto.telefono && (
                  <p>
                    Teléfono: <a href={`tel:${c.contacto.telefono.replace(/\s+/g, '')}`}>{c.contacto.telefono}</a>
                  </p>
                )}
                {c.contacto.whatsapp && (
                  <p>
                    WhatsApp:{' '}
                    <a href={ligaWhatsApp(c.contacto.whatsapp, `Hola, ${c.marca.nombre}.`) ?? '#'} target="_blank" rel="noreferrer">
                      {c.contacto.whatsapp}
                    </a>
                  </p>
                )}
                {c.contacto.correo && (
                  <p>
                    Correo: <a href={`mailto:${c.contacto.correo}`}>{c.contacto.correo}</a>
                  </p>
                )}
                {c.contacto.urgencias && <p className="st-aviso">{c.contacto.urgencias}</p>}
              </div>
            </div>
          </div>
        </section>

        {c.preguntas.length > 0 && (
          <section className="st-sec">
            <div className="st-wrap st-faq">
              <h2>Preguntas frecuentes</h2>
              {c.preguntas.map((p, i) => (
                <details key={i}>
                  <summary>{p.pregunta}</summary>
                  <p>{p.respuesta}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="st-sec st-cta">
          <div className="st-wrap">
            <h2>¿Listo para tu cita?</h2>
            <BotonesCita c={c} />
          </div>
        </section>
      </main>
      <Pie c={c} />
    </>
  )
}
