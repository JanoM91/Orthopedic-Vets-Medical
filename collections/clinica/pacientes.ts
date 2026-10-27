import type { CollectionConfig } from 'payload'
import {
  equipoCon,
  folioDesdeId,
  leerEquipoOTutor,
  mascotasDelCliente,
  nadie,
  porMascotaDelCliente,
  soloEquipoLee,
  validarFechaOpcional,
} from './acceso'

/**
 * Clientes-tutores y mascotas (octubre de 2026).
 *
 * MODELO:
 *   cliente (tutor) ──< tutoría >── mascota
 *   Una mascota puede tener varios tutores (pareja, familia) y un tutor varias
 *   mascotas. La tutoría vive en `mascotas.tutores[]` con un «principal».
 *   Cartilla, pesos, notas clínicas y documentos cuelgan de la MASCOTA
 *   (collections/clinica/expediente.ts); pedidos y cuenta en línea, del
 *   cliente (más adelante).
 *
 * FOLIOS: `folio` es virtual y sale del id (CLI-00012, MAS-00034): público,
 * corto e inmutable. Se usa en pantalla, en la cartilla impresa y en el portal.
 *
 * NADA SE BORRA: un cliente o una mascota se marcan inactivos (o «fallecido»)
 * para conservar la historia. Solo el superadministrador podría borrar desde la
 * base, y no hay botón para ello.
 *
 * ORIGEN: cada registro dice si se capturó a mano, llegó de una importación o
 * lo creó el tutor desde el portal.
 */

export const ESPECIES = [
  { label: 'Perro', value: 'perro' },
  { label: 'Gato', value: 'gato' },
  { label: 'Ave', value: 'ave' },
  { label: 'Conejo', value: 'conejo' },
  { label: 'Roedor', value: 'roedor' },
  { label: 'Reptil', value: 'reptil' },
  { label: 'Otra', value: 'otra' },
] as const

const ORIGEN = [
  { label: 'Captura manual', value: 'manual' },
  { label: 'Importación de archivo', value: 'importacion' },
  { label: 'Portal del tutor', value: 'portal' },
]

export const Clientes: CollectionConfig = {
  slug: 'clientes',
  typescript: { interface: 'Cliente' },
  labels: { singular: 'Cliente (tutor)', plural: 'Clientes (tutores)' },
  admin: {
    useAsTitle: 'nombreCompleto',
    group: 'Clínica',
    defaultColumns: ['folio', 'nombreCompleto', 'telefono', 'email', 'activo', 'updatedAt'],
    listSearchableFields: ['nombre', 'apellidos', 'telefono', 'telefonoAlterno', 'email', 'nombreCompleto'],
    description: 'Dueños de las mascotas.',
  },
  access: {
    read: leerEquipoOTutor('verPacientes', (clienteId) => ({ id: { equals: clienteId } })),
    create: equipoCon('editarPacientes'),
    update: equipoCon('editarPacientes'),
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const nombre = String(data.nombre ?? '').trim()
        const apellidos = String(data.apellidos ?? '').trim()
        data.nombre = nombre
        data.apellidos = apellidos
        data.nombreCompleto = [nombre, apellidos].filter(Boolean).join(' ')
        if (typeof data.telefono === 'string') data.telefono = normalizarTelefono(data.telefono)
        if (typeof data.telefonoAlterno === 'string') data.telefonoAlterno = normalizarTelefono(data.telefonoAlterno)
        if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase()
        return data
      },
    ],
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [folioDesdeId('CLI')] } },
    {
      type: 'row',
      fields: [
        { name: 'nombre', label: 'Nombre(s)', type: 'text', required: true },
        { name: 'apellidos', label: 'Apellidos', type: 'text' },
      ],
    },
    /* Guardado (no virtual) para buscar y ordenar por nombre completo con un solo índice. */
    { name: 'nombreCompleto', label: 'Nombre completo', type: 'text', index: true, admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'telefono', label: 'Teléfono (WhatsApp)', type: 'text', index: true, admin: { description: 'Con lada: 2281234567.' } },
        { name: 'telefonoAlterno', label: 'Otro teléfono', type: 'text' },
      ],
    },
    { name: 'email', label: 'Correo', type: 'email', index: true },
    { name: 'direccion', label: 'Dirección', type: 'textarea' },
    {
      name: 'contactoEmergencia',
      label: 'Contacto de emergencia',
      type: 'group',
      fields: [
        { type: 'row', fields: [{ name: 'nombre', label: 'Nombre', type: 'text' }, { name: 'telefono', label: 'Teléfono', type: 'text' }] },
      ],
    },
    {
      name: 'comunicacion',
      label: 'Comunicación',
      type: 'group',
      fields: [
        { name: 'avisos', label: 'Avisos de citas, resultados y cartilla', type: 'checkbox', defaultValue: true },
        { name: 'promociones', label: 'Promociones y novedades', type: 'checkbox', defaultValue: false },
        { name: 'whatsapp', label: 'Por WhatsApp', type: 'checkbox', defaultValue: true },
        { name: 'correo', label: 'Por correo', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'notasInternas',
      label: 'Notas internas (el cliente no las ve)',
      type: 'textarea',
      access: { read: soloEquipoLee },
    },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true, index: true, admin: { position: 'sidebar' } },
    { name: 'origen', label: 'Origen', type: 'select', options: ORIGEN, defaultValue: 'manual', admin: { position: 'sidebar', readOnly: true } },
  ],
}

