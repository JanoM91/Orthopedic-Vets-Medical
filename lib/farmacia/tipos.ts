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
  aprendizaje: { semanasHistorial: number; diasCobertura: number; diasEntregaPorOmision: number; diasSinRotacion: number }
  /** Correos extra para el resumen diario de alertas (además de quien tiene «Reportes»). */
  correosAlertas: string | null
  promociones: { diasAntes: number; descuentoPorciento: number }[]
  politicaDevoluciones: string | null
  almacenPorOmisionId: number | null
  finanzas: { areaId: number | null; categoriaVentasId: number | null; categoriaComprasId: number | null }
  pasarelaActiva: 'ninguna' | 'mercadopago'
  exigirOriginalGrupoII: boolean
  metodosPago: MetodoPagoVista[]
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
  /** Finanzas: áreas y categorías para la configuración (solo con «Configurar»); cuentas para pagar compras (con «Recibir compras»). */
  finanzas: { areas: { id: number; nombre: string }[]; categorias: { id: number; nombre: string; tipo: 'entrada' | 'gasto' }[]; cuentas: CuentaFinanzasBreve[] }
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
  /** Cifras de hoy (fase 3): ventas, recetas, cierre. */
  hoy: ResumenHoy
  /** ¿Está encendida la clínica? (expediente, recetas internas, mascotas). */
  clinica: boolean
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

/* ───────── compras (fase 2) ───────── */

export type RenglonCompraVista = {
  id: string | null
  claveProveedor: string | null
  descripcion: string | null
  presentacionId: number | null
  presentacionNombre: string | null
  productoId: number | null
  productoNombre: string | null
  unidadBase: string | null
  factor: number | null
  cantidad: number
  /** Solo con «Ver costos». */
  valorUnitario?: number | null
  importe?: number | null
  costoUnidadBase?: number | null
  numeroLote: string | null
  caducidad: string | null
  loteId: number | null
  /** Sugerencia de clave aprendida (cuando el renglón llegó sin presentación). */
  sugerida: boolean
}

export type CompraVista = {
  id: number
  folio: string
  estado: 'borrador' | 'recibida' | 'anulada'
  origen: 'xml' | 'manual'
  proveedor: { id: number; nombre: string; rfc: string | null }
  almacen: { id: number; nombre: string } | null
  fecha: string
  serieFactura: string | null
  folioFactura: string | null
  uuid: string | null
  tieneXml: boolean
  renglones: RenglonCompraVista[]
  /** Solo con «Ver costos». */
  subtotal?: number | null
  iva?: number | null
  total?: number | null
  condicion: 'contado' | 'credito'
  cuentaId: number | null
  venceEl: string | null
  gastoFinanzasId: number | null
  gastoFolio: string | null
  notas: string | null
  capturadaPor: PersonaBreve | null
  recibidaPor: PersonaBreve | null
  recibidaEn: string | null
  anuladaPor: PersonaBreve | null
  anuladaEn: string | null
  motivoAnulacion: string | null
  /** Qué falta para poder recibir (vacío = lista). */
  faltantes: string[]
  creadoEn: string
}

export type CompraBreve = Pick<CompraVista, 'id' | 'folio' | 'estado' | 'origen' | 'proveedor' | 'fecha' | 'folioFactura' | 'condicion' | 'creadoEn'> & { renglones: number; total?: number | null; gastoFolio: string | null }

export type CuentaFinanzasBreve = { id: number; nombre: string; tipo: string }

/** Lo que trae el XML antes de guardarlo (para mostrar y confirmar). */
export type CfdiLeido = {
  version: string
  emisor: { rfc: string; nombre: string | null }
  receptorRfc: string | null
  serie: string | null
  folio: string | null
  fecha: string
  uuid: string | null
  subtotal: number
  iva: number
  total: number
  conceptos: { clave: string | null; descripcion: string; cantidad: number; unidad: string | null; valorUnitario: number; importe: number }[]
  avisos: string[]
}

/* ───────── conteo físico (fase 2) ───────── */

export type RenglonConteo = {
  loteId: number
  loteFolio: string
  numeroLote: string
  caducidad: string
  estado: EstadoLote
  productoId: number
  productoNombre: string
  unidadBase: string
  almacen: { id: number; nombre: string }
  existencia: number
}

export type ResultadoConteo = {
  ajustes: { loteId: number; productoNombre: string; numeroLote: string; antes: number; contado: number; diferencia: number }[]
  sinCambio: number
}

/* ───────── venta de mostrador y recetas (fase 3) ───────── */

export type MetodoPagoVista = { clave: string; nombre: string; tipo: 'efectivo' | 'terminal' | 'transferencia' | 'otro'; cuentaId: number | null; porConfirmar: boolean; activo: boolean }

export type RenglonRecetaVista = {
  id: string | null
  productoId: number | null
  productoNombre: string | null
  principio: string | null
  dosis: string | null
  frecuencia: string | null
  duracion: string | null
  surtidosPermitidos: number
  surtidosUsados: number
}

