import Link from 'next/link'
import React from 'react'
import './barra-app.css'

/**
 * Barra de la app del cliente (UX del cliente, fase 1, nov-2026): las mismas
 * cinco pestañas en el portal, la tienda y, en el teléfono, el sitio público.
 *
 * - Tutor con sesión: Inicio · Mascotas · Citas · Tienda · Perfil.
 * - Visitante: Inicio (sitio) · Servicios · Citas · Tienda · Entrar.
 *
 * «Tienda» solo aparece con Farmacia y Tienda encendidas. Si `tienda` no se
 * pasa, se dibuja y el CSS la muestra solo cuando el layout del portal marca
 * `body[data-tienda="1"]` (así ninguna página del portal tiene que leer los
 * módulos). El sitio sí la pasa (`c.tienda`). Componente de servidor, sin estado.
 */
export type PestanaApp = 'inicio' | 'mascotas' | 'citas' | 'tienda' | 'cuenta' | 'servicios' | null

const TRAZOS: Record<string, React.ReactNode> = {
  inicio: <path d="M3 11l9-7 9 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z" />,
  mascotas: (<><circle cx="7" cy="9" r="1.8" /><circle cx="11" cy="6" r="1.8" /><circle cx="15" cy="6.5" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M8 16c0-2.5 2-4.5 4.5-4.5S17 13.5 17 16c0 2-1.6 3-3 3-1 0-1.5-.5-1.5-.5S12 19 11 19c-1.6 0-3-1-3-3z" /></>),
  citas: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  tienda: (<><path d="M5 8h14l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>),
  cuenta: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>),
  servicios: (<><path d="M5 3v5a4 4 0 0 0 8 0V3" /><path d="M9 12v2.5a5.5 5.5 0 0 0 11 0V13" /><circle cx="20" cy="11" r="2" /></>),
}

type Item = { clave: Exclude<PestanaApp, null>; href: string; icono: string; texto: string }

const TUTOR: Item[] = [
  { clave: 'inicio', href: '/portal', icono: 'inicio', texto: 'Inicio' },
  { clave: 'mascotas', href: '/portal/mascotas', icono: 'mascotas', texto: 'Mascotas' },
  { clave: 'citas', href: '/portal/citas', icono: 'citas', texto: 'Citas' },
  { clave: 'tienda', href: '/tienda', icono: 'tienda', texto: 'Tienda' },
  { clave: 'cuenta', href: '/portal/cuenta', icono: 'cuenta', texto: 'Perfil' },
]
const VISITANTE: Item[] = [
  { clave: 'inicio', href: '/', icono: 'inicio', texto: 'Inicio' },
  { clave: 'servicios', href: '/servicios', icono: 'servicios', texto: 'Servicios' },
  { clave: 'citas', href: '/portal/citas/nueva', icono: 'citas', texto: 'Citas' },
  { clave: 'tienda', href: '/tienda', icono: 'tienda', texto: 'Tienda' },
  { clave: 'cuenta', href: '/portal/entrar', icono: 'cuenta', texto: 'Entrar' },
]

export function BarraApp({ activa, modo, tienda, soloTelefono }: { activa: PestanaApp; modo: 'tutor' | 'visitante'; tienda?: boolean; soloTelefono?: boolean }) {
  const items = (modo === 'tutor' ? TUTOR : VISITANTE).filter((i) => i.clave !== 'tienda' || tienda !== false)
  return (
    <nav className={`ap-barra${soloTelefono ? ' ap-barra--telefono' : ''}`} aria-label="Secciones">
      {items.map((i) => {
        const on = activa === i.clave
        const clase = [on ? 'is-on' : '', i.clave === 'tienda' && tienda === undefined ? 'ap-barra__tienda' : ''].filter(Boolean).join(' ')
        return (
          <Link key={i.clave} href={i.href} className={clase || undefined} aria-current={on ? 'page' : undefined}>
            <span className="ap-barra__i">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {TRAZOS[i.icono]}
              </svg>
            </span>
            <span>{i.texto}</span>
          </Link>
        )
      })}
    </nav>
  )
}