export const Mascotas: CollectionConfig = {
  slug: 'mascotas',
  typescript: { interface: 'Mascota' },
  labels: { singular: 'Mascota (paciente)', plural: 'Mascotas (pacientes)' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Clínica',
    defaultColumns: ['folio', 'nombre', 'especie', 'raza', 'estado', 'updatedAt'],
    listSearchableFields: ['nombre', 'raza', 'microchip'],
    description: 'Un expediente por mascota.',
  },
  access: {
    read: leerEquipoOTutor('verPacientes', mascotasDelCliente),
    create: equipoCon('editarPacientes'),
    update: equipoCon('editarPacientes'),
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.nombre === 'string') data.nombre = data.nombre.trim()
        if (typeof data.microchip === 'string') data.microchip = data.microchip.replace(/\s+/g, '').trim() || null
        /* Un solo tutor principal. Si ninguno lo es, el primero. */
        const tutores = Array.isArray(data.tutores) ? (data.tutores as { cliente?: unknown; principal?: boolean }[]) : []
        if (tutores.length) {
          let visto = false
          for (const t of tutores) {
            if (t.principal && !visto) visto = true
            else t.principal = false
          }
          if (!visto) tutores[0].principal = true
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [folioDesdeId('MAS')] } },
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'especie', label: 'Especie', type: 'select', required: true, defaultValue: 'perro', options: [...ESPECIES], index: true },
        { name: 'especieOtra', label: '¿Cuál?', type: 'text', admin: { condition: (_, s) => s?.especie === 'otra' } },
        { name: 'raza', label: 'Raza', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'sexo',
          label: 'Sexo',
          type: 'select',
          defaultValue: 'desconocido',
          options: [{ label: 'Macho', value: 'macho' }, { label: 'Hembra', value: 'hembra' }, { label: 'Sin registrar', value: 'desconocido' }],
        },
        {
          name: 'esterilizado',
          label: 'Esterilización',
          type: 'select',
          defaultValue: 'desconocido',
          options: [{ label: 'Esterilizado(a)', value: 'si' }, { label: 'Entero(a)', value: 'no' }, { label: 'Sin registrar', value: 'desconocido' }],
        },
        { name: 'color', label: 'Color y señas', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'fechaNacimiento', label: 'Fecha de nacimiento (AAAA-MM-DD)', type: 'text', validate: validarFechaOpcional },
        { name: 'nacimientoEstimado', label: 'Es estimada', type: 'checkbox', defaultValue: false },
        { name: 'microchip', label: 'Microchip', type: 'text', index: true },
      ],
    },
    { name: 'alergias', label: 'Alergias', type: 'textarea', admin: { description: 'Se muestran como alerta en todo el sistema.' } },
    {
      name: 'alertasManejo',
      label: 'Alertas de manejo',
      type: 'array',
      labels: { singular: 'Alerta', plural: 'Alertas' },
      admin: { description: 'Ej. «Postoperatorio: evitar saltos». Las ve todo el equipo, también estética y recepción.' },
      fields: [{ name: 'texto', label: 'Alerta', type: 'text', required: true }],
    },
    { name: 'medicoTratante', label: 'Médico tratante', type: 'relationship', relationTo: 'users' },
    {
      name: 'tutores',
      label: 'Tutores',
      type: 'array',
      labels: { singular: 'Tutor', plural: 'Tutores' },
      required: true,
      minRows: 1,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'cliente', label: 'Cliente', type: 'relationship', relationTo: 'clientes', required: true, index: true },
            { name: 'principal', label: 'Principal', type: 'checkbox', defaultValue: false },
            { name: 'parentesco', label: 'Relación', type: 'text', admin: { description: 'Opcional: «pareja», «hijo», etc.' } },
          ],
        },
      ],
    },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      defaultValue: 'activo',
      index: true,
      options: [{ label: 'Activo', value: 'activo' }, { label: 'Inactivo (ya no viene)', value: 'inactivo' }, { label: 'Fallecido', value: 'fallecido' }],
      admin: { position: 'sidebar' },
    },
    { name: 'notasInternas', label: 'Notas internas (el tutor no las ve)', type: 'textarea', access: { read: soloEquipoLee } },
    { name: 'origen', label: 'Origen', type: 'select', options: ORIGEN, defaultValue: 'manual', admin: { position: 'sidebar', readOnly: true } },
  ],
}

/* Pesos: historia aparte para graficar y para que el tutor la vea sin abrir el expediente. */
export const MasPesos: CollectionConfig = {
  slug: 'mas-pesos',
  typescript: { interface: 'MasPeso' },
  labels: { singular: 'Peso', plural: 'Pesos' },
  admin: { group: 'Clínica', useAsTitle: 'fecha', defaultColumns: ['mascota', 'fecha', 'kg'], hidden: true },
  access: {
    read: leerEquipoOTutor('verPacientes', porMascotaDelCliente),
    create: equipoCon('editarPacientes'),
    update: equipoCon('editarPacientes'),
    delete: nadie,
  },
  fields: [
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'fecha', label: 'Fecha (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: (v: unknown) => (v ? validarFechaOpcional(v) : 'Escribe la fecha.') },
    { name: 'kg', label: 'Peso (kg)', type: 'number', required: true, min: 0.01, max: 500 },
    { name: 'nota', label: 'Nota', type: 'text' },
    { name: 'registradoPor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
  ],
}

/** Teléfonos: solo dígitos; si viene con +52 o 52 y 12 dígitos, se deja a 10. */
export function normalizarTelefono(t: string): string {
  const d = t.replace(/\D+/g, '')
  if (d.length === 12 && d.startsWith('52')) return d.slice(2)
  if (d.length === 13 && d.startsWith('521')) return d.slice(3)
  return d
}
