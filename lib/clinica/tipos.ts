/**
 * Tipos que viajan entre el servicio de la clínica (lib/clinica/servicio.ts),
 * la API (/api/clinica) y las pantallas (panel y portal). Sin dependencias.
 */

import type { PermisosClinica } from '../permisosBase'

export type PersonaBreve = { id: number; nombre: string }

export type ClienteVista = {
  id: number
  folio: string
  nombre: string
  apellidos: string
  nombreCompleto: string
  telefono: string | null
  telefonoAlterno: string | null
  email: string | null
  direccion: string | null
  contactoEmergencia: { nombre: string | null; telefono: string | null }
  comunicacion: { avisos: boolean; promociones: boolean; whatsapp: boolean; correo: boolean }
  notasInternas: string | null
  activo: boolean
  origen: 'manual' | 'importacion' | 'portal'
  creadoEn: string
  actualizadoEn: string
}

export type TutorDeMascota = { clienteId: number; folio: string; nombre: string; telefono: string | null; principal: boolean; parentesco: string | null }

export type MascotaVista = {
  id: number
  folio: string
  nombre: string
  especie: string
  especieOtra: string | null
  raza: string | null
  sexo: 'macho' | 'hembra' | 'desconocido'
  esterilizado: 'si' | 'no' | 'desconocido'
  color: string | null
  fechaNacimiento: string | null
  nacimientoEstimado: boolean
  edad: string | null
  microchip: string | null
  alergias: string | null
  alertasManejo: string[]
  medicoTratante: PersonaBreve | null
  tutores: TutorDeMascota[]
  estado: 'activo' | 'inactivo' | 'fallecido'
  notasInternas: string | null
  origen: 'manual' | 'importacion' | 'portal'
  ultimoPeso: PesoVista | null
  creadoEn: string
  actualizadoEn: string
}

export type PesoVista = { id: number; fecha: string; kg: number; nota: string | null; registradoPor: string | null }

export type CartillaVista = {
  id: number
  tipo: string
  producto: string
  fechaAplicacion: string
  proximaFecha: string | null
  lote: string | null
  caducidad: string | null
  aplicadoPor: string | null
  notas: string | null
}

export type AdendaVista = { motivo: string; texto: string; fecha: string | null; autor: string | null }

export type NotaVista = {
  id: number
  fecha: string
  tipo: string
  titulo: string
  subjetivo: string | null
  objetivo: string | null
  analisis: string | null
  plan: string | null
  autor: PersonaBreve | null
  estado: 'borrador' | 'firmada'
  firmadaEn: string | null
  firmadaPor: string | null
  adendas: AdendaVista[]
}

export type DocumentoVista = {
  id: number
  titulo: string
  tipo: string
  fecha: string | null
  publicadoAlTutor: boolean
  origen: 'clinica' | 'tutor'
  revision: 'no_aplica' | 'pendiente' | 'revisado'
  nombreArchivo: string | null
  tipoContenido: string | null
  tamano: number | null
  subidoPor: string | null
  creadoEn: string
}

export type CuentaPortalVista = { id: number; email: string; nombre: string; vinculadoEn: string | null }
export type CodigoVista = { codigo: string; expira: string }

export type FichaCliente = {
  cliente: ClienteVista
  mascotas: MascotaVista[]
  cuentasPortal: CuentaPortalVista[]
  codigosVigentes: CodigoVista[]
}

export type Expediente = {
  mascota: MascotaVista
  pesos: PesoVista[]
  cartilla: CartillaVista[]
  documentos: DocumentoVista[]
  /** null cuando el rol no lee el expediente. */
  notas: NotaVista[] | null
}

export type ResultadoBusqueda = {
  clientes: (ClienteVista & { mascotas: { id: number; nombre: string; especie: string }[] })[]
  mascotas: MascotaVista[]
}

