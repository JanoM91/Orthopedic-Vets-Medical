/**
 * Tipos que viajan entre el servicio de la farmacia (lib/farmacia/servicio.ts),
 * la API (/api/farmacia) y las pantallas del panel. Sin dependencias.
 *
 * COSTOS: todo campo de costo es opcional en las vistas. Cuando quien pregunta
 * no tiene «Ver costos», el servicio lo omite por completo (no manda null ni 0).
 */

import type { PermisosFarmacia } from '../permisosBase'
import type { Modulos } from '../modulos'

export type PersonaBreve = { id: number; nombre: string }
export type Opcion = { label: string; value: string }

export type Grupo = 'I' | 'II' | 'III' | 'desregulado'
export type Linea = 'medicamento' | 'antiparasitario' | 'alimento' | 'dieta_prescripcion' | 'accesorio' | 'higiene' | 'suplemento'

export type PresentacionVista = {
  id: number
  productoId: number
  nombre: string
  factor: number
  precio: number
  codigoBarras: string | null
  fraccionada: boolean
  activa: boolean
}

export type ProductoVista = {
  id: number
  folio: string
  nombre: string
  principioActivo: string | null
  laboratorio: string | null
  linea: Linea
  grupo: Grupo
  registroSenasica: string | null
  especies: string[]
  pesoMinKg: number | null
  pesoMaxKg: number | null
  edadMinMeses: number | null
  alergenos: string | null
  unidadBase: string
  refrigeracion: boolean
  duracionDias: number | null
  descripcion: string | null
  imagenUrl: string | null
  publicadoTienda: boolean
  minimoInventario: number
  puntoReordenPropuesto: number | null
  puntoReordenAceptado: number | null
  proveedorPreferente: { id: number; nombre: string } | null
  activo: boolean
  notasInternas: string | null
  presentaciones: PresentacionVista[]
  /** Suma de lotes no bloqueados ni vencidos, en unidades base. */
  existencia: number
  /** Suma de todos los lotes con existencia > 0 (incluye vencidos y bloqueados). */
  existenciaFisica: number
  bajoMinimo: boolean
  creadoEn: string
  actualizadoEn: string
}

export type ProductoBreve = Pick<ProductoVista, 'id' | 'folio' | 'nombre' | 'principioActivo' | 'laboratorio' | 'linea' | 'grupo' | 'unidadBase' | 'publicadoTienda' | 'activo' | 'existencia' | 'bajoMinimo'> & {
  presentaciones: number
  precioDesde: number | null
}

export type EstadoLote = 'vigente' | 'por_vencer' | 'urgente' | 'vencido' | 'bloqueado' | 'agotado'

export type LoteVista = {
  id: number
  folio: string
  productoId: number
  productoNombre: string
  almacen: { id: number; nombre: string }
  numeroLote: string
  caducidad: string
  diasParaCaducar: number
  estado: EstadoLote
  cantidadRecibida: number
  existencia: number
  /** Solo con «Ver costos». */
  costoUnidad?: number | null
  referencia: string | null
  bloqueado: boolean
  creadoEn: string
}

export type MovimientoVista = {
  id: number
  tipo: 'compra' | 'venta' | 'ajuste' | 'merma' | 'traspaso' | 'devolucion'
  productoId: number
  productoNombre: string
  loteId: number
  loteFolio: string
  numeroLote: string
  almacen: { id: number; nombre: string }
  cantidad: number
  /** Solo con «Ver costos». */
  costoUnidad?: number | null
  dia: string
  referencia: string | null
  motivo: string | null
  usuario: PersonaBreve | null
  existenciaDespues: number | null
  creadoEn: string
}

export type AlmacenVista = { id: number; nombre: string; tipo: 'farmacia' | 'clinica' | 'sucursal'; activo: boolean }
export type ProveedorVista = {
  id: number
  nombre: string
  rfc: string | null
  diasEntrega: number
  contacto: { nombre: string | null; telefono: string | null; correo: string | null }
  notas: string | null
  activo: boolean
}

export type ConfiguracionVista = {
  caducidad: { medicamentos: number; alimento: number; otros: number; urgente: number }
  horasApartado: number
  cierreDiaActivo: boolean
  recetaGrupoIIDomicilio: boolean
  aprendizaje: { semanasHistorial: number; diasCobertura: number; diasEntregaPorOmision: number }
  promociones: { diasAntes: number; descuentoPorciento: number }[]
  politicaDevoluciones: string | null
  almacenPorOmisionId: number | null
  finanzas: { areaId: number | null; categoriaVentasId: number | null; categoriaComprasId: number | null }
  pasarelaActiva: 'ninguna' | 'mercadopago'
}

