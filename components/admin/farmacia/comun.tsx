'use client'

/**
 * Piezas compartidas de las pantallas de la farmacia (panel): llamadas a
 * /api/farmacia, contexto, formatos. Reutiliza los estilos fz-* de Finanzas,
 * los cl-* de la clínica y agrega los fa-* (app/(payload)/farmacia.css).
 */
import React, { createContext, useContext } from 'react'
import type { CatalogoFarmacia, EstadoLote, Grupo, Linea } from '../../../lib/farmacia/tipos'

export { Aviso, Icono, Pastilla, Volver } from '../finanzas/comun'
export { Boton, Campo, ErrorForm, fecha, InputFecha, iniciales, Modal, momento, useCarga, ErrorApi } from '../clinica/comun'

export type ContextoFarmacia = { catalogo: CatalogoFarmacia; base: string; rutaAdmin: string; recargarCatalogo: () => void }
export const FarmaciaCtx = createContext<ContextoFarmacia | null>(null)
export function useFarmacia(): ContextoFarmacia {
  const c = useContext(FarmaciaCtx)
  if (!c) throw new Error('Falta FarmaciaCtx')
  return c
}

/* ───────── API ───────── */

class ErrorApiFarmacia extends Error {
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
    throw new ErrorApiFarmacia(r.status, msg)
  }
  return data as T
}
export const api = {
  async get<T>(ruta: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    const qs = params ? Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
    const r = await fetch(`/api/farmacia/${ruta}${qs ? `?${qs}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
    return leer<T>(r)
  },
  async post<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    const r = await fetch(`/api/farmacia/${ruta}`, {
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
    const r = await fetch(`/api/farmacia/${ruta}`, { method: 'POST', credentials: 'same-origin', body: fd })
    return leer<T>(r)
  },
}

/* ───────── formatos y etiquetas ───────── */

export const LINEA_LABEL: Record<Linea, string> = {
  medicamento: 'Medicamento',
  antiparasitario: 'Antiparasitario',
  alimento: 'Alimento',
  dieta_prescripcion: 'Dieta de prescripción',
  accesorio: 'Accesorio',
  higiene: 'Higiene',
  suplemento: 'Suplemento',
}
export const GRUPO_LABEL: Record<Grupo, string> = { I: 'Grupo I · controlado', II: 'Grupo II · con receta', III: 'Grupo III · venta libre', desregulado: 'Desregulado' }
export const GRUPO_CORTO: Record<Grupo, string> = { I: 'G-I', II: 'G-II', III: 'G-III', desregulado: 'libre' }
export const ESTADO_LOTE_LABEL: Record<EstadoLote, string> = { vigente: 'Vigente', por_vencer: 'Por vencer', urgente: 'Urgente', vencido: 'Vencido', bloqueado: 'Bloqueado', agotado: 'Agotado' }
export const ESTADO_LOTE_TONO: Record<EstadoLote, 'ok' | 'aviso' | 'malo' | 'info' | 'gris'> = { vigente: 'ok', por_vencer: 'aviso', urgente: 'malo', vencido: 'malo', bloqueado: 'gris', agotado: 'gris' }

export function dinero(pesos: number | null | undefined, siempreCentavos = false): string {
  if (pesos == null || !Number.isFinite(pesos)) return '—'
  const c = Math.round(Math.abs(pesos) * 100)
  const entero = Math.floor(c / 100)
  const dec = c % 100
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${pesos < 0 ? '−' : ''}$${miles}${dec || siempreCentavos ? '.' + String(dec).padStart(2, '0') : ''}`
}

/** 12 → «12», 12.5 → «12.5», con la unidad base. */
export function cantidad(n: number | null | undefined, unidad?: string): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const txt = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)
  return unidad ? `${txt} ${unidad}${Math.abs(n) === 1 ? '' : plural(unidad)}` : txt
}
function plural(unidad: string): string {
  if (/[aeiou]$/i.test(unidad)) return 's'
  if (/(ml|g|kg|mg|l)$/i.test(unidad)) return ''
  return 'es'
}

export function GrupoPastilla({ grupo }: { grupo: Grupo }) {
  const tono = grupo === 'I' ? 'malo' : grupo === 'II' ? 'aviso' : grupo === 'III' ? 'ok' : 'gris'
  return (
    <span className={`fz-pill fz-pill--${tono}`} title={GRUPO_LABEL[grupo]}>
      {GRUPO_CORTO[grupo]}
    </span>
  )
}

export function Select({ valor, onChange, children, ancho }: { valor: string; onChange: (v: string) => void; children: React.ReactNode; ancho?: 'auto' }) {
  return (
    <select className={`fz-input${ancho ? ' fz-input--compacto' : ''}`} value={valor} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="cl-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export const hoyISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
