import type { Payload, PayloadRequest } from 'payload'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Módulos activables de la instalación (octubre de 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Decisión de Jano (25-oct-2026): la misma app sirve a una clínica con
 * farmacia y a una farmacia veterinaria sin clínica. Qué módulos están
 * encendidos se guarda en el global `instalacion-configuracion`
 * (collections/Instalacion.ts), editable solo por el superadministrador.
 *
 *   - Finanzas: siempre activo (es la base de todo).
 *   - Clínica:  pacientes, expediente, agenda, portal del tutor con expediente.
 *   - Farmacia: catálogo, inventario, compras, ventas.
 *   - Tienda:   tienda digital para tutores (fase 5; hoy solo se guarda la casilla).
 *
 * Apagar un módulo NO borra datos: oculta sus rutas, menús, colecciones y
 * API. Las reglas de acceso de cada módulo llaman a `moduloActivo(req, …)`,
 * que lee el global una sola vez por petición (memoria en `req.context`).
 */

export type Modulo = 'clinica' | 'farmacia' | 'tienda'
export type Modulos = Record<Modulo, boolean>

/** Qué hay encendido cuando el global nunca se ha guardado. */
export const MODULOS_POR_OMISION: Modulos = { clinica: true, farmacia: true, tienda: false }

const MEMO = '__modulosMx'

function normalizar(doc: unknown): Modulos {
  const m = ((doc as { modulos?: Partial<Record<Modulo, boolean | null>> } | null)?.modulos ?? {}) as Partial<Record<Modulo, boolean | null>>
  return {
    clinica: m.clinica == null ? MODULOS_POR_OMISION.clinica : Boolean(m.clinica),
    farmacia: m.farmacia == null ? MODULOS_POR_OMISION.farmacia : Boolean(m.farmacia),
    tienda: m.tienda == null ? MODULOS_POR_OMISION.tienda : Boolean(m.tienda),
  }
}

/** Módulos activos leyendo el global (sin memoria por petición). */
export async function leerModulos(payload: Payload): Promise<Modulos> {
  try {
    const doc = await payload.findGlobal({ slug: 'instalacion-configuracion', depth: 0, overrideAccess: true })
    return normalizar(doc)
  } catch {
    /* Antes de aplicar la migración (o en una base recién creada) el global no existe: lo de fábrica. */
    return { ...MODULOS_POR_OMISION }
  }
}

/** Módulos activos, memorizados por petición (las reglas de acceso se evalúan muchas veces por página). */
export async function modulosDe(req: PayloadRequest): Promise<Modulos> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  const memo = ctx[MEMO] as Modulos | undefined
  if (memo) return memo
  const m = await leerModulos(req.payload)
  ctx[MEMO] = m
  if (!req.context) (req as { context: unknown }).context = ctx
  return m
}

export async function moduloActivo(req: PayloadRequest, modulo: Modulo): Promise<boolean> {
  return (await modulosDe(req))[modulo]
}