export type EstadoReceta = 'borrador' | 'por_validar' | 'valida' | 'rechazada' | 'cancelada'

export type RecetaVista = {
  id: number
  folio: string
  origen: 'interna' | 'externa'
  estado: EstadoReceta
  /** Válida y dentro de su vigencia. */
  vigente: boolean
  mascota: { id: number; folio: string; nombre: string; especie: string } | null
  cliente: { id: number; nombre: string; email: string | null } | null
  pacienteTexto: string | null
  notaId: number | null
  mvzNombre: string
  mvzCedula: string | null
  fechaEmision: string
  vigenteHasta: string
  folioCuantificado: string | null
  pesoKg: number | null
  indicaciones: string | null
  renglones: RenglonRecetaVista[]
  tieneArchivo: boolean
  firmadaPor: PersonaBreve | null
  firmadaEn: string | null
  validadaPor: PersonaBreve | null
  validadaEn: string | null
  motivoRechazo: string | null
  originalRecibido: boolean
  originalRecibidoPor: PersonaBreve | null
  originalRecibidoEn: string | null
  capturadaPor: PersonaBreve | null
  creadoEn: string
}

export type PacienteVenta = {
  mascotaId: number
  folio: string
  nombre: string
  especie: string
  raza: string | null
  edadMeses: number | null
  pesoKg: number | null
  pesoFecha: string | null
  /** Días desde el último peso (null sin peso). */
  pesoDias: number | null
  alergias: string | null
  cliente: { id: number; nombre: string; email: string | null; telefono: string | null } | null
}

/** Resultado de revisar un producto contra la mascota. */
export type ProblemaMascota = { tipo: 'especie' | 'peso' | 'edad' | 'alergia' | 'peso_viejo' | 'sin_peso'; mensaje: string }

export type RenglonVentaVista = {
  id: string | null
  presentacionId: number
  productoId: number
  descripcion: string
  grupo: string | null
  cantidad: number
  factor: number
  unidades: number
  precioUnitario: number
  descuentoPorciento: number
  importe: number
  /** Solo con «Ver costos». */
  costo?: number | null
  lotes: { loteId: number; numeroLote: string | null; caducidad: string | null; unidades: number }[]
  recetaId: number | null
  recetaFolio: string | null
  folioCuantificado: string | null
  autorizacionMascota: string | null
}

export type PagoVentaVista = {
  indice: number
  metodo: string
  etiqueta: string
  tipo: string
  monto: number
  recibido: number | null
  cambio: number | null
  cuentaId: number | null
  referencia: string | null
  estado: 'confirmado' | 'por_confirmar'
  confirmadoPor: PersonaBreve | null
  confirmadoEn: string | null
}

export type VentaVista = {
  id: number
  folio: string
  canal: 'mostrador' | 'tienda'
  estado: 'pagada' | 'por_confirmar' | 'anulada'
  dia: string
  cliente: { id: number; nombre: string; email: string | null } | null
  mascota: { id: number; nombre: string; folio: string } | null
  pesoUsadoKg: number | null
  renglones: RenglonVentaVista[]
  subtotal: number
  descuento: number
  total: number
  /** Solo con «Ver costos». */
  costoTotal?: number | null
  margen?: number | null
  pagos: PagoVentaVista[]
  cambio: number
  vendedor: PersonaBreve | null
  autorizoDescuento: PersonaBreve | null
  autorizo: PersonaBreve | null
  ingresoFinanzasId: number | null
  ingresoFolio: string | null
  correoTicket: string | null
  notas: string | null
  anuladaPor: PersonaBreve | null
  anuladaEn: string | null
  motivoAnulacion: string | null
  creadoEn: string
}

export type VentaBreve = Pick<VentaVista, 'id' | 'folio' | 'estado' | 'dia' | 'total' | 'cliente' | 'mascota' | 'vendedor' | 'ingresoFolio' | 'creadoEn'> & { renglones: number; metodos: string[] }

export type AsientoLibroVista = {
  id: number
  tipo: 'salida' | 'cancelacion'
  ventaFolio: string | null
  laboratorio: string | null
  producto: string
  registroSenasica: string | null
  numeroLote: string | null
  fechaCompra: string | null
  folioReceta: string
  mvz: string | null
  fechaUso: string
  cantidad: number
  unidad: string | null
  animal: string | null
  usuario: PersonaBreve | null
  motivo: string | null
}

export type CierreVista = {
  id: number | null
  fecha: string
  cuenta: { id: number; nombre: string }
  esperado: number
  contado: number | null
  diferencia: number | null
  ventasEfectivo: number
  ventas: number
  nota: string | null
  usuario: PersonaBreve | null
  creadoEn: string | null
}

export type ResumenHoy = {
  ventasHoy: number
  totalHoy: number
  pagosPorConfirmar: number
  recetasPorValidar: number
  originalesPendientes: number
  cierrePendiente: boolean
  /** Fase 4 */
  alertasAbiertas: number
  alertasCriticas: number
  promocionesPropuestas: number
  reordenPropuestos: number
}
