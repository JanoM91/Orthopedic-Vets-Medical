import Link from 'next/link'
import React from 'react'
import { BotonesCita, Cabecera, Horario, Icono, Pie } from '../../components/sitio/Piezas'
import { IconoServicio, InsigniaServicio } from '../../components/IconoServicio'
import { LINEAS_TIENDA } from '../../lib/farmacia/tiposTienda'
import { BarraApp } from '../../components/app/BarraApp'
import { partesLocales } from '../../lib/localTime'
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
    const i = (partesLocales(new Date()).weekday + 6) % 7 // día de la semana en la zona del negocio; el horario va de lunes (0) a domingo (6)
    return c.horario[i]
  })()
  /* Servicios destacados: hasta 6, primero uno de cada área y luego los demás en su orden. */
  const destacados = (() => {
    const primeros = c.grupos.map((g) => g.servicios[0]).filter(Boolean)
    const resto = c.grupos.flatMap((g) => g.servicios.slice(1))
    return [...primeros, ...resto].slice(0, 6)
  })()
  return (
    <>
      <Cabecera c={c} activa="inicio" />
      <main>
        <section className="st-hero">
          <div className="st-wrap st-hero__in">
            <div className="st-hero__texto">
              <p className="st-hero__pill">Veterinaria en {c.marca.ciudad}</p>
              <h1>{c.lema ?? c.marca.nombre}</h1>
              {c.descripcion && <p className="st-lead">{c.descripcion}</p>}
              <BotonesCita c={c} />
            </div>
            <aside className="st-hoy" aria-label="Hoy en la clínica">
              <div className="st-hoy__fila">
                <span className={`st-hoy__punto${abiertoHoy?.abierto ? ' is-abierto' : ''}`} aria-hidden="true" />
                <b>{abiertoHoy?.abierto ? `Hoy abrimos de ${abiertoHoy.de} a ${abiertoHoy.a}` : 'Hoy no hay atención'}</b>
              </div>
              {c.contacto.direccion && (
                <p className="st-hoy__dir">
                  <Icono n="pin" /> {c.contacto.direccion}
                </p>
              )}
              {c.contacto.urgencias && <p className="st-hoy__urg">{c.contacto.urgencias}</p>}
              <div className="st-hoy__acciones">
                {c.contacto.mapaUrl && (
                  <a href={c.contacto.mapaUrl} target="_blank" rel="noreferrer" className="st-btn st-btn--claro st-btn--chico">
                    Cómo llegar
                  </a>
                )}
                {c.contacto.telefono && (
                  <a href={`tel:${c.contacto.telefono.replace(/\s+/g, '')}`} className="st-btn st-btn--claro st-btn--chico">
                    <Icono n="phone" /> Llamar
                  </a>
                )}
              </div>
            </aside>
          </div>
        </section>

        <section className="st-sec" id="servicios">
          <div className="st-wrap">
            <div className="st-sec__head">
              <div>
                <p className="st-eyebrow">Servicios</p>
                <h2>Lo que hacemos por tu mascota</h2>
              </div>
              <Link href="/servicios" className="st-enlace">
                Ver todos y precios
              </Link>
            </div>
            {destacados.length > 0 ? (
              <div className="st-tarjetas">
                {destacados.map((s) => (
                  <Link key={s.id} href={s.enLinea ? `/portal/citas/nueva?servicio=${s.id}` : `/servicios#s-${s.id}`} className="st-servicio">
                    <InsigniaServicio clave={s.icono} grande />
                    <b>{s.nombre}</b>
                    <span className="st-servicio__det">
                      ≈ {s.duracionMin} min{s.precio ? ` · ${s.desde ? 'desde ' : ''}$${s.precio.toLocaleString('es-MX')}` : ''}
                    </span>
                    {s.descripcion && <span className="st-servicio__txt">{s.descripcion}</span>}
                    <span className="st-servicio__ir">
                      {s.enLinea ? 'Pedir cita' : 'Ver detalles'} <Icono n="next" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="st-tenue">Pronto publicaremos nuestros servicios.</p>
            )}
          </div>
        </section>

        {c.tienda && (
          <section className="st-sec st-sec--pegada">
            <div className="st-wrap">
              <div className="st-banda">
                <div className="st-banda__texto">
                  <p className="st-eyebrow">Farmacia y tienda</p>
                  <h2>Pide en línea y recoge en la clínica</h2>
                  <p className="st-tenue">Dinos para quién compras y te mostramos lo que le queda. Lo que necesita receta, solo con la receta de tu veterinario.</p>
                  <div className="st-acciones">
                    <Link href="/tienda" className="st-btn st-btn--acento">
                      <Icono n="bolsa" /> Ver la tienda
                    </Link>
                  </div>
                </div>
                <div className="st-banda__lineas" role="list" aria-label="Secciones de la tienda">
                  {LINEAS_TIENDA.slice(0, 6).map((l) => (
                    <Link key={l.clave} href={`/tienda?linea=${l.clave}`} className="st-linea" role="listitem">
                      <span className="st-linea__i">
                        <IconoServicio clave={l.icono} tamano={22} />
                      </span>
                      {l.nombre}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="st-sec st-sec--pegada">
          <div className="st-wrap">
            <div className="st-app">
              <div className="st-app__texto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.marca.logoClaro} alt="" width={48} height={48} />
                <h2>Tu mascota en tu celular</h2>
                <p>Citas, cartilla, documentos{c.tienda ? ', recetas y pedidos' : ''} en un solo lugar. Se instala desde el navegador, sin tiendas de apps.</p>
                <div className="st-acciones">
                  <Link href="/portal/registro" className="st-btn st-btn--primario">
                    Crear mi cuenta
                  </Link>
                  <Link href="/portal/entrar" className="st-btn st-btn--vidrio">
                    Ya tengo cuenta
                  </Link>
                </div>
              </div>
              <ol className="st-app__pasos">
                <li>
                  <Icono n="user" />
                  <span>
                    <b>Crea tu cuenta</b> con tu correo. En tu primera visita te damos un código para vincularla a tu ficha.
                  </span>
                </li>
                <li>
                  <Icono n="cal" />
                  <span>
                    <b>Pide tu cita</b>: mascota, servicio y hora. Nosotros la confirmamos.
                  </span>
                </li>
                <li>
                  <Icono n="shield" />
                  <span>
                    <b>Te avisamos</b> cuando toque un refuerzo y ves sus documentos cuando la clínica los publique.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {c.equipo.length > 0 && (
          <section className="st-sec" id="equipo">
            <div className="st-wrap">
              <p className="st-eyebrow">Equipo</p>
              <h2>Quién cuida a tu mascota</h2>
              <div className="st-grupos">
                {c.equipo.map((p, i) => (
                  <div key={i} className="st-card st-persona">
                    <span className="st-persona__ini" aria-hidden="true">
                      {p.nombre
                        .split(/\s+/)
                        .filter((x) => !/^(dr|dra|mvz)\.?$/i.test(x))
                        .slice(0, 2)
                        .map((x) => x[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div>
                      <h3>{p.nombre}</h3>
                      {p.cargo && <p className="st-tenue">{p.cargo}</p>}
                      {p.descripcion && <p className="st-chico">{p.descripcion}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="st-sec" id="horario">
          <div className="st-wrap st-dos">
            <div className="st-card">
              <h2>
                <Icono n="clock" /> Horario
              </h2>
              <Horario c={c} />
            </div>
            <div id="contacto" className="st-card">
              <h2>
                <Icono n="pin" /> Cómo llegar
              </h2>
              <div className="st-contacto">
                {c.contacto.direccion && <p>{c.contacto.direccion}</p>}
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
                {c.contacto.mapaUrl && (
                  <div className="st-acciones st-acciones--juntas">
                    <a href={c.contacto.mapaUrl} target="_blank" rel="noreferrer" className="st-btn st-btn--claro">
                      <Icono n="pin" /> Abrir en Mapas
                    </a>
                  </div>
                )}
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
      <BarraApp modo="visitante" activa="inicio" tienda={c.tienda} soloTelefono />
    </>
  )
}
