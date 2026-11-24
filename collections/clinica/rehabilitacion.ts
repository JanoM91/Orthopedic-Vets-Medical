import type { CollectionConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { equipoCon, folioDesdeId, nadie, soloEquipoLee } from './acceso'
import { MAX_FOTO_SITIO } from './sitio'

/**
 * RUTA ORTOPÉDICA · FASE 4: REHABILITACIÓN (nov-2026, decisiones de Jano:
 *   - cobro: paquetes y por sesión (cada sesión es una cita; si la mascota
 *     tiene un paquete con ese servicio se descuenta, si no se cobra la cita);
 *   - el tutor ve en su app el plan, los ejercicios para casa (con foto o
 *     video), marca los que hizo cada día y ve una gráfica de su avance;
 *   - el equipo mide con escalas comunes: dolor 0–10, cojera 0–5, goniometría
 *     por articulación y perímetro del muslo (solo se capturan y se grafican;
 *     la plataforma no interpreta ni diagnostica);
 *   - los ejercicios salen de un catálogo de la clínica).
 *
 * `reh-ejercicios` es el catálogo (Payload admin, «Escribir expediente»).
 * `reh-planes` y `reh-sesiones` solo los escribe `lib/clinica/rehabilitacion.ts`
 * (API genérica 403); el tutor los lee por el portal, nunca por la API genérica.
 */

const leeEquipo = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  const p = (await permisosDe(req)).clinica
  return p.verExpediente || p.agenda
}

export const ARTICULACIONES = [
  { label: 'Hombro', value: 'hombro' },
  { label: 'Codo', value: 'codo' },
  { label: 'Carpo', value: 'carpo' },
  { label: 'Cadera', value: 'cadera' },
  { label: 'Rodilla', value: 'rodilla' },
  { label: 'Tarso', value: 'tarso' },
] as const
export const LADOS = [
  { label: 'Izquierdo', value: 'izq' },
  { label: 'Derecho', value: 'der' },
] as const
export const MOVIMIENTOS = [
  { label: 'Flexión', value: 'flexion' },
  { label: 'Extensión', value: 'extension' },
] as const

const urlVideo = (v: unknown) => (v == null || v === '' || (typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) && v.length <= 300) ? true : 'Pega una liga que empiece con https:// (YouTube, Drive, etc.).')
const fotoOpcional = (v: unknown) => (v == null || v === '' || (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_FOTO_SITIO) ? true : 'Elige una foto (JPG, PNG o WebP).')

export const RehEjercicios: CollectionConfig = {
  slug: 'reh-ejercicios',
  typescript: { interface: 'RehEjercicio' },
  labels: { singular: 'Ejercicio de rehabilitación', plural: 'Ejercicios de rehabilitación' },
  admin: {
    group: 'Clínica',
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'activo', 'updatedAt'],
    description: 'Ejercicios para casa que el equipo asigna en cada plan de rehabilitación. El tutor ve el nombre, cómo se hace, la foto y el video.',
  },
  defaultSort: 'orden',
  access: { read: soloEquipoLee, create: equipoCon('escribirExpediente'), update: equipoCon('escribirExpediente'), delete: nadie },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true, maxLength: 80, admin: { description: 'Ej. «Sentarse y pararse», «Caminata con correa corta».' } },
    { name: 'comoSeHace', label: 'Cómo se hace (lo lee el tutor)', type: 'textarea', required: true, maxLength: 1500 },
    { name: 'foto', label: 'Foto', type: 'textarea', maxLength: MAX_FOTO_SITIO, validate: fotoOpcional, admin: { description: 'Opcional. Una foto clara de cómo se hace; se reduce sola antes de guardarse.', components: { Field: '/components/admin/CampoFoto#default' } } },
    { name: 'video', label: 'Video (liga)', type: 'text', maxLength: 300, validate: urlVideo, admin: { description: 'Opcional: liga de YouTube, Google Drive u otro sitio. El tutor la abre en su celular.' } },
    { name: 'activo', label: 'Disponible para asignar', type: 'checkbox', defaultValue: true, admin: { description: 'Quítalo para dejar de asignarlo (los planes que ya lo tienen lo conservan).' } },
    { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0 },
  ],
}

