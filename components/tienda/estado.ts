'use client'

import { useSyncExternalStore } from 'react'
import type { PerfilCompra } from '../../lib/farmacia/tiposTienda'

/**
 * Carrito y «¿Para quién compras?» de la tienda, guardados en este navegador
 * (localStorage, con respaldo en memoria si está bloqueado). No es fuente de
 * verdad: precios, existencia, receta y compatibilidad se vuelven a revisar en
 * el servidor al crear el pedido.
 */

export type RenglonCarrito = {
  presentacionId: number
  productoId: number
  producto: string
  presentacion: string
  precio: number
  cantidad: number
  fraccionada: boolean
  requiereReceta: boolean
  imagenUrl: string | null
}

export type PerfilGuardado = (PerfilCompra & { etiqueta: string }) | null

/** Pedidos hechos desde este navegador (para el invitado sin cuenta: su liga de seguimiento). */
export type PedidoGuardado = { folio: string; token: string; fecha: string; total: number }

type Estado = { carrito: RenglonCarrito[]; perfil: PerfilGuardado; pedidos: PedidoGuardado[] }

const LLAVE = 'ovm-tienda-v1'
const VACIO: Estado = { carrito: [], perfil: null, pedidos: [] }
let memoria: Estado = VACIO
let cargado = false
const oyentes = new Set<() => void>()

function leer(): Estado {
  if (cargado) return memoria
  cargado = true
  try {
    const d = JSON.parse(window.localStorage.getItem(LLAVE) || 'null') as Estado | null
    if (d && Array.isArray(d.carrito)) memoria = { carrito: d.carrito.filter((r) => r && r.presentacionId && r.cantidad > 0), perfil: d.perfil ?? null, pedidos: Array.isArray(d.pedidos) ? d.pedidos.slice(0, 10) : [] }
  } catch {
    /* almacenamiento bloqueado: se queda en memoria */
  }
  return memoria
}

function escribir(n: Estado) {
  memoria = n
  try {
    window.localStorage.setItem(LLAVE, JSON.stringify(n))
  } catch {
    /* sin almacenamiento: solo memoria */
  }
  oyentes.forEach((f) => f())
}

function suscribir(f: () => void) {
  oyentes.add(f)
  const alCambiar = (e: StorageEvent) => {
    if (e.key === LLAVE) {
      cargado = false
      leer()
      f()
    }
  }
  window.addEventListener('storage', alCambiar)
  return () => {
    oyentes.delete(f)
    window.removeEventListener('storage', alCambiar)
  }
}

export function useTienda(): Estado {
  return useSyncExternalStore(suscribir, leer, () => VACIO)
}

export const tienda = {
  agregar(r: Omit<RenglonCarrito, 'cantidad'>, cantidad = 1) {
    const e = leer()
    const ya = e.carrito.find((x) => x.presentacionId === r.presentacionId)
    const carrito = ya ? e.carrito.map((x) => (x.presentacionId === r.presentacionId ? { ...x, ...r, cantidad: Math.min(100, x.cantidad + cantidad) } : x)) : [...e.carrito, { ...r, cantidad }]
    escribir({ ...e, carrito })
  },
  cantidad(presentacionId: number, cantidad: number) {
    const e = leer()
    escribir({ ...e, carrito: cantidad <= 0 ? e.carrito.filter((x) => x.presentacionId !== presentacionId) : e.carrito.map((x) => (x.presentacionId === presentacionId ? { ...x, cantidad: Math.min(100, cantidad) } : x)) })
  },
  quitar(presentacionId: number) {
    const e = leer()
    escribir({ ...e, carrito: e.carrito.filter((x) => x.presentacionId !== presentacionId) })
  },
  vaciar() {
    escribir({ ...leer(), carrito: [] })
  },
  perfil(p: PerfilGuardado) {
    escribir({ ...leer(), perfil: p })
  },
  /** Pedido creado: se vacía el carrito y se guarda su liga (máximo 10). */
  pedidoHecho(p: PedidoGuardado) {
    const e = leer()
    escribir({ ...e, carrito: [], pedidos: [p, ...e.pedidos.filter((x) => x.folio !== p.folio)].slice(0, 10) })
  },
}

export const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Parámetros de consulta del perfil para la API (?mascota= o ?especie=&peso=). */
export function consultaPerfil(p: PerfilGuardado): string {
  if (!p) return ''
  if ('mascotaId' in p) return `mascota=${p.mascotaId}`
  return `especie=${encodeURIComponent(p.especie)}${p.pesoKg ? `&peso=${p.pesoKg}` : ''}`
}

export function perfilParaApi(p: PerfilGuardado): PerfilCompra | null {
  if (!p) return null
  if ('mascotaId' in p) return { mascotaId: p.mascotaId }
  return { especie: p.especie, pesoKg: p.pesoKg }
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/tienda/${ruta}`, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const d = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(d.error || 'No se pudo completar. Intenta de nuevo.')
  return d
}
