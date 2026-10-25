/**
 * Roles sugeridos de la farmacia (docs/FARMACIA-PROMPT.md → Permisos). Sin
 * dependencias: lo usan lib/farmacia/servicio.ts y lib/finanzas/servicio.ts
 * (arranque «Crear los sugeridos») sin importarse entre sí.
 */

export type RolSugeridoFarmacia = {
  nombre: string
  descripcion: string
  panel: { acceso: boolean; gestionarUsuarios: boolean }
  finanzas: Record<string, boolean | string>
  clinica: Record<string, boolean>
  farmacia: Record<string, boolean>
}

const SIN_CLINICA = { verPacientes: false, editarPacientes: false, verExpediente: false, escribirExpediente: false, importar: false, agenda: false, configurarAgenda: false }
export const FARMACIA_ENCARGADO = { vender: true, verCostos: true, descuentos: true, catalogo: true, recibirCompras: true, ajustes: true, recetas: true, aprobar: true, asignarRepartidor: true, entregas: false, cierreDia: true, reportes: true, configurar: false }
export const FARMACIA_VENDEDOR = { vender: true, verCostos: false, descuentos: false, catalogo: false, recibirCompras: false, ajustes: false, recetas: false, aprobar: false, asignarRepartidor: false, entregas: false, cierreDia: true, reportes: false, configurar: false }
export const FARMACIA_REPARTIDOR = { vender: false, verCostos: false, descuentos: false, catalogo: false, recibirCompras: false, ajustes: false, recetas: false, aprobar: false, asignarRepartidor: false, entregas: true, cierreDia: false, reportes: false, configurar: false }
export const FARMACIA_TODO = { ...FARMACIA_ENCARGADO, entregas: true, configurar: true }

/** Roles propios de la farmacia (docs/FARMACIA-PROMPT.md → Permisos). Dueño y Administración ya existen en Finanzas → arranque. */
export const ROLES_FARMACIA: RolSugeridoFarmacia[] = [
  {
    nombre: 'Encargado de farmacia',
    descripcion: 'Catálogo, compras, inventario, recetas, descuentos y reportes de la farmacia; registra ventas en Finanzas',
    panel: { acceso: false, gestionarUsuarios: false },
    finanzas: { registrar: true, ver: 'propios' },
    clinica: { ...SIN_CLINICA },
    farmacia: { ...FARMACIA_ENCARGADO },
  },
  {
    nombre: 'Vendedor de mostrador',
    descripcion: 'Vende en mostrador y prepara pedidos; no ve costos ni aplica descuentos',
    panel: { acceso: false, gestionarUsuarios: false },
    finanzas: {},
    clinica: { ...SIN_CLINICA },
    farmacia: { ...FARMACIA_VENDEDOR },
  },
  {
    nombre: 'Repartidor',
    descripcion: 'Solo ve sus entregas del día y las marca entregadas; no maneja dinero',
    panel: { acceso: false, gestionarUsuarios: false },
    finanzas: {},
    clinica: { ...SIN_CLINICA },
    farmacia: { ...FARMACIA_REPARTIDOR },
  },
]

