import type { CollectionConfig, GlobalConfig } from 'payload'
import type { Access, AccessResult, Where } from 'payload'
import { esPersonal, esTutor, permisosDe } from '../../lib/permisos'
import { equipoCon, folioDesdeId, leerEquipoOTutor, nadie, porMascotaDelCliente, soloEquipoLee } from './acceso'

/** El equipo con «ver pacientes»; el tutor del portal, solo los activos que se pueden pedir en línea. */
const leerServicios: Access = async ({ req }): Promise<AccessResult> => {
  if (esPersonal(req)) return (await permisosDe(req)).clinica.verPacientes
  if (esTutor(req)) {
    const activos: Where = { activo: { equals: true } }
    const enLinea: Where = { reservaEnLinea: { not_equals: 'no' } }
    return { and: [activos, enLinea] }
  }
  return false
}

/**
 * Agenda y citas (octubre de 2026).
 *
 * CATÁLOGOS (editables en el panel por quien tenga «Configurar agenda»):
 *   - recursos: consultorios, quirófano, estética… Lo que se ocupa en un horario.
 *   - servicios: lo que se agenda; cada uno dura X minutos, usa un recurso por
 *     defecto, puede tener precio (para el cargo en Finanzas al finalizar) y
 *     dice si el tutor lo puede pedir desde el portal.
 *   - agenda-configuracion (global): horario de atención por día, tamaño del
 *     intervalo y reglas del portal (anticipación, cancelación).
 *
 * CITAS: viven en `citas`. Se crean y cambian SOLO por la API de la clínica
 * (lib/clinica/agenda.ts), que revisa choques de horario en una transacción;
 * por la API genérica de Payload solo se leen (equipo con «agenda»; el tutor,
 * las de sus mascotas).
 *
 * ESTADOS: solicitada → confirmada → llegada → atencion → finalizada;
 * cancelada y no_asistio cierran. La transición permitida la decide el
 * servicio (TRANSICIONES), no la pantalla.
 */

export const ESTADOS_CITA = [
  { label: 'Solicitada', value: 'solicitada' },
  { label: 'Confirmada', value: 'confirmada' },
  { label: 'Llegada registrada', value: 'llegada' },
  { label: 'En atención', value: 'atencion' },
  { label: 'Finalizada', value: 'finalizada' },
  { label: 'Cancelada', value: 'cancelada' },
  { label: 'No asistió', value: 'no_asistio' },
] as const
export type EstadoCita = (typeof ESTADOS_CITA)[number]['value']

export const TRANSICIONES: Record<EstadoCita, EstadoCita[]> = {
  solicitada: ['confirmada', 'cancelada'],
  confirmada: ['llegada', 'atencion', 'no_asistio', 'cancelada'],
  llegada: ['atencion', 'cancelada'],
  atencion: ['finalizada'],
  finalizada: [],
  cancelada: [],
  no_asistio: [],
}
/** Estados que ocupan el recurso (cuentan para choques). */
export const ESTADOS_OCUPAN: EstadoCita[] = ['solicitada', 'confirmada', 'llegada', 'atencion']

const TIPOS_RECURSO = [
  { label: 'Consultorio', value: 'consultorio' },
  { label: 'Quirófano', value: 'quirofano' },
  { label: 'Estética', value: 'estetica' },
  { label: 'Sala o espacio', value: 'sala' },
  { label: 'Otro', value: 'otro' },
]

export const Recursos: CollectionConfig = {
  slug: 'recursos',
  typescript: { interface: 'Recurso' },
  labels: { singular: 'Recurso (consultorio)', plural: 'Recursos (consultorios)' },
  admin: { group: 'Clínica', useAsTitle: 'nombre', defaultColumns: ['nombre', 'tipo', 'activo', 'orden'], description: 'Consultorios, quirófano y espacios que se ocupan en la agenda. Desactivar no borra las citas pasadas.' },
  access: { read: equipoCon('verPacientes'), create: equipoCon('configurarAgenda'), update: equipoCon('configurarAgenda'), delete: nadie },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'consultorio', options: TIPOS_RECURSO },
    { name: 'orden', label: 'Orden en la agenda', type: 'number', defaultValue: 0 },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true, index: true },
  ],
}

export const Servicios: CollectionConfig = {
  slug: 'servicios',
  typescript: { interface: 'Servicio' },
  labels: { singular: 'Servicio', plural: 'Servicios' },
  admin: { group: 'Clínica', useAsTitle: 'nombre', defaultColumns: ['nombre', 'duracionMin', 'precio', 'reservaEnLinea', 'activo'], description: 'Lo que se agenda. La duración y el recurso por defecto arman la agenda; el precio (opcional) genera el cargo en Finanzas al finalizar la cita.' },
  access: {
    read: leerServicios,
    create: equipoCon('configurarAgenda'),
    update: equipoCon('configurarAgenda'),
    delete: nadie,
  },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    { name: 'descripcion', label: 'Qué incluye (lo ve el tutor)', type: 'textarea' },
    { name: 'indicaciones', label: 'Indicaciones previas para el tutor', type: 'text', admin: { description: 'Ej. «Traer cartilla y estudios previos».' } },
    {
      type: 'row',
      fields: [
        { name: 'duracionMin', label: 'Duración (minutos)', type: 'number', required: true, defaultValue: 30, min: 5, max: 600 },
        { name: 'precio', label: 'Precio (pesos, opcional)', type: 'number', min: 0, admin: { description: 'Si se captura, al finalizar la cita se registra una entrada por cobrar en Finanzas.' } },
      ],
    },
    { name: 'recursoPorDefecto', label: 'Recurso por defecto', type: 'relationship', relationTo: 'recursos', required: true },
    { name: 'area', label: 'Área de Finanzas', type: 'relationship', relationTo: 'fin-actividades', admin: { description: 'A qué actividad se asigna el cargo (Consulta, Cirugía, Estética…).' } },
    { name: 'categoriaFinanzas', label: 'Categoría de Finanzas', type: 'relationship', relationTo: 'fin-categorias', admin: { description: 'Opcional: categoría de entrada para el cargo.' } },
    {
      name: 'reservaEnLinea',
      label: 'Desde el portal',
      type: 'select',
      required: true,
      defaultValue: 'inmediata',
      options: [
        { label: 'El tutor puede pedirla (queda «solicitada» hasta confirmar)', value: 'inmediata' },
        { label: 'Solo con valoración previa (el tutor la solicita; la clínica decide)', value: 'valoracion' },
        { label: 'No se pide en línea', value: 'no' },
      ],
    },
    { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0 },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true, index: true },
  ],
}

