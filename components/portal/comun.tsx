import Link from 'next/link'
import React from 'react'
import { diaLocal } from '../../lib/localTime'
import { site } from '../../lib/site'
import { enlaceWhatsApp, mensajes } from '../../lib/whatsapp'
import { BarraApp } from '../app/BarraApp'

/* ───────── piezas de servidor (sin estado) ───────── */

const TRAZOS: Record<string, React.ReactNode> = {
  inicio: <path d="M3 11l9-7 9 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z" />,
  paw: (<><circle cx="7" cy="9" r="1.8" /><circle cx="11" cy="6" r="1.8" /><circle cx="15" cy="6.5" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M8 16c0-2.5 2-4.5 4.5-4.5S17 13.5 17 16c0 2-1.6 3-3 3-1 0-1.5-.5-1.5-.5S12 19 11 19c-1.6 0-3-1-3-3z" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  shield: (<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  file: (<><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  alerta: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4.2M12 17.2h.01" /></>),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  calmas: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  servicios: (<><path d="M5 3v5a4 4 0 0 0 8 0V3" /><path d="M9 12v2.5a5.5 5.5 0 0 0 11 0V13" /><circle cx="20" cy="11" r="2" /></>),
  camara: (<><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>),
  reloj: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  ubicacion: (<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sol: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></>),
  luna: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  camion: (<><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  bolsa: (<><path d="M5 8h14l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>),
  frasco: (<><rect x="7" y="7" width="10" height="14" rx="2" /><path d="M8 3h8v4H8zM7 12h10M12 14.5v4M10 16.5h4" /></>),
  carrito: (<><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /><path d="M3 4h2.5l2.2 11h10.6l2-8H6.4" /></>),
  buscar: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  receta: (<><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 11h3a2 2 0 0 1 0 4H9v-4zM9 15v3M12 15l3 3" /></>),
  wa: (<><path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z" /><path d="M9.5 9.5c0 3 2 5 5 5l1.2-1.2-1.8-.9-.8.8c-1-.4-1.8-1.2-2.2-2.2l.8-.8-.9-1.8z" /></>),
}
export function Icono({ n }: { n: string }) {
  return (
    <svg className="pt-i" viewBox="0 0 24 24" aria-hidden="true">
      {TRAZOS[n] ?? null}
    </svg>
  )
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m) return iso
  if (!d) return `${MESES[m - 1]} ${y}`
  return `${d} ${MESES[m - 1]} ${y}`
}
export const ESPECIE_LABEL: Record<string, string> = { perro: 'Perro', gato: 'Gato', ave: 'Ave', conejo: 'Conejo', roedor: 'Roedor', reptil: 'Reptil', otra: 'Otra' }
export const TIPO_CARTILLA_LABEL: Record<string, string> = { vacuna: 'Vacuna', desparasitacion_interna: 'Desparasitación interna', desparasitacion_externa: 'Desparasitación externa', otro: 'Preventivo' }
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  return p.length ? ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] ?? '' : '')).toUpperCase() : '?'
}
/** «Hoy» como AAAA-MM-DD en la zona del negocio (no en UTC: después de las 18:00 en México ya sería mañana). */
export function hoyISO(): string {
  return diaLocal(new Date())
}