export type CatalogoClinica = {
  permisos: PermisosClinica & { superadmin: boolean; panel: boolean }
  usuario: PersonaBreve
  equipo: PersonaBreve[]
  especies: { label: string; value: string }[]
  tiposCartilla: { label: string; value: string }[]
  tiposNota: { label: string; value: string }[]
  tiposDocumento: { label: string; value: string }[]
  documentosHabilitados: boolean
  totales: { clientes: number; mascotas: number }
}

/* ───────── importación ───────── */

/** Campos que entiende el importador (una fila = una mascota con su tutor; varias filas por mascota = varias vacunas). */
export const CAMPOS_IMPORTACION = [
  { clave: 'tutor_nombre', etiqueta: 'Tutor: nombre(s)', grupo: 'Tutor', requerido: true },
  { clave: 'tutor_apellidos', etiqueta: 'Tutor: apellidos', grupo: 'Tutor' },
  { clave: 'tutor_telefono', etiqueta: 'Tutor: teléfono', grupo: 'Tutor' },
  { clave: 'tutor_correo', etiqueta: 'Tutor: correo', grupo: 'Tutor' },
  { clave: 'tutor_direccion', etiqueta: 'Tutor: dirección', grupo: 'Tutor' },
  { clave: 'tutor_notas', etiqueta: 'Tutor: notas internas', grupo: 'Tutor' },
  { clave: 'mascota_nombre', etiqueta: 'Mascota: nombre', grupo: 'Mascota', requerido: true },
  { clave: 'especie', etiqueta: 'Mascota: especie', grupo: 'Mascota' },
  { clave: 'raza', etiqueta: 'Mascota: raza', grupo: 'Mascota' },
  { clave: 'sexo', etiqueta: 'Mascota: sexo', grupo: 'Mascota' },
  { clave: 'esterilizado', etiqueta: 'Mascota: esterilizado (sí/no)', grupo: 'Mascota' },
  { clave: 'color', etiqueta: 'Mascota: color y señas', grupo: 'Mascota' },
  { clave: 'fecha_nacimiento', etiqueta: 'Mascota: fecha de nacimiento', grupo: 'Mascota' },
  { clave: 'nacimiento_estimado', etiqueta: 'Mascota: nacimiento estimado (sí/no)', grupo: 'Mascota' },
  { clave: 'microchip', etiqueta: 'Mascota: microchip', grupo: 'Mascota' },
  { clave: 'alergias', etiqueta: 'Mascota: alergias', grupo: 'Mascota' },
  { clave: 'alertas_manejo', etiqueta: 'Mascota: alertas de manejo', grupo: 'Mascota' },
  { clave: 'peso_kg', etiqueta: 'Mascota: peso actual (kg)', grupo: 'Mascota' },
  { clave: 'fecha_peso', etiqueta: 'Mascota: fecha del peso', grupo: 'Mascota' },
  { clave: 'notas_mascota', etiqueta: 'Mascota: notas internas', grupo: 'Mascota' },
  { clave: 'cartilla_tipo', etiqueta: 'Cartilla: tipo (vacuna / desparasitación)', grupo: 'Cartilla' },
  { clave: 'cartilla_producto', etiqueta: 'Cartilla: producto o biológico', grupo: 'Cartilla' },
  { clave: 'cartilla_fecha', etiqueta: 'Cartilla: fecha de aplicación', grupo: 'Cartilla' },
  { clave: 'cartilla_lote', etiqueta: 'Cartilla: lote', grupo: 'Cartilla' },
  { clave: 'cartilla_caducidad', etiqueta: 'Cartilla: caducidad del biológico', grupo: 'Cartilla' },
  { clave: 'cartilla_proxima', etiqueta: 'Cartilla: próxima fecha', grupo: 'Cartilla' },
  { clave: 'cartilla_aplico', etiqueta: 'Cartilla: quién aplicó', grupo: 'Cartilla' },
] as const

export type ClaveImportacion = (typeof CAMPOS_IMPORTACION)[number]['clave']
/** columna del archivo → campo; una columna sin campo se ignora. */
export type MapeoImportacion = Record<string, ClaveImportacion | ''>

