/**
 * Tipos de la tienda en línea (Farmacia, fase 5a). Sin dependencias: los usan
 * el servicio (lib/farmacia/tienda.ts), la API pública (/api/tienda), las
 * pantallas de /tienda, el portal y el panel (Farmacia → Pedidos).
 */

export type Linea = 'medicamento' | 'antiparasitario' | 'alimento' | 'dieta_prescripcion' | 'accesorio' | 'higiene' | 'suplemento'

/** Secciones de la tienda por necesidad (nombre para el cliente e icono de lib/iconosServicio.ts). */
export const LINEAS_TIENDA: { clave: Linea; nombre: string; icono: 'desparasitacion' | 'nutricion' | 'farmacia' | 'cardio' | 'laboratorio' | 'bano' | 'patita' }[] = [
  { clave: 'antiparasitario', nombre: 'Pulgas y parásitos', icono: 'desparasitacion' },
  { clave: 'alimento', nombre: 'Alimento', icono: 'nutricion' },
  { clave: 'medicamento', nombre: 'Medicamentos', icono: 'farmacia' },
  { clave: 'dieta_prescripcion', nombre: 'Dietas especiales', icono: 'cardio' },
  { clave: 'suplemento', nombre: 'Vitaminas y suplementos', icono: 'laboratorio' },
  { clave: 'higiene', nombre: 'Baño e higiene', icono: 'bano' },
  { clave: 'accesorio', nombre: 'Accesorios', icono: 'patita' },
]

/** Para quién se compra: una mascota del tutor o un perfil rápido del invitado. */
export type PerfilCompra = { mascotaId: number } | { especie: string; pesoKg: number | null }

export type AptoTienda = { estado: 'apto' | 'no_apto' | 'sin_datos' | 'confirmar_peso'; motivos: string[] }

export type PresentacionTienda = {
  id: number
  nombre: string
  precio: number
  fraccionada: boolean
  /** Hay para al menos una pieza de esta presentación. */
  disponible: boolean
  /** Quedan pocas (menos de 3 piezas). */
  pocas: boolean
}

export type ProductoTienda = {
  id: number
  nombre: string
  principioActivo: string | null
  laboratorio: string | null
  linea: Linea
  grupo: 'I' | 'II' | 'III' | 'desregulado'
  requiereReceta: boolean
  descripcion: string | null
  imagenUrl: string | null
  especies: string[]
  rangoPeso: { min: number | null; max: number | null }
  presentaciones: PresentacionTienda[]
  apto: AptoTienda | null
}

export type MascotaCompra = { id: number; nombre: string; especie: string; pesoKg: number | null; foto: string | null }

/** Receta interna vigente del tutor que se puede surtir en la tienda. */
export type RecetaTienda = { id: number; folio: string; mascotaId: number | null; mascota: string | null; vigenteHasta: string; productos: { productoId: number | null; nombre: string; surtidosRestantes: number; enTienda: boolean }[] }

export type SesionTienda = {
  tutor: { nombre: string; correo: string; telefono: string | null } | null
  /** La cuenta está vinculada a una ficha (puede comprar con receta y ve sus mascotas). */
  vinculado: boolean
  mascotas: MascotaCompra[]
  recetas: RecetaTienda[]
  pagoEnLinea: { disponible: boolean; proveedor: 'prueba' | 'mercadopago' | null }
  pagarAlRecoger: boolean
  horasApartado: number
  /** Fase 5b: entrega a domicilio */
  domicilio: { activo: boolean; pagarAlRecibir: boolean; horario: string | null; grupoII: boolean }
  /** Hay búsqueda con IA («¿qué necesita tu mascota?»). */
  busquedaIA: boolean
}

/** Cotización de envío para un código postal. */
export type CotizacionEnvio = { cubre: boolean; zona: string | null; envio: number; pedidoMinimo: number; gratisDesde: number | null; mensaje: string | null }

/** Respuesta de la búsqueda con IA: productos de la tienda que pueden servir, nunca dosis. */
export type SugerenciaIA = { productos: ProductoTienda[]; explicacion: string; veterinario: boolean; motivoVeterinario: string | null; conIA: boolean }

export type EstadoPedido = 'pago_pendiente' | 'creado' | 'pagado' | 'receta_por_validar' | 'preparando' | 'listo_para_recoger' | 'en_ruta' | 'entregado' | 'cancelado' | 'expirado'

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  pago_pendiente: 'Por pagar',
  creado: 'Recibido',
  pagado: 'Pagado',
  receta_por_validar: 'Receta por validar',
  preparando: 'Preparando',
  listo_para_recoger: 'Listo',
  en_ruta: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  expirado: 'Venció el apartado',
}

export type PedidoVista = {
  id: number
  folio: string
  estado: EstadoPedido
  creadoEn: string
  expiraEn: string | null
  entrega: 'recoger' | 'domicilio'
  pago: { forma: 'al_recoger' | 'en_linea' | 'al_recibir'; estado: 'pendiente' | 'pagado' | 'reembolso_pendiente' | 'reembolsado'; proveedor: string | null; referencia: string | null; pagadoEn: string | null }
  contacto: { nombre: string; correo: string; telefono: string | null }
  mascota: { id: number; nombre: string } | null
  perfil: { especie: string | null; pesoKg: number | null } | null
  renglones: { presentacionId: number; productoId: number; descripcion: string; grupo: string | null; cantidad: number; precioUnitario: number; importe: number; recetaId: number | null; recetaFolio: string | null }[]
  subtotal: number
  /** Envío a domicilio (precio al cliente). */
  envio: number
  total: number
  direccion: { calle: string; colonia: string | null; codigoPostal: string; referencias: string | null; zona: string | null } | null
  repartidor: { id: number; nombre: string } | null
  entregaDomicilio: { salioEn: string | null; entregadoEn: string | null; recibio: string | null; nota: string | null; intentos: number; conFoto: boolean } | null
  notasCliente: string | null
  motivoCancelacion: string | null
  ventaId: number | null
  ventaFolio: string | null
  historial: { estado: string; fecha: string; por: string | null; detalle: string | null }[]
  /** Solo para el tutor o el invitado (liga de seguimiento). */
  token?: string
}