/** Foto de la mascota o, si no hay, sus iniciales sobre el color de su especie. */
export function Avatar({ nombre, especie, grande, foto }: { nombre: string; especie?: string; grande?: boolean; foto?: string | null }) {
  const clase = `pt-avatar${especie === 'perro' ? ' is-perro' : especie === 'gato' ? ' is-gato' : ''}${grande ? ' pt-avatar--grande' : ''}`
  if (foto)
    return (
      <span className={`${clase} pt-avatar--foto`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt={nombre} loading="lazy" decoding="async" />
      </span>
    )
  return <span className={clase}>{iniciales(nombre)}</span>
}

export function Pill({ tono, children }: { tono: 'ok' | 'warn' | 'bad' | 'info' | 'gris'; children: React.ReactNode }) {
  return <span className={`pt-pill pt-pill--${tono}`}>{children}</span>
}

/** Encabezado con marca y, si hay sesión, el nombre y «Salir». */
export function Cabecera({ nombre }: { nombre?: string }) {
  return (
    <header className="pt-cabecera">
      <Link href="/portal" className="pt-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={site.brand.logoClaro} alt="" />
        <span>{site.brand.name}</span>
      </Link>
      <span className="pt-cabecera__der">
        {nombre ? (
          <Link href="/portal/cuenta" aria-label="Mi cuenta" className="pt-cabecera__perfil">
            {iniciales(nombre)}
          </Link>
        ) : null}
      </span>
    </header>
  )
}

/**
 * Barra inferior del portal = la barra de la app del cliente (components/app/BarraApp.tsx),
 * en modo tutor. «Tienda» lleva a /tienda y solo se ve con la tienda encendida
 * (body[data-tienda="1"] del layout). Portal → Farmacia (mis pedidos) marca «Tienda».
 */
export function Barra({ activa, avisoTienda }: { activa: 'inicio' | 'mascotas' | 'citas' | 'farmacia' | 'cuenta'; avisoTienda?: number }) {
  return <BarraApp modo="tutor" activa={activa === 'farmacia' ? 'tienda' : activa} avisoTienda={avisoTienda} />
}

export function GraficaPeso({ pesos }: { pesos: { fecha: string; kg: number }[] }) {
  if (!pesos.length) return <p className="pt-tenue">Sin registros de peso todavía.</p>
  const serie = pesos.slice().reverse().slice(-24)
  const kgs = serie.map((p) => p.kg)
  const min = Math.min(...kgs), max = Math.max(...kgs), rango = max - min || 1
  const W = 320, H = 80, pad = 8
  const pts = serie.map((p, i) => [pad + (i * (W - 2 * pad)) / Math.max(1, serie.length - 1), H - pad - ((p.kg - min) / rango) * (H - 2 * pad)] as const)
  const ultimo = serie[serie.length - 1]
  return (
    <div>
      <p>
        <b style={{ fontSize: 22 }}>{ultimo.kg} kg</b> <span className="pt-tenue pt-chico">{fecha(ultimo.fecha)}</span>
      </p>
      {serie.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="pt-grafica" role="img" aria-label={`Peso: de ${serie[0].kg} kg a ${ultimo.kg} kg`}>
          <polyline fill="none" stroke="var(--pt-accent)" strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
          {pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--pt-primary)" />
          ))}
        </svg>
      )}
    </div>
  )
}

/** «¿Duda o urgencia?»: WhatsApp con mensaje listo y teléfono de la clínica (NEXT_PUBLIC_BRAND_PHONE). Sin teléfono no se muestra. */
export function TarjetaContacto({ mascota, contacto }: { mascota?: string | null; contacto: { telefono: string | null; whatsapp: string | null; urgencias?: string | null } }) {
  const tel = contacto.telefono
  const wa = enlaceWhatsApp(contacto.whatsapp, mensajes.aLaClinica(mascota))
  if (!tel && !wa) return null
  return (
    <div className="pt-card pt-contacto">
      <h2>¿Duda o urgencia?</h2>
      <p className="pt-chico pt-tenue">Escríbenos o llámanos. Si es una urgencia, llama directamente.</p>
      {contacto.urgencias && <p className="pt-chico">Urgencias: {contacto.urgencias}</p>}
      <div className="pt-acciones">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="pt-btn pt-btn--acento">
            WhatsApp
          </a>
        )}
        {tel && (
          <a href={`tel:${tel.replace(/[^\d+]/g, '')}`} className="pt-btn">
            Llamar {tel}
          </a>
        )}
      </div>
    </div>
  )
}

/** Salida por WhatsApp (nov-2026) para quien aún no puede pedir cita en el portal: primera vez o sin código de vinculación. Sin WhatsApp configurado no se muestra. */
export function SalidaWhatsApp({ whatsapp, motivo }: { whatsapp: string | null; motivo: 'primera' | 'codigo' }) {
  const liga = enlaceWhatsApp(whatsapp, motivo === 'primera' ? mensajes.primeraVez(site.brand.name) : mensajes.codigoPortal(site.brand.name))
  if (!liga) return null
  return (
    <a href={liga} target="_blank" rel="noreferrer" className="pt-primera">
      <span className="pt-primera__icono">
        <Icono n="wa" />
      </span>
      <span className="pt-primera__texto">
        <b>{motivo === 'primera' ? '¿Aún no eres cliente?' : '¿No tienes tu código?'}</b>
        <span>{motivo === 'primera' ? 'Escríbenos por WhatsApp y te agendamos.' : 'Pídelo por WhatsApp y te lo enviamos.'}</span>
      </span>
    </a>
  )
}