export type CatalogoFarmacia = {
  permisos: PermisosFarmacia & { superadmin: boolean; panel: boolean }
  modulos: Modulos
  usuario: PersonaBreve
  grupos: Opcion[]
  lineas: Opcion[]
  especies: Opcion[]
  tiposAlmacen: Opcion[]
  almacenes: AlmacenVista[]
  proveedores: ProveedorVista[]
  configuracion: ConfiguracionVista
  /** Finanzas: áreas y categorías para la configuración (solo con «Configurar»). */
  finanzas: { areas: { id: number; nombre: string }[]; categorias: { id: number; nombre: string; tipo: 'entrada' | 'gasto' }[] }
  totales: {
    productos: number
    productosActivos: number
    publicados: number
    lotesConExistencia: number
    lotesVencidos: number
    lotesPorVencer: number
    productosBajoMinimo: number
    /** Valor del inventario a costo, en pesos. Solo con «Ver costos». */
    valorInventario?: number
  }
  arranque: { almacenes: boolean; rolesFarmacia: boolean }
}

export type ResultadoProductos = { productos: ProductoBreve[]; total: number }

export type Inventario = {
  productos: (ProductoBreve & { lotes: LoteVista[] })[]
}

/* ───────── importación ───────── */

export const CAMPOS_IMPORTACION_PRODUCTOS = [
  { clave: 'nombre', etiqueta: 'Nombre comercial', requerido: true },
  { clave: 'principio_activo', etiqueta: 'Principio activo' },
  { clave: 'laboratorio', etiqueta: 'Laboratorio o marca' },
  { clave: 'linea', etiqueta: 'Línea: medicamento, antiparasitario, alimento, dieta de prescripción, accesorio, higiene o suplemento', requerido: true },
  { clave: 'grupo', etiqueta: 'Grupo NOM-064: I, II, III o desregulado (vacío = III para medicamentos, desregulado para lo demás)' },
  { clave: 'registro_senasica', etiqueta: 'Registro SENASICA (obligatorio en Grupo I y II)' },
  { clave: 'especies', etiqueta: 'Especies separadas por coma (perro, gato, ave, conejo, roedor, reptil, otra). Vacío = todas' },
  { clave: 'peso_min_kg', etiqueta: 'Peso mínimo en kg' },
  { clave: 'peso_max_kg', etiqueta: 'Peso máximo en kg' },
  { clave: 'edad_min_meses', etiqueta: 'Edad mínima en meses' },
  { clave: 'alergenos', etiqueta: 'Alérgenos o principios a cruzar, separados por coma' },
  { clave: 'unidad_base', etiqueta: 'Unidad base: tableta, ml, g, kg, pieza, dosis… (vacío = pieza)' },
  { clave: 'refrigeracion', etiqueta: 'Requiere refrigeración: Sí/No' },
  { clave: 'duracion_dias', etiqueta: 'Días que cubre una unidad base (p. ej. pipeta = 30)' },
  { clave: 'descripcion', etiqueta: 'Descripción para la tienda' },
  { clave: 'publicado_tienda', etiqueta: 'Publicado en la tienda: Sí/No' },
  { clave: 'minimo_inventario', etiqueta: 'Mínimo de inventario en unidades base' },
  { clave: 'proveedor', etiqueta: 'Proveedor preferente (se crea si no existe)' },
  { clave: 'presentacion', etiqueta: 'Nombre de la presentación («Caja 30 tabletas»). Una fila por presentación; repite el producto para otra', requerido: true },
  { clave: 'factor', etiqueta: 'Unidades base que contiene la presentación (vacío = 1)' },
  { clave: 'precio', etiqueta: 'Precio de venta de la presentación, MXN con IVA', requerido: true },
  { clave: 'codigo_barras', etiqueta: 'Código de barras de la presentación' },
  { clave: 'fraccionada', etiqueta: 'La presentación es venta fraccionada (unidad suelta): Sí/No' },
] as const

export type ClaveImportacionProducto = (typeof CAMPOS_IMPORTACION_PRODUCTOS)[number]['clave']

export type ResumenImportacionProductos = {
  aplicado: boolean
  filasLeidas: number
  productosNuevos: number
  productosExistentes: number
  presentacionesNuevas: number
  presentacionesExistentes: number
  proveedoresNuevos: number
  errores: { fila: number; mensaje: string }[]
  avisos: { fila: number; mensaje: string }[]
  /** Nombres de productos creados o actualizados (hasta 100). */
  productos: { folio: string | null; nombre: string; presentaciones: number; nuevo: boolean }[]
}
