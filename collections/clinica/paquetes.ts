import type { Access, AccessResult, CollectionConfig, CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'
import { esPersonal, esTutor, permisosDe } from '../../lib/permisos'
import { equipoCon, folioDesdeId, leerEquipoOTutor, nadie, porMascotaDelCliente, soloEquipoLee } from './acceso'

/**
 * PAQUETES CON SALDO DE USOS (nov-2026, decisión de Jano: «saldo de usos»,
 * «solicitud que confirma recepción»; pueden incluir servicios de la clínica,
 * de la estética y productos de la farmacia).
 *
 *   - `paquetes`: el catálogo. Lo arma quien tiene «Configurar agenda» en
 *     Clínica → Paquetes. Cada renglón es un servicio (N usos) o una
 *     presentación de la farmacia (N piezas). Precio fijo o por talla.
 *   - `paq-vendidos`: un paquete vendido a UNA mascota, con la copia de su
 *     contenido (lo que se vendió no cambia si después se edita el catálogo),
 *     fecha y vencimiento. Al venderlo se registra una entrada por cobrar en
 *     Finanzas (clave `paquete-<id>`).
 *   - `paq-usos`: cada uso (una cita finalizada, un uso a mano o una entrega
 *     de producto). El saldo = total − usos − citas por venir ligadas.
 *
 * `paq-vendidos` y `paq-usos` solo los escribe `lib/clinica/paquetes.ts`
 * (API genérica: crear, editar y borrar 403). El tutor lee los de sus mascotas.
 */

/** El equipo con «Agenda»; el tutor del portal, solo los activos que se muestran en línea. */
const leerPaquetes: Access = async ({ req }): Promise<AccessResult> => {
  if (esPersonal(req)) return (await permisosDe(req)).clinica.agenda
  if (esTutor(req)) return { and: [{ activo: { equals: true } }, { enLinea: { equals: true } }] }
  return false
}

const TIPOS_RENGLON = [
  { label: 'Servicio (usos)', value: 'servicio' },
  { label: 'Producto de la farmacia (piezas)', value: 'producto' },
] as const

/** Cada renglón dice qué es; no se repite el mismo servicio ni la misma presentación. */
const revisarContenido: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  const vistos = new Set<string>()
  /* Con `data`, Payload devuelve el mensaje tal cual aun en el código minificado de producción. */
  const error = (message: string) => new APIError(message, 400, { campo: 'contenido' }, true)
  for (const r of (data.contenido ?? []) as { tipo?: string; servicio?: unknown; presentacion?: unknown; cantidad?: number }[]) {
    if (r.tipo === 'servicio') {
      if (!r.servicio) throw error('Cada renglón de servicio necesita su servicio.')
      r.presentacion = null
    } else if (r.tipo === 'producto') {
      if (!r.presentacion) throw error('Cada renglón de producto necesita su presentación.')
      r.servicio = null
    }
    const id = r.tipo === 'servicio' ? r.servicio : r.presentacion
    const clave = `${r.tipo}:${typeof id === 'object' && id ? (id as { id: unknown }).id : id}`
    if (vistos.has(clave)) throw error('Un servicio o producto aparece dos veces: junta las cantidades en un solo renglón.')
    vistos.add(clave)
  }
  return data
}

export const Paquetes: CollectionConfig = {
  slug: 'paquetes',
  typescript: { interface: 'Paquete' },
  labels: { singular: 'Paquete', plural: 'Paquetes' },
  admin: {
    group: 'Clínica',
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'precio', 'vigenciaDias', 'enLinea', 'activo'],
    description: 'Servicios y productos que se venden juntos y se van usando (ej. 10 sesiones de rehabilitación, 4 baños). Se venden desde el expediente de la mascota → Paquetes.',
  },
  defaultSort: 'orden',
  access: { read: leerPaquetes, create: equipoCon('configurarAgenda'), update: equipoCon('configurarAgenda'), delete: nadie },
  hooks: { beforeValidate: [revisarContenido] },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [folioDesdeId('PAQ')] } },
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true, maxLength: 80, admin: { description: 'Ej. «Rehabilitación: 10 sesiones», «Baño mensual: 4 baños».' } },
    { name: 'descripcion', label: 'Qué incluye y para quién es (lo ve el cliente)', type: 'textarea', maxLength: 600 },
    {
      name: 'contenido',
      label: 'Contenido',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 12,
      labels: { singular: 'Renglón', plural: 'Renglones' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'servicio', options: [...TIPOS_RENGLON] },
            { name: 'cantidad', label: 'Cantidad', type: 'number', required: true, min: 1, max: 100, defaultValue: 1, admin: { description: 'Usos del servicio o piezas del producto.' } },
          ],
        },
        { name: 'servicio', label: 'Servicio', type: 'relationship', relationTo: 'servicios', admin: { condition: (_, s) => s?.tipo === 'servicio' } },
        {
          name: 'presentacion',
          label: 'Presentación de la farmacia',
          type: 'relationship',
          relationTo: 'far-presentaciones',
          admin: { condition: (_, s) => s?.tipo === 'producto', description: 'Solo productos sin receta (nunca Grupo I ni II). Se descuentan del inventario al entregarlos.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'precio', label: 'Precio del paquete (pesos)', type: 'number', required: true, min: 0, admin: { description: 'Lo que paga el cliente por todo el paquete.' } },
        { name: 'vigenciaDias', label: 'Vigencia (días)', type: 'number', min: 1, max: 1095, admin: { description: 'Desde el día de la venta. Vacío = no vence.' } },
      ],
    },
    {
      name: 'preciosTalla',
      label: 'Precio por talla (opcional, para paquetes de estética)',
      type: 'group',
      admin: { description: 'Si lo capturas, al vender se usa el precio de la talla de la mascota (por su peso o la talla fijada). Vacío = el precio de arriba.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'chico', label: 'Chica', type: 'number', min: 0 },
            { name: 'mediano', label: 'Mediana', type: 'number', min: 0 },
            { name: 'grande', label: 'Grande', type: 'number', min: 0 },
            { name: 'gigante', label: 'Gigante', type: 'number', min: 0 },
          ],
        },
      ],
    },
    { name: 'activo', label: 'Activo (se puede vender)', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'enLinea', label: 'Mostrar en el sitio y en la app del cliente', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar', description: 'El cliente lo pide y recepción lo confirma y lo cobra en la clínica.' } },
    { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
  ],
}