export type ArchivoCargado = {
  id: number
  archivo: string
  columnas: string[]
  totalFilas: number
  muestra: Record<string, string>[]
  mapeoSugerido: MapeoImportacion
}

export type PlanImportacion = {
  tutores: { nuevos: number; existentes: number }
  mascotas: { nuevas: number; existentes: number }
  cartilla: number
  pesos: number
  errores: { fila: number; mensaje: string }[]
  avisos: { fila: number; mensaje: string }[]
  /* Para la vista previa: las primeras filas interpretadas. */
  ejemplos: { fila: number; tutor: string; tutorEstado: 'nuevo' | 'existente'; mascota: string; mascotaEstado: 'nueva' | 'existente'; cartilla: string | null }[]
}

export type ResumenImportacion = PlanImportacion & { aplicadaEn: string; clientesCreados: number; mascotasCreadas: number }

/* ───────── portal ───────── */

export type PortalResumen = {
  tutor: { id: number; nombre: string; email: string; telefono: string | null }
  cliente: ClienteVista | null
  mascotas: (MascotaVista & { proximaCartilla: { producto: string; fecha: string } | null })[]
}

export type PortalMascota = {
  mascota: MascotaVista
  pesos: PesoVista[]
  cartilla: CartillaVista[]
  documentos: DocumentoVista[]
}

/* ───────── agenda ───────── */

export type RecursoVista = { id: number; nombre: string; tipo: string; activo: boolean; orden: number }
export type ServicioVista = {
  id: number
  nombre: string
  descripcion: string | null
  indicaciones: string | null
  duracionMin: number
  precio: number | null
  recursoPorDefecto: number
  area: number | null
  reservaEnLinea: 'inmediata' | 'valoracion' | 'no'
  activo: boolean
  orden: number
}
export type ConfiguracionAgenda = {
  horario: { dia: number; abierto: boolean; de: string; a: string }[]
  intervaloMin: number
  anticipacionHoras: number
  diasAdelante: number
  cancelacionHoras: number
  /** false mientras nadie haya guardado el horario (se usa el de omisión: L–V 9–19, S 9–14). */
  configurada: boolean
}
export type DisponibilidadDia = { dia: string; abierto: boolean; huecos: { hora: string; disponible: boolean }[]; motivo?: string; recursoId?: number; duracionMin?: number }
export type EstadoCitaVista = 'solicitada' | 'confirmada' | 'llegada' | 'atencion' | 'finalizada' | 'cancelada' | 'no_asistio'
export type CitaVista = {
  id: number
  folio: string
  mascota: { id: number; nombre: string; especie: string; folio: string; alertas: string[] }
  cliente: { id: number; nombre: string; telefono: string | null } | null
  servicio: { id: number; nombre: string }
  recurso: { id: number; nombre: string }
  profesional: PersonaBreve | null
  dia: string
  horaInicio: string
  horaFin: string
  duracionMin: number
  estado: EstadoCitaVista
  origen: 'panel' | 'portal'
  notasTutor: string | null
  notasInternas: string | null
  motivoCancelacion: string | null
  historial: { estado: string; fecha: string; por: string | null; detalle: string | null }[]
  cargoFinanzas: number | null
  esHoy: boolean
  siguientes: EstadoCitaVista[]
  creadoEn: string
}
export const ESTADO_CITA_LABEL: Record<EstadoCitaVista, string> = {
  solicitada: 'Solicitada',
  confirmada: 'Confirmada',
  llegada: 'Llegada registrada',
  atencion: 'En atención',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}
export const ACCION_ESTADO_LABEL: Record<EstadoCitaVista, string> = {
  solicitada: 'Volver a solicitada',
  confirmada: 'Confirmar',
  llegada: 'Registrar llegada',
  atencion: 'Pasar a atención',
  finalizada: 'Finalizar',
  cancelada: 'Cancelar',
  no_asistio: 'No asistió',
}
