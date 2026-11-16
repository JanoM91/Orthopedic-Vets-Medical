'use client'

import { Link, useNav, useWindowInfo } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React, { useEffect } from 'react'

export type EnlaceTrabajo = {
  clave: 'hoy' | 'agenda' | 'estetica' | 'pacientes' | 'mostrador' | 'farmacia' | 'finanzas'
  texto: string
  href: string
  /** Alertas abiertas de farmacia (solo se muestra si hay). */
  contador?: number
}

/* Trazos de 24×24 (mismo estilo que los iconos de las apps: línea de 2 px). */
const TRAZOS: Record<EnlaceTrabajo['clave'], React.ReactNode> = {
  hoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  estetica: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />
    </>
  ),
  pacientes: (
    <>
      <circle cx="7" cy="8" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="17" cy="8" r="2" />
      <path d="M12 11c-3.5 0-6 2.6-6 5.2 0 1.6 1.2 2.8 2.8 2.8 1.2 0 2-.6 3.2-.6s2 .6 3.2.6c1.6 0 2.8-1.2 2.8-2.8C18 13.6 15.5 11 12 11z" />
    </>
  ),
  mostrador: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  farmacia: (
    <>
      <rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-45 12 12.5)" />
      <path d="M9.5 15l5-5" />
    </>
  ),
  finanzas: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
}

/** ¿La ruta actual cae dentro de `href` (mismo segmento, no solo mismo prefijo)? */
function dentro(ruta: string, href: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`)
}

/* Payload cierra el menú lateral entre 1025 y 1440 px (laptops comunes) en cada
   carga y lo deja abierto solo arriba de 1440. Desde la UX del panel 3
   (nov-2026), cerrado ya no desaparece: queda el riel de iconos de 72 px
   (tema-clinico.css, «Riel del menú»), que se despliega al pasar el cursor.
   En ese rango el menú arranca como riel y se abre al cargar solo si la
   persona lo fijó abierto con el botón en esta pestaña (sessionStorage).
   En teléfono y tableta (≤ 1024 px) el menú sigue siendo el panel que se
   abre con el botón. */
const RANGO_LAPTOP = '(min-width: 1025px) and (max-width: 1440px)'
const CLAVE_ABIERTO = 'ovm-menu-fijo'
const enRango = () => typeof window !== 'undefined' && window.matchMedia(RANGO_LAPTOP).matches
function leerFijo(): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE_ABIERTO) === '1'
  } catch {
    return false
  }
}
function guardarFijo(fijo: boolean) {
  try {
    if (fijo) window.sessionStorage.setItem(CLAVE_ABIERTO, '1')
    else window.sessionStorage.removeItem(CLAVE_ABIERTO)
  } catch {
    /* sin almacenamiento (modo privado): no se recuerda */
  }
}

/* Payload marca el menú cerrado con `inert` (no se puede tocar ni enfocar). En el
   riel (≥ 1025 px) el menú cerrado sí se usa, así que se le quita; en teléfono y
   tableta se deja, porque ahí el menú cerrado está fuera de la pantalla. */
const RIEL = '(min-width: 1025px)'
function useRielUsable() {
  useEffect(() => {
    const nav = document.querySelector('aside.nav')
    if (!nav) return
    const mq = window.matchMedia(RIEL)
    const ajustar = () => {
      const abierto = nav.classList.contains('nav--nav-open')
      if (mq.matches && !abierto && nav.hasAttribute('inert')) nav.removeAttribute('inert')
      else if (!mq.matches && !abierto && !nav.hasAttribute('inert')) nav.setAttribute('inert', '')
    }
    ajustar()
    const obs = new MutationObserver(ajustar)
    obs.observe(nav, { attributes: true, attributeFilter: ['inert', 'class'] })
    mq.addEventListener('change', ajustar)
    return () => {
      obs.disconnect()
      mq.removeEventListener('change', ajustar)
    }
  }, [])
}

function useMenuEnLaptop() {
  const { hydrated, setNavOpen } = useNav()
  const { breakpoints } = useWindowInfo()
  const l = breakpoints?.l
  const m = breakpoints?.m
  /* Payload cierra el menú en su propio efecto cada vez que mide la ventana; se abre
     en el turno siguiente para que su cierre no lo pise. */
  useEffect(() => {
    if (!hydrated || !enRango() || !leerFijo()) return
    const t = window.setTimeout(() => setNavOpen(true), 0)
    return () => window.clearTimeout(t)
  }, [hydrated, l, m, setNavOpen])
  /* Solo el botón del menú cuenta como decisión de la persona (no los cierres que hace Payload). */
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      const boton = e.target instanceof Element ? e.target.closest('.nav-toggler') : null
      if (!boton || !enRango()) return
      window.setTimeout(() => guardarFijo(Boolean(document.querySelector('.template-default--nav-open'))), 50)
    }
    document.addEventListener('click', alClic, true)
    return () => document.removeEventListener('click', alClic, true)
  }, [])
}

/**
 * Parte cliente del bloque «Trabajo» (components/admin/MenuTrabajo.tsx).
 * Marca como activo el enlace más específico que contiene la ruta actual:
 * en /admin/clinica/agenda gana «Agenda» sobre «Pacientes», y en
 * /admin/farmacia/vender gana «Mostrador» sobre «Farmacia». «Hoy» solo se
 * marca en el tablero mismo.
 */
export default function MenuTrabajoEnlaces({ enlaces, rutaAdmin }: { enlaces: EnlaceTrabajo[]; rutaAdmin: string }) {
  useMenuEnLaptop()
  useRielUsable()
  const ruta = (usePathname() || '').replace(/\/+$/, '') || '/'
  const raiz = rutaAdmin.replace(/\/+$/, '')
  let activo: EnlaceTrabajo | null = null
  for (const e of enlaces) {
    const coincide = e.clave === 'hoy' ? ruta === raiz : dentro(ruta, e.href)
    if (coincide && (!activo || e.href.length > activo.href.length)) activo = e
  }
  return (
    <nav className="mx-trabajo" aria-label="Trabajo">
      <div className="mx-nav-etiqueta">Trabajo</div>
      {enlaces.map((e) => {
        const on = activo?.clave === e.clave
        return (
          <Link key={e.clave} className={`nav__link mx-trabajo__link${on ? ' active' : ''}`} href={e.href} aria-current={on ? 'page' : undefined} aria-label={e.contador ? `${e.texto}, ${e.contador} alertas abiertas` : e.texto} prefetch={false}>
            <svg aria-hidden="true" className="mx-trabajo__ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {TRAZOS[e.clave]}
            </svg>
            <span className="nav__link-label">{e.texto}</span>
            {e.contador ? (
              <span className="mx-trabajo__n" aria-label={`${e.contador} alertas abiertas`}>
                {e.contador > 99 ? '99+' : e.contador}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