export const ESTADOS_VENDIDO = [
  { label: 'Activo', value: 'activo' },
  { label: 'Cancelado', value: 'cancelado' },
] as const

export const PaqVendidos: CollectionConfig = {
  slug: 'paq-vendidos',
  typescript: { interface: 'PaqVendido' },
  labels: { singular: 'Paquete vendido', plural: 'Paquetes vendidos' },
  admin: {
    group: 'Clínica',
    useAsTitle: 'nombre',
    defaultColumns: ['folio', 'nombre', 'mascota', 'fecha', 'vence', 'estado'],
    description: 'Paquetes que compraron los clientes. Se venden y se usan desde el expediente de la mascota → Paquetes.',
  },
  defaultSort: '-createdAt',
  access: { read: leerEquipoOTutor('agenda', porMascotaDelCliente), create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [folioDesdeId('PQV')] } },
    { name: 'paquete', type: 'relationship', relationTo: 'paquetes', required: true, index: true },
    { name: 'nombre', label: 'Paquete', type: 'text', required: true, admin: { description: 'Como se llamaba al venderlo.' } },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes', index: true },
    { name: 'precio', label: 'Precio (pesos)', type: 'number', required: true, min: 0 },
    { name: 'talla', type: 'text', admin: { description: 'Talla con la que se cobró (paquetes por talla).' } },
    { name: 'fecha', label: 'Vendido el', type: 'text', required: true, index: true },
    { name: 'vence', label: 'Vence el', type: 'text', index: true, admin: { description: 'Vacío = no vence.' } },
    { name: 'estado', type: 'select', required: true, defaultValue: 'activo', index: true, options: [...ESTADOS_VENDIDO] },
    {
      name: 'renglones',
      type: 'array',
      required: true,
      fields: [
        { name: 'tipo', type: 'select', required: true, options: [...TIPOS_RENGLON] },
        { name: 'servicio', type: 'relationship', relationTo: 'servicios' },
        { name: 'presentacion', type: 'relationship', relationTo: 'far-presentaciones' },
        { name: 'nombre', type: 'text', required: true },
        { name: 'total', type: 'number', required: true, min: 1 },
      ],
    },
    { name: 'cargoFinanzas', label: 'Cargo en Finanzas', type: 'relationship', relationTo: 'fin-operaciones', access: { read: soloEquipoLee } },
    { name: 'solicitud', type: 'relationship', relationTo: 'solicitudes', access: { read: soloEquipoLee } },
    { name: 'vendidoPor', type: 'relationship', relationTo: 'users', access: { read: soloEquipoLee } },
    { name: 'notas', label: 'Notas del equipo', type: 'textarea', access: { read: soloEquipoLee } },
    { name: 'motivoCancelacion', type: 'text', access: { read: soloEquipoLee } },
  ],
}

export const PaqUsos: CollectionConfig = {
  slug: 'paq-usos',
  typescript: { interface: 'PaqUso' },
  labels: { singular: 'Uso de paquete', plural: 'Usos de paquetes' },
  admin: { group: 'Clínica', hidden: true },
  defaultSort: '-createdAt',
  access: { read: equipoCon('agenda'), create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'vendido', type: 'relationship', relationTo: 'paq-vendidos', required: true, index: true },
    { name: 'renglon', type: 'number', required: true, admin: { description: 'Índice del renglón del paquete vendido (desde 0).' } },
    { name: 'cantidad', type: 'number', required: true, min: 1 },
    { name: 'fecha', type: 'text', required: true },
    { name: 'origen', type: 'select', required: true, options: [{ label: 'Cita finalizada', value: 'cita' }, { label: 'Uso registrado a mano', value: 'manual' }, { label: 'Entrega de producto', value: 'entrega' }] },
    /* Una cita descuenta una sola vez. */
    { name: 'cita', type: 'relationship', relationTo: 'citas', unique: true },
    { name: 'venta', type: 'relationship', relationTo: 'far-ventas', access: { read: soloEquipoLee } },
    { name: 'por', type: 'text' },
    { name: 'nota', type: 'text', access: { read: soloEquipoLee } },
  ],
}