export const Citas: CollectionConfig = {
  slug: 'citas',
  typescript: { interface: 'Cita' },
  labels: { singular: 'Cita', plural: 'Citas' },
  admin: { group: 'Clínica', useAsTitle: 'dia', defaultColumns: ['dia', 'horaInicio', 'mascota', 'servicio', 'recurso', 'estado'], hidden: true },
  access: {
    read: leerEquipoOTutor('agenda', porMascotaDelCliente),
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('CIT')] } },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', label: 'Tutor que agenda', type: 'relationship', relationTo: 'clientes', index: true },
    { name: 'servicio', type: 'relationship', relationTo: 'servicios', required: true, index: true },
    { name: 'recurso', type: 'relationship', relationTo: 'recursos', required: true, index: true },
    { name: 'profesional', label: 'Atiende', type: 'relationship', relationTo: 'users' },
    /* Día y hora locales (texto) para listar y agrupar; instantes exactos para choques. */
    { name: 'dia', label: 'Día (AAAA-MM-DD)', type: 'text', required: true, index: true },
    { name: 'horaInicio', label: 'Hora', type: 'text', required: true },
    { name: 'duracionMin', type: 'number', required: true },
    { name: 'inicio', type: 'date', required: true, index: true },
    { name: 'fin', type: 'date', required: true, index: true },
    { name: 'estado', type: 'select', required: true, defaultValue: 'solicitada', index: true, options: [...ESTADOS_CITA] },
    { name: 'origen', type: 'select', required: true, defaultValue: 'panel', options: [{ label: 'Panel', value: 'panel' }, { label: 'Portal del tutor', value: 'portal' }] },
    { name: 'notasTutor', label: 'Motivo o notas del tutor', type: 'textarea' },
    { name: 'notasInternas', label: 'Notas internas', type: 'textarea', access: { read: soloEquipoLee } },
    { name: 'motivoCancelacion', type: 'text' },
    {
      name: 'historial',
      type: 'array',
      access: { read: soloEquipoLee },
      fields: [
        { name: 'estado', type: 'text', required: true },
        { name: 'fecha', type: 'date', required: true },
        { name: 'por', type: 'text' },
        { name: 'detalle', type: 'text' },
      ],
    },
    { name: 'cargoFinanzas', label: 'Cargo en Finanzas', type: 'relationship', relationTo: 'fin-operaciones', access: { read: soloEquipoLee } },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'creadoPorTutor', type: 'relationship', relationTo: 'tutores' },
  ],
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export const AgendaConfiguracion: GlobalConfig = {
  slug: 'agenda-configuracion',
  typescript: { interface: 'AgendaConfiguracion' },
  label: 'Agenda: horario y reglas',
  admin: { group: 'Clínica', description: 'Horario de atención por día y reglas para las citas pedidas desde el portal.' },
  access: { read: ({ req }) => Boolean(req.user), update: equipoCon('configurarAgenda') },
  fields: [
    {
      name: 'horario',
      label: 'Horario de atención',
      type: 'array',
      maxRows: 7,
      admin: { description: 'Un renglón por día (0 = domingo … 6 = sábado). Horas como HH:MM.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'dia', label: 'Día', type: 'select', required: true, options: DIAS_SEMANA.map((d, i) => ({ label: d, value: String(i) })) },
            { name: 'abierto', label: 'Abre', type: 'checkbox', defaultValue: true },
            { name: 'de', label: 'De', type: 'text', defaultValue: '09:00' },
            { name: 'a', label: 'A', type: 'text', defaultValue: '19:00' },
          ],
        },
      ],
    },
    { name: 'intervaloMin', label: 'Intervalo de la agenda (minutos)', type: 'number', defaultValue: 30, min: 5, max: 120 },
    { name: 'anticipacionHoras', label: 'Portal: horas mínimas de anticipación para pedir cita', type: 'number', defaultValue: 2, min: 0 },
    { name: 'diasAdelante', label: 'Portal: hasta cuántos días adelante se puede pedir', type: 'number', defaultValue: 60, min: 1, max: 365 },
    { name: 'cancelacionHoras', label: 'Portal: horas mínimas para cancelar o reprogramar', type: 'number', defaultValue: 12, min: 0 },
  ],
}
