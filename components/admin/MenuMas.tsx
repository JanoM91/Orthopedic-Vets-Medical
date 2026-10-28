'use client'

import Link from 'next/link'
import React, { useEffect, useRef } from 'react'

/**
 * «Más ▾» al final de una barra de secciones: guarda las pantallas que se usan
 * poco para que la barra quepa sin desplazarse. Si la pantalla activa está
 * aquí adentro, el botón muestra su nombre.
 */
export function MenuMas({ opciones }: { opciones: { href: string; on: boolean; texto: string; extra?: React.ReactNode }[] }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const activa = opciones.find((o) => o.on)
  useEffect(() => {
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      const el = ref.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('click', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('click', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [])
  return (
    <details ref={ref} className={`fz-mas${activa ? ' is-on' : ''}`}>
      <summary>{activa ? activa.texto : 'Más'}</summary>
      <div className="fz-mas__menu" role="menu">
        {opciones.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            role="menuitem"
            className={o.on ? 'is-on' : ''}
            onClick={() => {
              if (ref.current) ref.current.open = false
            }}
          >
            {o.texto}
            {o.extra}
          </Link>
        ))}
      </div>
    </details>
  )
}
