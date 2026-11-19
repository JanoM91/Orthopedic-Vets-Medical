import type { CollectionConfig } from 'payload'
import { equipoCon, folioDesdeId, nadie } from './acceso'

/**
 * SOLICITUDES DE PRIMERA CITA (nov-2026, decisión de Jano: «solicitud que
 * recepción confirma»). Las deja un visitante sin cuenta en `/reservar`;
 * recepción le escribe por WhatsApp, acuerda día y hora, y entonces da de alta
 * al cliente y agenda la cita como siempre. Una solicitud **no** aparta
 * horario ni crea fichas: así la agenda no se llena de citas falsas.
 *
 * Solo las crea `lib/sitio/solicitudes.ts` (API genérica: crear y borrar 403);
 * el equipo con «Agenda» las lee y les cambia el estado.
 */
export const ESTADOS_SOLICITUD = [
  { label: 'Nueva', value: 'nueva' },
  { label: 'Ya le escribimos', value: 'contactada' },
  { label: 'Cita agendada', value: 'agendada' },
  { label: 'Descartada', value: 'descartada' },
] as const

export const Solicitudes: CollectionConfig = {
  slug: 'solicitudes',
  typescript: { interface: 'Solicitud' },
  labels: { singular: 'Solicitud de cita', plural: 'Solicitudes de cita' },
  admin: {
    group: 'Clínica',
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'mascota', 'servicioNombre', 'diaPreferido', 'estado', 'createdAt'],
    description: 'Personas que pidieron su primera cita desde el sitio. Escríbeles por WhatsApp para acordar día y hora; después da de alta su ficha y agenda la cita.',
  },
  defaultSort: '-createdAt',
  access: { read: equipoCon('agenda'), create: nadie, update: equipoCon('agenda'), delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [folioDesdeId('SOL')] } },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'nueva',
      index: true,
      options: [...ESTADOS_SOLICITUD],
      admin: { position: 'sidebar', description: 'Cámbialo cuando le escribas y cuando la cita quede agendada.' },
    },
    { name: 'acciones', type: 'ui', admin: { components: { Field: '/components/admin/AccionesSolicitud#default' } } },
    { type: 'row', fields: [{ name: 'nombre', label: 'Nombre', type: 'text', required: true, admin: { readOnly: true } }, { name: 'whatsapp', label: 'WhatsApp', type: 'text', required: true, admin: { readOnly: true } }] },
    { name: 'correo', label: 'Correo', type: 'email', admin: { readOnly: true } },
    { type: 'row', fields: [{ name: 'mascota', label: 'Mascota', type: 'text', required: true, admin: { readOnly: true } }, { name: 'especie', label: 'Especie', type: 'select', required: true, options: [{ label: 'Perro', value: 'perro' }, { label: 'Gato', value: 'gato' }, { label: 'Otra', value: 'otra' }], admin: { readOnly: true } }] },
    { name: 'servicio', label: 'Servicio del catálogo', type: 'relationship', relationTo: 'servicios', admin: { readOnly: true } },
    { name: 'servicioNombre', label: 'Servicio', type: 'text', admin: { readOnly: true, description: 'Como se llamaba cuando lo pidió.' } },
    { type: 'row', fields: [{ name: 'diaPreferido', label: 'Día que prefiere', type: 'text', admin: { readOnly: true } }, { name: 'turno', label: 'Horario que prefiere', type: 'select', options: [{ label: 'Por la mañana', value: 'manana' }, { label: 'Por la tarde', value: 'tarde' }, { label: 'Cualquiera', value: 'cualquiera' }], admin: { readOnly: true } }] },
    { name: 'nota', label: 'Lo que nos contó', type: 'textarea', admin: { readOnly: true } },
    { name: 'origen', label: 'De dónde llegó', type: 'text', admin: { readOnly: true, description: 'Campaña vigente al momento de pedir, si la había.' } },
    { name: 'notaInterna', label: 'Nota del equipo', type: 'textarea', admin: { description: 'Solo la ve el equipo. Ej. «Quedó para el jueves 10:00».' } },
  ],
}
