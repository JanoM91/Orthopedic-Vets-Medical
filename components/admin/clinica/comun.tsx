'use client'

/**
 * Piezas compartidas de las pantallas de la clínica (panel): llamadas a
 * /api/clinica, contexto, formatos y controles de formulario. Reutiliza los
 * estilos fz-* de Finanzas (app/(payload)/finanzas.css) y agrega los cl-*
 * (app/(payload)/clinica.css).
 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import type { CatalogoClinica } from '../../../lib/clinica/tipos'
import { enlaceWhatsApp } from '../../../lib/whatsapp'

export { Aviso, Ayuda, Icono, Pastilla, Volver } from '../finanzas/comun'

export type ContextoClinica = { catalogo: CatalogoClinica; base: string; rutaAdmin: string; recargarCatalogo: () => void }
export const ClinicaCtx = createContext<ContextoClinica | null>(null)
export function useClinica(): ContextoClinica {
  const c = useContext(ClinicaCtx)
  if (!c) throw new Error('Falta ClinicaCtx')
  return c
}

/* ───────── API ───────── */

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
async function leer<T>(r: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await r.json()
  } catch {
    data = null
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error || (r.status === 401 ? 'Tu sesión terminó. Vuelve a entrar.' : 'No se pudo completar. Revisa tu conexión e intenta de nuevo.')
    throw new ErrorApi(r.status, msg)
  }
  return data as T
}
export const api = {
  async get<T>(ruta: string, params?: Record<string, string | number | null | undefined>): Promise<T> {
    const qs = params ? Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
    const r = await fetch(`/api/clinica/${ruta}${qs ? `?${qs}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
    return leer<T>(r)
  },
  async post<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    const r = await fetch(`/api/clinica/${ruta}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    return leer<T>(r)
  },
  async subir<T>(ruta: string, archivo: File, campos: Record<string, string | boolean> = {}): Promise<T> {
    const fd = new FormData()
    fd.append('archivo', archivo)
    for (const [k, v] of Object.entries(campos)) fd.append(k, String(v))
    const r = await fetch(`/api/clinica/${ruta}`, { method: 'POST', credentials: 'same-origin', body: fd })
    return leer<T>(r)
  },
}

/** Carga con estado: datos, error y recarga. */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]): { datos: T | null; error: string | null; cargando: boolean; recargar: () => void; poner: (d: T) => void } {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    fn().then(
      (d) => {
        if (!vivo) return
        setDatos(d)
        setCargando(false)
      },
      (e) => {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar.')
        setCargando(false)
      },
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { datos, error, cargando, recargar: () => setN((x) => x + 1), poner: setDatos }
}

/* ───────── formatos ───────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fecha(iso: string | null | undefined, conAnio = true): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m) return iso
  if (!d) return `${MESES[m - 1]} ${y}`
  return `${d} ${MESES[m - 1]}${conAnio ? ' ' + y : ''}`
}
export function momento(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(iso))
  } catch {
    return iso
  }
}
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const ESPECIE_LABEL: Record<string, string> = { perro: 'Perro', gato: 'Gato', ave: 'Ave', conejo: 'Conejo', roedor: 'Roedor', reptil: 'Reptil', otra: 'Otra' }
export const SEXO_LABEL: Record<string, string> = { macho: 'Macho', hembra: 'Hembra', desconocido: 'Sexo sin registrar' }
export const ESTERIL_LABEL: Record<string, string> = { si: 'esterilizado(a)', no: 'entero(a)', desconocido: '' }
export const TIPO_CARTILLA_LABEL: Record<string, string> = { vacuna: 'Vacuna', desparasitacion_interna: 'Desparasitación interna', desparasitacion_externa: 'Desparasitación externa', otro: 'Preventivo' }
export function telefonoBonito(t: string | null): string {
  if (!t) return '—'
  return t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t
}
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '')).toUpperCase()
}
export function etiquetaDe(lista: { label: string; value: string }[], v: string): string {
  return lista.find((x) => x.value === v)?.label ?? v
}

/* ───────── controles ───────── */

export function Campo({ etiqueta, children, ayuda, ancho }: { etiqueta: React.ReactNode; children: React.ReactNode; ayuda?: React.ReactNode; ancho?: 'corto' | 'medio' }) {
  return (
    <label className={`fz-campo${ancho ? ` cl-campo--${ancho}` : ''}`}>
      <span className="fz-etiqueta">{etiqueta}</span>
      {children}
      {ayuda ? <span className="fz-chico fz-tenue">{ayuda}</span> : null}
    </label>
  )
}

export function Boton({ tono = 'claro', chico, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tono?: 'navy' | 'teal' | 'claro' | 'peligro'; chico?: boolean }) {
  return (
    <button type="button" {...rest} className={`fz-btn fz-btn--${tono}${chico ? ' fz-btn--chico' : ''}${rest.className ? ' ' + rest.className : ''}`}>
      {children}
    </button>
  )
}

/** Mensaje de error de un formulario (o nada). */
export function ErrorForm({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="fz-aviso fz-aviso--malo" role="alert">
      <div>{error}</div>
    </div>
  )
}

export function Avatar({ nombre, especie, grande }: { nombre: string; especie?: string; grande?: boolean }) {
  const tono = especie === 'gato' ? 'is-gato' : especie === 'perro' ? 'is-perro' : especie ? 'is-otra' : 'is-persona'
  return (
    <span className={`cl-avatar ${tono}${grande ? ' cl-avatar--grande' : ''}`} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  )
}

/** Fecha en un input nativo (AAAA-MM-DD). */
export function InputFecha({ valor, onChange, max, requerido }: { valor: string; onChange: (v: string) => void; max?: string; requerido?: boolean }) {
  return <input className="fz-input fz-input--fecha" type="date" value={valor} max={max} required={requerido} onChange={(e) => onChange(e.target.value)} />
}

export function Modal({ titulo, onCerrar, children, ancho }: { titulo: string; onCerrar: () => void; children: React.ReactNode; ancho?: 'ancho' }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onCerrar])
  return (
    <div className="cl-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`cl-modal${ancho ? ' cl-modal--ancho' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="fz-entre" style={{ marginBottom: 12 }}>
          <h2 className="fz-h2">{titulo}</h2>
          <button type="button" className="cl-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Botón de WhatsApp con mensaje prellenado (lib/whatsapp.ts). No envía nada:
 * abre WhatsApp con el texto listo para revisarlo y mandarlo. Sin teléfono
 * válido de 10 dígitos no se muestra.
 */
export function BotonWhatsApp({ telefono, mensaje, etiqueta = 'WhatsApp', chico = true }: { telefono: string | null | undefined; mensaje: string; etiqueta?: string; chico?: boolean }) {
  const href = enlaceWhatsApp(telefono, mensaje)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`fz-btn fz-btn--claro cl-whatsapp${chico ? ' fz-btn--chico' : ''}`} title="Abre WhatsApp con el mensaje listo para revisar y enviar">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z" />
      </svg>
      {etiqueta}
    </a>
  )
}