export const RehPlanes: CollectionConfig = {
  slug: 'reh-planes',
  typescript: { interface: 'RehPlan' },
  labels: { singular: 'Plan de rehabilitación', plural: 'Planes de rehabilitación' },
  admin: { group: 'Clínica', useAsTitle: 'motivo', hidden: true },
  defaultSort: '-createdAt',
  access: { read: leeEquipo, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('REH')] } },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes' },
    { name: 'responsable', type: 'relationship', relationTo: 'users' },
    { name: 'hoja', label: 'Hoja quirúrgica', type: 'relationship', relationTo: 'cir-hojas' },
    { name: 'motivo', type: 'text', required: true, maxLength: 160 },
    { name: 'objetivo', type: 'textarea', maxLength: 600 },
    { name: 'servicio', label: 'Servicio de la sesión', type: 'relationship', relationTo: 'servicios' },
    { name: 'sesionesPrevistas', type: 'number' },
    { name: 'frecuencia', type: 'text', maxLength: 60 },
    { name: 'estado', type: 'select', required: true, defaultValue: 'activo', index: true, options: [{ label: 'Activo', value: 'activo' }, { label: 'Terminado', value: 'terminado' }] },
    { name: 'inicio', type: 'date', required: true },
    { name: 'fin', type: 'date' },
    {
      name: 'ejercicios',
      type: 'array',
      maxRows: 40,
      fields: [
        { name: 'clave', type: 'text', required: true },
        { name: 'ejercicio', type: 'relationship', relationTo: 'reh-ejercicios' },
        { name: 'nombre', type: 'text', required: true },
        { name: 'comoSeHace', type: 'textarea' },
        { name: 'repeticiones', type: 'text', maxLength: 80 },
        { name: 'vecesAlDia', type: 'number', required: true },
        { name: 'nota', type: 'text', maxLength: 300 },
        { name: 'activo', type: 'checkbox', defaultValue: true },
        { name: 'desde', type: 'date' },
        { name: 'por', type: 'text' },
        { name: 'quitadoEn', type: 'date' },
      ],
    },
    {
      name: 'casa',
      label: 'Registro en casa (tutor)',
      type: 'array',
      maxRows: 4000,
      fields: [
        { name: 'dia', type: 'text', required: true },
        { name: 'clave', type: 'text', required: true },
        { name: 'veces', type: 'number', required: true },
        { name: 'en', type: 'date' },
      ],
    },
    { name: 'resumenFinal', label: 'Resumen final (lo ve el tutor)', type: 'textarea', maxLength: 2000 },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'terminadoPor', type: 'relationship', relationTo: 'users' },
  ],
}

export const RehSesiones: CollectionConfig = {
  slug: 'reh-sesiones',
  typescript: { interface: 'RehSesion' },
  labels: { singular: 'Sesión de rehabilitación', plural: 'Sesiones de rehabilitación' },
  admin: { group: 'Clínica', hidden: true },
  defaultSort: 'fecha',
  access: { read: leeEquipo, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'plan', type: 'relationship', relationTo: 'reh-planes', required: true, index: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cita', type: 'relationship', relationTo: 'citas', index: true },
    { name: 'fecha', type: 'date', required: true },
    { name: 'terapeuta', type: 'relationship', relationTo: 'users' },
    { name: 'por', type: 'text' },
    { name: 'dolor', type: 'number' },
    { name: 'cojera', type: 'number' },
    {
      name: 'mediciones',
      type: 'array',
      maxRows: 24,
      fields: [
        { name: 'articulacion', type: 'select', required: true, options: [...ARTICULACIONES] },
        { name: 'lado', type: 'select', required: true, options: [...LADOS] },
        { name: 'movimiento', type: 'select', required: true, options: [...MOVIMIENTOS] },
        { name: 'grados', type: 'number', required: true },
      ],
    },
    { name: 'perimetroIzq', type: 'number' },
    { name: 'perimetroDer', type: 'number' },
    { name: 'terapias', type: 'text', maxLength: 300 },
    { name: 'notaInterna', type: 'textarea', maxLength: 2000 },
    { name: 'notaTutor', type: 'textarea', maxLength: 1000 },
  ],
}
