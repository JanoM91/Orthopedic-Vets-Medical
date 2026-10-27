import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { moduloActivo } from '../../lib/modulos'
import { equipoFarmacia, farmaciaCon, folioParaId, leeCostos, nadie, validarFecha } from './acceso'

/**
 * Venta de mostrador, recetas, libro de control del Grupo I y cierre del día
 * (fase 3, docs/FARMACIA-PROMPT.md).
 *
 * TODA escritura pasa por lib/farmacia/ventas.ts y lib/farmacia/recetas.ts:
 * la API genérica de Payload solo lee (crear, editar y borrar responden 403,
 * incluso al superadmin). Así una venta siempre descuenta por FEFO dentro de
 * una transacción con candado por lote, una receta firmada no cambia y el
 * libro de control no se edita.
 */

const folioVirtual = (prefijo: string) => ({
  name: 'folio',
  label: 'Folio',
  type: 'text' as const,
  virtual: true,
  admin: { readOnly: true, position: 'sidebar' as const },
  hooks: {
    afterRead: [
      ({ data, originalDoc }: { data?: unknown; originalDoc?: unknown }) => {
        const id = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id
        return id == null ? null : folioParaId(prefijo, id as number)
      },
    ],
  },
})

/* ───────────────────────────── recetas ───────────────────────────── */

export const ESTADOS_RECETA = [
  { label: 'Borrador (interna sin firmar)', value: 'borrador' },
  { label: 'Por validar (externa)', value: 'por_validar' },
  { label: 'Válida', value: 'valida' },
  { label: 'Rechazada', value: 'rechazada' },
  { label: 'Cancelada', value: 'cancelada' },
] as const

/** Quién lee recetas: equipo de farmacia, o quien ve el expediente en la clínica. */
const leeRecetas = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  const p = await permisosDe(req)
  if ((await moduloActivo(req, 'farmacia')) && (p.farmacia.vender || p.farmacia.recetas)) return true
  return (await moduloActivo(req, 'clinica')) && p.clinica.verExpediente
}

