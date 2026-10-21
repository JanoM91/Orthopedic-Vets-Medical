import type { Access, AccessResult, CollectionConfig, FieldAccess } from 'payload'
import { APIError } from 'payload'
import { htmlDeRecuperacion, VIGENCIA_RECUPERACION_MS } from '../../lib/authEmails'
import { esPersonal, esTutor, permisosDe } from '../../lib/permisos'
import { rateLimit } from '../../lib/rateLimit'
import { site } from '../../lib/site'
import { equipoCon, nadie } from './acceso'

/**
 * Cuentas del PORTAL DEL TUTOR (octubre de 2026).
 *
 * Son una colección con autenticación aparte de «users» (el equipo). Un tutor
 * se registra solo, con correo y contraseña, y al principio no ve nada: su
 * cuenta se VINCULA a una ficha de cliente con un código que genera recepción
 * (collections/clinica/tutores.ts → CodigosVinculacion). Nadie ve un
 * expediente por coincidir en nombre o teléfono.
 *
 * El campo `cliente` es la llave de todo el portal: solo lo escriben el equipo
 * (con «editar pacientes») y el canje del código (API local). El tutor no
 * puede tocarlo ni al registrarse.
 *
 * Sesiones: Payload usa la misma cookie para todas las colecciones con
 * autenticación. En un mismo navegador, entrar al portal cierra la sesión del
 * panel y viceversa. En la práctica son personas distintas; se documenta.
 */

const MAX_REGISTROS_POR_IP = 10
const VENTANA_MS = 60 * 60 * 1000

const leer: Access = async ({ req }): Promise<AccessResult> => {
  if (esPersonal(req)) return (await permisosDe(req)).clinica.verPacientes
  if (esTutor(req)) return { id: { equals: req.user!.id } }
  return false
}
const actualizar: Access = async ({ req }): Promise<AccessResult> => {
  if (esPersonal(req)) return (await permisosDe(req)).clinica.editarPacientes
  if (esTutor(req)) return { id: { equals: req.user!.id } }
  return false
}
const soloEquipoEscribe: FieldAccess = async ({ req }) => esPersonal(req) && (await permisosDe(req)).clinica.editarPacientes

export const Tutores: CollectionConfig = {
  slug: 'tutores',
  typescript: { interface: 'Tutor' },
  labels: { singular: 'Cuenta del portal', plural: 'Cuentas del portal' },
  admin: {
    useAsTitle: 'email',
    group: 'Clínica',
    defaultColumns: ['email', 'nombre', 'cliente', 'updatedAt'],
    description: 'Cuentas con las que los tutores entran al portal. Se vinculan a su ficha de cliente con un código.',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    /* 30 días: el portal se abre desde el teléfono de vez en cuando. */
    tokenExpiration: 30 * 24 * 60 * 60,
    forgotPassword: {
      expiration: VIGENCIA_RECUPERACION_MS,
      generateEmailSubject: () => `Restablece tu contraseña del portal de ${site.brand.name}`,
      generateEmailHTML: (args) =>
        htmlDeRecuperacion({
          liga: `${site.url}/portal/restablecer/${args?.token ?? ''}`,
          nombre: typeof args?.user?.nombre === 'string' ? args.user.nombre : undefined,
        }),
    },
  },
  access: {
    read: leer,
    /* Registro público desde el portal (con freno por dirección) o alta por el equipo. */
    create: async ({ req }) => {
      if (esPersonal(req)) return (await permisosDe(req)).clinica.editarPacientes
      if (req.user) return false
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconocida'
      if (!rateLimit(`tutores:registro:${ip}`, MAX_REGISTROS_POR_IP, VENTANA_MS)) {
        throw new APIError('Demasiados registros desde esta conexión. Intenta más tarde.', 429, undefined, true)
      }
      return true
    },
    update: actualizar,
    delete: nadie,
    /* Nadie entra al panel con una cuenta de tutor. */
    admin: () => false,
  },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true },
    { name: 'telefono', label: 'Teléfono', type: 'text' },
    {
      name: 'cliente',
      label: 'Ficha de cliente vinculada',
      type: 'relationship',
      relationTo: 'clientes',
      index: true,
      access: { create: soloEquipoEscribe, update: soloEquipoEscribe },
      admin: { description: 'Sin ficha vinculada, la cuenta no ve ninguna mascota.' },
    },
    { name: 'vinculadoEn', type: 'date', admin: { readOnly: true }, access: { create: soloEquipoEscribe, update: soloEquipoEscribe } },
  ],
}

/**
 * Códigos de vinculación: los genera el equipo desde la ficha del cliente, el
 * tutor lo escribe en el portal y su cuenta queda unida a esa ficha. Caducan
 * (72 h) y sirven una sola vez. Se guardan tal cual (no son secretos de largo
 * plazo) para que recepción pueda leerlos al cliente por teléfono.
 */
export const CodigosVinculacion: CollectionConfig = {
  slug: 'codigos-vinculacion',
  typescript: { interface: 'CodigoVinculacion' },
  labels: { singular: 'Código de vinculación', plural: 'Códigos de vinculación' },
  admin: { group: 'Clínica', useAsTitle: 'codigo', defaultColumns: ['codigo', 'cliente', 'expira', 'usadoEn'], hidden: true },
  access: {
    read: equipoCon('verPacientes'),
    create: equipoCon('editarPacientes'),
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'codigo', type: 'text', required: true, unique: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes', required: true, index: true },
    { name: 'expira', type: 'date', required: true },
    { name: 'usadoEn', type: 'date' },
    { name: 'usadoPor', type: 'relationship', relationTo: 'tutores' },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
  ],
}

/**
 * Importaciones de archivo: una fila por archivo cargado. Guarda las filas ya
 * leídas y el mapeo de columnas para que la vista previa y la confirmación no
 * dependan de volver a subir el archivo, y deja constancia de qué se creó.
 */
export const Importaciones: CollectionConfig = {
  slug: 'importaciones',
  typescript: { interface: 'Importacion' },
  labels: { singular: 'Importación', plural: 'Importaciones' },
  admin: { group: 'Clínica', useAsTitle: 'archivo', defaultColumns: ['archivo', 'estado', 'createdAt', 'creadoPor'], hidden: true },
  access: {
    read: equipoCon('importar'),
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'archivo', label: 'Archivo', type: 'text', required: true },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'previa',
      options: [{ label: 'Vista previa', value: 'previa' }, { label: 'Aplicada', value: 'aplicada' }, { label: 'Descartada', value: 'descartada' }],
    },
    { name: 'columnas', label: 'Encabezados del archivo', type: 'json' },
    { name: 'filas', label: 'Filas leídas', type: 'json' },
    { name: 'mapeo', label: 'Mapeo de columnas', type: 'json' },
    { name: 'resumen', label: 'Resumen (qué se creó, qué se omitió)', type: 'json' },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'aplicadaEn', type: 'date' },
  ],
}
