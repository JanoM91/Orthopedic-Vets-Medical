import React from 'react'
import type { ClaveIcono } from '../lib/iconosServicio'

/**
 * Iconos de servicio (nov-2026): trazos de línea de 24×24, sin dependencias.
 * Componente de servidor o de cliente (no tiene estado). La clave sale de
 * `iconoDeServicio()` (lib/iconosServicio.ts) o del campo «Icono» del servicio.
 *
 * `IconoServicio` dibuja solo el trazo (hereda `currentColor`).
 * `InsigniaServicio` lo pone en un círculo con un tono por familia; el color
 * de cada familia está en el CSS de quien la usa (`.svc-insignia--<familia>`).
 */

const TRAZOS: Record<ClaveIcono, React.ReactNode> = {
  consulta: (
    <>
      <path d="M5 3v5a4 4 0 0 0 8 0V3" />
      <path d="M9 12v2.5a5.5 5.5 0 0 0 11 0V13" />
      <circle cx="20" cy="11" r="2" />
    </>
  ),
  vacuna: (
    <>
      <path d="M18 2l4 4M17 7l3-3" />
      <path d="M19 9l-9.5 9.5a2 2 0 0 1-2.8 0l-1.2-1.2a2 2 0 0 1 0-2.8L15 5" />
      <path d="M9 11l4 4M5 19l-3 3M14 4l6 6" />
    </>
  ),
  desparasitacion: (
    <>
      <path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z" />
      <path d="M8.5 8.5l7 7" />
    </>
  ),
  cirugia: (
    <>
      <path d="M3 21l6.5-6.5" />
      <path d="M9.5 14.5l8.7-8.7a2.1 2.1 0 0 1 3 3L14 16.5c-1.4 1.4-3.6 1.3-4.5-2z" />
    </>
  ),
  ortopedia: (
    <path d="M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z" />
  ),
  rehabilitacion: (
    <>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M8 21l3-6.5 3 2.5v4" />
      <path d="M11 14.5l1.5-5.5 3 3 3.5.5" />
      <path d="M12.5 9L9 10.5 7.5 14" />
    </>
  ),
  imagen: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 6.5v11M8 9.5h8M7.5 12.5h9M8.5 15.5h7" />
    </>
  ),
  ultrasonido: (
    <>
      <path d="M3 21l5-5" />
      <path d="M6.5 13.5l4 4 4-4-4-4z" />
      <path d="M14.5 7a5 5 0 0 1 2.5 2.5M16 3.8a9 9 0 0 1 4.2 4.2" />
    </>
  ),
  laboratorio: (
    <>
      <path d="M9 3h6M10 3v6l-5.6 9.6A1.6 1.6 0 0 0 5.8 21h12.4a1.6 1.6 0 0 0 1.4-2.4L14 9V3" />
      <path d="M7.3 15h9.4" />
    </>
  ),
  dental: (
    <path d="M7.5 3C5 3 3.5 5 3.5 7.5c0 3 1.5 4.5 2 7.5s1 6 2.5 6 1.5-4 2.5-5.5h3c1 1.5 1 5.5 2.5 5.5s2-3 2.5-6 2-4.5 2-7.5C20.5 5 19 3 16.5 3c-2 0-2.8 1-4.5 1s-2.5-1-4.5-1z" />
  ),
  estetica: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />
    </>
  ),
  bano: (
    <>
      <path d="M3 12h18v2.5a5.5 5.5 0 0 1-5.5 5.5h-7A5.5 5.5 0 0 1 3 14.5z" />
      <path d="M6 12V5.5a2 2 0 0 1 3.6-1.2M7 20l-1 2M17 20l1 2" />
      <circle cx="14" cy="7.5" r="1.6" />
      <circle cx="18" cy="5" r="1.1" />
      <circle cx="17.6" cy="9" r="0.9" />
    </>
  ),
  hospital: (
    <>
      <path d="M3 6v14M3 16h18v4M21 16v-3a3 3 0 0 0-3-3h-7v6" />
      <circle cx="7" cy="12" r="2" />
    </>
  ),
  urgencias: <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />,
  farmacia: (
    <>
      <rect x="8" y="2.5" width="8" height="3.5" rx="1" />
      <path d="M7 6h10v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
      <path d="M12 10.5v6M9 13.5h6" />
    </>
  ),
  nutricion: (
    <>
      <path d="M3 11h18" />
      <path d="M4.5 11l1.4 7a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6l1.4-7" />
      <circle cx="8.5" cy="7.5" r="1.3" />
      <circle cx="12" cy="6" r="1.3" />
      <circle cx="15.5" cy="7.5" r="1.3" />
    </>
  ),
  cardio: (
    <>
      <path d="M19.4 13.4L12 20.8l-7.4-7.4A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 7.4 6.8z" />
      <path d="M3 12h4.5l1.5-2.5 3 5 1.5-2.5H21" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3v5h5M9 14.5l2 2 4-4" />
    </>
  ),
  patita: (
    <>
      <circle cx="7" cy="9" r="1.8" />
      <circle cx="11" cy="6" r="1.8" />
      <circle cx="15" cy="6.5" r="1.8" />
      <circle cx="18" cy="10" r="1.8" />
      <path d="M8 16c0-2.5 2-4.5 4.5-4.5S17 13.5 17 16c0 2-1.6 3-3 3-1 0-1.5-.5-1.5-.5S12 19 11 19c-1.6 0-3-1-3-3z" />
    </>
  ),
}

/** Familia de color de cada icono (el CSS de cada app define `.svc-insignia--<familia>`). */
export const FAMILIA: Record<ClaveIcono, 'clinica' | 'diagnostico' | 'quirurgico' | 'estetica' | 'movimiento'> = {
  consulta: 'clinica',
  vacuna: 'clinica',
  desparasitacion: 'clinica',
  cardio: 'clinica',
  nutricion: 'clinica',
  farmacia: 'clinica',
  patita: 'clinica',
  imagen: 'diagnostico',
  ultrasonido: 'diagnostico',
  laboratorio: 'diagnostico',
  documento: 'diagnostico',
  cirugia: 'quirurgico',
  urgencias: 'quirurgico',
  hospital: 'quirurgico',
  estetica: 'estetica',
  bano: 'estetica',
  ortopedia: 'movimiento',
  rehabilitacion: 'movimiento',
  dental: 'movimiento',
}

export function IconoServicio({ clave, className, tamano = 24 }: { clave: ClaveIcono; className?: string; tamano?: number }) {
  return (
    <svg className={className} width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[clave] ?? TRAZOS.patita}
    </svg>
  )
}

export function InsigniaServicio({ clave, grande }: { clave: ClaveIcono; grande?: boolean }) {
  return (
    <span className={`svc-insignia svc-insignia--${FAMILIA[clave] ?? 'clinica'}${grande ? ' svc-insignia--grande' : ''}`}>
      <IconoServicio clave={clave} tamano={grande ? 28 : 22} />
    </span>
  )
}