export const FarRecetas: CollectionConfig = {
  slug: 'far-recetas',
  typescript: { interface: 'FarReceta' },
  labels: { singular: 'Receta', plural: 'Recetas' },
  admin: {
    useAsTitle: 'mvzNombre',
    group: 'Farmacia',
    defaultColumns: ['folio', 'origen', 'mascota', 'mvzNombre', 'estado', 'vigenteHasta'],
    description: 'Recetas internas (emitidas desde el expediente; firmadas = inmutables) y externas (foto validada por el encargado).',
  },
  access: { read: leeRecetas, create: nadie, update: nadie, delete: nadie },
  hooks: {
    /* Defensa en profundidad: aunque la escriba el servicio, una receta interna firmada no cambia su contenido. */
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        if (operation !== 'update' || !originalDoc) return data
        const o = originalDoc as Record<string, unknown>
        if (o.origen === 'interna' && o.firmadaEn) {
          const valor = (v: unknown) => (v && typeof v === 'object' && 'id' in (v as object) ? (v as { id: unknown }).id : (v ?? null))
          for (const campo of ['mascota', 'mvzNombre', 'mvzCedula', 'folioCuantificado', 'fechaEmision', 'vigenteHasta', 'pesoKg', 'indicaciones', 'origen', 'nota']) {
            if (campo in data && String(valor(data[campo])) !== String(valor(o[campo]))) {
              throw new APIError(`La receta está firmada: «${campo}» ya no se puede cambiar.`, 400, undefined, true)
            }
          }
          /* Los renglones solo pueden cambiar sus surtidos usados (cada venta consume uno). */
          if (Array.isArray(data.renglones)) {
            const antes = ((o.renglones as Record<string, unknown>[] | undefined) ?? []).map((r) => [valor(r.producto), r.principio, r.dosis, r.frecuencia, r.duracion, r.surtidosPermitidos].join('|'))
            const ahora = (data.renglones as Record<string, unknown>[]).map((r) => [valor(r.producto), r.principio, r.dosis, r.frecuencia, r.duracion, r.surtidosPermitidos].join('|'))
            if (antes.join('§') !== ahora.join('§')) throw new APIError('La receta está firmada: sus medicamentos ya no se pueden cambiar.', 400, undefined, true)
          }
        }
        return data
      },
    ],
  },
  fields: [
    folioVirtual('REC'),
    { name: 'origen', label: 'Origen', type: 'select', required: true, options: [{ label: 'Interna (expediente)', value: 'interna' }, { label: 'Externa (foto)', value: 'externa' }], index: true },
    { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'borrador', options: [...ESTADOS_RECETA], index: true, admin: { position: 'sidebar' } },
    { name: 'mascota', label: 'Mascota', type: 'relationship', relationTo: 'mascotas', index: true },
    { name: 'cliente', label: 'Tutor', type: 'relationship', relationTo: 'clientes', index: true },
    { name: 'pacienteTexto', label: 'Paciente (si no está en el sistema)', type: 'text' },
    { name: 'nota', label: 'Nota clínica', type: 'relationship', relationTo: 'mas-notas' },
    { type: 'row', fields: [{ name: 'mvzNombre', label: 'MVZ', type: 'text', required: true }, { name: 'mvzCedula', label: 'Cédula profesional', type: 'text' }] },
    { name: 'emitidaPor', label: 'Emitida por (usuario)', type: 'relationship', relationTo: 'users' },
    {
      type: 'row',
      fields: [
        { name: 'fechaEmision', label: 'Emisión (AAAA-MM-DD)', type: 'text', required: true, validate: (v: unknown) => validarFecha(v, false) },
        { name: 'vigenteHasta', label: 'Vigente hasta (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: (v: unknown) => validarFecha(v, false) },
        { name: 'folioCuantificado', label: 'Folio cuantificado SENASICA (Grupo I)', type: 'text', index: true },
      ],
    },
    { name: 'pesoKg', label: 'Peso al emitir (kg)', type: 'number', min: 0 },
    { name: 'indicaciones', label: 'Indicaciones generales', type: 'textarea' },
    {
      name: 'renglones',
      label: 'Medicamentos',
      type: 'array',
      labels: { singular: 'Medicamento', plural: 'Medicamentos' },
      fields: [
        { type: 'row', fields: [{ name: 'producto', label: 'Producto', type: 'relationship', relationTo: 'far-productos' }, { name: 'principio', label: 'Principio activo o descripción', type: 'text' }] },
        { type: 'row', fields: [{ name: 'dosis', label: 'Dosis', type: 'text' }, { name: 'frecuencia', label: 'Frecuencia', type: 'text' }, { name: 'duracion', label: 'Duración', type: 'text' }] },
        { type: 'row', fields: [{ name: 'surtidosPermitidos', label: 'Surtidos permitidos', type: 'number', min: 1, defaultValue: 1 }, { name: 'surtidosUsados', label: 'Surtidos usados', type: 'number', min: 0, defaultValue: 0 }] },
      ],
    },
    { name: 'archivo', label: 'Foto o PDF (externa)', type: 'text', admin: { readOnly: true, description: 'Ruta en el almacén privado.' } },
    { name: 'archivoNombre', type: 'text', admin: { hidden: true } },
    { type: 'row', fields: [{ name: 'firmadaPor', label: 'Firmó', type: 'relationship', relationTo: 'users' }, { name: 'firmadaEn', label: 'Firmada el', type: 'date' }] },
    { type: 'row', fields: [{ name: 'validadaPor', label: 'Validó', type: 'relationship', relationTo: 'users' }, { name: 'validadaEn', label: 'Validada el', type: 'date' }] },
    { name: 'motivoRechazo', label: 'Motivo de rechazo', type: 'text' },
    { type: 'row', fields: [{ name: 'originalRecibido', label: 'Original físico recibido', type: 'checkbox', defaultValue: false }, { name: 'originalRecibidoPor', label: 'Lo recibió', type: 'relationship', relationTo: 'users' }, { name: 'originalRecibidoEn', label: 'Recibido el', type: 'date' }] },
    { name: 'capturadaPor', label: 'Capturó', type: 'relationship', relationTo: 'users' },
  ],
}

/* ───────────────────────────── ventas ───────────────────────────── */

