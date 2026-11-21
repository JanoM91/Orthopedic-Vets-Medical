import Link from 'next/link'
import React from 'react'
import type { ContenidoSitio } from '../../lib/sitio/contenido'
import { ligaWhatsApp } from '../../lib/sitio/contenido'
import { enlaceWhatsApp, mensajes } from '../../lib/whatsapp'

/* Piezas de servidor del sitio público: cabecera, pie e íconos. Sin estado. */

const TRAZOS: Record<string, React.ReactNode> = {
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  wa: (<><path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z" /><path d="M9.5 9.5c0 3 2 5 5 5l1.2-1.2-1.8-.9-.8.8c-1-.4-1.8-1.2-2.2-2.2l.8-.8-.9-1.8z" /></>),
  pin: (<><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  paw: (<><circle cx="7" cy="9" r="1.8" /><circle cx="11" cy="6" r="1.8" /><circle cx="15" cy="6.5" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M8 16c0-2.5 2-4.5 4.5-4.5S17 13.5 17 16c0 2-1.6 3-3 3-1 0-1.5-.5-1.5-.5S12 19 11 19c-1.6 0-3-1-3-3z" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  shield: (<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  next: <path d="M9 5l7 7-7 7" />,
  bolsa: (<><path d="M5 8h14l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>),
  file: (<><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
  chispa: <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
}
export function Icono({ n, grande }: { n: string; grande?: boolean }) {
  return (
    <svg className={`st-i${grande ? ' st-i--grande' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {TRAZOS[n] ?? null}
    </svg>
  )
}

/**
 * Cabecera del sitio. `oscura` (home versión B): va pegada al hero, sobre el
 * primario de la marca. El botón destacado es WhatsApp (decisión de Jano,
 * 16-nov-2026); sin número capturado, «Pedir cita».
 */
export function Cabecera({ c, activa, oscura }: { c: ContenidoSitio; activa?: 'inicio' | 'servicios' | 'paquetes'; oscura?: boolean }) {
  const wa = ligaWhatsApp(c.contacto.whatsapp, `Hola, quiero información para mi mascota en ${c.marca.nombre}.`)
  return (
    <header className={`st-cabecera${oscura ? ' st-cabecera--oscura' : ''}`}>
      <div className="st-wrap st-cabecera__in">
        <Link href="/" className="st-marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={oscura ? c.marca.logoClaro : c.marca.logo} alt="" />
          <span>{c.marca.nombre}</span>
        </Link>
        <nav className="st-nav" aria-label="Secciones">
          <Link href="/servicios" className={activa === 'servicios' ? 'is-on' : ''}>
            Servicios
          </Link>
          {c.paquetes.length > 0 && (
            <Link href="/paquetes" className={activa === 'paquetes' ? 'is-on' : ''}>
              Paquetes
            </Link>
          )}
          {c.doctor && <Link href="/#doctor">El doctor</Link>}
          {c.equipo.length > 0 && !c.doctor && <Link href="/#equipo">Equipo</Link>}
          {c.tienda && <Link href="/tienda">Tienda</Link>}
          <Link href="/#contacto">Cómo llegar</Link>
          <Link href="/portal" className="st-btn st-btn--claro st-btn--chico">
            Entrar
          </Link>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="st-btn st-btn--acento st-btn--chico">
              <Icono n="wa" /> WhatsApp
            </a>
          ) : (
            <Link href="/portal/citas/nueva" className="st-btn st-btn--acento st-btn--chico">
              Pedir cita
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Pie({ c }: { c: ContenidoSitio }) {
  const wa = ligaWhatsApp(c.contacto.whatsapp, `Hola, ${c.marca.nombre}.`)
  return (
    <footer className="st-pie">
      <div className="st-wrap st-pie__in">
        <div>
          <b>{c.marca.nombre}</b>
          {c.lema && <p className="st-tenue">{c.lema}</p>}
          {c.contacto.direccion && <p className="st-tenue">{c.contacto.direccion}</p>}
        </div>
        <div className="st-pie__ligas">
          <Link href="/servicios">Servicios</Link>
          {c.paquetes.length > 0 && <Link href="/paquetes">Paquetes</Link>}
          {c.tienda && <Link href="/tienda">Tienda</Link>}
          <Link href="/portal">Portal del tutor</Link>
          <Link href="/aviso-de-privacidad">Aviso de privacidad</Link>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          {c.redes.facebook && (
            <a href={c.redes.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
          )}
          {c.redes.instagram && (
            <a href={c.redes.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
          {c.redes.tiktok && (
            <a href={c.redes.tiktok} target="_blank" rel="noreferrer">
              TikTok
            </a>
          )}
          <Link href="/admin" className="st-tenue">
            Acceso del equipo
          </Link>
        </div>
      </div>
    </footer>
  )
}

/**
 * Botones de cita. WhatsApp es la acción principal (decisión de Jano,
 * 16-nov-2026) y «Agendar en línea» la segunda; sin número capturado, la
 * principal es la cita en línea y queda «Llamar».
 */
export function BotonesCita({ c, servicio }: { c: ContenidoSitio; servicio?: string }) {
  const wa = ligaWhatsApp(c.contacto.whatsapp, servicio ? `Hola, quiero una cita de ${servicio} en ${c.marca.nombre}.` : `Hola, quiero pedir una cita en ${c.marca.nombre}.`)
  return (
    <div className="st-acciones">
      {wa && (
        <a href={wa} className="st-btn st-btn--primario" target="_blank" rel="noreferrer">
          <Icono n="wa" /> Escríbenos por WhatsApp
        </a>
      )}
      <Link href="/portal/citas/nueva" className={`st-btn ${wa ? 'st-btn--claro' : 'st-btn--primario'}`}>
        <Icono n="cal" /> {wa ? 'Agendar en línea' : 'Pedir cita en línea'}
      </Link>
      {!wa && c.contacto.telefono && (
        <a href={`tel:${c.contacto.telefono.replace(/\s+/g, '')}`} className="st-btn st-btn--claro">
          <Icono n="phone" /> Llamar
        </a>
      )}
      <PrimeraVez c={c} servicio={servicio} />
    </div>
  )
}

/**
 * «¿Primera vez?»: pedir cita en línea exige cuenta y ficha vinculada. Quien
 * llega por primera vez deja una solicitud en `/reservar` (nov-2026) o
 * escribe por WhatsApp con el mensaje listo.
 */
export function PrimeraVez({ c, servicio, servicioId }: { c: ContenidoSitio; servicio?: string; servicioId?: number }) {
  const liga = enlaceWhatsApp(c.contacto.whatsapp, mensajes.primeraVez(c.marca.nombre, servicio))
  return (
    <p className="st-primera">
      ¿Primera vez? <Link href={servicioId ? `/reservar?servicio=${servicioId}` : '/reservar'}>Reserva sin crear cuenta</Link>
      {liga && (
        <>
          {' '}
          o{' '}
          <a href={liga} target="_blank" rel="noreferrer">
            escríbenos por WhatsApp
          </a>
        </>
      )}
      .
    </p>
  )
}

export function Horario({ c }: { c: ContenidoSitio }) {
  return (
    <table className="st-horario">
      <tbody>
        {c.horario.map((h) => (
          <tr key={h.dia}>
            <th>{h.dia}</th>
            <td>{h.abierto ? `${h.de} – ${h.a}` : 'Cerrado'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
