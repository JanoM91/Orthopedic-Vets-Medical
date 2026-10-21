import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { esPersonal } from '../../lib/permisos'
import { equipoCon, leerEquipoOTutor, nadie, porMascotaDelCliente, validarFechaOpcional } from './acceso'

/**
 * Expediente de la mascota (octubre de 2026): cartilla, notas clínicas y documentos.
 *
 * QUIÉN VE QUÉ:
 *   - Cartilla y documentos publicados: el equipo con «ver pacientes» y el tutor
 *     de esa mascota desde el portal.
 *   - Notas clínicas: SOLO el equipo con «ver expediente». Nunca el tutor; lo que
 *     el médico quiera compartirle lo publica como documento (indicaciones,
 *     receta, constancia).
 *
 * NOTA FIRMADA = INMUTABLE: una nota en borrador se edita libremente; al
 * firmarla, su contenido queda congelado y solo admite adendas (que tampoco se
 * editan ni se borran). Lo revisa el hook `beforeChange`, no la pantalla.
 */

const fechaRequerida = (v: unknown) => (v ? validarFechaOpcional(v) : 'Escribe la fecha.')

export const TIPOS_CARTILLA = [
  { label: 'Vacuna', value: 'vacuna' },
  { label: 'Desparasitación interna', value: 'desparasitacion_interna' },
  { label: 'Desparasitación externa', value: 'desparasitacion_externa' },
  { label: 'Otro (tratamiento preventivo)', value: 'otro' },
]

export const MasCartilla: CollectionConfig = {
  slug: 'mas-cartilla',
  typescript: { interface: 'MasCartilla' },
  labels: { singular: 'Registro de cartilla', plural: 'Cartilla' },
  admin: { group: 'Clínica', useAsTitle: 'producto', defaultColumns: ['mascota', 'tipo', 'producto', 'fechaAplicacion', 'proximaFecha'], hidden: true },
  access: {
    read: leerEquipoOTutor('verPacientes', porMascotaDelCliente),
    create: equipoCon('editarPacientes'),
    update: equipoCon('editarPacientes'),
    delete: nadie,
  },
  fields: [
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'vacuna', options: TIPOS_CARTILLA },
    { name: 'producto', label: 'Producto o biológico', type: 'text', required: true, admin: { description: 'Ej. «Vacuna múltiple canina», «Antirrábica», «Desparasitante interno».' } },
    {
      type: 'row',
      fields: [
        { name: 'fechaAplicacion', label: 'Aplicada el (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: fechaRequerida },
        { name: 'proximaFecha', label: 'Próxima fecha indicada', type: 'text', index: true, validate: validarFechaOpcional },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'lote', label: 'Lote', type: 'text' },
        { name: 'caducidad', label: 'Caducidad del biológico (AAAA-MM o AAAA-MM-DD)', type: 'text' },
      ],
    },
    { name: 'aplicadoPor', label: 'Aplicó (equipo)', type: 'relationship', relationTo: 'users' },
    { name: 'aplicadoPorTexto', label: 'Aplicó (texto, si fue en otra clínica o viene de importación)', type: 'text' },
    { name: 'notas', label: 'Notas', type: 'text' },
    { name: 'registradoPor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
  ],
}

export const TIPOS_NOTA = [
  { label: 'Consulta', value: 'consulta' },
  { label: 'Consulta de ortopedia', value: 'ortopedia' },
  { label: 'Cirugía', value: 'cirugia' },
  { label: 'Control o revisión', value: 'control' },
  { label: 'Urgencia', value: 'urgencia' },
  { label: 'Hospitalización', value: 'hospitalizacion' },
  { label: 'Rehabilitación', value: 'rehabilitacion' },
  { label: 'Otro', value: 'otro' },
]

const CAMPOS_CONGELADOS = ['mascota', 'fecha', 'tipo', 'titulo', 'subjetivo', 'objetivo', 'analisis', 'plan', 'autor'] as const

