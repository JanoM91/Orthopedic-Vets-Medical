import Link from 'next/link'
import React from 'react'
import { site } from '../../lib/site'

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
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
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
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function Avatar({ nombre, especie, grande }: { nombre: string; especie?: string; grande?: boolean }) {
  return <span className={`pt-avatar${especie === 'perro' ? ' is-perro' : especie === 'gato' ? ' is-gato' : ''}${grande ? ' pt-avatar--grande' : ''}`}>{iniciales(nombre)}</span>
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
        <img src={site.brand.logo} alt="" />
        <span>{site.brand.name}</span>
      </Link>
      <span className="pt-cabecera__der">
        {nombre ? (
          <Link href="/portal/cuenta" aria-label="Mi cuenta">
            {iniciales(nombre)}
          </Link>
        ) : null}
      </span>
    </header>
  )
}

export function Barra({ activa }: { activa: 'inicio' | 'mascotas' | 'cuenta' }) {
  const items: [typeof activa, string, string, string][] = [
    ['inicio', '/portal', 'inicio', 'Inicio'],
    ['mascotas', '/portal#mascotas', 'paw', 'Mascotas'],
    ['cuenta', '/portal/cuenta', 'user', 'Mi cuenta'],
  ]
  return (
    <nav className="pt-barra" aria-label="Secciones">
      {items.map(([k, href, ic, l]) => (
        <Link key={k} href={href} className={activa === k ? 'is-on' : ''} aria-current={activa === k ? 'page' : undefined}>
          <Icono n={ic} />
          <span>{l}</span>
        </Link>
      ))}
    </nav>
  )
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