export const FarVentas: CollectionConfig = {
  slug: 'far-ventas',
  typescript: { interface: 'FarVenta' },
  labels: { singular: 'Venta', plural: 'Ventas' },
  admin: {
    useAsTitle: 'claveIdempotencia',
    group: 'Farmacia',
    defaultColumns: ['folio', 'dia', 'total', 'estado', 'vendedor'],
    description: 'Ventas de mostrador (y de la tienda, fase 5). Cada una descuenta por FEFO y crea su entrada en Finanzas.',
  },
  access: { read: farmaciaCon('vender'), create: nadie, update: nadie, delete: nadie },
  fields: [
    folioVirtual('VTA'),
    { name: 'canal', label: 'Canal', type: 'select', required: true, defaultValue: 'mostrador', options: [{ label: 'Mostrador', value: 'mostrador' }, { label: 'Tienda', value: 'tienda' }] },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'pagada',
      index: true,
      options: [
        { label: 'Pagada', value: 'pagada' },
        { label: 'Con pago por confirmar', value: 'por_confirmar' },
        { label: 'Anulada', value: 'anulada' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'claveIdempotencia', label: 'Clave de reintento', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'dia', label: 'Día (AAAA-MM-DD)', type: 'text', required: true, index: true },
    { name: 'almacen', label: 'Almacén', type: 'relationship', relationTo: 'far-almacenes' },
    { type: 'row', fields: [{ name: 'cliente', label: 'Cliente', type: 'relationship', relationTo: 'clientes' }, { name: 'mascota', label: 'Mascota', type: 'relationship', relationTo: 'mascotas' }] },
    { name: 'pesoUsadoKg', label: 'Peso usado para validar (kg)', type: 'number' },
    {
      name: 'renglones',
      label: 'Renglones',
      type: 'array',
      fields: [
        { type: 'row', fields: [{ name: 'presentacion', type: 'relationship', relationTo: 'far-presentaciones', required: true }, { name: 'producto', type: 'relationship', relationTo: 'far-productos', required: true }] },
        { name: 'descripcion', type: 'text', required: true },
        { name: 'grupo', type: 'text' },
        { type: 'row', fields: [{ name: 'cantidad', label: 'Cantidad (presentaciones)', type: 'number', required: true }, { name: 'factor', type: 'number', required: true }, { name: 'unidades', label: 'Unidades base', type: 'number', required: true }] },
        { type: 'row', fields: [{ name: 'precioUnitario', type: 'number', required: true }, { name: 'descuentoPorciento', type: 'number', defaultValue: 0 }, { name: 'importe', type: 'number', required: true }] },
        { name: 'costo', label: 'Costo (unidades × costo del lote)', type: 'number', access: { read: leeCostos } },
        {
          name: 'lotes',
          type: 'array',
          fields: [
            { type: 'row', fields: [{ name: 'lote', type: 'relationship', relationTo: 'far-lotes', required: true }, { name: 'numeroLote', type: 'text' }, { name: 'caducidad', type: 'text' }, { name: 'unidades', type: 'number', required: true }] },
          ],
        },
        { type: 'row', fields: [{ name: 'receta', type: 'relationship', relationTo: 'far-recetas' }, { name: 'folioCuantificado', type: 'text' }] },
        { name: 'autorizacionMascota', label: 'Autorización (validación por mascota)', type: 'text' },
      ],
    },
    { type: 'row', fields: [{ name: 'subtotal', type: 'number', required: true }, { name: 'descuento', type: 'number', defaultValue: 0 }, { name: 'total', type: 'number', required: true, index: true }] },
    { name: 'costoTotal', type: 'number', access: { read: leeCostos } },
    {
      name: 'pagos',
      label: 'Pagos',
      type: 'array',
      fields: [
        { type: 'row', fields: [{ name: 'metodo', label: 'Método (clave)', type: 'text', required: true }, { name: 'etiqueta', type: 'text' }, { name: 'tipo', type: 'text' }] },
        { type: 'row', fields: [{ name: 'monto', type: 'number', required: true }, { name: 'recibido', type: 'number' }, { name: 'cambio', type: 'number' }] },
        { type: 'row', fields: [{ name: 'cuenta', type: 'relationship', relationTo: 'fin-cuentas' }, { name: 'referencia', type: 'text' }] },
        { type: 'row', fields: [{ name: 'estado', type: 'select', required: true, defaultValue: 'confirmado', options: [{ label: 'Confirmado', value: 'confirmado' }, { label: 'Por confirmar', value: 'por_confirmar' }] }, { name: 'confirmadoPor', type: 'relationship', relationTo: 'users' }, { name: 'confirmadoEn', type: 'date' }] },
      ],
    },
    { name: 'vendedor', label: 'Vendedor', type: 'relationship', relationTo: 'users', index: true },
    { name: 'autorizoDescuento', label: 'Autorizó el descuento', type: 'relationship', relationTo: 'users' },
    { name: 'autorizo', label: 'Autorizó (receta o mascota)', type: 'relationship', relationTo: 'users' },
    { name: 'ingresoFinanzas', label: 'Entrada en Finanzas', type: 'relationship', relationTo: 'fin-operaciones' },
    { name: 'correoTicket', label: 'Ticket enviado a', type: 'text' },
    { name: 'notas', type: 'textarea' },
    { type: 'row', fields: [{ name: 'anuladaPor', type: 'relationship', relationTo: 'users' }, { name: 'anuladaEn', type: 'date' }, { name: 'motivoAnulacion', type: 'text' }] },
  ],
}

/* ───────────────────────────── libro de control (Grupo I) ───────────────────────────── */

export const FarLibroControl: CollectionConfig = {
  slug: 'far-libro-control',
  typescript: { interface: 'FarLibroControl' },
  labels: { singular: 'Asiento del libro de control', plural: 'Libro de control (Grupo I)' },
  admin: {
    useAsTitle: 'producto',
    group: 'Farmacia',
    defaultColumns: ['fechaUso', 'producto', 'numeroLote', 'cantidad', 'folioReceta', 'animal'],
    description: 'Asiento automático e inmutable por cada salida de Grupo I (NOM-064-ZOO-2000). Una venta anulada agrega un asiento de cancelación; nunca se edita.',
  },
  access: { read: farmaciaCon('reportes'), create: nadie, update: nadie, delete: nadie },
  hooks: {
    beforeChange: [
      ({ operation }) => {
        if (operation === 'update') throw new APIError('El libro de control no se edita: se agrega un asiento de cancelación.', 400, undefined, true)
      },
    ],
    beforeDelete: [
      () => {
        throw new APIError('El libro de control no se borra.', 400, undefined, true)
      },
    ],
  },
  fields: [
    { name: 'tipo', type: 'select', required: true, defaultValue: 'salida', options: [{ label: 'Salida', value: 'salida' }, { label: 'Cancelación de salida', value: 'cancelacion' }] },
    { name: 'venta', type: 'relationship', relationTo: 'far-ventas', index: true },
    { type: 'row', fields: [{ name: 'laboratorio', type: 'text' }, { name: 'producto', type: 'text', required: true }, { name: 'productoRef', type: 'relationship', relationTo: 'far-productos', index: true }] },
    { name: 'registroSenasica', label: 'Número de registro', type: 'text' },
    { type: 'row', fields: [{ name: 'lote', type: 'relationship', relationTo: 'far-lotes' }, { name: 'numeroLote', type: 'text' }, { name: 'fechaCompra', label: 'Fecha de compra (entrada del lote)', type: 'text' }] },
    { type: 'row', fields: [{ name: 'folioReceta', type: 'text', required: true }, { name: 'receta', type: 'relationship', relationTo: 'far-recetas' }, { name: 'mvz', type: 'text' }] },
    { type: 'row', fields: [{ name: 'fechaUso', label: 'Fecha de salida', type: 'text', required: true, index: true }, { name: 'cantidad', type: 'number', required: true }, { name: 'unidad', type: 'text' }] },
    { type: 'row', fields: [{ name: 'animal', label: 'Animal de destino', type: 'text' }, { name: 'mascota', type: 'relationship', relationTo: 'mascotas' }] },
    { name: 'usuario', type: 'relationship', relationTo: 'users' },
    { name: 'motivo', type: 'text' },
  ],
}

/* ───────────────────────────── cierre del día ───────────────────────────── */

export const FarCierresDia: CollectionConfig = {
  slug: 'far-cierres-dia',
  typescript: { interface: 'FarCierreDia' },
  labels: { singular: 'Cierre del día', plural: 'Cierres del día' },
  admin: { useAsTitle: 'clave', group: 'Farmacia', defaultColumns: ['fecha', 'cuenta', 'esperado', 'contado', 'diferencia', 'usuario'] },
  access: { read: equipoFarmacia, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'clave', type: 'text', required: true, unique: true, admin: { readOnly: true, description: 'fecha-cuenta: un cierre por caja y día.' } },
    { type: 'row', fields: [{ name: 'fecha', type: 'text', required: true, index: true }, { name: 'cuenta', label: 'Caja', type: 'relationship', relationTo: 'fin-cuentas', required: true }] },
    { type: 'row', fields: [{ name: 'esperado', type: 'number', required: true }, { name: 'contado', type: 'number', required: true }, { name: 'diferencia', type: 'number', required: true }] },
    { type: 'row', fields: [{ name: 'ventasEfectivo', label: 'Ventas en efectivo del día', type: 'number' }, { name: 'ventas', label: 'Número de ventas', type: 'number' }] },
    { name: 'nota', type: 'text' },
    { name: 'usuario', type: 'relationship', relationTo: 'users' },
  ],
}