export const MasNotas: CollectionConfig = {
  slug: 'mas-notas',
  typescript: { interface: 'MasNota' },
  labels: { singular: 'Nota clínica', plural: 'Notas clínicas' },
  admin: { group: 'Clínica', useAsTitle: 'titulo', defaultColumns: ['mascota', 'fecha', 'tipo', 'titulo', 'estado'], hidden: true },
  access: {
    /* El tutor NUNCA lee notas: lo que se le comparte se publica como documento. */
    read: equipoCon('verExpediente'),
    create: equipoCon('escribirExpediente'),
    update: equipoCon('escribirExpediente'),
    /* Solo borradores, y solo quien escribe expediente (se revisa en el hook). */
    delete: equipoCon('escribirExpediente'),
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, req }) => {
        if (operation !== 'update' || !originalDoc) return data
        const firmada = originalDoc.estado === 'firmada'
        if (!firmada) {
          /* Al firmar, sellar fecha y firmante. */
          if (data.estado === 'firmada') {
            data.firmadaEn = new Date().toISOString()
            data.firmadaPor = esPersonal(req) ? req.user?.id : null
          }
          return data
        }
        /* Firmada: contenido congelado; solo se agregan adendas al final. */
        for (const campo of CAMPOS_CONGELADOS) {
          if (campo in data && normaliza(data[campo]) !== normaliza(originalDoc[campo])) {
            throw new APIError(`La nota está firmada: «${campo}» ya no se puede cambiar. Agrega una adenda.`, 400, undefined, true)
          }
        }
        if (data.estado && data.estado !== 'firmada') throw new APIError('Una nota firmada no vuelve a borrador.', 400, undefined, true)
        const previas = Array.isArray(originalDoc.adendas) ? originalDoc.adendas : []
        const nuevas = Array.isArray(data.adendas) ? data.adendas : previas
        if (nuevas.length < previas.length) throw new APIError('Las adendas no se borran.', 400, undefined, true)
        for (let i = 0; i < previas.length; i++) {
          const a = previas[i], b = nuevas[i]
          if (!b || normaliza(a.texto) !== normaliza(b.texto) || normaliza(a.motivo) !== normaliza(b.motivo)) {
            throw new APIError('Una adenda ya guardada no se edita; agrega otra.', 400, undefined, true)
          }
        }
        for (let i = previas.length; i < nuevas.length; i++) {
          nuevas[i].fecha = new Date().toISOString()
          nuevas[i].autor = esPersonal(req) ? req.user?.id : null
        }
        data.adendas = nuevas
        return data
      },
    ],
    beforeDelete: [
      async ({ req, id }) => {
        const n = await req.payload.findByID({ collection: 'mas-notas', id, depth: 0, overrideAccess: true, req })
        if (n.estado === 'firmada') throw new APIError('Una nota firmada no se borra.', 400, undefined, true)
      },
    ],
  },
  fields: [
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'fecha', label: 'Fecha (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: fechaRequerida },
        { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'consulta', options: TIPOS_NOTA },
      ],
    },
    { name: 'titulo', label: 'Motivo o título', type: 'text', required: true },
    { name: 'subjetivo', label: 'S · Subjetivo (lo que refiere el tutor)', type: 'textarea' },
    { name: 'objetivo', label: 'O · Objetivo (hallazgos de la exploración)', type: 'textarea' },
    { name: 'analisis', label: 'A · Análisis (diagnóstico o impresión)', type: 'textarea' },
    { name: 'plan', label: 'P · Plan (tratamiento, estudios, indicaciones)', type: 'textarea' },
    { name: 'autor', label: 'Autor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'borrador',
      index: true,
      options: [{ label: 'Borrador', value: 'borrador' }, { label: 'Firmada', value: 'firmada' }],
      admin: { position: 'sidebar' },
    },
    { name: 'firmadaEn', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'firmadaPor', type: 'relationship', relationTo: 'users', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'adendas',
      label: 'Adendas (solo en notas firmadas)',
      type: 'array',
      fields: [
        { name: 'motivo', label: 'Motivo', type: 'text', required: true },
        { name: 'texto', label: 'Texto', type: 'textarea', required: true },
        { name: 'fecha', type: 'date', admin: { readOnly: true } },
        { name: 'autor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      ],
    },
  ],
}

export const TIPOS_DOCUMENTO = [
  { label: 'Indicaciones', value: 'indicaciones' },
  { label: 'Receta', value: 'receta' },
  { label: 'Consentimiento', value: 'consentimiento' },
  { label: 'Estudio o resultado', value: 'estudio' },
  { label: 'Constancia', value: 'constancia' },
  { label: 'Cartilla anterior (foto o PDF)', value: 'cartilla' },
  { label: 'Otro', value: 'otro' },
]

export const MasDocumentos: CollectionConfig = {
  slug: 'mas-documentos',
  typescript: { interface: 'MasDocumento' },
  labels: { singular: 'Documento', plural: 'Documentos' },
  admin: { group: 'Clínica', useAsTitle: 'titulo', defaultColumns: ['mascota', 'titulo', 'tipo', 'publicadoAlTutor', 'origen'], hidden: true },
  access: {
    /* El tutor ve los publicados de sus mascotas y lo que él mismo aportó. */
    read: leerEquipoOTutor('verPacientes', (clienteId) => ({
      and: [porMascotaDelCliente(clienteId), { or: [{ publicadoAlTutor: { equals: true } }, { origen: { equals: 'tutor' } }] }],
    })),
    /* Se crean solo desde la API de la clínica y del portal (suben el archivo al almacén privado). */
    create: nadie,
    update: equipoCon('editarPacientes'),
    delete: nadie,
  },
  fields: [
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'otro', options: TIPOS_DOCUMENTO },
    { name: 'fecha', label: 'Fecha del documento (AAAA-MM-DD)', type: 'text', validate: validarFechaOpcional },
    { name: 'publicadoAlTutor', label: 'Publicado al tutor (lo ve en el portal)', type: 'checkbox', defaultValue: false, index: true },
    {
      name: 'origen',
      type: 'select',
      required: true,
      defaultValue: 'clinica',
      options: [{ label: 'Clínica', value: 'clinica' }, { label: 'Aportado por el tutor', value: 'tutor' }],
      admin: { readOnly: true },
    },
    {
      name: 'revision',
      label: 'Revisión profesional (de lo aportado por el tutor)',
      type: 'select',
      defaultValue: 'no_aplica',
      options: [{ label: 'No aplica', value: 'no_aplica' }, { label: 'Pendiente', value: 'pendiente' }, { label: 'Revisado', value: 'revisado' }],
    },
    /* Archivo en el almacén privado (Vercel Blob). La ruta no es pública: se sirve por la API revisando permisos. */
    { name: 'ruta', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'nombreArchivo', type: 'text', admin: { readOnly: true } },
    { name: 'tipoContenido', type: 'text', admin: { readOnly: true } },
    { name: 'tamano', label: 'Tamaño (bytes)', type: 'number', admin: { readOnly: true } },
    { name: 'subidoPor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'subidoPorTutor', type: 'relationship', relationTo: 'tutores', admin: { readOnly: true } },
  ],
}

function normaliza(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object' && 'id' in (v as object)) return String((v as { id: unknown }).id)
  return String(v).trim()
}
