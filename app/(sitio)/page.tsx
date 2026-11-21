import Link from 'next/link'
import React from 'react'
import { BotonesCita, Cabecera, Horario, Icono, Pie } from '../../components/sitio/Piezas'
import { Areas, type AreaSitio } from '../../components/sitio/Areas'
import { IconoServicio } from '../../components/IconoServicio'
import { LINEAS_TIENDA } from '../../lib/farmacia/tiposTienda'
import { BarraApp } from '../../components/app/BarraApp'
import { partesLocales } from '../../lib/localTime'
import { contenidoSitio, ligaWhatsApp, type ServicioPublico } from '../../lib/sitio/contenido'
import { enlaceWhatsApp, mensajes } from '../../lib/whatsapp'
import { TarjetaPaquete } from '../../components/sitio/TarjetaPaquete'
import { Carrusel } from '../../components/sitio/Carrusel'

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
  const wa = (texto: string) => ligaWhatsApp(c.contacto.whatsapp, texto)
  const detalle = (s: ServicioPublico) => `≈ ${s.duracionMin} min${s.precio ? ` · ${s.desde ? 'desde ' : ''}$${s.precio.toLocaleString('es-MX')}` : ''}`
  /* «¿Qué necesita hoy tu mascota?»: una píldora por área del catálogo, con hasta 5 servicios cada una. */
  const areas: AreaSitio[] = c.grupos.map((g) => ({
    nombre: g.area,
    whatsapp: wa(`Hola, me interesa ${g.area} en ${c.marca.nombre}.`),
    servicios: g.servicios.slice(0, 5).map((s) => ({ id: s.id, nombre: s.nombre, detalle: detalle(s), descripcion: s.descripcion, enLinea: s.enLinea, icono: s.icono })),
    mas: Math.max(0, g.servicios.length - 5),
  }))
  const waPrimera = enlaceWhatsApp(c.contacto.whatsapp, mensajes.primeraVez(c.marca.nombre))
  const waCampana = c.campana ? wa(`Hola, quiero información de la campaña «${c.campana.titulo}» de ${c.marca.nombre}.`) : null
  const waDoctor = c.doctor ? wa(`Hola, quiero pedir una cita con ${c.doctor.nombre} en ${c.marca.nombre}.`) : null
  const waEstetica = c.estetica ? wa(`Hola, quiero apartar un servicio de ${c.estetica.nombre}.`) : null
  const lineaHoy = abiertoHoy?.abierto ? `Hoy abrimos de ${abiertoHoy.de} a ${abiertoHoy.a}` : 'Hoy no hay atención'
  return (
    <>
      <Cabecera c={c} activa="inicio" oscura />
      <main className="st-b">
        <section className={`st-hero${c.campana ? ' st-hero--campana' : ''}`}>
          <div className="st-wrap st-hero__in">
            <div className="st-hero__texto">
              <p className="st-hero__pill">Veterinaria en {c.marca.ciudad}</p>
              <h1>{c.lema ?? c.marca.nombre}</h1>
              {c.descripcion && <p className="st-lead">{c.descripcion}</p>}
              <BotonesCita c={c} />
              {c.fotos.length > 0 && (
                <p className="st-hero__hoy">
                  <span className={`st-hoy__punto${abiertoHoy?.abierto ? ' is-abierto' : ''}`} aria-hidden="true" />
                  {lineaHoy}
                  {c.contacto.direccion ? ` · ${c.contacto.direccion}` : ''}
                </p>
              )}
            </div>
            {c.fotos.length > 0 ? (
              <Carrusel fotos={c.fotos} />
            ) : (
              <aside className="st-hoy" aria-label="Hoy en la clínica">
                <div className="st-hoy__fila">
                  <span className={`st-hoy__punto${abiertoHoy?.abierto ? ' is-abierto' : ''}`} aria-hidden="true" />
                  <b>{lineaHoy}</b>
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
            )}
          </div>
        </section>

        {c.campana && (
          <section className="st-wrap st-campana-zona" aria-label="Campaña vigente">
            <div className="st-campana">
              <div className="st-campana__texto">
                {c.campana.etiqueta && <p className="st-campana__etiqueta">{c.campana.etiqueta}</p>}
                <h2>{c.campana.titulo}</h2>
                {c.campana.texto && <p>{c.campana.texto}</p>}
              </div>
              {waCampana ? (
                <a href={waCampana} target="_blank" rel="noreferrer" className="st-btn st-btn--primario">
                  <Icono n="wa" /> {c.campana.boton}
                </a>
              ) : (
                <Link href="/portal/citas/nueva" className="st-btn st-btn--primario">
                  <Icono n="cal" /> {c.campana.boton}
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="st-sec" aria-labelledby="primera-vez">
          <div className="st-wrap">
            <div className="st-sec__head">
              <div>
                <p className="st-eyebrow">¿Primera vez con nosotros?</p>
                <h2 id="primera-vez">Empieza por aquí</h2>
              </div>
            </div>
            <div className="st-accesos">
              <div className="st-acceso">
                <span className="st-acceso__i">
                  <Icono n="cal" />
                </span>
                <h3>Reserva tu primera cita</h3>
                <p>Déjanos tus datos y qué día te queda mejor; te escribimos por WhatsApp para confirmarte la hora. No necesitas crear una cuenta.</p>
                <Link href="/reservar" className="st-btn st-btn--acento">
                  <Icono n="cal" /> Reservar mi primera cita
                </Link>
                {waPrimera && (
                  <a href={waPrimera} target="_blank" rel="noreferrer" className="st-acceso__otra">
                    O escríbenos por WhatsApp
                  </a>
                )}
              </div>
              {c.tienda && (
                <div className="st-acceso">
                  <span className="st-acceso__i">
                    <Icono n="bolsa" />
                  </span>
                  <h3>Compra en la farmacia y tienda</h3>
                  <p>No necesitas cuenta: dinos para quién compras y te mostramos lo que le queda. Lo que lleva receta se surte con la receta de tu veterinario.</p>
                  <Link href="/tienda" className="st-btn st-btn--acento">
                    <Icono n="bolsa" /> Entrar a la tienda
                  </Link>
                </div>
              )}
              <div className="st-acceso">
                <span className="st-acceso__i">
                  <Icono n="user" />
                </span>
                <h3>Ya soy cliente</h3>
                <p>Entra al portal para pedir y cambiar citas, ver su cartilla y sus documentos{c.tienda ? ' y volver a pedir sus productos' : ''}.</p>
                <Link href="/portal/entrar" className="st-btn st-btn--claro">
                  Entrar al portal
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="st-sec st-sec--pegada" id="servicios">
          <div className="st-wrap">
            <div className="st-sec__head">
              <div>
                <p className="st-eyebrow">Servicios</p>
                <h2>¿Qué necesita hoy tu mascota?</h2>
              </div>
            </div>
            {areas.length > 0 ? <Areas areas={areas} /> : <p className="st-tenue">Pronto publicaremos nuestros servicios.</p>}
          </div>
        </section>

        {c.paquetes.length > 0 && (
          <section className="st-sec st-sec--pegada" id="paquetes" aria-labelledby="t-paquetes">
            <div className="st-wrap">
              <div className="st-sec__head">
                <div>
                  <p className="st-eyebrow">Paquetes</p>
                  <h2 id="t-paquetes">Paga una vez, úsalo con el tiempo</h2>
                </div>
                {c.paquetes.length > 3 && (
                  <Link href="/paquetes" className="st-enlace">
                    Ver todos
                  </Link>
                )}
              </div>
              <div className="st-paquetes">
                {c.paquetes.slice(0, 3).map((p) => (
                  <TarjetaPaquete key={p.id} p={p} compacta />
                ))}
              </div>
            </div>
          </section>
        )}

        {c.razones.length > 0 && (
          <section className="st-sec st-sec--pegada" aria-label="Por qué elegirnos">
            <div className="st-wrap st-razones">
              {c.razones.map((r, i) => (
                <div key={i} className="st-card">
                  <h3>{r.titulo}</h3>
                  {r.texto && <p className="st-tenue">{r.texto}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {c.doctor && (
          <section className="st-sec st-sec--pegada" id="doctor">
            <div className="st-wrap">
              <div className={`st-doctor${c.doctor.foto ? '' : ' st-doctor--sin-foto'}`}>
                {c.doctor.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="st-doctor__foto" src={c.doctor.foto.url} alt={c.doctor.foto.alt} loading="lazy" />
                )}
                <div className="st-doctor__texto">
                  <p className="st-eyebrow">Quién lo atiende</p>
                  <h2>{`Lo atiende ${c.doctor.titulo} ${c.doctor.nombre}.`}</h2>
                  {c.doctor.presentacion && <p className="st-doctor__pres">{c.doctor.presentacion}</p>}
                  {c.doctor.credenciales.length > 0 && (
                    <dl className="st-credenciales">
                      {c.doctor.credenciales.map((x, i) => (
                        <div key={i}>
                          <dt>{x.etiqueta}</dt>
                          <dd>{x.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="st-acciones">
                    {waDoctor ? (
                      <a href={waDoctor} target="_blank" rel="noreferrer" className="st-btn st-btn--acento">
                        <Icono n="wa" /> Pedir cita con {c.doctor.nombre.split(/\s+/)[0]}
                      </a>
                    ) : (
                      <Link href="/portal/citas/nueva" className="st-btn st-btn--acento">
                        <Icono n="cal" /> Pedir cita
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {c.estetica && (
          <section className="st-sec st-sec--pegada" id="estetica">
            <div className="st-wrap">
              <div className="st-banda st-banda--estetica">
                {c.estetica.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="st-banda__logo" src={c.estetica.logo} alt="" loading="lazy" />
                )}
                <div className="st-banda__texto">
                  <p className="st-eyebrow">Estética</p>
                  <h2>{c.estetica.nombre}: baño y corte con ojos de veterinario</h2>
                  <p className="st-tenue">Precio según su talla. Si al arreglarlo vemos algo en su piel, sus oídos o sus uñas, te avisamos el mismo día.</p>
                  <div className="st-acciones">
                    {waEstetica && (
                      <a href={waEstetica} target="_blank" rel="noreferrer" className="st-btn st-btn--acento">
                        <Icono n="wa" /> Apartar por WhatsApp
                      </a>
                    )}
                    <Link href="/servicios" className="st-btn st-btn--claro">
                      Ver servicios y precios
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

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

        {c.testimonios.length > 0 && (
          <section className="st-sec" aria-labelledby="testimonios">
            <div className="st-wrap">
              <h2 id="testimonios">Lo que dicen las familias</h2>
              <div className="st-testimonios">
                {c.testimonios.map((x, i) => (
                  <blockquote key={i} className="st-card">
                    <p>{x.texto}</p>
                    {x.autor && <footer>{x.autor}</footer>}
                  </blockquote>
                ))}
              </div>
            </div>
          </section>
        )}

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
